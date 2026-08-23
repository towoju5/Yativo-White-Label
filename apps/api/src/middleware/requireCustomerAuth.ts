import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyPortalAccessToken, type PortalAccessClaims } from "../lib/jwt.js";
import { UnauthorizedError } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    customer?: PortalAccessClaims;
  }
}

export async function requireCustomerAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Missing portal access token");
  try {
    request.customer = verifyPortalAccessToken(header.slice("Bearer ".length));
  } catch {
    throw new UnauthorizedError("Invalid or expired portal access token");
  }
}
