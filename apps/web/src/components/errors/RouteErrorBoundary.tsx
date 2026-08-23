import { useEffect, useState } from "react";
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from "react-router-dom";
import { AlertTriangle, FileQuestion, ShieldAlert } from "lucide-react";
import { Sentry } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning" | "destructive";

interface ErrorPresentation {
  tone: Tone;
  icon: typeof AlertTriangle;
  title: string;
  message: string;
}

function describeError(error: unknown): ErrorPresentation {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        tone: "neutral",
        icon: FileQuestion,
        title: "Page not found",
        message: "The page you're looking for doesn't exist or may have moved.",
      };
    }
    if (error.status === 403) {
      return {
        tone: "warning",
        icon: ShieldAlert,
        title: "Access denied",
        message: "You don't have permission to view this page.",
      };
    }
    return {
      tone: "warning",
      icon: AlertTriangle,
      title: `Request failed (${error.status})`,
      message: error.statusText || "The server couldn't complete this request.",
    };
  }

  return {
    tone: "destructive",
    icon: AlertTriangle,
    title: "Something went wrong",
    message: "We hit an unexpected error loading this page. Your other tabs and data are safe.",
  };
}

const TONE_STYLES: Record<Tone, { iconWrap: string; icon: string }> = {
  neutral: { iconWrap: "bg-muted", icon: "text-muted-foreground" },
  warning: { iconWrap: "bg-warning/10", icon: "text-warning" },
  destructive: { iconWrap: "bg-destructive/10", icon: "text-destructive" },
};

function dashboardPathFor(pathname: string) {
  if (pathname.startsWith("/admin")) return "/admin";
  if (pathname.startsWith("/portal")) return "/portal";
  return "/";
}

/**
 * Used as `errorElement` at three tiers (root, /portal, /admin section wrapper) — see router.tsx.
 * Whichever tier catches the error, this renders in place of just that tier's own element, so an
 * ancestor's chrome (sidebar/topbar) stays mounted and interactive when a page-level boundary
 * catches the crash.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const navigate = useNavigate();
  const [eventId, setEventId] = useState<string | null>(null);
  const { tone, icon: Icon, title, message } = describeError(error);

  useEffect(() => {
    // 404s are routine navigation noise, not application failures — don't spend Sentry quota on them.
    if (isRouteErrorResponse(error) && error.status === 404) return;
    const id = Sentry.captureException(error);
    setEventId(id);
  }, [error]);

  const styles = TONE_STYLES[tone];

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <div className={cn("mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full", styles.iconWrap)}>
          <Icon className={cn("h-6 w-6", styles.icon)} />
        </div>
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate(dashboardPathFor(location.pathname))}>Return to dashboard</Button>
        </div>
        {eventId && <p className="mt-6 font-mono text-[11px] text-muted-foreground">Error ID: {eventId}</p>}
      </div>
    </div>
  );
}
