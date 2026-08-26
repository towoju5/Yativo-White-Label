import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  staffLoginSchema,
  authTokensSchema,
  staffUserSchema,
  inviteStaffSchema,
  updateStaffSchema,
  resetStaffPasswordResultSchema,
  roleSchema,
  createRoleSchema,
  updateRoleSchema,
  passkeyLoginOptionsResultSchema,
  verifyPasskeyLoginSchema,
} from "@white-label/shared-types";
import {
  registerFirstOwner,
  loginStaff,
  refreshStaffSession,
  logoutStaff,
  getStaffPasskeyLoginOptions,
  verifyStaffPasskeyLogin,
  inviteStaff,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  deleteStaff,
  resetStaffPassword,
  resolveStaffPermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} from "./auth.service.js";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { env } from "../../config/env.js";
import { parseTtlToMs } from "../../lib/refreshTokens.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";

const REFRESH_COOKIE = "admin_refresh_token";

type StaffRow = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "STAFF";
  isActive: boolean;
  customRoleId: string | null;
  customRole?: { name: string; permissions: string[] } | null;
  invitedBy?: { email: string } | null;
  createdAt: Date;
};

function toDto(user: StaffRow) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    customRoleId: user.customRoleId,
    customRoleName: user.customRole?.name ?? null,
    permissions: resolveStaffPermissions({ role: user.role, customRole: user.customRole ?? null }),
    invitedByEmail: user.invitedBy?.email ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function authRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.post(
    "/auth/register",
    { schema: { body: staffLoginSchema, response: { 200: staffUserSchema } } },
    async (request, reply) => {
      const user = await registerFirstOwner(app.prisma, request.body.email, request.body.password);
      return reply.send(toDto({ ...user, customRole: null, invitedBy: null }));
    },
  );

  server.post(
    "/auth/login",
    { schema: { body: staffLoginSchema, response: { 200: authTokensSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await loginStaff(app.prisma, request.body.email, request.body.password);
      reply.setCookie(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
        maxAge: parseTtlToMs(env.JWT_REFRESH_TTL) / 1000,
      });
      return reply.send({ accessToken });
    },
  );

  server.post(
    "/auth/passkey/login/options",
    { schema: { response: { 200: passkeyLoginOptionsResultSchema } } },
    async (_request, reply) => {
      const result = await getStaffPasskeyLoginOptions(app.redis);
      return reply.send({ flowId: result.flowId, options: result.options as unknown as Record<string, unknown> });
    },
  );

  server.post(
    "/auth/passkey/login/verify",
    { schema: { body: verifyPasskeyLoginSchema, response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const { accessToken, refreshToken } = await verifyStaffPasskeyLogin(
        app.prisma,
        app.redis,
        request.body.flowId,
        request.body.response as unknown as AuthenticationResponseJSON,
      );
      reply.setCookie(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
        maxAge: parseTtlToMs(env.JWT_REFRESH_TTL) / 1000,
      });
      return reply.send({ accessToken });
    },
  );

  server.post(
    "/auth/refresh",
    { schema: { response: { 200: authTokensSchema, 401: errorResponseSchema } } },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];
      if (!refreshToken) return reply.code(401).send({ message: "Missing refresh token" });
      const { accessToken, refreshToken: newRefreshToken } = await refreshStaffSession(app.prisma, refreshToken);
      reply.setCookie(REFRESH_COOKIE, newRefreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
        maxAge: parseTtlToMs(env.JWT_REFRESH_TTL) / 1000,
      });
      return reply.send({ accessToken });
    },
  );

  server.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) await logoutStaff(app.prisma, refreshToken);
    reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
    return reply.code(204).send();
  });

  server.get(
    "/auth/me",
    { preHandler: requireStaffAuth, schema: { response: { 200: staffUserSchema } } },
    async (request, reply) => {
      const user = await app.prisma.staffUser.findUniqueOrThrow({
        where: { id: request.staffUser!.sub },
        include: { customRole: true, invitedBy: { select: { email: true } } },
      });
      return reply.send(toDto(user));
    },
  );

  server.post(
    "/staff/invite",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { body: inviteStaffSchema, response: { 200: z.object({ user: staffUserSchema, tempPassword: z.string() }) } },
    },
    async (request, reply) => {
      const { user, tempPassword } = await inviteStaff(
        app.prisma,
        request.staffUser!.sub,
        request.staffUser!.role,
        request.body.email,
        request.body.role,
        request.body.customRoleId,
      );
      return reply.send({ user: toDto(user), tempPassword });
    },
  );

  server.get(
    "/staff",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(staffUserSchema) } } },
    async (_request, reply) => {
      const users = await app.prisma.staffUser.findMany({
        orderBy: { createdAt: "asc" },
        include: { customRole: true, invitedBy: { select: { email: true } } },
      });
      return reply.send(users.map(toDto));
    },
  );

  server.patch(
    "/admin/staff/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, body: updateStaffSchema, response: { 200: staffUserSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const user = await updateStaff(app.prisma, request.staffUser!.sub, request.staffUser!.role, request.params.id, request.body);
      return reply.send(toDto(user));
    },
  );

  server.post(
    "/admin/staff/:id/deactivate",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, response: { 200: staffUserSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const user = await deactivateStaff(app.prisma, request.staffUser!.sub, request.params.id);
      return reply.send(toDto(user));
    },
  );

  server.post(
    "/admin/staff/:id/reactivate",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, response: { 200: staffUserSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const user = await reactivateStaff(app.prisma, request.staffUser!.sub, request.params.id);
      return reply.send(toDto(user));
    },
  );

  server.post(
    "/admin/staff/:id/reset-password",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, response: { 200: resetStaffPasswordResultSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const result = await resetStaffPassword(app.prisma, request.params.id);
      return reply.send(result);
    },
  );

  server.delete(
    "/admin/staff/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, response: { 204: z.void(), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      await deleteStaff(app.prisma, request.staffUser!.sub, request.params.id);
      return reply.code(204).send();
    },
  );

  // ── Roles ──────────────────────────────────────────────────────────────

  server.get(
    "/admin/roles",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(roleSchema) } } },
    async (_request, reply) => {
      const roles = await listRoles(app.prisma);
      return reply.send(roles.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
    },
  );

  server.post(
    "/admin/roles",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { body: createRoleSchema, response: { 200: roleSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const role = await createRole(app.prisma, request.body);
      return reply.send({ ...role, createdAt: role.createdAt.toISOString(), updatedAt: role.updatedAt.toISOString() });
    },
  );

  server.patch(
    "/admin/roles/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, body: updateRoleSchema, response: { 200: roleSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const role = await updateRole(app.prisma, request.params.id, request.body);
      return reply.send({ ...role, createdAt: role.createdAt.toISOString(), updatedAt: role.updatedAt.toISOString() });
    },
  );

  server.delete(
    "/admin/roles/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("team.manage")],
      schema: { params: idParam, response: { 204: z.void(), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      await deleteRole(app.prisma, request.params.id);
      return reply.code(204).send();
    },
  );
}
