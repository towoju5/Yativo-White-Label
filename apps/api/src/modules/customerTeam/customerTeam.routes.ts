import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { acceptTeamInviteSchema, customerTeamMemberSchema, inviteTeamMemberSchema, updateTeamMemberSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { acceptTeamInvite, deleteTeamMember, inviteTeamMember, listTeamMembers, setTeamMemberActive, updateTeamMember } from "./customerTeam.service.js";

const teamGuard = [requireCustomerAuth, requirePortalPermission("team.manage")];

export async function customerTeamRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  /** Every /portal/team endpoint operates on the business's own account, regardless of whether
   * the caller is the owner or a permitted team member — never the caller's own id. */
  async function requireBusinessCustomer(businessCustomerId: string) {
    const customer = await app.prisma.customer.findUnique({ where: { id: businessCustomerId } });
    if (!customer) throw new NotFoundError("Customer");
    if (customer.type !== "BUSINESS") throw new AppError("Team members are only available for business accounts", 400, "NOT_A_BUSINESS_ACCOUNT");
    return customer;
  }

  server.get("/portal/team", { preHandler: teamGuard, schema: { response: { 200: z.array(customerTeamMemberSchema) } } }, async (request, reply) => {
    const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
    await requireBusinessCustomer(businessCustomerId);
    return reply.send(await listTeamMembers(app.prisma, businessCustomerId));
  });

  server.post(
    "/portal/team/invite",
    { preHandler: teamGuard, schema: { body: inviteTeamMemberSchema, response: { 200: customerTeamMemberSchema } } },
    async (request, reply) => {
      const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
      const business = await requireBusinessCustomer(businessCustomerId);
      const member = await inviteTeamMember(app.prisma, businessCustomerId, request.customer!.sub, business.businessName ?? business.fullName ?? business.email, request.body);
      return reply.send(member);
    },
  );

  server.patch(
    "/portal/team/:id",
    { preHandler: teamGuard, schema: { params: z.object({ id: z.string() }), body: updateTeamMemberSchema, response: { 200: customerTeamMemberSchema } } },
    async (request, reply) => {
      const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
      const member = await updateTeamMember(app.prisma, businessCustomerId, request.params.id, request.body);
      return reply.send(member);
    },
  );

  server.post(
    "/portal/team/:id/deactivate",
    { preHandler: teamGuard, schema: { params: z.object({ id: z.string() }), response: { 200: customerTeamMemberSchema } } },
    async (request, reply) => {
      const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
      return reply.send(await setTeamMemberActive(app.prisma, businessCustomerId, request.params.id, false));
    },
  );

  server.post(
    "/portal/team/:id/reactivate",
    { preHandler: teamGuard, schema: { params: z.object({ id: z.string() }), response: { 200: customerTeamMemberSchema } } },
    async (request, reply) => {
      const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
      return reply.send(await setTeamMemberActive(app.prisma, businessCustomerId, request.params.id, true));
    },
  );

  server.delete(
    "/portal/team/:id",
    { preHandler: teamGuard, schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      const businessCustomerId = resolveEffectiveCustomerId(request.customer!);
      await deleteTeamMember(app.prisma, businessCustomerId, request.params.id);
      return reply.code(204).send();
    },
  );

  // Unauthenticated — the invite token itself is the credential, same idea as a password-reset link.
  server.post(
    "/portal/team/accept-invite",
    { schema: { body: acceptTeamInviteSchema, response: { 200: z.object({ accepted: z.literal(true) }), 401: errorResponseSchema } } },
    async (request, reply) => {
      await acceptTeamInvite(app.prisma, request.body.token, request.body.password);
      return reply.send({ accepted: true });
    },
  );
}
