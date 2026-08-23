# White-Label Fintech Platform (Yativo-powered)

## Context

We're initializing a brand-new project (currently empty directory) at
`/home/ignite/Documents/Yativo/white-label`. The product: a Node.js + React
fintech platform that Yativo sells as **white-label code** — a reseller buys
it, gets the codebase + hosting, and runs their *own* fintech business on top
of the Yativo API. Per the user: "we only provide code and host it for them.
we only own the code base and API while they handle everything like managing
it themselves." That means the deployment needs **two logged-in audiences**:

1. **The reseller's own end customers** — a self-service wallet/banking app
   (deposit, send money, cards, statements) for *their* customers.
2. **The reseller's own staff** — a full admin/back-office panel to run the
   business: onboard & KYC-review customers, oversee the ledger, manage
   payouts/cards, configure branding, and see reconciliation against Yativo.

Every customer's balance is tracked in a **local double-entry ledger** (our
own source of truth), reconciled against Yativo's actual settlement via
webhooks + a reconciliation job — not a naive `balance` column.

Single-deployment, single-tenant per install (one reseller per deployed
instance) — no multi-tenant DB partitioning needed, since each reseller forks
their own hosted instance.

## Repo Structure

pnpm workspaces + Turborepo, Node 20, TypeScript everywhere.

```
white-label/
  package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
  .env.example  docker-compose.yml        # postgres + redis
  apps/
    api/                                  # Fastify backend
    web/                                  # single Vite React app, two route trees
  packages/
    yativo-sdk/                           # typed Yativo Fiat+Crypto client
    shared-types/                         # zod schemas shared api<->web
```

`apps/web` stays **one** React app rather than splitting into two, since one
codebase is what gets hosted for the reseller — but it has two independent
route trees, layouts, and auth guards:
- `/portal/*` — customer self-service app (auth = `Customer`)
- `/admin/*` — staff back-office console (auth = `StaffUser`, roles
  `OWNER`/`ADMIN`/`STAFF`)
- `/` — public marketing/landing page selling the product itself
- `/portal/login`, `/portal/signup` vs `/admin/login` (no public admin
  signup — first `OWNER` comes from seed, others invited from the admin
  Team page)

## Backend Stack

- **Fastify** (not Express/Nest) — schema validation, plugin structure,
  performance, without Nest's DI ceremony. Plugins: `@fastify/jwt`,
  `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`,
  `@fastify/cookie`, raw-body support for webhook HMAC verification.
- **PostgreSQL + Prisma** — `BigInt` minor-unit columns for all money
  (no floats), mature interactive-transaction API for ledger locking.
- **Zod** everywhere: route schemas, env parsing, Yativo request/response
  shapes, webhook payloads.
- **Two separate auth flows/JWT audiences**, so a customer token can never
  be used against admin routes or vice versa:
  - `StaffUser` — hybrid JWT (15m access + 30d rotating refresh in
    httpOnly cookie, hashed in `RefreshToken` table for revocation).
  - `Customer` — same hybrid pattern, separate cookie name/JWT audience
    (`aud: portal` vs `aud: admin`), separate `CustomerRefreshToken` table.
- **BullMQ + Redis** for webhook processing (handler just verifies +
  persists + enqueues + returns 200 fast) and a daily reconciliation job.

## Double-Entry Ledger (Prisma schema, `apps/api/prisma/schema.prisma`)

All money is `BigInt` minor units; a `Currency` table stores `decimals`.
Ledger entries are append-only/immutable — corrections are new offsetting
transactions, never row updates.

- **Currency** — `code` (PK), `decimals`, `isFiat`
- **Account** (chart of accounts) — `id`, `type` enum (`CUSTOMER_WALLET`,
  `PLATFORM_FEE_REVENUE`, `YATIVO_SETTLEMENT`, `YATIVO_CLEARING`,
  `SUSPENSE_PENDING`, `PLATFORM_RESERVE`), `currencyCode`, `customerId`
  (nullable, set only for `CUSTOMER_WALLET`), unique on
  `(type, currencyCode, customerId)`
