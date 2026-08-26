import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { Customer, CreateCustomerInput, PortalLoginInput, PortalLoginResult, PasskeyLoginOptionsResult } from "@white-label/shared-types";
import { apiFetch, portalApi, portalTokenStore } from "@/lib/api-client";

interface CustomerAuthState {
  user: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Returns the raw login result — the caller checks `requiresTwoFactor` and, if true, collects a code and calls verifyTwoFactor with the returned challengeToken. */
  login: (input: PortalLoginInput) => Promise<PortalLoginResult>;
  loginWithPasskey: () => Promise<void>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  signup: (input: CreateCustomerInput) => Promise<void>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await apiFetch<{ accessToken: string }>("/portal/auth/refresh", { method: "POST" });
        portalTokenStore.set(accessToken);
        const me = await portalApi.get<Customer>("/portal/auth/me");
        setUser(me);
      } catch {
        portalTokenStore.set(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login: CustomerAuthState["login"] = async (input) => {
    const result = await apiFetch<PortalLoginResult>("/portal/auth/login", { method: "POST", body: input });
    if ("requiresTwoFactor" in result) return result;
    portalTokenStore.set(result.accessToken);
    const me = await portalApi.get<Customer>("/portal/auth/me");
    setUser(me);
    return result;
  };

  const verifyTwoFactor: CustomerAuthState["verifyTwoFactor"] = async (challengeToken, code) => {
    const { accessToken } = await apiFetch<{ accessToken: string }>("/portal/auth/2fa/verify", {
      method: "POST",
      body: { challengeToken, code },
    });
    portalTokenStore.set(accessToken);
    const me = await portalApi.get<Customer>("/portal/auth/me");
    setUser(me);
  };

  const loginWithPasskey: CustomerAuthState["loginWithPasskey"] = async () => {
    const { flowId, options } = await apiFetch<PasskeyLoginOptionsResult>("/portal/auth/passkey/login/options", { method: "POST" });
    const response = await startAuthentication({ optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
    const { accessToken } = await apiFetch<{ accessToken: string }>("/portal/auth/passkey/login/verify", {
      method: "POST",
      body: { flowId, response },
    });
    portalTokenStore.set(accessToken);
    const me = await portalApi.get<Customer>("/portal/auth/me");
    setUser(me);
  };

  const signup: CustomerAuthState["signup"] = async (input) => {
    const { accessToken } = await apiFetch<{ accessToken: string }>("/portal/auth/signup", { method: "POST", body: input });
    portalTokenStore.set(accessToken);
    const me = await portalApi.get<Customer>("/portal/auth/me");
    setUser(me);
  };

  const logout: CustomerAuthState["logout"] = async () => {
    try {
      await portalApi.post("/portal/auth/logout");
    } finally {
      portalTokenStore.set(null);
      setUser(null);
    }
  };

  return (
    <CustomerAuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, loginWithPasskey, verifyTwoFactor, signup, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
