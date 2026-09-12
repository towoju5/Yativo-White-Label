# Yativo White-Label — Fix-Up TODO

Source of truth: `https://docs.yativo.com` (fiat + crypto). Every item below must be verified
against the live docs/OpenAPI spec before implementation — do not trust memory of Yativo's API shape.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (note why)

> **2026-08-21 status note:** Beneficiaries, payouts, virtual accounts, virtual cards, deposit
> payment-links, and customer/KYC submission are now wired to the real API (live mode, real
> credentials in `apps/api/.env`). Verification used the docs pages linked inline below, the
> `Yativo API v2.postman_collection.json`, and direct live GET/validation-probe calls — not the
> `openapi-*.yaml` specs (never located a working link to them; the `.md` reference pages + Postman
> collection + live probing were treated as equivalent ground truth). Auth is `X-Api-Key` /
> `X-Api-Secret` headers throughout (per explicit product decision, not the bearer-token flow the
> docs describe for some endpoints — see the auth note under §0).
>
> **Same-day follow-up:** the KYC/KYB submission flow was rebuilt as a proper multi-step wizard
> (`apps/web/src/pages/portal/kyc/`) against `KYC_KYB_INTEGRATION_GUIDE.md` (generated from
> Yativo's live validation source, more precise than the docs pages) — correct per-flow enum
> casing, live country/subdivision/postal-code/occupation/account-purpose/source-of-funds lookups,
> 100KB–4MB file validation, and **multi-owner support** (add/remove associated persons, each
> requiring the 2 identity documents — tax ID + photo ID — the guide mandates). Along the way, two
> unrelated pre-existing bugs were found and fixed: signup never issued a session token, and
> Business-type signup was permanently broken (a stale react-hook-form field registration). Also
> added: live-wired deposit currency picker + KYC-approval gating on beneficiary/payout/virtual
> account/card actions (see §3, §4).

---

## 0. Setup / Discovery

- [x] ~~Fetch and diff current OpenAPI specs~~ — done via the `fiat-api-reference/*.md` pages +
      `Yativo API v2.postman_collection.json` + live probing instead (no working link to
      `openapi-fiat.yaml`/`openapi-crypto.yaml` was found). Verified endpoints: customers, KYC
      (individual + business), beneficiaries/payment-methods, payouts, virtual accounts, virtual
      cards, deposits, payment-methods (payin/payout), locations, occupation-codes.
- [x] Locate the white-label project root and map existing files for auth/token handling,
      deposits, payouts, beneficiaries, virtual accounts, KYC/KYB status, webhooks.
- [x] Confirm which auth flow is in use — **not** `POST /auth/token` bearer flow; using
      `X-Api-Key`/`X-Api-Secret` headers on every request (`packages/yativo-sdk/src/client.ts`).
      Deleted the old bearer-token manager. **`[!]` partially blocked:** live-tested and confirmed
      this API key works for payouts, virtual accounts, deposits, payment-methods, locations,
      occupation-codes, and **both KYC submit endpoints** — but returns 401 Unauthenticated on
      `GET/POST /customer`, `/customer/{id}`, `/beneficiaries/payment-methods/*`, and
      `/customer/virtual/cards/*`. Those specific route groups need Yativo to extend API-key
      auth to them (or a bearer-token exchange, which was explicitly declined for now — see chat
      history 2026-08-21).
- [x] Confirm `.env` has correct base URLs for fiat vs crypto (and now KYC, a third host):
      `YATIVO_FIAT_BASE_URL=https://api.yativo.com/api/v1`,
      `YATIVO_KYC_BASE_URL=https://kyc.yativo.com` (new). `YATIVO_CRYPTO_BASE_URL` removed entirely
      (2026-09-12) — `crypto.yativo.com` is a separate Yativo product this project doesn't use.
- [x] Audit webhook receiver against `yativo-fiat/webhooks.md` — event types confirmed via
      `docs.yativo.com/yativo-fiat/webhooks.md`: `deposit.{created,updated,completed}`,
      `payout.{updated,completed}`, `customer.created`, `customer.kyc.{approved,rejected}`,
      `virtual_account.{deposit,funded}`. Signature verification (`X-Yativo-Signature`/`Signature`
      header, HMAC-SHA256 over the raw body) matches `verifyYativoSignature` already in place.
      Found and fixed two real gaps in `apps/api/src/webhooks/dispatcher.ts`: `payout.completed`
      and `deposit.completed` were falling through to "unrecognized eventType" (no docs-given
      payload example for either, but same resource family/shape as their `.updated` siblings, same
      convention already used for `business_spend_card.*`) — now routed through the existing
      handlers. Added `customer.kyc.approved`/`.rejected` as recognized-but-ignored (KYC is always
      read live, same rationale as `endorsement.updated`) and `virtual_account.funded` as
      recognized-but-ignored (distinct from `virtual_account.deposit` per the docs' event table, but
      no payload example given — not safe to auto-process on a guess). Payout status vocabulary
      remains only partially documented (docs confirm just `"completed"` as an example value); the
      existing `classifyStatus` safety-net design in `payoutPoll.worker.ts` (explicit
      success/failure sets, unknown statuses stay PENDING rather than guessed) was already the
      correct posture for that gap and needed no change.

---

## 1. Deposit (Payin) Flow

**Target flow:** fetch gateways → generate quote → submit deposit → return/display deposit link.

- [x] "List available gateways" — `GET /my-payin-methods` (business-scoped list, `fiat/paymentMethods.ts`
      `listPayinMethods()`), filtered by currency in `deposits.routes.ts`. Not country-first (see
      note in §2) — this endpoint doesn't take a country param, it's scoped to the business's
      enabled rails.
- [x] Quote generation before deposit — **done 2026-09-12, see §6a.** Yativo's exchange-rate quote
      endpoint (`POST /exchange-rate`, `method_type: "payin"`) was located and confirmed live;
      `POST /portal/deposit/quote` + `quoteId` support in `fiat/deposits.ts#create()` lock the rate
      for ~5 minutes before `POST /wallet/deposits/new` is actually called.
- [x] Deposit creation — `fiat/deposits.ts` → `POST /wallet/deposits/new`, live request/response
      shape confirmed via docs + Postman (`deposit_url`, `deposit_data`). Now quote-locked (see
      above) instead of a raw amount.
- [x] Deposit link captured + rendered — `deposit_url` returned as `depositUrl`, shown with
      copy/open actions on the portal Deposit page ("pay by link" section).
- [x] `List Deposits` — **done 2026-09-12, see §6a.** No new Yativo call needed: local `Deposit`/
      `LedgerTransaction` rows already exist from initiate time; a "Recent deposits" card was added
      to `DepositPage.tsx` against the existing `GET /portal/transactions?type=DEPOSIT`.
- [!] Status polling/tracking (`Track Transaction`) + webhook reconciliation — webhook side is done
      (`deposit.completed` now dispatches correctly, see §0's 2026-09-12 update). **Blocked, not a
      code gap:** attempted to add a `payoutPoll.worker.ts`-style fallback poller and live-tested
      `GET /wallet/deposits` (2026-09-12, GET-only, non-destructive) against the real credentials in
      `apps/api/.env` before writing any code against it — confirmed **401 "Invalid or revoked API
      credentials"**, the same access-scope gap already documented in §0 for `/customer`,
      `/beneficiaries/payment-methods/*`, and `/customer/virtual/cards/*` (the API key works for
      `/locations/countries` and other endpoints in the same pass, so this isn't a bad key — Yativo
      hasn't extended API-key auth to this route). Nothing to build here until that's resolved.
- [ ] Error handling for expired quote / unsupported currency / gateway-down — the new quote flow's
      countdown UI prevents most late-expiry submissions client-side, but there's no server-side
      translation of Yativo's expired-quote/gateway-down error codes into a specific `AppError` —
      still surfaces as a generic error today. Only the pre-existing "no deposit method for this
      currency" 404 (`NO_PAYIN_METHOD`) is specifically handled.

---

## 2. Payout (Send Money) Flow

**Target flow:** select country → get payment methods for country → select/add beneficiary →
fill dynamic payout form → (optional) 2FA → submit → send to Yativo API.

- [!] Country selector — **not built.** The real form-driving endpoint (`GET /beneficiary/form/all`,
      964 entries live) is keyed by **currency + gateway_id**, not country, so the beneficiary UI
      was built currency-first instead of country-first. `GET /payment-methods/payout/countries`
      exists and works but wasn't wired in — worth adding if a country-first UX is still wanted.
- [x] Dynamic form schema — `GET /beneficiary/form/all` drives the "add beneficiary" form
      end-to-end (currency → gateway/payout method → the exact `payment_data` fields that gateway
      requires). This was confirmed to be the actual root cause of "dummy" beneficiary creation —
      the old code never called Yativo at all, just wrote to the local DB.
- [x] Beneficiary CRUD:
  - [x] List — local DB, synced at creation time.
  - [x] Create — `POST /beneficiaries/payment-methods` (real call, was previously a no-op).
  - [x] Payment method IS the beneficiary in this API (no separate attach step needed).
  - [x] Archive — calls `DELETE /beneficiaries/payment-methods/delete/{id}` before local soft-delete.
  - [!] Update (`PUT /beneficiaries/payment-methods/update/{id}`) — **blocked, not a code gap:**
        live-tested `GET /beneficiaries/payment-methods` (2026-09-12, GET-only, non-destructive)
        before building UI for the update endpoint — confirmed **401 "Invalid or revoked API
        credentials"**, same `/beneficiaries/payment-methods/*` access-scope gap already documented
        in §0. Not safe to build a UI around an endpoint family confirmed unreachable with the
        current API key.
- [x] "Quote before send" — **resolved differently than planned:** there is no dedicated payout
      quote endpoint for same-currency wallet payouts (`POST /wallet/payout` just takes an amount +
      currency). `/portal/quotes` was rewritten as a local review-step calculation (0 fee, rate
      1.00) instead of a fake Yativo call — the old code called a `/quotes` path that doesn't exist
      on Yativo's side and would have hard-blocked this flow in live mode.
- [!] 2FA / transaction PIN — **blocked, not a code gap:** live-tested `GET /is-pin-set`
      (2026-09-12, GET-only, non-destructive) — confirmed 401, same access-scope gap as the other
      `[!]` items in this file. Not investigated further since there's nothing to wire up yet.
- [x] Submit — confirmed `POST /wallet/payout` ("New Withdrawal" in Postman) is the correct
      endpoint for this white-label's wallet-based payout model; `Idempotency-key` header included.
      Batch payout was not investigated (no bulk-send UI exists).
- [x] `List Payouts` / `Get Payout` — **stale, corrected 2026-09-12:** local DB list/detail exist
      (`portalPayoutsRoutes`), and `payouts.getStatus()` IS actually called —
      `payoutPoll.worker.ts` (a BullMQ worker, enqueued on every payout creation) polls it as a
      fallback safety net alongside the webhook, with backoff up to `MAX_POLL_ATTEMPTS`. This item
      was investigated fresh (not just re-read) during the §6b hardening pass and confirmed working
      as designed — the original note describing it as dead code was itself wrong.
- [x] Status tracking + webhook reconciliation — **done 2026-09-12, see §0's webhook audit.**
      `payout.handler.ts` handles `payout.updated`; the dispatcher gap that left `payout.completed`
      unrecognized is fixed. Payload shape (`payoutEventPayloadSchema`) was already confirmed live
      in an earlier pass (see the "confirmed live" code comment in `webhooks/types.ts`).
- [~] Error handling — added: insufficient funds, beneficiary never linked to Yativo
      (`BENEFICIARY_NOT_LINKED`). Not added: invalid form fields per gateway (Yativo's own 422
      surfaces raw), expired quote (n/a now), country/beneficiary currency mismatch.

---

## 3. Virtual Account Flow

**Target flow:** fetch virtual account currencies → check customer endorsement for that currency
→ create virtual account.

- [x] Currency list — wired: `virtualAccounts.listSupportedCurrencies()` →
      `GET /portal/deposit/currencies` (filters Yativo's real ISO codes out from its rail-specific
      pseudo-codes like `EURBASE`/`USDCOBO`) → Deposit page's currency `<Select>` now live-populated
      instead of a hardcoded USD/EUR list. Also seeded `Currency` rows for all 9 codes Yativo
      returned live (was USD-only, which would've thrown on any non-USD payout/card/deposit
      decimals lookup).
- [x] Endorsement/eligibility check before creation — **KYC half done, endorsement half not.**
      Added `requireKycApproved()` gating (customer must be `kycStatus: APPROVED`) before
      beneficiary creation, payout, virtual-account creation, and card issuance — verified live
      (unverified customer → 403 `KYC_REQUIRED`; seeded KYC-approved `jane@example.com` → passes).
      Per-currency **endorsement** checking (distinct from KYC approval) is still not implemented.
- [x] Create — `getOrCreate()` in `fiat/virtualAccounts.ts`: checks
      `GET /business/virtual-account/customer/accounts/{id}` first, creates via
      `POST /business/virtual-account/create` if none exists for that currency. Response shape
      (`account_info`, wildly inconsistent per corridor) confirmed and handled live.
- [x] List/detail/history — **corrected 2026-09-12:** `GET /portal/virtual-accounts` +
      `VirtualAccountsPage.tsx` already existed (this bullet was stale even describing the
      pre-session state). Per-account transaction history added in §6a (expandable "Recent
      activity" per account, scoped by currency since accounts are one-per-currency). Still
      missing: a delete/close-VA route — Yativo's API for this wasn't located/confirmed.

- [x] `currencies-and-endorsements` — **already done, this bullet was stale.**
      `virtualAccounts.listSupportedCurrencies()` (`packages/yativo-sdk/src/fiat/virtualAccounts.ts:57`)
      calls exactly this endpoint; `virtualAccounts.routes.ts` cross-references it against the
      customer's endorsements before allowing creation.
- [x] Error handling for un-endorsed currency / no KYC — also already done: `ENDORSEMENT_REQUIRED`
      (409) and the KYC gate both throw specific `AppError`s, surfaced in the portal UI.

**Known account-level blocker (not a code bug):** `GET /business/configs` shows
`can_issue_bra_virtual_account`, `can_issue_mxn_virtual_account`, `can_issue_arg_virtual_account`
all `false` for this business — those three corridors will fail regardless of code correctness
until Yativo enables them.

---

## 4. Cross-Cutting / Shared

- [x] Centralize a single API client — `packages/yativo-sdk/src/client.ts`: one `performRequest`,
      one header/auth injection point, one envelope-unwrap helper (`yativoEnvelope`). No retry/backoff
      exists (removed the old fake 401-retry-via-token-refresh; not replaced with anything, since
      API-key auth has no refresh concept).
- [x] Normalize error responses — **corrected 2026-09-12, this bullet was stale.**
      `apps/api/src/lib/errors.ts` (`AppError` + subclasses) is used consistently, and
      `app.ts`'s global error handler already fully translates `YativoApiError`: 401/403 → a
      friendly 503 (`PROVIDER_AUTH_ERROR`, the known auth-scope-gap case), other 4xx → the parsed
      upstream message via `parseYativoErrorMessage` (handles the documented + validator-shape
      variants), 5xx → a generic 502. Nothing left to build here.
- [x] KYC/KYB gating checked consistently — `apps/api/src/lib/requireKycApproved.ts` gates
      beneficiary creation, payout, virtual-account creation, and card issuance on
      `customer.kycStatus === "APPROVED"`, verified live (403 `KYC_REQUIRED` for unapproved,
      passes for approved). Deposit payment-links were deliberately left ungated (deposits-only,
      no custody risk before KYC, matching how most fintechs treat inbound funds) — revisit if
      that's not the intended policy.
- [~] Sandbox vs production base URL — `YATIVO_MODE` (`mock`/`sandbox`/`live`) is independent of
      the base-URL env vars; switching to sandbox requires manually pointing
      `YATIVO_FIAT_BASE_URL` at `https://sandbox.yativo.com/api/v1` (seen as a disabled Postman
      variable, never confirmed live) — no automatic mode→URL switch exists.
- [x] Sweep hardcoded field/country/currency lists — countries + occupation codes come live from
      `/locations/countries` and `/auth/occupation-codes` (KYC form); the deposit page's wallet
      picker is also live (`GET /portal/wallets`) — this bullet's claim that it was still
      hardcoded to USD/EUR was stale, corrected 2026-09-12. Card currency is genuinely USD-only by
      design, not a gap: confirmed via `packages/yativo-sdk/src/fiat/cards.ts`'s own doc comment —
      "Yativo only issues Visa/virtual/USD cards today," no currency param exists on that API at all.
- [x] Webhook idempotency — **already handled, this bullet was stale.** `webhooks/yativo.routes.ts`
      derives a stable `externalEventId` per delivery (`deriveExternalEventId`) and relies on its
      unique DB constraint — a P2002 conflict on re-delivery short-circuits as a no-op duplicate
      rather than reprocessing.

---

## 5. Verification

- [~] Happy-path runs — **GET-only live verification done** (safe, non-destructive): beneficiary
      forms catalog, payin methods, virtual account listing, countries, occupation codes, wallet
      balance, profile, payouts list, deposits list, business config. **Destructive POST flows
      (create customer, create beneficiary, send payout, issue card, create deposit link) were
      deliberately NOT exercised live** — only schema-validated against mock fixtures and the
      docs/Postman examples. These need a real sandbox/low-value live run before trusting them
      fully.
- [ ] Deliberate failure-path UI checks (bad country, expired quote, unendorsed currency) — not
      done at the UI level. Some failure shapes were probed directly against the API
      (missing-field validation on both KYC endpoints) but not routed through the UI.
- [x] Webhook event confirmation — **done 2026-09-12, see §0.** Event types, signature verification,
      and dispatcher coverage were all audited against `docs.yativo.com/yativo-fiat/webhooks.md`;
      the two real gaps found (`payout.completed`/`deposit.completed` unrecognized) are fixed.

---

## 6a. Deposit & virtual account history + deposit rate-lock (2026-09-12)

- [x] Deposit history — no new endpoint needed: deposits already post local `Deposit`/`LedgerTransaction`
      rows at initiate time, and `GET /portal/transactions?type=DEPOSIT` already existed. Added a
      "Recent deposits" card to `DepositPage.tsx` reusing that endpoint + the existing
      `TransactionCardRow` component, with a link to the full Transactions page.
- [x] Virtual account per-account activity — virtual accounts are provisioned one-per-currency
      (get-or-create, confirmed in `virtualAccounts.routes.ts`), and their deposits post as
      `type: "DEPOSIT"` in that same currency (`virtualAccountDeposit.handler.ts`) — so
      `currencyCode` on the existing transactions endpoint is a reliable per-account scope with no
      schema change. Added an expandable "Recent activity" section per account card in
      `VirtualAccountsPage.tsx`.
- [x] Deposit rate-lock — confirmed via `docs.yativo.com/yativo-fiat/deposits.md` that a real quote
      endpoint exists (`POST /exchange-rate`, `method_type: "payin"`, returns a `quote_id` that
      locks the rate ~5 minutes), the payin counterpart to the payout-side quote flow that already
      existed. Added `quoteId` support to `fiat/deposits.ts`'s `create()`, added
      `POST /portal/deposit/quote`, and reworked `DepositPage.tsx`'s wizard to quote-then-confirm
      (with a live countdown and re-quote-on-expiry) instead of the old fake "confirmed" gate that
      existed only because no real quote call was known to exist at the time.
- [x] **Correction, 2026-09-12 (user-reported + live samples provided):** the initial payin-quote
      implementation wrongly reused the payout quote's response schema — assumed the same
      `calculator`/`payout_data` nesting and a `rate` field. The real payin response
      (`method_type: "payin"`) is structurally unrelated: flat fields `deposit_amount`,
      `exchange_rate`, `fixed_fee`/`float_fee`/`percentage_fee`/`total_fees`, and
      `credited_amount` — confirmed via a live COP→COP sample (100 COP deposit, `total_fees`
      3152.23, `credited_amount` **-3052.23**, i.e. fees can exceed the deposit and the result is
      genuinely negative). Fixed: `quotes.ts` now has a separate `createPayin()` with its own
      schema (`create()` stays payout-only, `methodType` param removed since each is now a
      dedicated method); `/portal/deposit/quote` computes this platform's own fee on top of
      Yativo's (`getEffectiveFee`, same base+upstream-fee convention `/portal/deposit/initiate`
      already used) so the quote preview shows the real final net amount, not just Yativo's;
      `depositQuoteSchema` gained `yativoFee`/`creditedAmount`/`platformFee`/`platformFeeLocal`/
      `netReceiveAmount` (replacing the wrong `receiveAmount` field); `DepositPage.tsx`'s quote
      panel shows the full fee breakdown and blocks confirming (with an explicit warning) when the
      net amount would be negative.

## 6b. Multi-channel notification system (2026-09-12)

- [x] `Notification` + `PushSubscription` Prisma models (migration `notification_center_and_push`).
      In-app center backed by `GET /portal/notifications`, `/unread-count`, `/read-all`, `/:id/read`.
- [x] `sendNotificationEmail()` (kept its name — ~15 existing call sites, no churn) now always
      persists a `Notification` row and fans out to every enabled channel, not just email:
      `apps/api/src/modules/notifications/channels/{webPush,sms}.ts` and `whatsapp/` (provider
      dispatcher over `meta`/`twilio`/`custom_webhook`, each admin-selectable with its own
      credentials — `apps/api/src/lib/notificationChannelConfig.ts`, encrypted via the existing
      `SecureSetting`/`credentialEncryption.ts` machinery, same pattern as platform-integrations).
      Each channel is a safe no-op (logged, not thrown) until an admin configures it — ships
      working today on email + web push (self-issued VAPID keys, generated on first boot).
- [x] `channels/slack.ts` + `channels/telegram.ts` + `channels/opsAlert.ts` — internal ops alerting
      (not per-customer), wired into: webhook signature failures that survive the auto-resync
      (`webhooks/yativo.routes.ts`), failed payouts from both the webhook and poll-worker paths
      (`payout.handler.ts`, `payoutPoll.worker.ts`), and KYC/KYB submissions pending review
      (`kyc.routes.ts`, both individual and business).
- [x] Admin settings: `GET/PUT /admin/settings/notification-channels` +
      `NotificationChannelsSettingsPage.tsx` (added to every template's admin nav — prime, nova,
      meridian, aurora, atlas). Portal: `NotificationBell` (real dropdown, unread badge, mark-read)
      wired into all 5 templates (2026-09-12 follow-up) — `prime`'s Topbar, `nova`/`meridian`/
      `aurora`'s Sidebar header row, `atlas`'s Topbar. **Correction caught during the follow-up:**
      the first pass hardcoded the bell directly into these shared Topbar/Sidebar components, which
      are reused by BOTH `PortalShell` and `AdminShell` in every template — that would have made
      the bell render in the admin console too, firing `/portal/notifications` calls with no
      customer session to authenticate them. Fixed by adding an opt-in `showNotifications` prop,
      passed only from each template's `PortalShell.tsx`; no `AdminShell.tsx` passes it.
- [x] Web push subscribe/unsubscribe flow (`usePushSubscription.ts`, `PushNotificationsCard.tsx` in
      portal Settings) + `push`/`notificationclick` listeners in `apps/web/public/sw.js`.
- **Scoped out:** per-customer channel preferences (opt out of SMS but keep email, etc.) — only a
      global per-channel admin enable exists today, plus the existing type-level `disabledTypes`
      toggle. A preference matrix is a reasonable follow-up, not built this pass.

## 6c. Support ticket tracking (2026-09-12)

- [x] `SupportTicket`/`SupportTicketMessage` Prisma models replace the old "email only, nothing
      tracked" flow. `support.service.ts` still forwards to the support inbox on the first message
      and on every reply (nothing changes for how staff get paged) but now persists the full thread
      + status (`OPEN`/`IN_PROGRESS`/`RESOLVED`/`CLOSED`).
- [x] Portal: `SupportPage.tsx` gained a "Your tickets" list + thread dialog with reply
      (`GET/POST /portal/support/tickets*`). Admin: new `SupportTicketsPage.tsx` queue with
      reply + status change (`GET/POST/PATCH /admin/support/tickets*`), added to every template's
      admin nav.

## 6d. Security/ops hardening + login page cleanup (2026-09-12)

- [x] Dead module cleanup: deleted `apps/api/src/modules/{identity,payments,trading,webhooksAdmin}`
      (confirmed empty, confirmed unreferenced anywhere).
- [x] Login/OTP throttling: `/auth/login` (staff), `/portal/auth/login`, `/portal/auth/2fa/verify`
      now carry a tighter per-route `@fastify/rate-limit` override (10/min) than the global 200/min
      default — native plugin feature, no new dependency.
- [x] Device/session management: `CustomerRefreshToken` gained `ip`/`userAgent`/`lastUsedAt`,
      populated at login/refresh (`SessionMeta` threaded through `issueSession`,
      `refreshCustomerSession`, etc. in `portalAuth.service.ts`). Access tokens now carry a
      `sessionId` claim (`PortalAccessClaims.sessionId`) so `GET/DELETE /portal/security/sessions*`
      can identify and revoke a specific device. Portal Settings gained a real "Active sessions"
      card.
- [x] Customer-facing audit trail: `CustomerAuditLog` model + `logCustomerAction()` helper, wired
      into login (password/2FA/passkey), password change, password reset, 2FA enable/disable, and
      beneficiary-added. `GET /portal/security/activity` + a "Security activity" card in Settings.
- [x] Withdrawal/spend limits: `CustomerLimits` (per customer+currency override) and
      `PlatformLimitsDefault` (per-currency platform default) models — a currency with neither has
      no limit at all, this is opt-in. Enforced in `payouts.service.ts#createPortalPayout` against
      the sum of non-reversed payouts in the daily/monthly window. Admin UI (2026-09-12 follow-up):
      `LimitsSettingsPage.tsx` (`/admin/settings/limits`, added to every template's nav) manages
      platform defaults per currency; a "Withdrawal limit overrides" card on
      `CustomerDetailPage.tsx` manages per-customer overrides against that customer's actual wallet
      currencies. Both convert major-unit input to/from the API's minor-unit strings client-side.
- [x] **Found and fixed a genuinely broken feature while in Settings**: the "Change password" card
      was a fake form that only ever toasted "not available yet" — no backend route existed at
      all. Built `changeCustomerPassword()` + `POST /portal/auth/change-password` (verifies current
      password, revokes every session, logs the event) and wired the real form.
- [x] Staff invite email: `StaffUser.passwordHash` is now nullable (mirrors
      `CustomerTeamMember`'s pending-invite pattern) with `inviteTokenHash`/`inviteExpiresAt`/
      `acceptedAt`. `inviteStaff()` emails a real "set your password" link instead of returning a
      temp password; `POST /auth/accept-invite` + new `AdminAcceptInvitePage.tsx`
      (`/admin/accept-invite`) redeem it. `loginStaff`/`changePassword` guard the now-nullable hash.
      Team page shows an "Invite pending" badge (`StaffUserDto.invitePending`) instead of the old
      copy-this-password dialog. The separate admin-forced `resetStaffPassword` (temp password,
      relayed out-of-band) is untouched — legitimate, different feature.
- [x] Magic-link customer login: `PlatformSettings.customerLoginMethod` (`PASSWORD` default |
      `MAGIC_LINK`), admin-editable from Settings → Verification (`PATCH
      /admin/settings/customer-login-method`), publicly readable via `GET /portal/auth/config` so
      the login page knows which form to show before authenticating. `Customer` gained
      `magicLinkTokenHash`/`magicLinkExpiresAt` (15 min TTL, single-use). `POST
      /portal/auth/magic-link/request` (silent no-op for unknown email, rate-limited) + `POST
      /portal/auth/magic-link/verify` (issues a real session, same as password login). New
      `MagicLinkPage.tsx` (`/portal/magic-link`) auto-redeems on load. Password login is untouched
      either way — this only changes the portal login page's default form.

## 6e. Landing page removed, password reset added (2026-09-12, user request mid-session)

- [x] Root `/` now renders the portal login page directly instead of a marketing landing page.
      Deleted `apps/web/src/pages/marketing/LandingPage.tsx` and all 5 per-template
      `LandingPage.tsx` files + their registrations (`templates/*/index.ts`,
      `templates/types.ts`) — confirmed zero remaining references anywhere. The catch-all `*` route
      and `RequireStaffAuth`'s unauthenticated fallback (`router/guards.tsx`) now render a new
      generic `NotFoundPage.tsx` instead — preserves the existing deliberate security property that
      an unauthenticated hit on `/admin` looks exactly like an unknown route (see that file's
      comment), which pointing it at the customer login page would have broken.
- [x] Full "forgot password" flow, which never existed for customers before this: `Customer` gained
      `passwordResetTokenHash`/`passwordResetExpiresAt` (same hash-not-raw-token pattern as email
      verification); `POST /portal/auth/forgot-password` (silently no-ops for an unknown email,
      rate-limited) emails a 1-hour link; `POST /portal/auth/reset-password` redeems it, revokes
      every session, and logs it to the new audit trail. New `ForgotPasswordPage.tsx` /
      `ResetPasswordPage.tsx`, linked from a new "Forgot password?" link on the login form.

## 6f. Realtime support chat (2026-09-12, user request)

- [x] Instant delivery — reused the existing `/ws` + Redis pub/sub infrastructure built for live
      wallet balances (`apps/api/src/lib/realtime.ts`) rather than building a parallel system: a
      new `support-ticket:${ticketId}` channel, published to by `support.service.ts` right after
      any message (customer submit, customer reply, staff reply) is persisted. Both
      `SupportPage.tsx` (portal) and `SupportTicketsPage.tsx` (admin) patch the message straight
      into the react-query cache on receipt — no polling, no refetch round-trip.
- [x] Notification sound — `lib/chatSound.ts`, a short two-tone beep synthesized with the Web Audio
      API (no bundled audio asset). Plays on the receiving side only (staff beep on customer
      messages, customer beeps on staff replies) — never for your own just-sent message.
- [x] "Not online" fallback notification — **reused existing infrastructure instead of adding
      FCM**: presence is tracked per ticket per side (`TicketSide` in `realtime.ts`) via a
      Redis counter incremented/decremented as WS connections watch/unwatch a ticket (correct
      across multiple API instances, unlike the local EventEmitter). When a message is published
      and the other side isn't currently watching: a customer message with no staff present goes
      to the ops Slack/Telegram alert channels (already built in §6b); a staff reply with the
      customer absent goes out via the existing customer web-push channel (also §6b, self-issued
      VAPID — no new vendor).
- [x] Access control: a customer can only watch their own ticket (verified against the DB on
      `watch-ticket`, not just trusted from the client); staff can watch any, matching the existing
      admin access model for wallet channels.

## 6g. Live permission checks + role-modal scroll fix (2026-09-12, user request)

- [x] **"Permissions must always be up to date"**: found and fixed a real gap — `requirePermission`/
      `requireRole` (staff) and `requirePortalPermission` (business team members) all trusted the
      role/permissions *claims baked into the JWT at login/refresh time*, explicitly documented in
      their own old comments as "takes effect on next token refresh, not instantly." With a 15-
      minute default access-token TTL, revoking a permission, demoting a role, or deactivating a
      staff/team-member account could stay silently in effect for up to 15 minutes. Fixed: all
      three now re-fetch the current role/permissions/`isActive` from the DB on every gated
      request instead of trusting the token claim — a change now takes effect on the very next
      request, not the next login. Removed `isPortalOwnerLevel()` (`lib/portalPrincipal.ts`) since
      it was the one other place trusting a stale `role` claim, and had no other caller once
      `requirePortalPermission` stopped using it.
- [x] Permissions modal scroll bug: `RolesPage.tsx`'s `RoleFormDialog` had a `max-h-72
      overflow-y-auto` permissions list nested INSIDE `DialogContent`'s own `max-h-[85vh]
      overflow-y-auto` (a global default for every dialog in the app) — two independent scroll
      containers, where the inner one's artificial 288px cap left the outer modal with a lot of
      unused space around a small, separately-scrolling box. Removed the inner cap; the list now
      flows naturally and the outer dialog is the only thing that scrolls, only when actual content
      exceeds 85% of the viewport.

## 6h. Admin action attribution — "who did this" audit trail (2026-09-12, user request)

- [x] New `AdminAuditLog` model (`actorId`, `action`, `target`, `metadata Json?`, `createdAt`,
      indexed on `[actorId, createdAt]` and `[target]`) + `logAdminAction(prisma, actorId, action,
      target, metadata?)` helper in `apps/api/src/lib/adminAuditLog.ts` — swallows its own errors
      (an audit-log failure must never fail the action it's describing), same posture as
      `sendNotificationEmail`. `SYSTEM_ACTOR_ID = "system"` is the sentinel for anything automated.
- [x] **Centralized rather than per-call-site**: `reverseTransaction()` and
      `settlePendingTransaction()` (`apps/api/src/modules/ledger/`) — the shared primitives called
      from ~12 places (admin routes, webhook handlers, the payout-poll worker, card
      failure-cleanup paths) — now take an `actorId` parameter defaulting to `SYSTEM_ACTOR_ID` and
      log the action themselves, once, right after their DB write commits. This means every
      existing caller gets correct attribution automatically: admin-triggered calls pass
      `request.staffUser!.sub` through `adminSettleTransaction`/`adminReverseTransaction`
      (`transactions.service.ts`), and every other caller (webhook-driven settlement, poll-worker
      reversal, etc.) needs no code change at all — it silently logs as "System." No future caller
      of these two functions can forget to attribute the action.
- [x] Extended the same `logAdminAction` call to the other admin-visible mutations a "who did this"
      trail is actually for: KYC approve/reject (`customers.service.ts` — reject's reason, never
      persisted to its own column before, is now captured queryably via the log's metadata),
      customer freeze/unfreeze, staff role changes and deactivate/reactivate
      (`auth.service.ts`), and platform-wide + per-customer withdrawal limit overrides
      (`limits.service.ts`).
- [x] New admin-only `GET /admin/audit-log` route (`modules/security/adminAuditLog.routes.ts`,
      OWNER/ADMIN only) + `AuditLogPage.tsx` (`/admin/audit-log`, added to nav in all 5 templates)
      — paginated, filterable by target id, resolves `actorId` to the staff member's email (or
      "System"), with a detail sheet for the metadata.
- [x] The admin transaction detail dialog (`AdminTransactionDetailDialog.tsx`) now shows "Settled
      by" / "Reversed by" / "Released by" inline — `getTransactionDetailForAdmin` looks up the most
      recent `AdminAuditLog` row targeting that transaction id and resolves the actor label. This
      is the exact scenario the user asked for: "if admin A marks a deposit as reversed, other
      admin members should be able to see it was done by admin A... when it was done by the system
      it should also say it was the system."
- [ ] Not yet covered by `logAdminAction`: card admin actions (freeze/unfreeze/terminate on
      `cards.service.ts`/`businessSpendCards.service.ts`), branding/settings changes, webhook
      replay. Lower priority than the ledger/KYC/customer-status/staff actions above since those
      were the user's explicit example scenario.

## 6j. New-location login step-up + staff TOTP (2026-09-12, user request)

- [x] **New model `KnownLoginLocation`** (`principalType`, `principalId`, `country`, unique on the
      triple) — one row per (customer or staff) × country a login has ever succeeded from.
      Country-grained, not IP-grained, so normal ISP/VPN churn within the same country never false-
      positives. `apps/api/src/lib/loginLocationGuard.ts`: `isNewLoginLocation()` (geoip-lite —
      already a dependency, previously only used for language-detection — looks up the login IP's
      country; returns false if ungeolocatable, or if this is the principal's very first login ever
      since there's nothing yet to compare against) and `recordLoginLocation()` (upserts
      lastSeenAt — called from every successful session issuance for both customer and staff).
- [x] **Customer portal**: `loginCustomer` — 2FA-enabled accounts are unaffected (2FA already gates
      every login regardless of location, satisfying "require email/2FA verification" already).
      For accounts WITHOUT 2FA, a login from a never-seen country now returns
      `{requiresEmailStepUp: true, challengeToken}` instead of a session; a 6-digit code (Redis,
      10 min TTL, `lib/emailStepUp.ts`) is emailed, and `POST /portal/auth/step-up/verify`
      (`verifyEmailStepUpLogin`) redeems it for the real session. `LoginPage.tsx` reuses the
      existing 2FA challenge-code screen, keyed by a new `challengeMode: "2fa" | "stepup"` so both
      cases share one UI with different copy.
- [x] **Staff admin login — built from scratch, since none of this existed for staff before**:
      - Full TOTP + backup-code 2FA for `StaffUser` (mirrors the customer's `twoFactor.service.ts`
        exactly): schema fields `twoFactorEnabled/twoFactorSecret/twoFactorBackupCodeHashes`,
        `staffTwoFactor.service.ts`, routes at `/auth/2fa/{status,setup,enable,disable}`, and a new
        "Two-factor authentication" card in `AuthenticationSettingsPage.tsx` (staff's own
        self-service settings page) — reuses the fully-generic `twoFactorStatusSchema` etc. from
        shared-types rather than duplicating them.
      - `RefreshToken` (staff) gained `ip`/`userAgent`/`lastUsedAt` columns (mirroring
        `CustomerRefreshToken`) — staff logins captured **zero** device metadata before this.
      - `loginStaff` now takes a `meta: SessionMeta` (ip/userAgent, via a new `requestMeta()`
        helper in `auth.routes.ts` — didn't exist for staff at all before) and gets the identical
        2FA-first / new-location-email-code-otherwise branching as the portal, via
        `verifyStaffTwoFactorLogin`/`verifyStaffEmailStepUpLogin`. `AdminLoginPage.tsx` gained the
        same challenge-code screen as the portal login page.
      - Every staff login (success, 2FA, or step-up) now writes an `AdminAuditLog` row
        (`staff.login` / `staff.login_2fa` / `staff.login_new_location_pending` /
        `staff.login_new_location_verified`) — staff logins were completely unaudited before this.
- [x] New JWT challenge-token audiences, all short-lived and unusable as real access tokens even if
      leaked: `portal-stepup` (10 min), `admin-2fa` (5 min), `admin-stepup` (10 min) — see
      `lib/jwt.ts`.
- [ ] **Known gap, out of scope for this pass**: business team-member logins
      (`CustomerTeamMember`/`CustomerTeamRefreshToken`) get neither the new-location check nor any
      2FA verification at all, even though `CustomerTeamMember.twoFactorEnabled` already exists as
      a column — `loginCustomer`'s member-fallback branch issues a session directly. Flagged, not
      fixed, since the user's request named "customer/admin" (the account owner and staff), not
      invited team members specifically.

## 6i. Admin "unconfigured settings" reminders (2026-09-12, user request)

- [x] `GET /admin/dashboard/summary` now includes `configReminders[]` — checked live against the
      same mutable config objects every send path already reads (`smtpConfig`,
      `notificationChannelConfig`), so it can never drift out of sync with what's actually
      configured: no SMTP host/sendmail path set, no Slack/Telegram ops-alert channel enabled, no
      branding logo uploaded. Each reminder carries an `actionPath` straight to the relevant
      settings page.
- [x] `DashboardPage.tsx` renders them as a dismissible-per-session banner above the platform
      overview — dismissal is session-only (not persisted), so an actually-still-unconfigured item
      resurfaces next visit rather than being permanently silenceable.

## 6k. UI polish batch: auth pages, transaction detail gaps, platform profit, mobile responsiveness (2026-09-12, user request)

- [x] **Auth pages redesigned**: new shared `AuthShell`/`AdminAuthShell` (`components/auth/`) — a
      two-column layout (brand gradient panel + form, lg+ only; collapses to the original centered
      column below `lg`) replacing the flat centered card every login/signup/forgot-password/
      reset-password/magic-link/verify-email/accept-invite page (portal + admin, 9 pages total) used
      before. One shell change instead of touching each page's visual design individually.
- [x] **Admin payouts had no detail view at all** — `AdminPayoutsPage.tsx` now has a "View details"
      button per row opening the existing `AdminTransactionDetailDialog` via the payout's
      `transactionId` (already on the `Payout` model, just never surfaced). Also resolved
      `beneficiaryName` server-side (`payouts.service.ts`) instead of showing a raw beneficiary id.
- [x] **Customer statements had no detail view** — `StatementsPage.tsx`'s preview table/card rows
      had no click handler and no `TransactionDetailDialog` at all, unlike the main Transactions
      page and Wallet Detail page which already had this wired. Fixed to match.
- [x] **New "Platform profit" admin report** — `GET /admin/dashboard/profit` (date-range filterable)
      sums CREDIT entries to the `PLATFORM_FEE_REVENUE` account (this platform's own markup, never
      Yativo's cut), grouped by transaction type + currency. New `/admin/profit` page with date
      pickers, a type filter, and per-currency total cards.
- [x] **Mobile responsiveness fixes**: found and fixed a real bug present in 4 of 5 templates —
      `StatCard`'s balance/count value (`text-xl`–`text-2xl`) had no `truncate`, so a long currency
      amount could overflow a narrow 2-column mobile stat grid; same fix applied to
      `WalletBalanceCard` amounts. Mobile topbar header (`nova`/`meridian`/`aurora` — `prime`/`atlas`
      already had this) was missing `sticky top-0`, so it scrolled away with page content instead of
      staying pinned; fixed across all three. Mobile header also showed a static "Portal"/"Admin"
      label — now shows the current page's own nav label (new `lib/currentPageLabel.ts` helper,
      matches the current route against each shell's own nav item list) via all 4 templates that
      show a text label (`atlas` shows the real brand logo image there instead, so needed no change).
- [x] Portal `SettingsPage.tsx` converted from a single centered column (`max-w-lg`, all cards
      stacked) to a `grid-cols-1 lg:grid-cols-2` layout (`max-w-4xl`) — less scrolling on desktop,
      unchanged single-column stack on mobile.
- [ ] **Not done — explicitly out of scope for this pass given the size of "check all pages"**: a
      full responsive audit of every remaining page (only Dashboard/Settings and the shared
      StatCard/WalletBalanceCard/Topbar chrome used by every portal page were actually checked and
      fixed). No visual/browser-based testing was available in this environment — all fixes here
      were found via static analysis of the Tailwind classes, not by rendering the pages.

## 6l. Dialog width bug, global loading indicator, push-notification silent failure, strict grid rule (2026-09-12, user request)

- [x] **Root cause of "deposit page not responsive"**: the shared `Dialog` component
      (`components/ui/dialog.tsx`) had `w-full` with no side margin/gutter on `DialogContent` —
      since it's `position: fixed`, `w-full` resolves to 100% of the *viewport*, so on a phone the
      entire deposit wizard (and every other dialog in the app, both portal and admin) rendered
      completely edge-to-edge with zero breathing room. Fixed at the source: `w-[calc(100%-2rem)]`
      gives every dialog a consistent 1rem gutter on narrow screens; unaffected on desktop where
      `max-w-*` already caps it well short of the viewport.
- [x] **Global loading indicator**: new `GlobalLoadingBar` (top-of-viewport indeterminate progress
      bar, `useIsFetching`/`useIsMutating` from React Query) mounted once in `App.tsx` — covers
      every action across the whole app automatically, rather than requiring each of the ~60
      mutation buttons to be individually retrofitted. Also gave `Button` a first-class `loading`
      prop (spinner + auto-disable) for new/updated call sites to opt into per-action feedback on
      top of the global bar.
- [x] **Push notifications silently failing to enable**: `usePushSubscription.ts`'s `subscribe()`
      had zero error handling — any failure (a stale subscription left over from before the
      server's VAPID key last changed, which makes the browser throw "a subscription with a
      different applicationServerKey already exists"; a network hiccup; permission request
      throwing) became an unhandled promise rejection with no UI feedback at all — the toggle just
      did nothing. Fixed: wrapped in try/catch, clears any stale subscription before re-subscribing,
      and returns a typed reason (`unsupported`/`permission-denied`/`not-configured`/`error`) so the
      UI shows what actually went wrong instead of a generic message. Also stopped hiding the whole
      card on unsupported browsers — it now explains *why* (in particular: iOS Safari only exposes
      push to a PWA actually installed to the home screen, not a regular browser tab — a very common
      "why can't I enable this" case with no code fix available, just an explanation).
- [x] **Strict 1-column-mobile / 2-column-max-desktop grid rule, applied with no exceptions per
      explicit user confirmation**: audited and fixed every multi-column grid active below the `lg`
      (1024px) breakpoint across the entire `apps/web/src` tree — form field pairs, KYC wizard
      steps, settings pages, card/wallet grids, dashboard stat tiles (previously 2-4 per row on
      phones), and the hero/chart/wallet split sections in all 5 dashboard templates (previously
      3-column at `lg`, now 2, with `col-span` values adjusted to match). Deliberately left alone:
      `MobileBottomNav`'s 5-tab bar (a fixed-role tab strip, not page content) and the tiny
      decorative `PreviewThumbnail` mockups in the admin template picker (not real responsive UI).

## 6. Crypto integration

- [x] Crypto wallet deposit flow (`packages/yativo-sdk/src/crypto/wallets.ts`) — real, live, on
      `fiatBaseUrl` (`/crypto/create-wallet`, `/crypto/get-wallets`, `/crypto/deposit-histories`,
      etc.). This was already correct; it's the one file in `crypto/*` that was never fictional.
- [x] Removed the rest of `crypto/*` (`accounts.ts`, `send.ts`, `swap.ts`, `cards.ts`,
      `forwardingRules.ts`, `ibanAccount.ts`, `gateway.ts`, `compliance.ts`) and every
      `cryptoBaseUrl`/`crypto.yativo.com` reference across the codebase (SDK config, env schema,
      `.env`/`.env.example`, `integrationRuntimeConfig.ts`, the admin integrations route + settings
      page). **Product decision:** `crypto.yativo.com` is a separate Yativo product (accounts,
      transactions, swap, crypto cards, auto-forwarding, IBAN, payment gateway, address-screening
      compliance) this project does not use — those scaffold files were speculative and never wired
      to any route. Not a rebuild target; deleted outright rather than made live.