- **Wallet** — read-optimized cache: `id`, `customerId`, `currencyCode`,
  `accountId` (unique FK), `cachedAvailableMinor`, `cachedPendingMinor`,
  `cacheUpdatedAt` — updated transactionally inside ledger postings;
  reconciliation re-derives it to catch drift
- **LedgerTransaction** (journal header) — `id`, `type` enum (`DEPOSIT`,
  `PAYOUT`, `SWAP`, `CARD_TOPUP`, `CARD_WITHDRAWAL`, `FEE`, `REFUND`,
  `CHARGEBACK`, `ADJUSTMENT`, `TRANSFER`), `status`
  (`PENDING`/`POSTED`/`REVERSED`), `idempotencyKey` (unique),
  `externalSource` (`YATIVO_WEBHOOK`/`MANUAL`/`SYSTEM`), `externalRef`
  (indexed), `description`, `metadata` (jsonb), `reversalOfId` (self-FK),
  timestamps
- **LedgerEntry** (immutable lines) — `id`, `transactionId`, `accountId`,
  `direction` (`DEBIT`/`CREDIT`), `amountMinor` (always positive),
  `currencyCode`
- **Customer** — `id`, `type` (`INDIVIDUAL`/`BUSINESS`), name/email,
  `kycStatus`, `yativoCustomerId`, **auth fields**: `passwordHash`,
  `emailVerifiedAt`, `lastLoginAt`, `status` (`ACTIVE`/`FROZEN`)
- **StaffUser** — `id`, `email`, `passwordHash`, `role`
  (`OWNER`/`ADMIN`/`STAFF`), `invitedById`, timestamps
- **RefreshToken** / **CustomerRefreshToken** — token hash, expiry, revoked-at
- **WebhookEvent** — `externalEventId` (unique, idempotency), `eventType`,
  `payload` (jsonb), `signatureValid`, `processingStatus`
  (`PENDING`/`PROCESSED`/`FAILED`/`IGNORED`), `errorMessage`
- **ReconciliationReport** — `currencyCode`, `accountType`,
  `expectedMinor`, `actualMinor`, `deltaMinor`, `status`
  (`MATCH`/`MISMATCH`)
- **Beneficiary** — per-customer, `yativoBeneficiaryId`, `details` (jsonb)
- **Card** — per-customer, `yativoCardId`, `network`, `last4`, `status`,
  `type` (`VIRTUAL`/`PHYSICAL`)
- **ApiKey** — platform's own outbound keys for reseller integrations
  (distinct from Yativo creds): `keyHash`, `last4`, `createdById`, `revokedAt`
- **BrandingConfig** — singleton row: `productName`, `logoUrl`,
  `faviconUrl`, `primaryColor`, `secondaryColor`, `accentColor`,
  `supportEmail` — the entire white-label theming mechanism

### Ledger service (`apps/api/src/modules/ledger/`)

```ts
postTransaction(input: {
  type, status: 'PENDING'|'POSTED', idempotencyKey, externalSource,
  externalRef?, description?, metadata?, lines: EntryLine[]
}): Promise<LedgerTransaction>
```
1. Group lines by currency; assert `sum(DEBIT) === sum(CREDIT)` per
   currency — throw before any DB write if unbalanced.
2. `prisma.$transaction`: lock all distinct `accountId`s ascending via
   `SELECT ... FOR UPDATE` (serializes concurrent postings, avoids
   deadlocks).
3. Insert on `idempotencyKey` conflict → return existing transaction
   (webhook-replay-safe no-op).
4. Insert `LedgerTransaction` + `LedgerEntry` rows, update touched
   `Wallet` caches, commit.

