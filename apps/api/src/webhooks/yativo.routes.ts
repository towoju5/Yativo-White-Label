import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { verifyYativoSignature } from "@white-label/yativo-sdk";
import { yativoWebhookConfig } from "../lib/integrationRuntimeConfig.js";
import logger from "../lib/logger.js";
import { enqueueWebhookEvent } from "../jobs/queue.js";

// Yativo's guide names this header literally `Signature` (not `X-Yativo-Signature` or similar) —
// Fastify lowercases incoming header names, so this lowercase key is what actually matches it.
const YATIVO_SIGNATURE_HEADER = "signature";

/**
 * Yativo sends webhooks in three different, structurally incompatible shapes depending on event
 * family (confirmed against their webhook guide):
 *  - Most events: `{ "event.type": "...", "payload": {...} }`.
 *  - Gift card events: `{ "event": "giftcard.status_changed", trace_id, status, ..., data: {...} }`.
 *  - `virtualcard.*` events: no envelope at all — the request body IS the event data, and most
 *    don't carry any field naming the event.
 * This classifies an incoming body into a normalized `{ eventType, payload }` pair covering all
 * three, or returns null if the shape isn't recognized at all.
 */
function classifyIncomingWebhook(body: unknown): { eventType: string; payload: Record<string, unknown> } | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  if (typeof record["event.type"] === "string" && typeof record.payload === "object" && record.payload !== null) {
    return { eventType: record["event.type"], payload: record.payload as Record<string, unknown> };
  }

  if (record.event === "giftcard.status_changed") {
    return { eventType: "giftcard.status_changed", payload: record };
  }

  if (record.event === "virtualcard.deactivated") {
    return { eventType: "virtualcard.deactivated", payload: record };
  }

  // Every other virtualcard.* event: recognized by the presence of `cardId`, since that's the one
  // field this whole family shares. The label below is a best-effort guess for the admin log only
  // (several sub-types are genuinely indistinguishable by field shape per Yativo's own guide) —
  // it never drives automatic processing; see dispatcher.ts for why only `.deactivated` is handled.
  if (typeof record.cardId === "string") {
    return { eventType: classifyVirtualCardEvent(record), payload: record };
  }

  return null;
}

function classifyVirtualCardEvent(record: Record<string, unknown>): string {
  if (record.createdStatus !== undefined) return "virtualcard.created.success";
  if (record.kycPassed !== undefined) return record.reason !== undefined ? "virtualcard.user.kyc.failed" : "virtualcard.user.kyc.success";
  if (record.isTerminated !== undefined) return record.status === "failed" ? "virtualcard.withdrawal.failed" : "virtualcard.withdrawal.success";
  if (record.amount === undefined && record.narrative !== undefined) return "virtualcard.transaction.verification";
  if (record.amount === undefined && record.reason !== undefined) return "virtualcard.created.failed";
  // Everything with an `amount` and no other distinguishing field could be a purchase, a topup
  // confirmation, or one of the transaction.* siblings (reversed/declined/crossborder/...) — the
  // guide doesn't give a reliable way to tell them apart from the body alone.
  if (record.amount !== undefined) return "virtualcard.transaction_or_topup.unclassified";
  return "virtualcard.unclassified";
}

/**
 * There's no delivery id, timestamp, or API-version field on the standard envelope, so idempotency
 * has to be derived from whatever identifying fields the payload itself carries (Yativo's own
 * guide suggests exactly this: "use fields inside payload — e.g. id, created_at, status — for
 * idempotency"). Combines an id-like field with status/timestamp so a genuine status transition
 * (e.g. pending -> success) gets its own row instead of colliding with the first delivery, while
 * an exact re-delivery of the same state still dedupes. Falls back to a content hash for the rare
 * shape with no recognizable id field at all, so this never fails to produce a stable, unique key.
 */
function deriveExternalEventId(eventType: string, payload: Record<string, unknown>): string {
  const id = payload.id ?? payload.transaction_id ?? payload.payout_id ?? payload.deposit_id ?? payload.account_id ?? payload.trace_id ?? payload.cardId ?? payload.metadata_id;
  const status = payload.status ?? payload.previous_status;
  const stamp = payload.updated_at ?? payload.created_at;
  if (id !== undefined) {
    const parts = [eventType, String(id), status !== undefined ? String(status) : null, stamp !== undefined ? String(stamp) : null].filter((p) => p !== null);
    return parts.join(":");
  }
  return `${eventType}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export async function webhookRoutes(app: FastifyInstance) {
  // `app.register(webhookRoutes)` creates its own encapsulated Fastify context, so this
  // content-type parser override only applies to routes registered on `app` inside this
  // function — every other route in the app keeps the default JSON body parser. We need
  // the raw, unparsed bytes here to verify the HMAC signature against exactly what Yativo signed.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/webhooks/yativo",
    { schema: { response: { 200: z.object({ status: z.string() }), 400: z.object({ message: z.string() }) } } },
    async (request, reply) => {
      const rawBody = request.body as Buffer;
      const signatureHeader = request.headers[YATIVO_SIGNATURE_HEADER];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      if (!signature || !verifyYativoSignature(rawBody, signature, yativoWebhookConfig.secret)) {
        logger.warn("Rejected Yativo webhook with invalid or missing signature");
        return reply.code(400).send({ message: "Invalid signature" });
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return reply.code(400).send({ message: "Malformed webhook payload" });
      }

      const classified = classifyIncomingWebhook(parsedBody);
      if (!classified) {
        logger.warn({ body: parsedBody }, "Unrecognized Yativo webhook shape — not the standard envelope, gift card, or virtualcard.* shape");
        return reply.code(400).send({ message: "Unrecognized webhook shape" });
      }

      const { eventType, payload } = classified;
      const externalEventId = deriveExternalEventId(eventType, payload);

      let event;
      try {
        event = await app.prisma.webhookEvent.create({
          data: { externalEventId, eventType, payload: payload as Prisma.InputJsonValue, signatureValid: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          // Duplicate delivery of an eventId we've already recorded — idempotent no-op,
          // do not re-enqueue or reprocess.
          return reply.code(200).send({ status: "duplicate" });
        }
        throw err;
      }

      await enqueueWebhookEvent(event.id);
      return reply.code(200).send({ status: "accepted" });
    },
  );
}
