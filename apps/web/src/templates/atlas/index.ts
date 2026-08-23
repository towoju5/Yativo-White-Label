import type { TemplateComponents } from "../types";
import { atlasTokens } from "./tokens";
import { AtlasPortalShell } from "./PortalShell";
import { AtlasAdminShell } from "./AdminShell";
import { AtlasDashboardLayout } from "./DashboardLayout";
import { AtlasWalletBalanceCard } from "./WalletBalanceCard";
import { AtlasStatCard } from "./StatCard";
import { AtlasLandingPage } from "./LandingPage";
import { AtlasPreviewThumbnail } from "./PreviewThumbnail";

export const atlasTemplate: TemplateComponents = {
  id: "atlas",
  name: "Atlas",
  description: "Light, hero-driven consumer neobank — top nav, spacious balance-first dashboard.",
  PortalShell: AtlasPortalShell,
  AdminShell: AtlasAdminShell,
  DashboardLayout: AtlasDashboardLayout,
  WalletBalanceCard: AtlasWalletBalanceCard,
  StatCard: AtlasStatCard,
  LandingPage: AtlasLandingPage,
  PreviewThumbnail: AtlasPreviewThumbnail,
  tokens: atlasTokens,
};
