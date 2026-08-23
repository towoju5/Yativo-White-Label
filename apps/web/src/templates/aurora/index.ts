import type { TemplateComponents } from "../types";
import { auroraTokens } from "./tokens";
import { AuroraPortalShell } from "./PortalShell";
import { AuroraAdminShell } from "./AdminShell";
import { AuroraDashboardLayout } from "./DashboardLayout";
import { AuroraWalletBalanceCard } from "./WalletBalanceCard";
import { AuroraStatCard } from "./StatCard";
import { AuroraLandingPage } from "./LandingPage";
import { AuroraPreviewThumbnail } from "./PreviewThumbnail";

export const auroraTemplate: TemplateComponents = {
  id: "aurora",
  name: "Aurora",
  description: "Colorful bento-grid dashboard — shadowed blocks, minimum two columns per row, clickable profile.",
  PortalShell: AuroraPortalShell,
  AdminShell: AuroraAdminShell,
  DashboardLayout: AuroraDashboardLayout,
  WalletBalanceCard: AuroraWalletBalanceCard,
  StatCard: AuroraStatCard,
  LandingPage: AuroraLandingPage,
  PreviewThumbnail: AuroraPreviewThumbnail,
  tokens: auroraTokens,
};
