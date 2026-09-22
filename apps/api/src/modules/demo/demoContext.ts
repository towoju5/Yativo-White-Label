import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

/**
 * Request-scoped demo context. Deliberately AsyncLocalStorage, not a module-level mutable
 * variable — Fastify serves many requests concurrently on one event loop, so a shared mutable
 * "current demo" would leak one request's demo session into another's response. ALS gives each
 * request (and everything awaited within its handler) its own isolated view.
 */
export type DemoContext = {
  isDemoRequest: true;
  demoSessionId: string;
  demoDatabaseName: string;
  demoPrisma: PrismaClient;
  demoUserId?: string;
};

const demoContextStorage = new AsyncLocalStorage<DemoContext>();

/** Runs `fn` (and everything it awaits) inside `ctx` — the right primitive when you control the whole call chain end-to-end (e.g. a background job, a test). */
export function runInDemoContext<T>(ctx: DemoContext, fn: () => Promise<T> | T): Promise<T> | T {
  return demoContextStorage.run(ctx, fn);
}

/**
 * Establishes `ctx` for the remainder of the current execution chain without requiring a
 * callback — the right primitive inside a Fastify `onRequest` hook, where the rest of the
 * request lifecycle (later hooks, the handler, onSend) runs as later continuations of the same
 * hook invocation's call stack rather than as code nested inside a callback we control here.
 */
export function enterDemoContext(ctx: DemoContext): void {
  demoContextStorage.enterWith(ctx);
}

export function getCurrentDemoContext(): DemoContext | undefined {
  return demoContextStorage.getStore();
}

/** Returns the demo Prisma client for the in-flight request, or undefined outside a demo context. Never returns the production client — callers combine this with `?? app.prisma` at the call site (see prisma resolution in demo.plugin.ts). */
export function getCurrentDemoPrisma(): PrismaClient | undefined {
  return demoContextStorage.getStore()?.demoPrisma;
}

export function isDemoRequest(): boolean {
  return demoContextStorage.getStore() !== undefined;
}
