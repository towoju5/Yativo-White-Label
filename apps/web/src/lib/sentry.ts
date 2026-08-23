import * as Sentry from "@sentry/react";

/** No-op until VITE_SENTRY_DSN is set — safe to call unconditionally at startup. */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
