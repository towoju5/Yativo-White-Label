import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { getDemoPrismaClient } from "./demoDatabase.service.js";
import { enterDemoContext } from "./demoContext.js";
import { isDemoTokenDenylisted } from "./demoCleanup.service.js";
import logger from "../../lib/logger.js";

/**
 * Establishes AsyncLocalStorage demo context for the remainder of a request whose bearer token
 * carries a `demoSessionId` claim. Only registered at all when DEMO_ENABLED=true (see app.ts) —
 * on a deployment with the flag off this plugin is never imported into the request pipeline.
 *
 * Uses `enterWith` rather than wrapping the whole request in `.run()` because Fastify's own
 * lifecycle (further hooks, the handler, onSend) all continue in the same async execution chain
 * kicked off by this onRequest hook, so context set here is visible for the rest of this request
 * only — it never leaks to a concurrent request's chain (each inbound connection gets its own).
 *
 * This only decodes the token (no signature check — that still happens in
 * requireStaffAuth/requireCustomerAuth as normal); it exists purely to opt the request into the
 * isolated demo Prisma client before route code runs. A forged/garbage demoSessionId claim can't
 * do anything harmful here since real authorization still requires the full requireStaffAuth /
 * requireCustomerAuth verification to pass afterward.
 */
export const demoContextPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const token = header.slice("Bearer ".length);

    let decoded: { demoSessionId?: string } | null = null;
    try {
      decoded = jwt.decode(token) as { demoSessionId?: string } | null;
    } catch {
      return;
    }
    if (!decoded?.demoSessionId) return;

    const demoSessionId = decoded.demoSessionId;
    const session = await app.prisma.demoSession.findUnique({ where: { id: demoSessionId } });
    if (!session || session.status !== "ACTIVE" || session.expiresAt.getTime() <= Date.now()) {
      // Fail closed: an expired/destroyed/unknown demo session establishes NO demo context, so
      // any route that would have used the demo Prisma client instead sees none — it must not
      // silently continue against app.prisma with demo-shaped claims still in the token.
      logger.warn({ demoId: demoSessionId }, "demo.context.rejected");
      return;
    }
    if (await isDemoTokenDenylisted(app.redis, session.tokenHash)) {
      logger.warn({ demoId: demoSessionId }, "demo.context.denylisted");
      return;
    }

    const demoPrisma = getDemoPrismaClient(session.databaseName);
    enterDemoContext({
      isDemoRequest: true,
      demoSessionId,
      demoDatabaseName: session.databaseName,
      demoPrisma,
      demoUserId: session.demoUserId ?? undefined,
    });
  });
});
