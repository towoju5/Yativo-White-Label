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
      `YATIVO_CRYPTO_BASE_URL=https://crypto.yativo.com` (unaudited — see crypto section),
      `YATIVO_KYC_BASE_URL=https://kyc.yativo.com` (new).
- [ ] Audit webhook receiver against `yativo-fiat/webhooks.md` — event types, signature
      verification, retry handling. **Not started this pass** — `apps/api/src/webhooks/*` is
      unchanged; payload shapes (`PayoutCompletedPayload` etc.) are still the original scaffold's
      guesses, unverified against real webhook deliveries.

---

## 1. Deposit (Payin) Flow

**Target flow:** fetch gateways → generate quote → submit deposit → return/display deposit link.

- [x] "List available gateways" — `GET /my-payin-methods` (business-scoped list, `fiat/paymentMethods.ts`
      `listPayinMethods()`), filtered by currency in `deposits.routes.ts`. Not country-first (see
      note in §2) — this endpoint doesn't take a country param, it's scoped to the business's
      enabled rails.
- [ ] Quote generation before deposit — **not implemented.** `POST /wallet/deposits/new` was called
      directly with a raw amount, no `quote_id`. Yativo's exchange-rate/quote endpoint for deposits
      hasn't been located/verified.
- [x] Deposit creation — `fiat/deposits.ts` → `POST /wallet/deposits/new`, live request/response
      shape confirmed via docs + Postman (`deposit_url`, `deposit_data`). Not quote-locked (see
      above).
- [x] Deposit link captured + rendered — `deposit_url` returned as `depositUrl`, shown with
      copy/open actions on the portal Deposit page ("pay by link" section).
- [ ] `List Deposits` (`GET /wallet/deposits/`) — SDK/route not wired; deposit history view doesn't
      exist yet.
- [ ] Status polling/tracking (`Track Transaction`) + webhook reconciliation — not implemented.
- [ ] Error handling for expired quote / unsupported currency / gateway-down — only a generic
      "no deposit method for this currency" 404 exists today (`NO_PAYIN_METHOD`).

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
  - [ ] Update (`PUT /beneficiaries/payment-methods/update/{id}`) — not exposed in the UI.
- [x] "Quote before send" — **resolved differently than planned:** there is no dedicated payout
      quote endpoint for same-currency wallet payouts (`POST /wallet/payout` just takes an amount +
      currency). `/portal/quotes` was rewritten as a local review-step calculation (0 fee, rate
      1.00) instead of a fake Yativo call — the old code called a `/quotes` path that doesn't exist
      on Yativo's side and would have hard-blocked this flow in live mode.
- [ ] 2FA / transaction PIN — **not investigated.** `GET /is-pin-set` exists in the Postman
      collection (Auth folder) but wasn't tested or wired in.
- [x] Submit — confirmed `POST /wallet/payout` ("New Withdrawal" in Postman) is the correct
      endpoint for this white-label's wallet-based payout model; `Idempotency-key` header included.
      Batch payout was not investigated (no bulk-send UI exists).
- [~] `List Payouts` / `Get Payout` — local DB list/detail exist (`portalPayoutsRoutes`); SDK has
      `payouts.getStatus()`/list wired to `/wallet/payout/{id}` but it's **not called anywhere** —
      payout status still comes only from local ledger state + webhook, not live-polled from Yativo.
- [ ] Status tracking + webhook reconciliation — webhook handler (`payout.handler.ts`) is untouched
      from the original scaffold; payload shape unverified against real Yativo webhooks.
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
- [~] List/detail/history — `listForCustomer()` exists in the SDK and is used internally by
      `getOrCreate()`, but there's no dedicated "my virtual accounts" list route/UI, no per-account
      transaction history (`Virtual Account Histories`), and no delete-VA route.

- [ ] https://api.yativo.com/api/v1/business/virtual-account/currencies-and-endorsements - 
      pull the endoresement  for each virtual acount currencies - customer must have a endorsement to be able to create the virtual account.
      
- [ ] Error handling for un-endorsed currency / no KYC — not implemented (see endorsement check
      above).

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
- [~] Normalize error responses — `apps/api/src/lib/errors.ts` (`AppError` + subclasses) is used
      consistently across the newly-touched modules; raw Yativo error bodies (e.g. 422 validation)
      are not translated into this shape, they surface as a generic 500/thrown Error today.
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
- [~] Sweep hardcoded field/country/currency lists — countries + occupation codes now come live
      from `/locations/countries` and `/auth/occupation-codes` (used in the KYC form). Still
      hardcoded: Deposit page currency picker (USD/EUR), card currency (USD-only in the issue-card
      dialogs).
- [ ] Webhook idempotency — not touched.

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
- [ ] Webhook event confirmation — not done (matches the "webhook receiver unaudited" gap above).

---

## 6. Crypto integration

- [ ] Integrate crypto wallet as a service. **Not started** — this session's work was entirely
      fiat-side (`packages/yativo-sdk/src/crypto/*` is unchanged from the original scaffold and
      still calls fictional endpoints/mock fixtures only).
