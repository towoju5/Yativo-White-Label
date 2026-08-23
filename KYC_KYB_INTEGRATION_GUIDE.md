# Yativo KYC / KYB API — Integration Guide

**Audience:** external engineering teams integrating individual (KYC) and business (KYB)
verification submission into their own product.

**Purpose of this document:** everything needed to (1) build a submission form/UI, (2)
pre-validate on the client before hitting the API, and (3) never get a preventable
rejection. Section 2 ("Why submissions fail") is the most important section — read it
first.

This document was generated directly from the live validation code in this repository
(`app/Http/Controllers/CustomerController.php`, `app/Http/Controllers/BusinessController.php`,
`app/Rules/*.php`, `config/bridge_data.php`) on **2026-08-21**, not from older hand-written
docs in this repo. Where it corrects something those older docs (`KYC_REFERENCE.md`,
`KYB_REFERENCE.md`, `KYC_API_PAYLOAD_DOCUMENTATION.md`, `BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md`)
got wrong or stale, that's called out explicitly so nobody copies the wrong example twice.

> **Rule data drifts. Endpoints don't.** Everywhere this guide lists an enum (countries,
> occupations, ID types, account purposes, source of funds...), treat the **lookup
> endpoint** as the source of truth and this document as a convenience snapshot. Rebuild
> your dropdowns from the live endpoints, or refresh your hardcoded copy on a schedule.

---

## 1. Base URL, auth, content type

- Base URL: `https://kyc.yativo.com/`
- Auth: **none of the endpoints below currently require an API key or bearer token.**
  There is no `middleware()` on any `business-kyc/*`, `individual-kyc/*`, or shared
  lookup route in `routes/api.php`. If your integration needs IP allowlisting or a
  token, confirm that separately with Yativo — don't assume it exists.
- Content-Type: `application/json` for JSON submissions. Files can be sent three ways
  (see §3.1) — multipart file upload is also accepted on the same endpoints.
- Rate limiting: no custom throttle is configured for these routes in this codebase.
  Don't assume unlimited throughput; confirm expected volume with Yativo.
