import { z } from "zod";

/**
 * An optional string field with a format validator (`.url()`, `.length()`, `.regex()`, ...)
 * rejects an untouched form field, because react-hook-form's uncontrolled inputs default to
 * `""`, not `undefined` — `.optional()` alone only lets `undefined` through, so an
 * empty-but-never-touched field still fails the format check. This coerces `""` to
 * `undefined` first so "optional" actually means optional.
 */
function optionalString<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

// account_purpose / source_of_funds / employment_status / expected_monthly_payments_usd /
// business_industry / most_recent_occupation_code all come from live lookup endpoints —
// per KYC_KYB_INTEGRATION_GUIDE.md, these drift and must never be hardcoded, so they're
// plain non-empty strings here rather than z.enum(...) tuples. The two exceptions below
// (high-risk activities, business document purposes) are given as fixed lists in the guide
// with no associated lookup endpoint, so those are hardcoded.

export const IMMIGRATION_STATUSES = ["Permanent U.S. Resident", "Non-Permanent U.S. Resident", "Non-Resident of U.S."] as const;
export const BUSINESS_TYPES = ["cooperative", "corporation", "llc", "partnership", "sole_prop", "trust", "other"] as const;
export const BUSINESS_DOCUMENT_PURPOSES = [
  "business_registration",
  "proof_of_address",
  "tax_documents",
  "compliance_documents",
  "financial_statements",
  "certificate_of_good_standing",
  "portfolio_statement",
  "board_minutes",
] as const;
export const HIGH_RISK_ACTIVITIES = [
  "adult_entertainment",
  "gambling",
  "hold_client_funds",
  "investment_services",
  "lending_banking",
  "marijuana_or_related_services",
  "money_services",
  "nicotine_tobacco_or_related_services",
  "operate_foreign_exchange_virtual_currencies_brokerage_otc",
  "pharmaceuticals",
  "precious_metals_precious_stones_jewelry",
  "safe_deposit_box_rentals",
  "third_party_payment_processing",
  "weapons_firearms_and_explosives",
] as const;
export const OPERATES_IN_PROHIBITED_COUNTRIES = ["yes", "no"] as const;

export const FILE_MIN_BYTES = 100 * 1024;
export const FILE_MAX_BYTES = 4 * 1024 * 1024;
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.tif";

export const kycAddressSchema = z.object({
  streetLine1: z.string().min(1).max(256),
  streetLine2: z.string().max(256).optional(),
  city: z.string().min(1).max(256),
  /** Bare ISO-3166-2 segment (e.g. "CA", not "US-CA") — see GET /portal/kyc/reference/subdivisions/{country}. */
  state: z.string().min(1).max(256),
  /** Validated against GET /portal/kyc/reference/postal-codes/{country} at the form layer. */
  postalCode: z.string().min(1).max(32),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2),
});
export type KycAddress = z.infer<typeof kycAddressSchema>;

/** Individual KYC's identifying_information[] shape (image_front_file/image_back_file, date_issued/expiration_date). */
export const individualIdDocSchema = z.object({
  /** From GET /portal/kyc/reference/identification-types/{country} — country-specific. */
  type: z.string().min(1),
  issuingCountry: z.string().length(2),
  number: z.string().min(1).max(64),
  dateIssued: z.string().min(1),
  expirationDate: z.string().min(1),
  imageFront: z.string().min(1),
  imageBack: z.string().optional(),
});
export type IndividualIdDoc = z.infer<typeof individualIdDocSchema>;

/**
 * Business associated-person identifying_information[] entry. `tax_id` entries only need
 * `number` (no images); everything else needs `imageFront` (+ `imageBack` recommended).
 * Enforced by `businessAssociatedPersonSchema`'s refine below, not per-entry, since the
 * requirement ("no image for tax_id, image required otherwise") is conditional on `type`.
 */
export const businessIdDocSchema = z.object({
  type: z.string().min(1),
  number: z.string().min(1).max(64),
  expiration: z.string().optional(),
  imageFront: z.string().optional(),
  imageBack: z.string().optional(),
});
export type BusinessIdDoc = z.infer<typeof businessIdDocSchema>;

const virtualAccountFlagsShape = {
  usdVirtualAccount: z.boolean(),
  eurVirtualAccount: z.boolean(),
  eurdeVirtualAccount: z.boolean(),
  gbpVirtualAccount: z.boolean(),
};

/** guide §2.9: eurde=true requires usd+eur both false; eurde=false requires at least one of usd/eur true. gbp is independent. */
function refineVirtualAccountFlags<T extends z.infer<z.ZodObject<typeof virtualAccountFlagsShape>>>(v: T, ctx: z.RefinementCtx) {
  if (v.eurdeVirtualAccount) {
    if (v.usdVirtualAccount || v.eurVirtualAccount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "EURDE can't be combined with USD or EUR.", path: ["eurdeVirtualAccount"] });
    }
  } else if (!v.usdVirtualAccount && !v.eurVirtualAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one of USD or EUR (or EURDE alone).", path: ["usdVirtualAccount"] });
  }
}

