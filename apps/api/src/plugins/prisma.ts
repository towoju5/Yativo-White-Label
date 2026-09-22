import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { getCurrentDemoPrisma } from "../modules/demo/demoContext.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Wraps the real (production) PrismaClient in a Proxy so every one of the ~60 existing call
 * sites (`app.prisma.wallet.findMany(...)`, `app.prisma.$transaction(...)`, etc.) transparently
 * resolves to the current request's isolated demo database when one is active, with zero changes
 * required at those call sites.
 *
 * Resolution happens on EVERY property access via `getCurrentDemoPrisma()`, which reads
 * AsyncLocalStorage — so it is correctly request-scoped even though `app.prisma` itself is a
 * single, shared, module-level object. Outside a demo context (the overwhelming majority of
 * requests, and every request when DEMO_ENABLED=false) `getCurrentDemoPrisma()` returns
 * `undefined` and every access falls through via `?? target` to the exact same real PrismaClient
 * instance and method as before this change — same object identity, same bound `this`, so
 * production-path behavior is unchanged.
 *
 * Only the `get` trap is implemented (no `set`/`deleteProperty`/etc.) — nothing in this codebase
 * assigns onto `app.prisma`, and Prisma's public API surface (`.customer`, `.$transaction`, ...)
 * is accessed, not mutated. Function-valued properties are rebound to the resolved client so
 * their internal `this` matches the object they were read off, which matters for `$transaction`
 * and every model delegate.
 */
function createContextAwarePrismaProxy(realPrisma: PrismaClient): PrismaClient {
  return new Proxy(realPrisma, {
    get(target, prop, _receiver) {
      const client = getCurrentDemoPrisma() ?? target;
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const prismaPlugin = fp(async (app: FastifyInstance) => {
  const prisma = new PrismaClient();
  await prisma.$connect();
  app.decorate("prisma", createContextAwarePrismaProxy(prisma));
  app.addHook("onClose", async () => {
    // Disconnect the real underlying client directly (not via the proxy, which would resolve to
    // whatever demo context happens to be active — irrelevant here; demo clients are disconnected
    // separately via disconnectAllDemoPrismaClients()/evictDemoPrismaClient()).
    await prisma.$disconnect();
  });
});