- There is currently **no public status-polling or webhook endpoint** in this API for
  tracking what happens to a submission after acceptance (see §2, "What a 200/201
  actually means"). Confirm the status-notification mechanism with Yativo directly —
  don't build a poller against an endpoint that isn't documented here.

---

## 2. Why submissions fail (read this before building the form)

These are the actual, current server-side gotchas — not hypothetical ones. Most KYC
integration failures are one of these.

### 2.1 File size has a **minimum**, not just a maximum
`App\Rules\ValidFileSize`: every uploaded file (selfie, ID front/back, proof of address,
business documents) must be **between 100 KB and 5 MB**. Teams that compress images for
bandwidth routinely produce files under 100 KB and get a rejection that reads like a
size *maximum* problem but is actually a size *minimum* problem. Don't compress below
100 KB.

### 2.2 Allowed file types are a fixed whitelist
`App\Rules\ValidFileType`: only **`pdf`, `jpg`, `jpeg`, `png`, `heic`, `tif`**. No `gif`,
`webp`, `bmp`, or `heif` (note: `heic` is allowed, `heif` is not). This applies whether
the file arrives as multipart, a `data:...;base64,` URI, or a public URL (extension is
inferred from the URL path or MIME type).

### 2.3 Business KYB: `account_purpose` and `source_of_funds` are **not** the same enum as individual KYC
This is the single most consequential difference in this whole system, and it is where
copy-pasting the wrong sample payload will silently fail:

- **Business `account_purpose`** must be one of the **snake_case Bridge values** from
  `GET /api/business-kyc/account-purposes` (13 values — §6.4). It does **not** accept
  `operating_a_company`, `business_transactions`, `receive_payment_for_freelancing`, or
  `receive_salary` — those are individual-only. Business additionally accepts `payroll`,
  `receive_payments_for_goods_and_services`, `tax_optimization`,
  `third_party_money_transmission`, `treasury_management`, which individual does not.
- **Business `source_of_funds`** must be one of the **PascalCase keys** from
  `GET /api/business-kyc/source-of-funds` (11 values — §6.4): `BusinessLoans`, `Grants`,
  `InterCompanyFunds`, `InvestmentProceeds`, `LegalSettlement`, `OwnersCapital`,
  `PensionRetirement`, `SaleOfAssets`, `SalesOfGoodsAndServices`, `ThirdPartyFunds`,
  `TreasuryReserves`. It does **not** accept `CompanyFunds`, `Salary`, `Gifts`,
  `GamblingProceeds`, etc. — those are individual-only.

  Yes, this means one business field uses snake_case values and the sibling field uses
  PascalCase values. That asymmetry is real, current, server-enforced behavior — not a
  typo in this guide. Always pull both from their respective lookup endpoints rather
  than hardcoding, and don't assume they follow the same casing convention.

  **Note:** an older sample payload in this repo (`BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md`)
  uses `"account_purpose": "OperatingACompany"` and `"source_of_funds": "CompanyFunds"`.
  Both of those values would be **rejected** by the current `BusinessController::rulesForStep()`
  validation. Do not copy that sample's values for these two fields — use §6.4 instead.

- Individual `account_purpose` / `source_of_funds` / `employment_status` /
  `expected_monthly_payments_usd`, by contrast, are validated as `required` only —
  **no server-side enum check** on the one-shot submit endpoint. You can technically
  submit any string. Don't. The value flows downstream to the verification provider's
  own enum, and an unrecognized value there will fail *after* your API call succeeds,
  which is much harder to debug. Always use the exact values from
  `GET /api/individual-kyc/account-purposes` etc. (§5.4).

### 2.4 Business `associated_persons[].identifying_information` needs **at least 2 entries**
`BusinessController::rulesForStep()` step 3: `'associated_persons.*.identifying_information' => 'required|array|min:2'`.
One government-issued photo ID is not enough. In practice, supply:

1. One entry with `"type": "tax_id"` — just `number` (SSN/EIN/ITIN/etc.), **no image
   required** for this type (the front/back image rules are waived specifically when
   `type` normalizes to `tax_id`).
2. At least one entry that is **not** `type: "tax_id"` (e.g. `passport`, `national_id`,
   `drivers_license`) — this one **requires** `image_front` (and `image_back` unless the
   doc type is a tax-id type).

   The code additionally checks that at least one non-tax-ID entry exists
   (`validateAssociatedPersonsTaxIdRequirement`) — omit it and you'll get "At least one
   non-tax-ID identifying document (e.g. passport, national ID) is required."

   Also note: `BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md`'s example only supplies **one**
   `identifying_information` entry per associated person. That example would fail the
   `min:2` rule as written. Use two entries per the pattern above.

### 2.5 Business KYB: ownership percentages are cross-checked
`validateAssociatedPersonsOwnershipSum`: the sum of `ownership_percentage` across every
`associated_persons[]` entry where `has_ownership: true` must not exceed 100% (with a
small floating-point tolerance). This is checked across the *whole array*, not per-entry
— double-check your total before submitting, especially on multi-owner submissions.

### 2.6 Business KYB: one specific document purpose is hard-required
Step 6 requires `documents[]` to include at least one entry with
`"purpose": "business_registration"` — the code comment literally says *"Kira KYB
requires this specific document purpose to be present before the business can submit."*
Every other `documents[].purpose` value is optional but must still come from the fixed
enum in §6.7.

### 2.7 Business KYB: a `Customer` record must already exist for your `customer_id`
`BusinessController::submitAll()` looks up an existing `Customer` row by `customer_id`
(from the JSON body or the `X-Business-Id` header) and returns **404 "Business with the
provided Customer_ID not found"** if none exists. **There is no public API endpoint in
this codebase to create that `Customer` record** — provisioning happens on Yativo's side
during account/customer onboarding, outside this service. If you get this 404, the fix
is not in your payload — confirm with Yativo that the `customer_id` you're using has
been provisioned.

### 2.8 Nigeria: BVN and NIN are conditionally required (individual KYC)
If `nationality` **or** `residential_address.country` is `NG`, both `bvn` and `nin` are
required and must be exactly 11 digits (`digits:11`). This triggers off either field —
a non-Nigerian national residing in Nigeria still needs to supply both.

### 2.9 Virtual account flags are cross-validated, not independent booleans
Individual and business submissions both validate:
- `eurde_virtual_account: true` → `usd_virtual_account` and `eur_virtual_account` **must
  both be false**.
- `eurde_virtual_account: false` (or omitted) → **at least one** of `usd_virtual_account`
  / `eur_virtual_account` must be `true`.
- `gbp_virtual_account` is independent of the above and can be combined with any
  combination. Selecting it may incur an additional KYC fee — surface that in your UI.

Sending all four as `false`, or sending `eurde: true` alongside `usd: true`, are both
rejected.

### 2.10 Postal code / state strictness differs by endpoint — don't assume uniform behavior
This trips people up because the *same-looking* field is validated differently depending
on which endpoint you call:

| Endpoint | `state` / `postal_code` strictness |
|---|---|
| `POST /api/individual-kyc/submit` (one-shot create) | **Loose.** Just `required\|string\|max:256`. No ISO subdivision or postal regex check. Any string passes. |
| `PATCH /api/individual-kyc/{customerId}` (partial update) | **Strict.** Uses `ValidSubdivisionCode` + `ValidPostalCode` against the seeded country/state tables. |
| `POST /api/business-kyc/submit` (one-shot create) | **Strict**, on `registered_address`, `physical_address`, and every `associated_persons[].residential_address`. |
| `PATCH /api/business-kyc/{customerId}` (partial update) | **Strict**, same rules. |

Even where the API itself is loose, **validate client-side against §7's postal-code and
subdivision endpoints anyway** — a value that passes Yativo's validator but is garbage
will still fail (or get flagged) at the downstream verification provider, just later and
with a worse error message.

### 2.11 `state` accepts `US-CA` / `NG-LA` format but normalizes it — send the bare code
Where strict validation applies, a full ISO-3166-2 code like `US-CA` or `NG-LA` is
accepted and normalized down to the segment (`CA`, `LA`). But `GET .../subdivisions/{cc}`
returns the bare segment as `code` — send that bare value directly rather than relying on
normalization.

### 2.12 What a 200/201 response actually means
A successful `submit` call means **the payload passed structural validation and was
accepted for processing** — it does not mean the identity/business was approved. Both
controllers dispatch a queued job (`ThirdPartyKycSubmission` for individual;
business-equivalent dispatch for business) that forwards the data to the actual
verification provider(s) asynchronously. Downstream provider-side rejections (e.g. a
mismatched enum value that Yativo's validator doesn't check but Bridge/Kira's does) will
not surface in this HTTP response. Build your UI around "submitted, pending" rather than
"approved."

---

## 3. Global conventions

### 3.1 File fields
Every file-accepting field (`selfie_image`, `proof_of_address_file`, `image_front`,
`image_back`, `documents[].file`, etc.) accepts **any one** of:
1. A multipart file upload (standard `multipart/form-data` field).
2. A base64 data URI: `"data:application/pdf;base64,<...>"` or `"data:image/jpeg;base64,<...>"`.
3. A publicly reachable URL string (the server fetches it).

All three are subject to the type whitelist (§2.2) and size range (§2.1). All files are
virus-scanned server-side before processing; a failed scan returns a 422 with a
`virus_error` detail.

### 3.2 Countries / nationalities
ISO 3166-1 **alpha-2** only (`size:2` validation), e.g. `US`, `NG`, `GB`. Do not send
alpha-3 codes in submission payloads (alpha-3 is accepted as a *convenience* on some
`GET` lookup routes only — see §7).

### 3.3 Dates
ISO 8601 date or datetime strings, e.g. `"1990-01-01"` or `"1990-01-01T00:00:00.000000Z"`.
`birth_date` must be in the past (`before:today`, and `before:-18 years` in a couple of
business-side paths — treat 18+ as the safe floor everywhere). Document `expiration_date`
/ `expiration` fields must be in the future where required.

### 3.4 Booleans
Send real JSON booleans (`true`/`false`). String `"true"`/`"false"` are tolerated on some
fields via Laravel's `boolean` cast but don't rely on it — send native booleans.

### 3.5 Phone numbers
Split into `calling_code` (or `phone_calling_code`) and `phone`/`phone_number`:
- Calling code: `^\+\d{1,4}$` (individual) or `^\+[1-9]\d{0,3}$` (business) — e.g. `+1`, `+234`.
- Number: digits only, `^\d{7,15}$` or `^\d{8,15}$` depending on flow — **no leading `+`,
  no spaces, no dashes** in the number part itself.

### 3.6 Error response shape (use this to drive inline form errors)
Every validation failure returns HTTP 422 with:

```json
{
  "success": false,
  "message": "Validation error.",
  "validation_errors": {
    "residential_address.postal_code": ["The residential_address.postal_code field is required."]
  },
  "field_hints": {
    "residential_address.postal_code": "Validated by country via ValidPostalCode; call GET /api/postal-codes/{countryCode} for the expected pattern."
  }
}
```

`field_hints` is populated from a static per-field hint map on the server
(`CustomerController::FIELD_HINTS` / equivalent on `BusinessController`) and is keyed by
the *normalized* field path (numeric array indexes collapsed to `*`, e.g.
`identifying_information.0.type` → `identifying_information.*.type`). Not every field has
a hint registered — treat `field_hints` as a nice-to-have for surfacing better error
copy, and always fall back to `validation_errors` as the authoritative failure list.

---

## 4. Integration flow (happy path)

1. **Confirm the customer/business record exists** (or is created) on Yativo's side —
   see §2.7. This step is outside this API.
2. Fetch dropdown data as the user progresses through your form (§7) — countries →
   subdivisions/identification-types/postal-code-format for the selected country;
   occupations/business-industries with typeahead (they're large lists); account
   purposes and source of funds per flow type.
3. Validate client-side using the same rules in §5/§6 before enabling submit, to give
   the user immediate feedback instead of a round-trip 422.
4. `POST` the full payload to `/api/individual-kyc/submit` or `/api/business-kyc/submit`.
5. On 422, map `validation_errors` (and `field_hints` where present) back onto your form
   fields.
6. On 200/201, treat the submission as "accepted, pending verification" (§2.12), not
   "approved."
7. For light corrections after initial submission, use the `PATCH` partial-update
   endpoints (§5.5 / §6.9) rather than resubmitting everything — note their **stricter**
   address validation (§2.10).

---

## 5. Individual KYC

### 5.1 Endpoint
```
POST /api/individual-kyc/submit
```
(Alias: `POST /api/individual-kyc/submit-all` — same handler, `CustomerController::submitFullKyc`.)

Top-level requirement: `customer_id` (string, required). `type` / `signed_agreement_id`
are **not required in the request body** — `signed_agreement_id` is generated
server-side (`Str::uuid()`) if you don't send one. Sending your own is harmless but not
necessary.

### 5.2 Field reference

**Personal details**
| Field | Rules |
|---|---|
| `first_name` | required, string, max 1024 |
| `middle_name` | optional, string, max 1024 |
| `last_name` | required, string, max 1024 |
| `email` | required, email, max 1024 |
| `calling_code` | required, string, regex `^\+\d{1,4}$` |
| `phone` | required, string, regex `^\d{8,15}$` |
| `birth_date` | required, date, before today |
| `nationality` | required, ISO alpha-2 |
| `gender` | required, one of `male`, `female` |
| `taxId` | required, string, max 100 |
| `current_employer` | optional, string, max 512 |
| `immigration_status` | optional, one of `Permanent U.S. Resident`, `Non-Permanent U.S. Resident`, `Non-Resident of U.S.` |
| `selfie_image` | required, file (§2.1–2.2) |
| `bvn` | required **only** if NG (§2.8), digits:11 |
| `nin` | required **only** if NG (§2.8), digits:11 |

**Residential address** (`residential_address` object) — see §2.10 for strictness caveat
| Field | Rules |
|---|---|
| `street_line_1` | required, string, max 256 |
| `street_line_2` | optional, string, max 256 |
| `city` | required, string, max 256 |
| `state` | required, string, max 256 (loose on this endpoint — see §2.10) |
| `postal_code` | required, string, max 256 (loose on this endpoint — see §2.10) |
| `country` | required, ISO alpha-2 |
| `proof_of_address_file` | required, file |

**Identifying information** (`identifying_information[]`, min 1)
| Field | Rules |
|---|---|
| `type` | required, string — use a value from `GET .../identification-types/{country}` |
| `issuing_country` | required, ISO alpha-2 |
| `number` | required, string |
| `date_issued` | required, date, before today |
| `expiration_date` | required, date, after today |
| `image_front_file` | required, file |
| `image_back_file` | optional, file |

**Employment / risk / purpose**
| Field | Rules |
|---|---|
| `employment_status` | required (no server enum check — use §5.4 values anyway) |
| `most_recent_occupation_code` | required, string, **must** be a valid `code` from `GET /api/occupations` (this one *is* enum-checked: `Rule::in(Arr::pluck(config('bridge_data.occupations'), 'code'))`) |
| `expected_monthly_payments_usd` | required (no server enum check — use §5.4 bucket keys anyway) |
| `source_of_funds` | required (no server enum check — use §5.4 values anyway) |
| `account_purpose` | required (no server enum check — use §5.4 values anyway) |
| `account_purpose_other` | required if `account_purpose` is `Other`/`other` |
| `acting_as_intermediary` | optional, boolean |

**Uploaded documents** (`uploaded_documents[]`, optional but recommended)
| Field | Rules |
|---|---|
| `type` | required, string, free-form (lowercased server-side); common values: `proof_of_bank_account_ownership`, `proof_of_address`, `proof_of_funds` |
| `file` | required if entry present, file |

**Virtual account flags** — see §2.9
`usd_virtual_account`, `eur_virtual_account`, `eurde_virtual_account`, `gbp_virtual_account` (booleans).

### 5.3 Response
- `422` on any validation failure — see §3.6.
- `201` on success: `{"success": true, "message": "KYC submitted successfully.", "data": {...submission...}}`. The returned submission omits `sumsub_token`, `submission_results`, `submit_bridge_kyc`.
- `500` with `{"success": false, "message": "Unexpected server error.", "data": {"error": "..."}}` on unhandled exceptions.

### 5.4 Enumerated values (individual)

`account_purpose` — send the **key** (PascalCase) shown by `GET /api/individual-kyc/account-purposes`:
`CharitableDonations`, `EcommerceRetailPayments`, `InvestmentPurposes`, `OperatingACompany`,
`Other`, `PaymentsToFriendsOrFamilyAbroad`, `PersonalOrLivingExpenses`, `ProtectWealth`,
`PurchaseGoodsAndServices`, `ReceivePaymentForFreelancing`, `ReceiveSalary`.

`source_of_funds` — key from `GET /api/individual-kyc/source-of-funds`:
`CompanyFunds`, `EcommerceReseller`, `GamblingProceeds`, `Gifts`, `GovernmentBenefits`,
`Inheritance`, `InvestmentsLoans`, `PensionRetirement`, `Salary`, `SaleOfAssetsRealEstate`,
`Savings`, `SomeoneElsesFunds`.

`employment_status`: `Employed`, `Exempt`, `Homemaker`, `Retired`, `SelfEmployed`,
`Student`, `Unemployed`.

`expected_monthly_payments_usd` (send the key): `LessThan5K` (0–4,999), `From5KTo10K`
(5,000–9,999), `From10KTo50K` (10,000–49,999), `GreaterThan50K` (50,000+).

`gender`: `male`, `female`.

`immigration_status`: `Permanent U.S. Resident`, `Non-Permanent U.S. Resident`,
`Non-Resident of U.S.`.

`most_recent_occupation_code`: a NAICS-style `code` from `GET /api/occupations`
(~1,600 rows — fetch, don't hardcode; a searchable typeahead is the right UI).

`most_recent_occupation_code` / `identifying_information[].type` / `country` / subdivision
/ postal-code data: all sourced from the lookup endpoints in §7 — do not hardcode.

### 5.5 Partial update
```
PATCH /api/individual-kyc/{customerId}
```
Only send fields you want to change (`sometimes` on everything). Notably **stricter**
address validation than the create endpoint — see §2.10. Also accepts `subdivision` as
an alias for `residential_address.state`, and normalizes a `US-CA`-style value down to
`CA` automatically (§2.11).

---

## 6. Business KYB

### 6.1 Endpoint
```
POST /api/business-kyc/submit
```
Handler: `BusinessController::submitAll`. Requires the target `Customer` record to
already exist (§2.7) — pass `customer_id` in the body, or an `X-Business-Id` header.

### 6.2 Field reference — business basics
| Field | Rules |
|---|---|
| `business_legal_name` | required, string, max 255 |
| `business_trade_name` | required, string, max 255 |
| `business_description` | required, string, max 1000 |
| `email` | required, email |
| `business_type` | required, one of `cooperative`, `corporation`, `llc`, `partnership`, `sole_prop`, `trust`, `other` |
| `registration_number` | required, string, max 100 |
| `incorporation_date` | required, date, before today |
| `incorporation_country` | optional, string, max 2 |
| `tax_id` | optional, string, max 100 |
| `phone_calling_code` | optional, regex `^\+[1-9]\d{0,3}$` |
| `phone_number` | optional, string, regex `^\d{7,15}$` |
| `business_industry` | optional, string (no server enum check — use `GET /api/business-industries` `code` values for downstream compatibility) |
| `primary_website` | optional, URL |
| `is_dao` | optional, boolean |
| `statement_descriptor` | optional, string, max 22 |

### 6.3 Addresses (`registered_address`, `physical_address`) — strict on this endpoint
| Field | Rules |
|---|---|
| `street_line_1` | required, string, max 255 |
| `street_line_2` | optional, string, max 255 |
| `city` | required, string, max 100 |
| `state` | required, `ValidSubdivisionCode` against the selected `country` |
| `country` | required, ISO alpha-2 |
| `postal_code` | required, `ValidPostalCode` against the selected `country` |
| `proof_of_address_file` | optional, file (recommended for `physical_address`; folded into the downstream `identifying_information` as `proof_of_address` when present) |

### 6.4 Purpose / funds / risk
| Field | Rules |
|---|---|
| `account_purpose` | required — **snake_case Bridge value**, see §2.3 / `GET /api/business-kyc/account-purposes`: `charitable_donations`, `ecommerce_retail_payments`, `investment_purposes`, `other`, `payments_to_friends_or_family_abroad`, `payroll`, `personal_or_living_expenses`, `protect_wealth`, `purchase_goods_and_services`, `receive_payments_for_goods_and_services`, `tax_optimization`, `third_party_money_transmission`, `treasury_management` |
| `account_purpose_other` | required if `account_purpose` is `other` |
| `source_of_funds` | required — **PascalCase key**, see §2.3 / `GET /api/business-kyc/source-of-funds`: `BusinessLoans`, `Grants`, `InterCompanyFunds`, `InvestmentProceeds`, `LegalSettlement`, `OwnersCapital`, `PensionRetirement`, `SaleOfAssets`, `SalesOfGoodsAndServices`, `ThirdPartyFunds`, `TreasuryReserves` |
| `high_risk_activities` | required array — values from: `adult_entertainment`, `gambling`, `hold_client_funds`, `investment_services`, `lending_banking`, `marijuana_or_related_services`, `money_services`, `nicotine_tobacco_or_related_services`, `operate_foreign_exchange_virtual_currencies_brokerage_otc`, `pharmaceuticals`, `precious_metals_precious_stones_jewelry`, `safe_deposit_box_rentals`, `third_party_payment_processing`, `weapons_firearms_and_explosives`, `none_of_the_above` |
| `high_risk_activities_explanation` | nominally `required_if:high_risk_activities,*,!=,none_of_the_above\|nullable\|string` — this is Laravel's scalar `required_if` rule applied to an **array** field, so it likely never actually triggers server-side (array values don't equality-match against the listed strings). Don't rely on that gap: **always send an explanation whenever `high_risk_activities` contains anything other than `none_of_the_above`** — the downstream provider almost certainly expects one even where this API's validator won't stop you. |
| `conducts_money_services` | optional, boolean |
| `conducts_money_services_description` | required if `conducts_money_services` is `true` |
| `compliance_screening_explanation` | required if `conducts_money_services` is `true` |
| `estimated_annual_revenue_usd` | optional, free string (no enum) |
| `expected_monthly_payments_usd` | optional, **integer** ≥ 0 (raw dollar figure — *not* a bucket key like the individual flow) |
| `operates_in_prohibited_countries` | optional, one of `yes`, `no` |
| `ownership_threshold` | optional, integer 5–100 |
| `has_material_intermediary_ownership` | optional, boolean |

### 6.5 Regulated activity / PEP
| Field | Rules |
|---|---|
| `pep_status` | required, boolean |
| `third_party_msb_payments` | required, boolean — whether the business will use its Yativo profile for third-party / MSB payments |
| `regulated_activity.regulated_activities_description` | optional, string |
| `regulated_activity.primary_regulatory_authority_country` | optional, ISO alpha-2 |
| `regulated_activity.primary_regulatory_authority_name` | optional, string |
| `regulated_activity.license_number` | optional, string |

### 6.6 Associated persons (`associated_persons[]`, min 1) — see §2.4, §2.5
| Field | Rules |
|---|---|
| `first_name` / `last_name` | required, string, max 100 |
| `birth_date` | required, date, 18+ years ago |
| `nationality` | required, ISO alpha-2 |
| `email` | required, email |
| `phone` | optional, regex `^\d{7,15}$` |
| `title` | optional, string |
| `ownership_percentage` | required, numeric, 0–100 (sum constraint — §2.5) |
| `relationship_established_at` | optional, date, ≤ today |
| `has_ownership` / `has_control` / `is_signer` / `is_director` | optional, boolean |
| `residential_address.*` | same shape/strictness as §6.3 |
| `identifying_information[]` | required, **min 2** — see §2.4 for the required pattern |
| `identifying_information[].type` | required, string (`tax_id` is a special-cased value — see §2.4) |
| `identifying_information[].number` | required, string |
| `identifying_information[].expiration` | optional, date |
| `identifying_information[].image_front` | required **unless** `type` is `tax_id` |
| `identifying_information[].image_back` | required **unless** `type` is `tax_id` |

### 6.7 Business documents (`documents[]`, min 1) — see §2.6
| Field | Rules |
|---|---|
| `purpose` | required, one of: `proof_of_address`, `business_registration`, `tax_documents`, `compliance_documents`, `financial_statements`, `certificate_of_good_standing`, `portfolio_statement`, `board_minutes` — **`business_registration` must appear at least once** |
| `description` | required, string |
| `file` | required, file |

### 6.8 Business-level identifying information (`identifying_information[]`, optional)
Distinct from `documents[]` above and from each associated person's own
`identifying_information`. Free-form, all fields optional: `type`, `issuing_country`
(ISO alpha-2), `number`, `description`, `expiration` (date, after today), `image_front`,
`image_back`.

### 6.9 Extra sections — flat top-level fields, not nested objects

> **Correction vs. older docs:** `KYC_API_PAYLOAD_DOCUMENTATION.md` in this repo shows
> these as nested `extra_business_info` / `collections_data` / `payouts_data` objects.
> The actual `BusinessController::rulesForStep('business'|'collections'|'payouts')`
> validates them as **flat top-level request fields**. Use the flat form below (which
> matches `BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md`'s example, not the payload guide's).

**Business profile**
| Field | Rules |
|---|---|
| `meeting_mode` | optional, string, max 255 |
| `industry_vertical` | optional, string, max 255 |
| `business_description` | optional, string, **140–5000** chars (note: different length rule than the top-level `business_description` in §6.2, which is max 1000 with no minimum) |
| `obo_usage` | optional, one of `yes`, `no` |
| `monthly_volume_usd` | optional, numeric ≥ 0 |
| `avg_transaction_usd` | optional, numeric ≥ 0, ≤ `max_transaction_usd` |
| `max_transaction_usd` | optional, numeric ≥ 0 |
| `primary_account_purpose` | optional, string, max 255 |
| `sender_geographies[]` | optional array, values from: `Africa`, `Europe`, `North America`, `South America`, `Asia` |

**Collections**
| Field | Rules |
|---|---|
| `sender_industries[]` | optional array, values from: `E-commerce`, `Wholesale`, `Retail`, `Logistics`, `Manufacturing`, `Consulting`, `Others` |
| `sender_types` | optional, one of `individuals`, `business`, `businesses`, `both` |
| `top_5_senders[]` | optional array, 1–5 strings |
| `incoming_from_fintech_wallets` | optional, boolean |
| `incoming_fintech_wallet_details` | optional, string, max 1000 |
| `collection_currencies[]` | optional array, values from: `USD`, `EUR`, `GBP`, `NGN`, `KES`, `ZAR`, `AED`, `HKD` |
| `current_collection_provider` | optional, string, max 255 |
| `reason_for_switching_collection` | optional, string, max 1000 |
| `expected_monthly_disbursement_usd` | optional, numeric ≥ 0 |
| `avg_transaction_amount_collection` | optional, numeric ≥ 0 |
| `max_transaction_amount_collection` | optional, numeric ≥ 0 |

**Payouts**
| Field | Rules |
|---|---|
| `payout_primary_purpose` | optional, string, max 255 |
| `beneficiary_geographies[]` | optional array, each ISO alpha-2 |
| `beneficiary_industries[]` | optional array, string, max 100 |
| `beneficiary_types` | optional, one of `individual`, `individuals`, `business`, `both` |
| `top_5_beneficiaries[]` | optional array, 1–5 strings |
| `primary_payout_method` | optional, one of `ach`, `wire`, `sepa`, `swift`, `local_transfer`, `mobile_money`, `crypto` |
| `payout_currencies[]` | optional array, values from: `USD`, `EUR`, `GBP`, `NGN`, `KES`, `ZAR`, `AED`, `HKD`, `CAD` |
| `current_payout_provider` | optional, string, max 255 |
| `reason_for_switching_payout` | optional, string, max 1000 |

### 6.10 Extra documents (`extra_documents[]`, optional)
Free-form array; each entry may carry `type`, `description`, `file`.

### 6.11 Virtual account flags
Same rules as §2.9: `usd_virtual_account`, `eur_virtual_account`, `eurde_virtual_account`,
`gbp_virtual_account`.

### 6.12 Response
Same envelope shape as §5.3 (`success`, `message`, and either the saved record or a
`validation_errors` + `field_hints` pair on 422).

### 6.13 Partial update
```
PATCH /api/business-kyc/{customerId}
```
`sometimes` on every field; addresses use the same strict `ValidSubdivisionCode` /
`ValidPostalCode` rules as the create endpoint (§6.3). Accepts a `subdivision` alias and
normalizes `US-CA`-style values, same as §5.5.

### 6.14 Debug / support: resubmit + provider log dump
```
POST /api/business-kyc/resubmit/{customerId}
```
Re-runs the submission using stored data and returns a `download_url` to a generated
JSON dump of the outgoing provider payload — useful when debugging a rejection with
Yativo support, not part of the normal integration flow. If `KYC_RESUBMIT_TOKEN` is
configured on the server, pass it via `X-Resubmit-Token` header or a `token` body field.
Optional flags: `include_files` (boolean, default `false` — redacts file contents to
size+sha256 when `false`), `skip_enrichment` (boolean, default `false`).

---

## 7. Lookup / reference endpoints

Use these to populate dropdowns and to pre-validate before submit. Prefer the
**shared, unprefixed** routes (no `individual-kyc/` or `business-kyc/` prefix) — they
serve the same underlying config and are flow-agnostic, except account-purposes/
source-of-funds which genuinely differ by flow (§2.3) and must be called on the
flow-specific path.

| Endpoint | Returns |
|---|---|
| `GET /api/countries` | `[{code, iso3, name}, ...]` — all ISO countries, sorted by name |
| `GET /api/subdivisions/{countryCode}` | `[{name, code}, ...]` — states/provinces for a country. Accepts ISO-2 or ISO-3 (`NG` or `NGA`). Empty array if unknown or if reference DB is unreachable. |
| `GET /api/subdivisions/states/{countryCode}` | Alias of the above |
| `GET /api/identification-types/{countryCode}` | `[{type, description}, ...]` — valid `identifying_information[].type` values for that country (§7.1) |
| `GET /api/postal-codes/{countryCode}` | Postal code validation metadata for the country (§7.2) — **the authoritative source for postal regex**, since it reflects the same DB-seeded format `ValidPostalCode` checks server-side |
| `GET /api/occupations` | `[{occupation, code}, ...]` — ~1,600 NAICS-style rows, sorted by label. Use for `most_recent_occupation_code` (individual) — this one *is* enum-enforced. |
| `GET /api/business-industries` | Same shape/size as occupations — use for `business_industry` (business; not enum-enforced but strongly recommended) |
| `GET /api/account-purposes` | Shared/individual account-purpose map (`{key: label}`) |
| `GET /api/source-of-funds` | Shared/individual source-of-funds map (`{key: label}`) |
| `GET /api/expected-monthly-payments-usd` | `{"LessThan5K": "0_4999", ...}` — ordered ascending, not alphabetized |
| `GET /api/individual-kyc/account-purposes` | Individual-flow account purposes (identical data to the shared route) |
| `GET /api/individual-kyc/source-of-funds` | Individual-flow source of funds |
| `GET /api/individual-kyc/expected-monthly-payments-usd` | Individual-flow monthly payment buckets |
| `GET /api/individual-kyc/countries` / `.../subdivisions/{cc}` / `.../identification-types/{cc}` | Same data as the shared routes, individual-prefixed |
| `GET /api/business-kyc/account-purposes` | **Business-specific** — snake_case values, use these for `account_purpose` (§2.3, §6.4) |
| `GET /api/business-kyc/source-of-funds` | **Business-specific** — PascalCase keys, use these for `source_of_funds` (§2.3, §6.4) |
| `GET /api/business-kyc/expected-monthly-payments-usd` | Same bucket data (note §6.4: business's actual `expected_monthly_payments_usd` field is a raw integer, not a bucket key — this lookup is informational only for that field) |
| `GET /api/business-kyc/countries` / `.../subdivisions/{cc}` / `.../identification-types/{cc}` | Same data as the shared routes, business-prefixed |

### 7.1 `GET /api/identification-types/{countryCode}`
Response: array of `{type, description}` sorted by description, e.g. for `NG`:
```json
[
  { "type": "bvn", "description": "Bank Verification Number" },
  { "type": "national_id", "description": "National ID" },
  { "type": "nin", "description": "National Identification Number" },
  { "type": "other", "description": "Other Government Issued ID" },
  { "type": "passport", "description": "Passport" },
  { "type": "tin", "description": "Tax Identification Number" }
]
```
Every country falls back to `[{"type": "other", "description": "Other Government Issued ID"}]`
if not explicitly configured — always include `other` as a fallback in your dropdown.
`US` is a special case with only `ssn` and `itin` (no generic passport/national_id
entries in the config for US). See `config/bridge_data.php` →
`identification_types_by_country` for the full ~190-country map, or just call the
endpoint per selected country rather than bundling all of it client-side.

### 7.2 `GET /api/postal-codes/{countryCode}`
```json
{
  "country_code": "NG",
  "country_name": "Nigeria",
  "uses_postal_codes": true,
  "validation": {
    "rule_regex": "/^\\d{6}$/u",
    "rule_samples": ["100001", "660213"],
    "addressing_pattern": "\\d{6}"
  },
  "note": "We return regex patterns + sample values; exhaustive postal-code lists require a country dataset."
}
```
- `rule_regex` is (when present) the **exact** pattern `App\Rules\ValidPostalCode` checks
  server-side for strict flows (§2.10) — validate against this on the client, not a
  separately-maintained copy.
- `uses_postal_codes: false` (or an empty `rule_regex` with no samples) generally means
  the country doesn't use postal codes at all — see the no-postal-code list below;
  don't force the field as required in your UI for these.
- Countries with **no postal code system** (validation skipped entirely server-side):
  `AO, AG, AW, BS, BZ, BJ, BW, BF, BI, CM, CF, KM, CG, CD, CK, DJ, DM, GQ, ER, FJ, GM, GD,
  GY, HK, KI, MO, MW, ML, MR, NR, NU, QA, RW, KN, LC, ST, SC, SL, SB, SR, SY, TL, TK, TO,
  TV, UG, VU, YE, ZW`.
- For a country with **no seeded DB format and no static pattern**, the server falls back
  to a generic check: 2–20 alphanumeric characters (`^[A-Za-z0-9\s\-]{2,20}$`). Mirror
  that same fallback client-side for unlisted countries rather than blocking submission.

### 7.3 `GET /api/occupations` and `GET /api/business-industries`
Both are large (~1,600–1,900 row) NAICS-style code/label lists drawn from the same
underlying config shape. Build a searchable typeahead against these — don't render them
as a plain `<select>`, and don't hardcode a snapshot into your codebase (codes get
added/renamed).

---

## 8. Pre-submission validation checklist

Run this client-side before enabling your submit button — it maps directly to §2.

- [ ] Every file is between 100 KB and 5 MB, and is `pdf`/`jpg`/`jpeg`/`png`/`heic`/`tif`.
- [ ] **(Business)** `account_purpose` is a snake_case value from `GET /api/business-kyc/account-purposes`, not the individual list.
- [ ] **(Business)** `source_of_funds` is a PascalCase key from `GET /api/business-kyc/source-of-funds`, not the individual list.
- [ ] **(Individual)** `account_purpose` / `source_of_funds` / `employment_status` / `expected_monthly_payments_usd` use the exact keys from the individual lookup endpoints, even though the API won't reject a wrong value itself.
- [ ] **(Business)** Every `associated_persons[]` entry has **≥ 2** `identifying_information[]` entries: one `tax_id` (no image needed) + one photo ID (front image required).
- [ ] **(Business)** Sum of `ownership_percentage` across `has_ownership: true` associated persons ≤ 100%.
- [ ] **(Business)** `documents[]` includes a `purpose: "business_registration"` entry.
- [ ] **(Individual)** If `nationality` or `residential_address.country` is `NG`, both `bvn` and `nin` are present and exactly 11 digits.
- [ ] Virtual account flags satisfy the eurde/usd/eur combination rule (§2.9).
- [ ] `state` is a bare subdivision code (e.g. `CA`, not `US-CA`) sourced from `GET /api/subdivisions/{country}`.
- [ ] `postal_code` matches `GET /api/postal-codes/{country}`'s `rule_regex`, or the country is in the no-postal-code list.
- [ ] **(Business)** The `customer_id` you're submitting against is already a provisioned `Customer` record on Yativo's side (§2.7) — otherwise expect a 404 regardless of payload correctness.

---

## 9. Full example payloads

### 9.1 Individual KYC — minimal valid example
```json
{
  "customer_id": "33333333-3333-3333-3333-333333333333",
  "first_name": "Alex",
  "last_name": "Smith",
  "email": "alex.smith@example.com",
  "phone": "5551234567",
  "calling_code": "+1",
  "gender": "male",
  "nationality": "US",
  "birth_date": "1990-01-01",
  "taxId": "998877665",
  "selfie_image": "https://example.com/docs/selfie.jpg",
  "residential_address": {
    "street_line_1": "123 Main Street",
    "city": "Anytown",
    "state": "CA",
    "postal_code": "90210",
    "country": "US",
    "proof_of_address_file": "https://example.com/docs/proof_of_address.jpg"
  },
  "identifying_information": [
    {
      "type": "passport",
      "issuing_country": "US",
      "number": "P00012345",
      "date_issued": "2020-01-01",
      "expiration_date": "2030-01-01",
      "image_front_file": "https://example.com/docs/id_front.jpg",
      "image_back_file": "https://example.com/docs/id_back.jpg"
    }
  ],
  "employment_status": "Employed",
  "most_recent_occupation_code": "541511",
  "expected_monthly_payments_usd": "LessThan5K",
  "source_of_funds": "Salary",
  "account_purpose": "ReceiveSalary",
  "usd_virtual_account": true,
  "eur_virtual_account": false,
  "eurde_virtual_account": false,
  "gbp_virtual_account": false
}
```

### 9.2 Business KYB — minimal valid example (US LLC, single US-resident owner)
Note the corrected `account_purpose` / `source_of_funds` values and the two-entry
`identifying_information` per associated person, both fixed relative to the older
sample in this repo (§2.3, §2.4).

```json
{
  "customer_id": "cust_biz_us_resident_001",

  "business_legal_name": "Palmwood Ventures LLC",
  "business_trade_name": "Palmwood",
  "business_description": "SaaS platform for supply-chain analytics.",
  "email": "compliance@palmwood.com",
  "business_type": "llc",
  "registration_number": "12-3456789",
  "incorporation_date": "2019-04-10",
  "tax_id": "12-3456789",
  "phone_calling_code": "+1",
  "phone_number": "3055551234",
  "business_industry": "518210",
  "primary_website": "https://palmwood.com",
  "is_dao": false,
  "statement_descriptor": "PALMWOOD",

  "registered_address": {
    "street_line_1": "123 Main St",
    "city": "Wilmington",
    "state": "DE",
    "country": "US",
    "postal_code": "19801"
  },
  "physical_address": {
    "street_line_1": "500 Brickell Ave",
    "city": "Miami",
    "state": "FL",
    "country": "US",
    "postal_code": "33131",
    "proof_of_address_file": "https://example.com/docs/proof_physical.pdf"
  },

  "associated_persons": [
    {
      "first_name": "John",
      "last_name": "Doe",
      "birth_date": "1985-05-05",
      "nationality": "US",
      "email": "john.doe@palmwood.com",
      "phone": "3055551234",
      "title": "CEO / Managing Member",
      "ownership_percentage": 100,
      "relationship_established_at": "2019-04-10",
      "has_ownership": true,
      "has_control": true,
      "is_signer": true,
      "is_director": true,
      "residential_address": {
        "street_line_1": "742 Evergreen Terrace",
        "city": "Miami",
        "state": "FL",
        "country": "US",
        "postal_code": "33101"
      },
      "identifying_information": [
        {
          "type": "tax_id",
          "number": "123-45-6789"
        },
        {
          "type": "drivers_license",
          "number": "D1234567",
          "expiration": "2029-06-15",
          "image_front": "https://example.com/docs/id_front.jpg",
          "image_back": "https://example.com/docs/id_back.jpg"
        }
      ]
    }
  ],

  "account_purpose": "purchase_goods_and_services",
  "source_of_funds": "OwnersCapital",
  "high_risk_activities": ["none_of_the_above"],
  "conducts_money_services": false,
  "estimated_annual_revenue_usd": "1000000_to_5000000",
  "expected_monthly_payments_usd": 250000,
  "operates_in_prohibited_countries": "no",
  "ownership_threshold": 5,
  "has_material_intermediary_ownership": false,

  "pep_status": false,
  "third_party_msb_payments": false,

  "documents": [
    {
      "purpose": "business_registration",
      "description": "Certificate of Formation filed with Delaware Secretary of State",
      "file": "https://example.com/docs/business_formation.pdf"
    }
  ],

  "usd_virtual_account": true,
  "eur_virtual_account": false,
  "eurde_virtual_account": false,
  "gbp_virtual_account": false
}
```

---

## 10. Where this guide corrects older docs in this repo

For maintainers reconciling this file against pre-existing docs:

| Older doc | Issue found | Fixed here |
|---|---|---|
| `BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md` | Sample uses `account_purpose: "OperatingACompany"` and `source_of_funds: "CompanyFunds"` — both rejected by current `Rule::in` checks | §2.3, §6.4, §9.2 |
| `BUSINESS_KYB_FULL_SUBMISSION_SAMPLE.md` | Sample associated person has only 1 `identifying_information` entry — fails `min:2` | §2.4, §9.2 |
| `KYC_API_PAYLOAD_DOCUMENTATION.md` | Shows `extra_business_info` / `collections_data` / `payouts_data` as nested objects | §6.9 — these are flat top-level fields |
| `KYC_API_PAYLOAD_DOCUMENTATION.md` | States `signed_agreement_id` is a required top-level field for both submit endpoints | §5.1 — it's optional/auto-generated |
| `KYB_REFERENCE.md` | `account_purpose`/`source_of_funds` supported-values appendix lists the individual enum for business too | §2.3, §6.4 |
| `KYC_LOOKUP_ENDPOINTS.md` | Missing `GET /api/postal-codes/{countryCode}` and `GET /api/business-industries` | §7 |
| All of the above | No mention of the 100 KB file-size minimum, the associated-persons ownership-sum check, or the loose-vs-strict postal/state validation split between create and patch endpoints | §2.1, §2.5, §2.10 |
