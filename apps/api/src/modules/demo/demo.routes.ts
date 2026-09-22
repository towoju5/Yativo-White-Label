import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { signPortalAccessToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { createDemoSession, getDemoSessionById, listDemoSessions, resolveDemoSessionByToken, DemoSessionInvalidError } from "./demo.service.js";
import { cleanupDemoSession } from "./demoCleanup.service.js";
import logger from "../../lib/logger.js";

const demoSessionDto = z.object({
  id: z.string(),
  status: z.enum(["ACTIVE", "EXPIRED", "DESTROYING", "DESTROYED", "FAILED"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastAccessedAt: z.string().nullable(),
  destroyedAt: z.string().nullable(),
  createdByStaffUserId: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

function toDto(session: {
  id: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date | null;
  destroyedAt: Date | null;
  createdByStaffUserId: string | null;
  errorMessage: string | null;
}) {
  return {
    id: session.id,
    status: session.status as "ACTIVE" | "EXPIRED" | "DESTROYING" | "DESTROYED" | "FAILED",
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    lastAccessedAt: session.lastAccessedAt?.toISOString() ?? null,
    destroyedAt: session.destroyedAt?.toISOString() ?? null,
    createdByStaffUserId: session.createdByStaffUserId,
    errorMessage: session.errorMessage,
  };
}

/**
 * Demo-environment routes: registered ONLY when DEMO_ENABLED=true (see app.ts's registration
 * gate) — on a deployment with the flag off, none of these routes, their auth requirements, or
 * their side effects exist at all.
 */
export async function demoRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // ── Admin management (staff-auth protected) ──────────────────────────
  server.post(
    "/admin/demo-sessions",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { response: { 200: demoSessionDto.extend({ url: z.string() }) } } },
    async (request, reply) => {
      const { session, url } = await createDemoSession(app.prisma, request.staffUser!.sub);
      await logAdminAction(app.prisma, request.staffUser!.sub, "demo_session.create", session.id, { expiresAt: session.expiresAt.toISOString() });
      // The raw URL/token is returned exactly once, here, to the requesting admin — never logged, never stored, never returned by any other endpoint again.
      return reply.send({ ...toDto(session), url });
    },
  );

  // ── Public self-service landing page ──────────────────────────────────
  // Gated independently of DEMO_ENABLED by DEMO_PUBLIC_SIGNUP_ENABLED: an operator can run the
  // demo system for staff-only use (admin creates links, shares them manually) without exposing
  // an unauthenticated "anyone can mint a demo" endpoint. Both routes below are still only
  // registered at all when DEMO_ENABLED=true (see app.ts's registration gate for this whole
  // plugin) — the extra flag only controls this one entry point within it.
  server.get(
    "/demo/config",
    { schema: { response: { 200: z.object({ publicSignupEnabled: z.boolean() }) } } },
    async (_request, reply) => {
      return reply.send({ publicSignupEnabled: env.DEMO_PUBLIC_SIGNUP_ENABLED });
    },
  );

  server.post(
    "/demo/request",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: z.object({ businessName: z.string().trim().min(1).max(200), email: z.string().trim().email() }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      if (!env.DEMO_PUBLIC_SIGNUP_ENABLED) {
        throw new AppError("Self-service demo creation is not enabled", 404, "DEMO_PUBLIC_SIGNUP_DISABLED");
      }
      const { businessName, email } = request.body;
      const { session } = await createDemoSession(app.prisma, null, { businessName, email });
      logger.info({ demoId: session.id, source: "public_landing" }, "demo.created");
      // Self-service demos are delivered by email only — the URL and admin credentials are never
      // returned in this HTTP response (unlike the staff-created admin endpoint above, where the
      // requesting admin IS the intended one-time recipient).
      return reply.send({ ok: true });
    },
  );

  server.get(
    "/admin/demo-sessions",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { response: { 200: z.array(demoSessionDto) } } },
    async (_request, reply) => {
      const sessions = await listDemoSessions(app.prisma);
      return reply.send(sessions.map(toDto));
    },
  );

  server.get(
    "/admin/demo-sessions/:id",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ id: z.string() }), response: { 200: demoSessionDto } },
    },
    async (request, reply) => {
      const session = await getDemoSessionById(app.prisma, request.params.id);
      if (!session) throw new NotFoundError("Demo session");
      return reply.send(toDto(session));
    },
  );

  server.delete(
    "/admin/demo-sessions/:id",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      const session = await getDemoSessionById(app.prisma, request.params.id);
      if (!session) throw new NotFoundError("Demo session");
      await cleanupDemoSession(app.prisma, app.redis, session.id);
      await logAdminAction(app.prisma, request.staffUser!.sub, "demo_session.revoke", session.id);
      logger.info({ demoId: session.id }, "demo.revoked");
      return reply.send({ ok: true });
    },
  );

  // ── Public demo entry point ───────────────────────────────────────────
  // The frontend route /demo/:token (see apps/web router) POSTs here with the raw token to
  // exchange it for a real portal session — same "verify a one-time token, return access token +
  // set refresh cookie" shape as /portal/auth/magic-link/verify, just sourced from a DemoSession
  // instead of a MagicLinkToken. Any failure (expired/invalid/destroyed/db unreachable) throws
  // DemoSessionInvalidError (410) — never falls back to any production identity.
  server.post(
    "/portal/demo/verify",
    {
      schema: {
        body: z.object({ token: z.string().min(1) }),
        response: { 200: z.object({ accessToken: z.string(), expiresAt: z.string(), demoSessionId: z.string() }) },
      },
    },
    async (request, reply) => {
      let session;
      try {
        session = await resolveDemoSessionByToken(app.prisma, request.body.token);
      } catch (err) {
        if (err instanceof DemoSessionInvalidError) throw err;
        logger.error({ err }, "demo.authentication.error");
        throw new DemoSessionInvalidError();
      }

      if (!session.demoUserId) {
        // Provisioning never finished seeding a demo user — fail closed rather than issue a token for nothing.
        throw new AppError("This demo environment is still being prepared. Please try again shortly.", 409, "DEMO_NOT_READY");
      }

      const accessToken = signPortalAccessToken({
        sub: session.demoUserId,
        principalType: "owner",
        demoSessionId: session.id,
      });

      return reply.send({ accessToken, expiresAt: session.expiresAt.toISOString(), demoSessionId: session.id });
    },
  );
}
