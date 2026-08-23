export type WebhookHandlerResult = { status: "PROCESSED" | "FAILED" | "IGNORED"; errorMessage?: string };