export const individualKycSubmissionSchema = z
  .object({
    firstName: z.string().min(1).max(1024),
    middleName: z.string().max(1024).optional(),
    lastName: z.string().min(1).max(1024),
    email: z.string().email(),
    /** E.164 dial code, e.g. "+1". */
    callingCode: z.string().regex(/^\+\d{1,4}$/),
    /** Digits only, no country code, 8-15 digits. */
    phone: z.string().regex(/^\d{8,15}$/),
    birthDate: z.string(),
    /** ISO 3166-1 alpha-2. */
    nationality: z.string().length(2),
    gender: z.enum(["male", "female"]),
    taxId: z.string().min(1).max(100),
    currentEmployer: z.string().max(512).optional(),
    immigrationStatus: z.enum(IMMIGRATION_STATUSES).optional(),
    /** Base64 data URI (preferred) or hosted URL — pdf/jpg/jpeg/png/heic/tif, 100KB-4MB. */
    selfieImage: z.string().min(1),
    bvn: optionalString(z.string().length(11)),
    nin: optionalString(z.string().length(11)),
    residentialAddress: kycAddressSchema.extend({ proofOfAddressFile: z.string().min(1) }),
    identifyingInformation: z.array(individualIdDocSchema).min(1),
    employmentStatus: z.string().min(1),
    /** Must be a valid `code` from GET /portal/kyc/reference/occupations — this one IS server-enum-checked. */
    mostRecentOccupationCode: z.string().min(1),
    expectedMonthlyPaymentsUsd: z.string().min(1),
    sourceOfFunds: z.string().min(1),
    accountPurpose: z.string().min(1),
    accountPurposeOther: z.string().optional(),
    actingAsIntermediary: z.boolean().default(false),
    uploadedDocuments: z.array(z.object({ type: z.string().min(1), file: z.string().min(1) })).default([]),
    ...virtualAccountFlagsShape,
  })
  .superRefine((v, ctx) => {
    refineVirtualAccountFlags(v, ctx);
    if (v.accountPurpose === "Other" && !v.accountPurposeOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Describe the account purpose.", path: ["accountPurposeOther"] });
    }
    const needsNg = v.nationality === "NG" || v.residentialAddress.country === "NG";
    if (needsNg && !v.bvn) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "BVN is required.", path: ["bvn"] });
    if (needsNg && !v.nin) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NIN is required.", path: ["nin"] });
  });
export type IndividualKycSubmissionInput = z.infer<typeof individualKycSubmissionSchema>;

export const kycAssociatedPersonSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    birthDate: z.string().min(1),
    /** ISO 3166-1 alpha-2. */
    nationality: z.string().length(2),
    email: z.string().email(),
    ownershipPercentage: z.number().min(0).max(100),
    residentialAddress: kycAddressSchema,
    /** Exactly one `tax_id` entry + at least one non-tax-id photo ID — guide §2.4. */
    identifyingInformation: z.array(businessIdDocSchema).min(2),
    phone: optionalString(z.string().regex(/^\d{7,15}$/)),
    title: z.string().optional(),
    relationshipEstablishedAt: z.string().optional(),
    hasOwnership: z.boolean().default(true),
    hasControl: z.boolean().default(true),
    isSigner: z.boolean().default(false),
    isDirector: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const taxIdEntries = v.identifyingInformation.filter((d) => d.type === "tax_id");
    const nonTaxIdEntries = v.identifyingInformation.filter((d) => d.type !== "tax_id");
    if (taxIdEntries.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A tax ID (SSN/EIN/ITIN) entry is required.", path: ["identifyingInformation"] });
    }
    if (nonTaxIdEntries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one non-tax-ID photo document (passport, national ID, etc.) is required.",
        path: ["identifyingInformation"],
      });
    }
    nonTaxIdEntries.forEach((d) => {
      if (!d.imageFront) {
        const idx = v.identifyingInformation.indexOf(d);
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Front image is required for this document.", path: ["identifyingInformation", idx, "imageFront"] });
      }
    });
  });
export type KycAssociatedPerson = z.infer<typeof kycAssociatedPersonSchema>;