```ts
reverseTransaction(transactionId, reason): Promise<LedgerTransaction>
settlePendingTransaction(pendingTransactionId, finalLines): Promise<LedgerTransaction>
getPostedBalance / getPendingHold / getAvailableBalance(accountId): Promise<bigint>
```

**Deposit flow:** Yativo webhook `deposit.confirmed` →
`postTransaction({DEPOSIT, POSTED, lines:[DEBIT YATIVO_SETTLEMENT, CREDIT CUSTOMER_WALLET]})`.

**Payout flow:** customer/staff initiates → `postTransaction({PAYOUT, PENDING, lines:[DEBIT CUSTOMER_WALLET, CREDIT SUSPENSE_PENDING]})` (reduces available immediately) → call Yativo payout API with `idempotencyKey = transaction.id` → `payout.completed` webhook → `settlePendingTransaction(...)`; `payout.failed` → `reverseTransaction(...)`.

## Yativo Integration Layer (`packages/yativo-sdk`)

```
src/client.ts          # createYativoClient(config) -> { fiat, crypto }
src/auth.ts             # token acquisition/refresh/caching, OTP support
src/config.ts            # zod config: baseUrls, apiKey, apiSecret, mode
src/fiat/{wallets,customers,kyc,virtualAccounts,swaps,paymentMethods,
           payouts,quotes,cards,giftCards,beneficiaries,transactions}.ts
src/crypto/{accounts,wallets,send,swap,cards,gateway,ibanAccount,
             forwardingRules,compliance}.ts
src/webhooks/{verify.ts,types.ts}
src/fixtures/            # mock data used when YATIVO_MODE=mock
```

`YATIVO_MODE`: `mock` (no real creds — fixture responses, default for this
scaffold) | `sandbox` | `live`. `apps/api` only ever talks to Yativo through
this package. Webhook receiver: `POST /webhooks/yativo` verifies HMAC
signature against raw body, upserts `WebhookEvent` on `externalEventId`
(idempotent), enqueues a BullMQ job, returns 200 immediately; a worker
dispatches by `eventType` to handlers that call the ledger service.

## Frontend Stack

Vite + React + TypeScript + Tailwind, shadcn/ui pattern (Radix primitives +
`class-variance-authority`, copied into `src/components/ui`) for full design
control. React Router v6, TanStack Query for server state, `react-hook-form`
+ zod for forms, Recharts for balance/volume charts.

**Design direction:** dark-mode-first premium fintech aesthetic (Mercury /
Ramp / Brex / Revolut quality bar) with light mode support — HSL CSS custom
properties for a full neutral + primary/accent scale, muted (not neon)
success/warning/danger semantics, consistent radius/shadow tokens.

### Design templates (multi-template white-labeling)

Resellers pick from a gallery of **design templates** that differ
structurally — nav placement, page composition, landing-page layout — not
just color tokens. Start with **2 templates**; the architecture is built so
more can be added later without touching business logic.

**Template contract:** every page's *business logic* (data fetching hooks,
mutations, form handling, validation) is template-agnostic and lives in
`hooks/`/`pages/*` containers. *Presentation* is swapped via a shared
TypeScript interface implemented once per template:

```ts
// apps/web/src/templates/types.ts
interface TemplateComponents {
  PortalShell: FC<{children}>;  AdminShell: FC<{children}>;
  Sidebar?: FC;  Topbar: FC;
  DashboardLayout: FC<{balances, activity, ...}>;
  WalletBalanceCard: FC<{...}>;  StatCard: FC<{...}>;
  LandingPage: FC;
  tokens: { fonts, radii, shadows, density, defaultPalette };
}
```
A `useTemplate()` hook (backed by `TemplateProvider`, resolved from
`BrandingConfig.templateId` at boot) returns the active set; page
containers render `<T.DashboardLayout balances={...} />` instead of
importing a concrete component, so switching templates never touches a
page's data logic.

