import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { prismaPlugin } from "../../plugins/prisma.js";
import { runInDemoContext } from "./demoContext.js";
import { hashPassword } from "../../lib/passwords.js";
import { createDemoSession } from "./demo.service.js";
import { cleanupDemoSession } from "./demoCleanup.service.js";
import { getDemoPrismaClient, disconnectAllDemoPrismaClients } from "./demoDatabase.service.js";
import { env } from "../../config/env.js";
import { Redis } from "ioredis";

/**
 * This is the real regression test for the gap the demo system had: route handlers call
 * `app.prisma.<model>...` directly, and until now that always hit the PRODUCTION database
 * regardless of whether a demo context was active. `app.prisma` is now a context-aware Proxy
 * (see apps/api/src/plugins/prisma.ts) that resolves to the current request's isolated demo
 * Prisma client when one is set via AsyncLocalStorage, and falls through to the real client
 * otherwise.
 *
 * This test boots a real Fastify instance with the real `prismaPlugin`, registers a plain route
 * handler that does nothing but call `app.prisma.staffUser.findMany(...)` (the exact pattern
 * every one of the ~60 existing route handlers uses), and fires real HTTP requests at it — one
 * with a demo context established around it (mirroring what demoContextPlugin's onRequest hook
 * does for a request bearing a valid demoSessionId claim), one without. It asserts the demo
 * request only ever sees rows written to the isolated demo database (never the production row
 * seeded in beforeAll) and the plain request only ever sees the production row (never anything
 * seeded into the demo database) — i.e. real read isolation through a real route handler, in
 * both directions, not just at the seeding/provisioning layer.
 */
describe("app.prisma context-aware proxy (integration)", () => {
  const prodPrisma = new PrismaClient();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  let staffUserId: string;
  let demoDatabaseName: string;
  let demoSessionId: string;
  const prodMarkerEmail = "prisma-proxy-prod-marker@example.com";
  const demoMarkerEmail = "prisma-proxy-demo-marker@example.com";

  const app = Fastify();

  beforeAll(async () => {
    await app.register(prismaPlugin);

    // A route that is byte-for-byte what a normal route handler looks like today: it just calls
    // app.prisma.<model>.<method>(...) and returns the result. No demo-awareness in the handler
    // itself — the whole point is that none is needed.
    app.get("/__test/staff-users", async () => {
      const rows = await app.prisma.staffUser.findMany({ where: { email: { in: [prodMarkerEmail, demoMarkerEmail] } } });
      return { emails: rows.map((r) => r.email).sort() };
    });

    await app.ready();

    // Seed a marker row directly in production.
    const staff = await prodPrisma.staffUser.upsert({
      where: { email: "demo-proxy-test-owner@example.com" },
      update: {},
      create: { email: "demo-proxy-test-owner@example.com", passwordHash: await hashPassword("password123"), role: "OWNER" },
    });
    staffUserId = staff.id;
    await prodPrisma.staffUser.upsert({
      where: { email: prodMarkerEmail },
      update: {},
      create: { email: prodMarkerEmail, passwordHash: await hashPassword("password123"), role: "ADMIN" },
    });

    // Provision a real isolated demo database and seed a DIFFERENT marker row only there.
    const { session } = await createDemoSession(prodPrisma, staffUserId);
    demoSessionId = session.id;
    demoDatabaseName = session.databaseName;
    const demoPrisma = getDemoPrismaClient(demoDatabaseName);
    await demoPrisma.staffUser.upsert({
      where: { email: demoMarkerEmail },
      update: {},
      create: { email: demoMarkerEmail, passwordHash: await hashPassword("password123"), role: "ADMIN" },
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
    await cleanupDemoSession(prodPrisma, redis, demoSessionId);
    await disconnectAllDemoPrismaClients();
    // Note: the "owner" staff user is intentionally left in place (matching demo.integration.test.ts's
    // pattern) — cleanupDemoSession's DESTROYED DemoSession row still FK-references it.
    await prodPrisma.staffUser.deleteMany({ where: { email: prodMarkerEmail } });
    await redis.quit();
    await prodPrisma.$disconnect();
  }, 30000);

  it("a request WITHOUT demo context only ever sees production data (byte-for-byte unchanged behavior)", async () => {
    const res = await app.inject({ method: "GET", url: "/__test/staff-users" });
    expect(res.statusCode).toBe(200);
    expect(res.json().emails).toEqual([prodMarkerEmail]);
  });

  it("a request WITH demo context sees ONLY the isolated demo database's data via the real route handler", async () => {
    const demoPrisma = getDemoPrismaClient(demoDatabaseName);
    const result = await runInDemoContext(
      { isDemoRequest: true, demoSessionId, demoDatabaseName, demoPrisma },
      async () => app.inject({ method: "GET", url: "/__test/staff-users" }),
    );
    expect(result.statusCode).toBe(200);
    expect(result.json().emails).toEqual([demoMarkerEmail]);
  });
});