export const businessKycSubmissionSchema = z
  .object({
    businessLegalName: z.string().min(1).max(255),
    businessTradeName: z.string().min(1).max(255),
    businessDescription: z.string().min(1).max(1000),
    email: z.string().email(),
    businessType: z.enum(BUSINESS_TYPES),
    registrationNumber: z.string().min(1).max(100),
    incorporationDate: z.string().min(1),
    incorporationCountry: z.string().length(2).optional(),
    taxId: z.string().max(100).optional(),
    // Optional per Yativo's own KYB validator, but required here: our platform needs a phone
    // number to provision the Yativo customer record in the first place (see ensureYativoCustomer).
    /** E.164 dial code, e.g. "+1". */
    phoneCallingCode: z.string().regex(/^\+[1-9]\d{0,3}$/),
    phoneNumber: z.string().regex(/^\d{7,15}$/),
    /** From GET /portal/kyc/reference/business-industries. */
    businessIndustry: z.string().optional(),
    primaryWebsite: optionalString(z.string().url()),
    isDao: z.boolean().default(false),
    statementDescriptor: z.string().max(22).optional(),
    registeredAddress: kycAddressSchema,
    physicalAddress: kycAddressSchema.extend({ proofOfAddressFile: z.string().optional() }),
    associatedPersons: z.array(kycAssociatedPersonSchema).min(1),
    accountPurpose: z.string().min(1),
    accountPurposeOther: z.string().optional(),
    sourceOfFunds: z.string().min(1),
    highRiskActivities: z.array(z.enum(HIGH_RISK_ACTIVITIES)).default([]),
    highRiskActivitiesExplanation: z.string().optional(),
    conductsMoneyServices: z.boolean().default(false),
    conductsMoneyServicesDescription: z.string().optional(),
    complianceScreeningExplanation: z.string().optional(),
    estimatedAnnualRevenueUsd: z.string().optional(),
    expectedMonthlyPaymentsUsd: z.number().min(0).optional(),
    operatesInProhibitedCountries: z.enum(OPERATES_IN_PROHIBITED_COUNTRIES).optional(),
    ownershipThreshold: z.number().min(5).max(100).optional(),
    hasMaterialIntermediaryOwnership: z.boolean().optional(),
    pepStatus: z.boolean(),
    thirdPartyMsbPayments: z.boolean(),
    documents: z.array(z.object({ purpose: z.enum(BUSINESS_DOCUMENT_PURPOSES), description: z.string().min(1), file: z.string().min(1) })).min(1),
    ...virtualAccountFlagsShape,
  })
  .superRefine((v, ctx) => {
    refineVirtualAccountFlags(v, ctx);
    if (v.accountPurpose === "other" && !v.accountPurposeOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Describe the account purpose.", path: ["accountPurposeOther"] });
    }
    if (v.highRiskActivities.length > 0 && !v.highRiskActivitiesExplanation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Explain the flagged high-risk activity.", path: ["highRiskActivitiesExplanation"] });
    }
    if (v.conductsMoneyServices) {
      if (!v.conductsMoneyServicesDescription) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Describe the money-services activity.", path: ["conductsMoneyServicesDescription"] });
      }
      if (!v.complianceScreeningExplanation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Describe your compliance screening program.", path: ["complianceScreeningExplanation"] });
      }
    }
    if (!v.documents.some((d) => d.purpose === "business_registration")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one document with purpose "business_registration" is required.', path: ["documents"] });
    }
    const ownedPercent = v.associatedPersons.filter((p) => p.hasOwnership).reduce((sum, p) => sum + p.ownershipPercentage, 0);
    if (ownedPercent > 100.01) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ownership percentages sum to over 100%.", path: ["associatedPersons"] });
    }
  });
export type BusinessKycSubmissionInput = z.infer<typeof businessKycSubmissionSchema>;

export const kycSubmissionResultSchema = z.object({
  submissionId: z.string().nullable(),
  status: z.string(),
});
export type KycSubmissionResult = z.infer<typeof kycSubmissionResultSchema>;

export const kycStatusResponseSchema = z.object({
  kycStatus: z.enum(["NOT_STARTED", "PENDING", "APPROVED", "REJECTED"]),
  kycSubmissionId: z.string().nullable(),
  kycSubmittedAt: z.string().nullable(),
});

export const kycCountrySchema = z.object({ code: z.string(), iso3: z.string(), name: z.string() });
export type KycCountry = z.infer<typeof kycCountrySchema>;

export const kycSubdivisionSchema = z.object({ code: z.string(), name: z.string() });
export type KycSubdivision = z.infer<typeof kycSubdivisionSchema>;

export const kycIdentificationTypeSchema = z.object({ type: z.string(), description: z.string() });
export type KycIdentificationType = z.infer<typeof kycIdentificationTypeSchema>;

export const kycPostalCodeRuleSchema = z.object({
  countryCode: z.string(),
  usesPostalCodes: z.boolean(),
  ruleRegex: z.string().nullable(),
  ruleSamples: z.array(z.string()),
});
export type KycPostalCodeRule = z.infer<typeof kycPostalCodeRuleSchema>;

export const kycOccupationSchema = z.object({ code: z.string(), label: z.string() });
export type KycOccupation = z.infer<typeof kycOccupationSchema>;

/** `{ EnumKey: "Human label" }` — used for account-purposes / source-of-funds / expected-monthly-payments. */
export const kycLabelMapSchema = z.record(z.string());
export type KycLabelMap = z.infer<typeof kycLabelMapSchema>;
