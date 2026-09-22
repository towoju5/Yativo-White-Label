import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Landing page for a demo link that failed to verify — expired, revoked, already destroyed, or simply invalid. Never guesses which; the message stays generic on purpose (same reasoning as any other failed-auth surface: don't reveal which case it was). */
export default function DemoExpiredPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("demo.expired.title", "This demo link is no longer valid")}</CardTitle>
          <CardDescription>
            {t("demo.expired.description", "It may have expired, already been used up, or been revoked. Contact whoever shared it with you for a new one.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            {t("demo.expired.backHome", "Back to home")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
