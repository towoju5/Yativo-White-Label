import { useTranslation } from "react-i18next";

/**
 * Generic "nothing here" page — deliberately reveals nothing about the app. Used both for genuine
 * unknown routes and as RequireStaffAuth's unauthenticated fallback in router/guards.tsx, so that
 * an unauthenticated hit on /admin looks exactly like a route that doesn't exist (see that file's
 * comment on why the admin login path is never redirected to from here).
 */
export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">{t("notFound.message", "Nothing to see here.")}</p>
    </div>
  );
}
