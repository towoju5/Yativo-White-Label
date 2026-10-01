import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { issueEmailStepUpCode } from "../../lib/emailStepUp.js";
import { sendSystemEmail } from "../notifications/notifications.service.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { NotFoundError } from "../../lib/errors.js";

/** Minimum gap between emailed codes, so the dialog's "resend" can't be used to flood an inbox. */
const RESEND_COOLDOWN_SECONDS = 30;

export async function staffStepUpRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Email fallback for requireStepUp — staff with an authenticator app never need this.
  server.post(
    "/admin/step-up/email",
    {
      preHandler: requireStaffAuth,
      schema: {
        body: z.object({ action: z.string().max(120) }),
        response: { 200: z.object({ sent: z.boolean(), retryAfterSeconds: z.number() }), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const staffId = request.staffUser!.sub;
      const staff = await app.prisma.staffUser.findUnique({ where: { id: staffId }, select: { email: true } });
      if (!staff) throw new NotFoundError("Staff member");

      const cooldownKey = `stepup:email-cooldown:${staffId}`;
      const fresh = await app.redis.set(cooldownKey, "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
      if (!fresh) {
        const ttl = await app.redis.ttl(cooldownKey);
        return reply.send({ sent: false, retryAfterSeconds: Math.max(ttl, 1) });
      }

      const code = await issueEmailStepUpCode(app.redis, "staff-action", staffId);
      try {
        await sendSystemEmail(app.prisma, "STAFF_ACTION_VERIFICATION_CODE", staff.email, { code, action: request.body.action });
      } catch {
        // Same posture as every other auth email — never surfaces delivery failures as an API error.
      }
      return reply.send({ sent: true, retryAfterSeconds: RESEND_COOLDOWN_SECONDS });
    },
  );
}
