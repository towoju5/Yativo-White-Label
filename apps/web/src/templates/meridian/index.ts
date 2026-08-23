import type { TemplateComponents } from "../types";
import { meridianTokens } from "./tokens";
import { MeridianPortalShell } from "./PortalShell";
import { MeridianAdminShell } from "./AdminShell";
import { MeridianDashboardLayout } from "./DashboardLayout";
import { MeridianWalletBalanceCard } from "./WalletBalanceCard";
import { MeridianStatCard } from "./StatCard";
import { MeridianLandingPage } from "./LandingPage";
import { MeridianPreviewThumbnail } from "./PreviewThumbnail";

export const meridianTemplate: TemplateComponents = {
  id: "meridian",
  name: "Meridian",
  description: "Light, block-style ops console — sidebar nav and hero header, every section its own rounded card.",
  PortalShell: MeridianPortalShell,
  AdminShell: MeridianAdminShell,
  DashboardLayout: MeridianDashboardLayout,
  WalletBalanceCard: MeridianWalletBalanceCard,
  StatCard: MeridianStatCard,
  LandingPage: MeridianLandingPage,
  PreviewThumbnail: MeridianPreviewThumbnail,
  tokens: meridianTokens,
};
