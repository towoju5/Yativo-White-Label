/**
 * Typed fetch wrapper shared by both auth audiences. Access tokens are kept
 * in memory only (never localStorage) — refresh persistence happens via an
 * httpOnly cookie the browser sends automatically with `credentials: "include"`.
 *
 * The two audiences (`staff` / `portal`) are fully independent: each has its
 * own in-memory token, its own refresh endpoint, and a 401 on one audience's
 * request never triggers the other audience's refresh flow.
 */

import { isStepUpPayload, requestStepUpCode } from "@/lib/stepUp";

export type AuthAudience = "staff" | "portal" | "none";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type TokenListener = (token: string | null) => void;

class TokenStore {
  private token: string | null = null;
  private listeners = new Set<TokenListener>();

  get() {
    return this.token;
  }

  set(token: string | null) {
    this.token = token;
    for (const l of this.listeners) l(token);
  }

  subscribe(listener: TokenListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const staffTokenStore = new TokenStore();
export const portalTokenStore = new TokenStore();

function storeFor(audience: Exclude<AuthAudience, "none">) {
  return audience === "staff" ? staffTokenStore : portalTokenStore;
}

function refreshPathFor(audience: Exclude<AuthAudience, "none">) {
  return audience === "staff" ? "/auth/refresh" : "/portal/auth/refresh";
}

// Set once branding loads (see theme/branding.ts's fetchBranding) so a 401-triggered hard
// redirect (outside React, can't use the router) lands on the admin's configured login path
// instead of the hardcoded default.
let staffLoginPath = "/admin/login";

export function setStaffLoginPath(path: string) {
  staffLoginPath = path;
}

export function loginRouteFor(audience: Exclude<AuthAudience, "none">) {
  return audience === "staff" ? staffLoginPath : "/portal/login";
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Prevents concurrent requests from all firing their own refresh call.
const refreshInFlight = new Map<Exclude<AuthAudience, "none">, Promise<string | null>>();

async function doRefresh(audience: Exclude<AuthAudience, "none">): Promise<string | null> {
  const existing = refreshInFlight.get(audience);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // No body on this request — a Content-Type: application/json header with an empty body
      // makes Fastify reject it outright with 400 ("Body cannot be empty..."), which silently
      // broke this exact recovery path (confirmed live): any time an access token went stale
      // mid-session, the automatic refresh-and-retry in apiFetch below would fail here first,
      // logging the user out instead of transparently refreshing.
      const res = await fetch(`${API_BASE_URL}${refreshPathFor(audience)}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        storeFor(audience).set(null);
        return null;
      }
      const data = (await res.json()) as { accessToken: string };
      storeFor(audience).set(data.accessToken);
      return data.accessToken;
    } catch {
      storeFor(audience).set(null);
      return null;
    } finally {
      refreshInFlight.delete(audience);
    }
  })();

  refreshInFlight.set(audience, promise);
  return promise;
}

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * The text a toast/error banner shows for a failed request. The API is meant to always send a
 * readable `message`, but a raw object, a JSON blob or an "[object Object]" must never reach a
 * customer — fall back to a generic line instead.
 */
function readableErrorMessage(payload: unknown): string {
  const message = payload && typeof payload === "object" && "message" in payload ? (payload as { message: unknown }).message : undefined;
  if (typeof message !== "string") return GENERIC_ERROR_MESSAGE;
  const text = message.trim();
  if (!text || /^[[{]/.test(text) || /\[object Object\]|\{\s*"/.test(text)) return GENERIC_ERROR_MESSAGE;
  return text;
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: AuthAudience;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** internal: prevents infinite refresh-retry loops */
  _retried?: boolean;
  /** internal: the step-up code collected after a 428 (see lib/stepUp.ts) */
  _stepUpCode?: string;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, auth = "none", query, _retried, _stepUpCode } = options;

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {};
  // FormData (file uploads) needs no explicit Content-Type — the browser sets the
  // multipart boundary itself, and setting it manually here would omit that boundary.
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  if (auth !== "none") {
    const token = storeFor(auth).get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (_stepUpCode) headers["X-Step-Up-Code"] = _stepUpCode;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && auth !== "none" && !_retried) {
    const newToken = await doRefresh(auth);
    if (newToken) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
    if (typeof window !== "undefined") {
      window.location.href = loginRouteFor(auth);
    }
    throw new ApiError("Unauthorized", 401, null);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

  // Sensitive admin action — ask for a fresh 2FA/email code and retry. A rejected code comes back
  // as another 428, which re-prompts with the error until the user gets it right or cancels.
  if (res.status === 428 && auth === "staff" && isStepUpPayload(payload)) {
    const code = await requestStepUpCode({
      ...payload.stepUp,
      error: payload.code === "STEP_UP_INVALID" ? payload.message : undefined,
    });
    if (code) return apiFetch<T>(path, { ...options, _stepUpCode: code });
    throw new ApiError("Verification cancelled — the action was not performed.", 428, payload);
  }

  if (!res.ok) {
    throw new ApiError(readableErrorMessage(payload), res.status, payload);
  }

  return payload as T;
}

export const staffApi = {
  get: <T>(path: string, query?: ApiFetchOptions["query"]) => apiFetch<T>(path, { auth: "staff", query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "staff", method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "staff", method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "staff", method: "PATCH", body }),
  del: <T>(path: string) => apiFetch<T>(path, { auth: "staff", method: "DELETE" }),
};

export const portalApi = {
  get: <T>(path: string, query?: ApiFetchOptions["query"]) => apiFetch<T>(path, { auth: "portal", query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "portal", method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "portal", method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "portal", method: "PATCH", body }),
  del: <T>(path: string) => apiFetch<T>(path, { auth: "portal", method: "DELETE" }),
};

/** Binary downloads (statement PDF/Excel exports) — apiFetch only ever parses JSON responses, so this bypasses it and returns the raw Blob instead. */
export async function portalDownload(path: string, query?: ApiFetchOptions["query"]): Promise<Blob> {
  const token = portalTokenStore.get();
  const res = await fetch(buildUrl(path, query), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "message" in body) message = String((body as { message: unknown }).message);
    } catch {
      // non-JSON error body — keep the statusText fallback
    }
    throw new ApiError(message, res.status, null);
  }
  return res.blob();
}

export const publicApi = {
  get: <T>(path: string, query?: ApiFetchOptions["query"]) => apiFetch<T>(path, { auth: "none", query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { auth: "none", method: "POST", body }),
};
