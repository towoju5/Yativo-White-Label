import { createBrowserRouter } from "react-router-dom";

import PortalLayout from "@/layouts/PortalLayout";
import AdminLayout from "@/layouts/AdminLayout";
import { RequireCustomerAuth, RequireStaffAuth } from "@/router/guards";
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary";

import LandingPage from "@/pages/marketing/LandingPage";
import StaticPageView from "@/pages/marketing/StaticPageView";
import VerifyStatementPage from "@/pages/public/VerifyStatementPage";

import PortalLoginPage from "@/pages/portal/auth/LoginPage";
import PortalSignupPage from "@/pages/portal/auth/SignupPage";
import AcceptInvitePage from "@/pages/portal/auth/AcceptInvitePage";
import PortalTeamPage from "@/pages/portal/team/TeamPage";
import PortalDashboardPage from "@/pages/portal/dashboard/DashboardPage";
import PortalWalletsPage from "@/pages/portal/wallets/WalletsPage";
import PortalWalletDetailPage from "@/pages/portal/wallets/WalletDetailPage";
import PortalTransactionsPage from "@/pages/portal/transactions/TransactionsPage";
import StatementsPage from "@/pages/portal/statements/StatementsPage";
import SupportPage from "@/pages/portal/support/SupportPage";
import SendMoneyPage from "@/pages/portal/send/SendMoneyPage";
import DepositPage from "@/pages/portal/deposit/DepositPage";
import PortalCryptoWalletsPage from "@/pages/portal/crypto/CryptoWalletsPage";
import VirtualAccountsPage from "@/pages/portal/virtualAccounts/VirtualAccountsPage";
import BeneficiariesPage from "@/pages/portal/beneficiaries/BeneficiariesPage";
import PortalCardsPage from "@/pages/portal/cards/CardsPage";
import ProfilePage from "@/pages/portal/profile/ProfilePage";
import PortalSettingsPage from "@/pages/portal/settings/SettingsPage";
import KycWizardPage from "@/pages/portal/kyc/KycWizardPage";

import AdminLoginPage from "@/pages/admin/auth/LoginPage";
import AdminDashboardPage from "@/pages/admin/dashboard/DashboardPage";
import CustomersPage from "@/pages/admin/customers/CustomersPage";
import CustomerDetailPage from "@/pages/admin/customers/CustomerDetailPage";
import EndorsementsPage from "@/pages/admin/customers/EndorsementsPage";
import TransactionsPage from "@/pages/admin/transactions/TransactionsPage";
import AdminPayoutsPage from "@/pages/admin/payouts/PayoutsPage";
import AdminCardsPage from "@/pages/admin/cards/CardsPage";
import TeamPage from "@/pages/admin/team/TeamPage";
import RolesPage from "@/pages/admin/roles/RolesPage";
import WebhooksPage from "@/pages/admin/webhooks/WebhooksPage";
import ReconciliationPage from "@/pages/admin/reconciliation/ReconciliationPage";
import CryptoWalletsPage from "@/pages/admin/crypto/CryptoWalletsPage";
import PagesPage from "@/pages/admin/pages/PagesPage";
import PageEditorPage from "@/pages/admin/pages/PageEditorPage";
import BrandingSettingsPage from "@/pages/admin/settings/BrandingSettingsPage";
import ApiKeysSettingsPage from "@/pages/admin/settings/ApiKeysSettingsPage";
import WalletCurrenciesSettingsPage from "@/pages/admin/settings/WalletCurrenciesSettingsPage";
import IntegrationsSettingsPage from "@/pages/admin/settings/IntegrationsSettingsPage";
import VerificationSettingsPage from "@/pages/admin/settings/VerificationSettingsPage";
import AuthenticationSettingsPage from "@/pages/admin/settings/AuthenticationSettingsPage";
import NotificationSettingsPage from "@/pages/admin/settings/NotificationSettingsPage";
import EmailTemplatesSettingsPage from "@/pages/admin/settings/EmailTemplatesSettingsPage";
import StorageSettingsPage from "@/pages/admin/settings/StorageSettingsPage";

