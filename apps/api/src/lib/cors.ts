/**
 * CORS origin check. In dev, browsers commonly reach the same web app dev
 * server via `localhost`, `127.0.0.1`, or `[::1]` interchangeably (and VS
 * Code / devcontainer port forwarding tends to prefer 127.0.0.1) — matching
 * only the exact configured WEB_APP_URL string breaks the moment someone's
 * browser normalizes the host differently, even though it's the same dev
 * server. So: always allow the exact configured origin; in non-production,
 * also allow any of the loopback hostnames on that same port. Production
 * stays strict — exact match only.
 */
export function buildCorsOriginCheck(webAppUrl: string, nodeEnv: string) {
  const configured = new URL(webAppUrl);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

  return (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
    // No Origin header (curl, server-to-server, same-origin) — allow.
    if (!origin) return callback(null, true);
    if (origin === webAppUrl) return callback(null, true);

    if (nodeEnv !== "production") {
      try {
        const requested = new URL(origin);
        if (loopbackHosts.has(requested.hostname) && loopbackHosts.has(configured.hostname) && requested.port === configured.port) {
          return callback(null, true);
        }
      } catch {
        // fall through to reject
      }
    }

    const err = new Error(`Origin ${origin} is not allowed`);
    (err as Error & { statusCode: number }).statusCode = 403;
    return callback(err, false);
  };
}
