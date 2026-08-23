import type { TemplateComponents } from "../types";
import { novaTokens } from "./tokens";
import { NovaPortalShell } from "./PortalShell";
import { NovaAdminShell } from "./AdminShell";
import { NovaDashboardLayout } from "./DashboardLayout";
import { NovaWalletBalanceCard } from "./WalletBalanceCard";
import { NovaStatCard } from "./StatCard";
import { NovaLandingPage } from "./LandingPage";
import { NovaPreviewThumbnail } from "./PreviewThumbnail";

export const novaTemplate: TemplateComponents = {
  id: "nova",
  name: "Nova",
  description: "Dark, dense ops-console — left sidebar nav, information-forward dashboard.",
  PortalShell: NovaPortalShell,
  AdminShell: NovaAdminShell,
  DashboardLayout: NovaDashboardLayout,
  WalletBalanceCard: NovaWalletBalanceCard,
  StatCard: NovaStatCard,
  LandingPage: NovaLandingPage,
  PreviewThumbnail: NovaPreviewThumbnail,
  tokens: novaTokens,
};
