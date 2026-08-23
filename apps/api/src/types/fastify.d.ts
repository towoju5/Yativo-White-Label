// Ensures @fastify/cookie's `declare module "fastify"` augmentation
// (request.cookies, reply.setCookie/clearCookie) is always part of the
// program, regardless of which entry file gets compiled first.
import "@fastify/cookie";
