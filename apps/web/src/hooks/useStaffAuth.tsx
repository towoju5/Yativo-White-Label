import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { StaffLoginInput, StaffUserDto, PasskeyLoginOptionsResult } from "@white-label/shared-types";
import { apiFetch, staffApi, staffTokenStore } from "@/lib/api-client";

interface StaffAuthState {
  user: StaffUserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: StaffLoginInput) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  logout: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthState | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" });
        staffTokenStore.set(accessToken);
        const me = await staffApi.get<StaffUserDto>("/auth/me");
        setUser(me);
      } catch {
        staffTokenStore.set(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login: StaffAuthState["login"] = async (input) => {
    const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/login", { method: "POST", body: input });
    staffTokenStore.set(accessToken);
    const me = await staffApi.get<StaffUserDto>("/auth/me");
    setUser(me);
  };

  const loginWithPasskey: StaffAuthState["loginWithPasskey"] = async () => {
    const { flowId, options } = await apiFetch<PasskeyLoginOptionsResult>("/auth/passkey/login/options", { method: "POST" });
    const response = await startAuthentication({ optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
    const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/passkey/login/verify", {
      method: "POST",
      body: { flowId, response },
    });
    staffTokenStore.set(accessToken);
    const me = await staffApi.get<StaffUserDto>("/auth/me");
    setUser(me);
  };

  const logout: StaffAuthState["logout"] = async () => {
    try {
      await staffApi.post("/auth/logout");
    } finally {
      staffTokenStore.set(null);
      setUser(null);
    }
  };

  return (
    <StaffAuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, loginWithPasskey, logout }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error("useStaffAuth must be used within StaffAuthProvider");
  return ctx;
}
