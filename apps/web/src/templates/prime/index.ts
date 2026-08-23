import type { TemplateComponents } from "../types";
import { primeTokens } from "./tokens";
import { PrimePortalShell } from "./PortalShell";
import { PrimeAdminShell } from "./AdminShell";
import { PrimeDashboardLayout } from "./DashboardLayout";
import { PrimeWalletBalanceCard } from "./WalletBalanceCard";
import { PrimeStatCard } from "./StatCard";
import { PrimeLandingPage } from "./LandingPage";
import { PrimePreviewThumbnail } from "./PreviewThumbnail";

export const primeTemplate: TemplateComponents = {
  id: "prime",
  name: "Prime",
  description: "Stripe-inspired ops console — sidebar and header together, data tables, with a light/dark toggle.",
  PortalShell: PrimePortalShell,
  AdminShell: PrimeAdminShell,
  DashboardLayout: PrimeDashboardLayout,
  WalletBalanceCard: PrimeWalletBalanceCard,
  StatCard: PrimeStatCard,
  LandingPage: PrimeLandingPage,
  PreviewThumbnail: PrimePreviewThumbnail,
  tokens: primeTokens,
};