export function createRouter(adminLoginPath: string) {
  return createBrowserRouter([
  {
    // Pathless root wrapper — global catch-all for catastrophic failures (e.g. routing itself
    // breaking). Every other route sits underneath so nothing escapes without at least this tier.
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/verify-statement/:token", element: <VerifyStatementPage /> },

      { path: "/portal/login", element: <PortalLoginPage /> },
      { path: "/portal/signup", element: <PortalSignupPage /> },
      { path: "/portal/accept-invite", element: <AcceptInvitePage /> },
      {
        path: "/portal/verify",
        element: (
          <RequireCustomerAuth>
            <KycWizardPage />
          </RequireCustomerAuth>
        ),
      },
      {
        path: "/portal",
        element: (
          <RequireCustomerAuth>
            <PortalLayout />
          </RequireCustomerAuth>
        ),
        children: [
          {
            // Pathless section wrapper: a crash in any child below is caught here rather than
            // bubbling to the parent, so PortalLayout's sidebar/topbar (rendered by the route
            // above) stays mounted and interactive — only the outlet content shows the fallback.
            errorElement: <RouteErrorBoundary />,
            children: [
              { index: true, element: <PortalDashboardPage /> },
              { path: "wallets", element: <PortalWalletsPage /> },
              { path: "wallets/:walletId", element: <PortalWalletDetailPage /> },
              { path: "transactions", element: <PortalTransactionsPage /> },
              { path: "statements", element: <StatementsPage /> },
              { path: "support", element: <SupportPage /> },
              { path: "send", element: <SendMoneyPage /> },
              { path: "deposit", element: <DepositPage /> },
              { path: "crypto", element: <PortalCryptoWalletsPage /> },
              { path: "virtual-accounts", element: <VirtualAccountsPage /> },
              { path: "beneficiaries", element: <BeneficiariesPage /> },
              { path: "cards", element: <PortalCardsPage /> },
              { path: "profile", element: <ProfilePage /> },
              { path: "settings", element: <PortalSettingsPage /> },
              { path: "team", element: <PortalTeamPage /> },
            ],
          },
        ],
      },

      { path: adminLoginPath, element: <AdminLoginPage /> },
      {
        path: "/admin",
        element: (
          <RequireStaffAuth>
            <AdminLayout />
          </RequireStaffAuth>
        ),
        children: [
          {
            // Same pattern as /portal above — keeps AdminLayout's chrome mounted through a page crash.
            errorElement: <RouteErrorBoundary />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: "customers", element: <CustomersPage /> },
              { path: "customers/:customerId", element: <CustomerDetailPage /> },
              { path: "endorsements", element: <EndorsementsPage /> },
              { path: "transactions", element: <TransactionsPage /> },
              { path: "payouts", element: <AdminPayoutsPage /> },
              { path: "cards", element: <AdminCardsPage /> },
              { path: "team", element: <TeamPage /> },
              { path: "roles", element: <RolesPage /> },
              { path: "webhooks", element: <WebhooksPage /> },
              { path: "reconciliation", element: <ReconciliationPage /> },
              { path: "crypto", element: <CryptoWalletsPage /> },
              { path: "pages", element: <PagesPage /> },
              { path: "pages/:id", element: <PageEditorPage /> },
              { path: "settings/branding", element: <BrandingSettingsPage /> },
              { path: "settings/api-keys", element: <ApiKeysSettingsPage /> },
              { path: "settings/wallet-currencies", element: <WalletCurrenciesSettingsPage /> },
              { path: "settings/verification", element: <VerificationSettingsPage /> },
              { path: "settings/integrations", element: <IntegrationsSettingsPage /> },
              { path: "settings/authentication", element: <AuthenticationSettingsPage /> },
              { path: "settings/notifications", element: <NotificationSettingsPage /> },
              { path: "settings/email-templates", element: <EmailTemplatesSettingsPage /> },
              { path: "settings/storage", element: <StorageSettingsPage /> },
            ],
          },
        ],
      },

      // A bare dynamic slug — placed last among top-level siblings so it can never shadow a
      // fixed path above it (react-router always ranks a static segment over a `:param` one
      // regardless of registration order, but keeping it last here matches that intent for readers).
      { path: "/:slug", element: <StaticPageView /> },

      { path: "*", element: <LandingPage /> },
    ],
  },
  ]);
}
