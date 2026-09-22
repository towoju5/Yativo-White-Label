import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";

const DEMO_EXPIRES_AT_KEY = "demo_expires_at";

/** Set once by DemoLoginPage after a successful /portal/demo/verify — never written anywhere else. */
export function setDemoExpiresAt(iso: string) {
  try {
    sessionStorage.setItem(DEMO_EXPIRES_AT_KEY, iso);
  } catch {
    // sessionStorage unavailable (private mode, etc.) — the banner just won't show, nothing else depends on it.
  }
}

function readDemoExpiresAt(): string | null {
  try {
    return sessionStorage.getItem(DEMO_EXPIRES_AT_KEY);
  } catch {
    return null;
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Purely cosmetic countdown — the server remains the sole authority on when a demo session
 * actually expires (see DemoSession.expiresAt / the cleanup cron); this only renders a
 * client-side clock derived from the expiresAt the server returned at login, so it never grants
 * or extends access on its own.
 */
export function DemoExpiryBanner() {
  const { t } = useTranslation();
  const [expiresAt, setExpiresAt] = useState<string | null>(() => readDemoExpiresAt());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(remainingMs)) return null;

  return (
    <div className="flex items-center gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">
      <Clock className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        {remainingMs > 0
          ? t("demo.banner.remaining", "Demo environment — expires in {{time}}", { time: formatRemaining(remainingMs) })
          : t("demo.banner.expired", "This demo environment has expired.")}
      </p>
    </div>
  );
}