`apps/web/src/templates/`
- `nova/` — dark-first, **left sidebar nav**, dense card-grid dashboard,
  glassy/bordered cards, tight radius — ops-console feel (Mercury/Ramp-esque).
- `atlas/` — light-first, **top nav**, hero-driven dashboard (large balance
  banner + horizontal-scroll activity/cards), soft large-radius cards,
  more spacious — consumer-neobank feel (Revolut/N26-esque).

Each template folder implements the full `TemplateComponents` contract
(its own shell/nav, dashboard composition, and landing page layout) plus a
`tokens.ts` default palette. `BrandingConfig.templateId` (`nova` | `atlas`)
selects the template; the existing `primaryColor`/`secondaryColor`/
`accentColor` always override that template's default palette on top —
template = structure, color = brand identity.

Admin **Settings → Branding** (`/admin/settings/branding`, **fully wired**):
a gallery to pick a template (preview card per option) + a color section
(primary/secondary/accent pickers) with a live preview before saving.

Both `nova` and `atlas` get the complete screen set from this plan (portal
+ admin + landing) so the "full website" exists twice, structurally
distinct; adding a 3rd template later means implementing one more folder
against the same `TemplateComponents` contract.

## Screens

**Public**
- `/` marketing landing page (hero, feature grid, CTA)
- `/portal/login`, `/portal/signup`, `/admin/login`

**Customer portal `/portal/*`** (auth = Customer)
- Dashboard — own multi-currency balances + recent activity
- Wallet detail + statement (paginated ledger entries, available vs
  pending, balance chart) — **fully wired**
- Send money — beneficiary picker → quote → confirm → two-phase payout —
  **fully wired**
- Deposit — virtual account details — UI shell, TODO real provisioning
- Beneficiaries — own, CRUD
- Cards — own, view/freeze/request — UI shell, TODO real issuance
- Profile/KYC — submit + status — UI shell, TODO real KYC wiring
- Settings — security (password, 2FA placeholder)

**Admin console `/admin/*`** (auth = StaffUser, role-gated)
- Dashboard — platform-wide balances, volume, pending-payout count,
  KYC queue count
- Customers — list/detail, KYC review (approve/reject), wallet balances,
  ledger statement, manual ledger adjustment (OWNER/ADMIN only, reason
  required), freeze/unfreeze — **fully wired** against ledger
- Transactions — platform-wide ledger browser with filters
- Payouts — status list across all customers
- Cards — platform-wide list, issue/freeze on behalf of customer — shell
- Team — invite staff, manage roles — **fully wired**
- Webhooks — event log viewer (payload, status, replay button) — **fully wired**
- Reconciliation — reports list + "run now" — **fully wired**
- Settings — Branding (live preview, fully wired), API Keys (fully wired)

Ledger-backed screens (wallets/statements, payouts, admin customer ledger
view, reconciliation, webhooks, branding, team, API keys) are fully wired to
the real backend. Yativo-dependent externals without real credentials here
(actual card issuance, actual virtual-account provisioning, actual KYC
verification) are solid UI shells with `// TODO: wire to Yativo` markers,
operating against `YATIVO_MODE=mock` fixtures.

## File Layout (key paths)

