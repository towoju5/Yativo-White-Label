/**
 * Bridge between apiFetch (plain module code) and the React dialog that collects a step-up code
 * for sensitive admin actions (see apps/api/src/middleware/requireStepUp.ts). apiFetch calls
 * requestStepUpCode() when the API answers 428; <StepUpDialogHost /> registers the handler that
 * shows the prompt and resolves with the entered code, or null if the user cancels.
 */

export type StepUpMethod = "totp" | "email";

export interface StepUpPrompt {
  method: StepUpMethod;
  /** Human-readable description of what's being confirmed, e.g. "Reverse a transaction". */
  action: string;
  /** Set when the previous attempt's code was rejected. */
  error?: string;
}

type StepUpHandler = (prompt: StepUpPrompt) => Promise<string | null>;

let handler: StepUpHandler | null = null;
// Concurrent protected requests prompt one after another rather than stacking dialogs.
let queue: Promise<unknown> = Promise.resolve();

export function setStepUpHandler(next: StepUpHandler) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function requestStepUpCode(prompt: StepUpPrompt): Promise<string | null> {
  if (!handler) return Promise.resolve(null);
  const current = handler;
  const result = queue.then(() => current(prompt));
  queue = result.catch(() => undefined);
  return result;
}

export function isStepUpPayload(payload: unknown): payload is { code: string; message?: string; stepUp: { method: StepUpMethod; action: string } } {
  return !!payload && typeof payload === "object" && "stepUp" in payload && !!(payload as { stepUp: unknown }).stepUp;
}
