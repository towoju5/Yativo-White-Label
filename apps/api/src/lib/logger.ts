import { format } from "node:util";
import winston, { type Logger as WinstonLogger } from "winston";

const winstonLogger: WinstonLogger = winston.createLogger({
  // Set minimum level to debug so it captures debug messages
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(), // Saves structured JSON to files
  ),
  transports: [
    // Saves debug, info, warn, and error logs here
    new winston.transports.File({ filename: "combined.log" }),
    // Saves only error logs here
    new winston.transports.File({ filename: "error.log", level: "error" }),
  ],
});

// Also print human-readable text to the console during development
if (process.env.NODE_ENV !== "production") {
  winstonLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  );
}

type PinoLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
// winston has no fatal/trace levels out of the box — mapped to their closest equivalents.
const WINSTON_LEVEL: Record<PinoLevel, string> = { fatal: "error", error: "error", warn: "warn", info: "info", debug: "debug", trace: "debug" };

/**
 * Pino (Fastify's default logger) ships built-in req/res serializers that Fastify wires up
 * automatically; a custom `loggerInstance` bypasses that wiring entirely, so without this the
 * raw Fastify request/reply objects — sockets, circular refs, the works — get merged in whole on
 * every "incoming request"/"request completed" log line. Trimmed down to what's actually useful.
 */
function serializeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!value || typeof value !== "object") {
      out[key] = value;
      continue;
    }
    const v = value as Record<string, unknown>;
    if (key === "req" && typeof v.method === "string" && typeof v.url === "string") {
      out[key] = { method: v.method, url: v.url, id: v.id, remoteAddress: (v.ip as string) ?? undefined };
    } else if (key === "res" && typeof v.statusCode === "number") {
      out[key] = { statusCode: v.statusCode };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Fastify's `loggerInstance` option (see app.ts) and every call site in this codebase
 * (`logger.info({ ...fields }, "message")`) use pino's calling convention — a merging object
 * first, the message second — which is the *opposite* of winston's own `.info(message, meta)`.
 * Swapping the underlying library without this adapter would silently corrupt every log line
 * (Fastify's own request/response logging included, not just this app's explicit calls): the
 * object would be logged as the "message" and the real message would land as metadata.
 * `child()` mirrors pino/Fastify's per-request logger pattern — winston has no native equivalent,
 * so bound fields are merged into every subsequent call instead.
 */
class PinoCompatibleLogger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  private log(level: PinoLevel, args: unknown[]) {
    const [first, ...rest] = args;
    let message = "";
    let meta: Record<string, unknown> = { ...this.bindings };

    if (typeof first === "string") {
      message = rest.length > 0 ? format(first, ...rest) : first;
    } else if (first instanceof Error) {
      message = (rest[0] as string | undefined) ?? first.message;
      meta = { ...meta, err: { message: first.message, stack: first.stack, name: first.name } };
    } else if (first && typeof first === "object") {
      meta = { ...meta, ...(first as Record<string, unknown>) };
      const msgArg = rest[0];
      message = typeof msgArg === "string" ? format(msgArg, ...rest.slice(1)) : "";
    }

    winstonLogger.log(WINSTON_LEVEL[level], message, serializeMeta(meta));
  }

  fatal(...args: unknown[]) {
    this.log("fatal", args);
  }
  error(...args: unknown[]) {
    this.log("error", args);
  }
  warn(...args: unknown[]) {
    this.log("warn", args);
  }
  info(...args: unknown[]) {
    this.log("info", args);
  }
  debug(...args: unknown[]) {
    this.log("debug", args);
  }
  trace(...args: unknown[]) {
    this.log("trace", args);
  }

  child(bindings: Record<string, unknown>): PinoCompatibleLogger {
    return new PinoCompatibleLogger({ ...this.bindings, ...bindings });
  }

  // Fastify's FastifyBaseLogger type requires these in addition to the standard log-level
  // methods above — `level` is read/write (Fastify doesn't actually change it here) and
  // `silent` is pino's no-op "log nothing" level, never invoked by Fastify itself.
  level = "debug";
  silent(..._args: unknown[]) {}
}

const logger = new PinoCompatibleLogger();
export default logger;