```
apps/api/prisma/{schema.prisma,seed.ts,migrations/}
apps/api/src/
  index.ts app.ts config/env.ts
  plugins/{prisma,redis,auth,cors,helmet,rate-limit,rawBody}.ts
  modules/
    auth/                 # StaffUser auth
    portalAuth/            # Customer auth (separate module/audience)
    customers/ wallets/
    ledger/{postTransaction,reverseTransaction,settlePendingTransaction,
            balances,accounts,ledger.routes}.ts
    payouts/ deposits/ swaps/ cards/ beneficiaries/
    staff/                 # team management (admin)
    branding/ apiKeys/ reconciliation/
  webhooks/{yativo.routes,dispatcher,handlers/*}.ts
  jobs/{queue,scheduler,workers/*}.ts
  lib/{logger,errors,idempotency}.ts
  middleware/{requireStaffAuth,requireRole,requireCustomerAuth}.ts
test/ledger/postTransaction.test.ts

apps/web/src/
  theme/{tokens.css,branding.ts}       # runtime CSS-var application
  templates/
    types.ts                           # TemplateComponents contract
    TemplateProvider.tsx  useTemplate.ts
    nova/{tokens.ts,Shell.tsx,Sidebar.tsx,Topbar.tsx,DashboardLayout.tsx,
          WalletBalanceCard.tsx,StatCard.tsx,LandingPage.tsx,index.ts}
    atlas/{tokens.ts,Shell.tsx,Topbar.tsx,DashboardLayout.tsx,
           WalletBalanceCard.tsx,StatCard.tsx,LandingPage.tsx,index.ts}
  lib/{api-client,query-client,utils}.ts
  components/ui/*                      # shared shadcn primitives (button, input, table, dialog...)
  components/wallet/WalletStatementTable.tsx  components/charts/BalanceChart.tsx
  pages/marketing/LandingPage.tsx       # renders T.LandingPage
  pages/portal/{auth,dashboard,wallets,send,deposit,beneficiaries,cards,profile,settings}/*
  pages/admin/{auth,dashboard,customers,transactions,payouts,cards,team,webhooks,reconciliation,settings}/*
  router.tsx            # splits /, /portal/*, /admin/*

packages/yativo-sdk/src/*   (see above)
packages/shared-types/src/{customer,wallet,transaction,payout,branding}.schema.ts
```

## Env

`apps/api/.env`: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `PORTAL_JWT_ACCESS_SECRET`,
`PORTAL_JWT_REFRESH_SECRET`, `YATIVO_MODE=mock`, `YATIVO_FIAT_BASE_URL`,
`YATIVO_CRYPTO_BASE_URL`, `YATIVO_API_KEY`, `YATIVO_API_SECRET`,
`YATIVO_WEBHOOK_SECRET`, `APP_BASE_URL`, `WEB_APP_URL`, `LOG_LEVEL`.
`apps/web/.env`: `VITE_API_BASE_URL`, `VITE_APP_NAME`.

## Setup & Verification

```bash
corepack enable
docker compose up -d                 # postgres + redis
pnpm install
pnpm --filter api prisma migrate dev --name init
pnpm --filter api prisma db seed
pnpm turbo run dev                   # api:4000, web:5173
```

Seed creates: one `StaffUser` (owner@example.com, role OWNER), platform
accounts (`YATIVO_SETTLEMENT[USD]`, `SUSPENSE_PENDING[USD]`,
`PLATFORM_FEE_REVENUE[USD]`), one `Customer` ("Jane Doe",
portal login jane@example.com) with `CUSTOMER_WALLET[USD]`, then via
`postTransaction`: a POSTED $1,000.00 deposit, a POSTED $5.00 fee, a
PENDING $100.00 payout hold → expected available = $895.00, pending =
$100.00.

**Verify:**
1. SQL invariant check — no transaction's entries sum to nonzero
   (debits == credits) per transaction.
2. `GET /wallets/:id/balance` returns `available=89500`, `pending=10000`.
3. Log into `/portal` as Jane — wallet card + statement match those
   numbers; log into `/admin` as owner — Jane's customer detail page
   shows the same ledger.
4. `POST /admin/reconciliation/run` against a deliberately-mismatched mock
   fixture produces a `ReconciliationReport` with `status=MISMATCH`.
5. Fire two concurrent payouts exceeding the combined available balance —
   exactly one succeeds (proves row-level locking prevents the race).

### Critical files
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/ledger/postTransaction.ts`
- `apps/api/src/webhooks/dispatcher.ts`
- `packages/yativo-sdk/src/client.ts`
- `apps/web/src/theme/branding.ts`
- `apps/web/src/router.tsx`
