import { z } from "zod";
import type { YativoContext } from "../client.js";

export const fiatKycSubmissionResultSchema = z.object({
  submissionId: z.string().nullable(),
  status: z.string(),
});
export type FiatKycSubmissionResult = z.infer<typeof fiatKycSubmissionResultSchema>;

/** A file as uploaded by the browser — sent to Yativo as real multipart binary. */
export type UploadedFile = { buffer: Buffer; filename: string; mimetype: string };

/**
 * A file field's value: real binary where Yativo's API supports it, or a base64 data URI where
 * it doesn't. Yativo has a confirmed server-side bug (reproduced directly against their API,
 * 2026-08-21) that silently drops any *nested* binary file field — anything inside an object or
 * array, e.g. `residential_address[proof_of_address_file]` or
 * `identifying_information[0][image_front_file]` — the instant the rest of the submission's
 * top-level fields validate successfully. Only true top-level file fields (`selfie_image`) are
 * unaffected. Until Yativo fixes it, nested fields must go as base64 instead.
 */
export type KycFile = UploadedFile | string;

export type KycAddressInput = {
  streetLine1: string;
  streetLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/** Individual KYC's `identifying_information[]` shape — see guide §5.2. */
export type IndividualIdDocInput = {
  type: string;
  issuingCountry: string;
  number: string;
  dateIssued: string;
  expirationDate: string;
  imageFront: KycFile;
  imageBack?: KycFile;
};

/**
 * Business associated-person `identifying_information[]` shape — deliberately
 * different field names from the individual one (`image_front`/`image_back`/
 * `expiration`, no `issuing_country`/`date_issued`) per guide §6.6. Exactly
 * one `tax_id` entry (number only, no images) plus at least one non-tax-id
 * photo ID is required — see guide §2.4.
 */
export type BusinessIdDocInput = {
  type: string;
  number: string;
  expiration?: string;
  imageFront?: KycFile;
  imageBack?: KycFile;
};

export type SubmitIndividualKycInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  callingCode: string;
  phone: string;
  birthDate: string;
  nationality: string;
  gender: "male" | "female";
  taxId: string;
  currentEmployer?: string;
  immigrationStatus?: string;
  selfieImage: KycFile;
  bvn?: string;
  nin?: string;
  residentialAddress: KycAddressInput & { proofOfAddressFile: KycFile };
  identifyingInformation: IndividualIdDocInput[];
  employmentStatus: string;
  mostRecentOccupationCode: string;
  expectedMonthlyPaymentsUsd: string;
  sourceOfFunds: string;
  accountPurpose: string;
  accountPurposeOther?: string;
  actingAsIntermediary: boolean;
  uploadedDocuments: { type: string; file: KycFile }[];
  usdVirtualAccount: boolean;
  eurVirtualAccount: boolean;
  eurdeVirtualAccount: boolean;
  gbpVirtualAccount: boolean;
};

export type SubmitBusinessKycInput = {
  businessLegalName: string;
  businessTradeName: string;
  businessDescription: string;
  email: string;
  businessType: string;
  registrationNumber: string;
  incorporationDate: string;
  incorporationCountry?: string;
  taxId?: string;
  phoneCallingCode?: string;
  phoneNumber?: string;
  businessIndustry?: string;
  primaryWebsite?: string;
  isDao?: boolean;
  statementDescriptor?: string;
  registeredAddress: KycAddressInput;
  physicalAddress: KycAddressInput & { proofOfAddressFile?: KycFile };
  associatedPersons: {
    firstName: string;
    lastName: string;
    birthDate: string;
    nationality: string;
    email: string;
    ownershipPercentage: number;
    residentialAddress: KycAddressInput;
    identifyingInformation: BusinessIdDocInput[];
    phone?: string;
    title?: string;
    relationshipEstablishedAt?: string;
    hasOwnership: boolean;
    hasControl: boolean;
    isSigner: boolean;
    isDirector: boolean;
  }[];
  accountPurpose: string;
  accountPurposeOther?: string;
  sourceOfFunds: string;
  highRiskActivities: string[];
  highRiskActivitiesExplanation?: string;
  conductsMoneyServices: boolean;
  conductsMoneyServicesDescription?: string;
  complianceScreeningExplanation?: string;
  estimatedAnnualRevenueUsd?: string;
  expectedMonthlyPaymentsUsd?: number;
  operatesInProhibitedCountries?: "yes" | "no";
  ownershipThreshold?: number;
  hasMaterialIntermediaryOwnership?: boolean;
  pepStatus: boolean;
  thirdPartyMsbPayments: boolean;
  documents: { purpose: string; description: string; file: KycFile }[];
  usdVirtualAccount: boolean;
  eurVirtualAccount: boolean;
  eurdeVirtualAccount: boolean;
  gbpVirtualAccount: boolean;
};

// Both submit endpoints share this envelope (guide §5.3 / §6.12) — not the generic
// {status,status_code,message,data} envelope the rest of the fiat API uses.
const submitResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({ id: z.union([z.string(), z.number()]).optional(), status: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

function addressBody(a: KycAddressInput) {
  return { street_line_1: a.streetLine1, street_line_2: a.streetLine2, city: a.city, state: a.state, postal_code: a.postalCode, country: a.country };
}

function individualIdDocsBody(items: IndividualIdDocInput[]) {
  return items.map((i) => ({
    type: i.type,
    issuing_country: i.issuingCountry,
    number: i.number,
    date_issued: i.dateIssued,
    expiration_date: i.expirationDate,
    image_front_file: i.imageFront,
    image_back_file: i.imageBack,
  }));
}

function businessIdDocsBody(items: BusinessIdDocInput[]) {
  return items.map((i) => ({
    type: i.type,
    number: i.number,
    expiration: i.expiration,
    image_front: i.imageFront,
    image_back: i.imageBack,
  }));
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === "object" && value !== null && Buffer.isBuffer((value as UploadedFile).buffer) && "filename" in value;
}

/**
 * Flattens a nested body object into Laravel-style bracket-path multipart fields
 * (`foo[bar][0][baz]`) — the convention Yativo's Laravel backend expects for both
 * nested arrays and objects in multipart/form-data. `UploadedFile` values become
 * real binary file parts; everything else becomes a plain string field.
 */
function appendToFormData(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (isUploadedFile(value)) {
    formData.append(key, new Blob([value.buffer], { type: value.mimetype }), value.filename);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendToFormData(formData, `${key}[${i}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) appendToFormData(formData, `${key}[${k}]`, v);
    return;
  }
  // Confirmed live: Yativo's validator rejects the literal strings "true"/"false" for
  // acting_as_intermediary with "must be true or false" (Laravel's stock `boolean` rule only
  // accepts true/false/1/0/"1"/"0" — not the words "true"/"false") even though multipart/form-data
  // can only ever carry strings. "1"/"0" is the one encoding every variant of that rule accepts.
  formData.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}

function objectToFormData(obj: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(obj)) appendToFormData(formData, key, value);
  return formData;
}

export function createKycResource(ctx: YativoContext) {
  return {
    async submitIndividual(yativoCustomerId: string, input: SubmitIndividualKycInput): Promise<FiatKycSubmissionResult> {
      const body = objectToFormData({
        customer_id: yativoCustomerId,
        first_name: input.firstName,
        middle_name: input.middleName,
        last_name: input.lastName,
        email: input.email,
        calling_code: input.callingCode,
        phone: input.phone,
        birth_date: input.birthDate,
        nationality: input.nationality,
        gender: input.gender,
        taxId: input.taxId,
        current_employer: input.currentEmployer,
        immigration_status: input.immigrationStatus,
        selfie_image: input.selfieImage,
        bvn: input.bvn,
        nin: input.nin,
        residential_address: { ...addressBody(input.residentialAddress), proof_of_address_file: input.residentialAddress.proofOfAddressFile },
        identifying_information: individualIdDocsBody(input.identifyingInformation),
        employment_status: input.employmentStatus,
        most_recent_occupation_code: input.mostRecentOccupationCode,
        expected_monthly_payments_usd: input.expectedMonthlyPaymentsUsd,
        source_of_funds: input.sourceOfFunds,
        account_purpose: input.accountPurpose,
        account_purpose_other: input.accountPurposeOther,
        acting_as_intermediary: input.actingAsIntermediary,
        uploaded_documents: input.uploadedDocuments.map((d) => ({ type: d.type, file: d.file })),
        usd_virtual_account: input.usdVirtualAccount,
        eur_virtual_account: input.eurVirtualAccount,
        eurde_virtual_account: input.eurdeVirtualAccount,
        gbp_virtual_account: input.gbpVirtualAccount,
      });

      const res = await ctx.request({
        baseUrl: ctx.config.kycBaseUrl,
        path: "/api/individual-kyc/submit",
        method: "POST",
        // Deterministic — a customer has one canonical individual KYC submission; a retry of
        // this call should dedupe to it rather than create a second one.
        headers: { "Idempotency-Key": `kyc:individual:${yativoCustomerId}` },
        body,
        schema: submitResponseSchema,
        mockData: { success: true, message: "mock", data: { id: "kyc-mock-001", status: "submitted" } },
      });
      return { submissionId: res.data?.id !== undefined ? String(res.data.id) : null, status: res.data?.status ?? "submitted" };
    },

    async submitBusiness(yativoCustomerId: string, input: SubmitBusinessKycInput): Promise<FiatKycSubmissionResult> {
      const body = objectToFormData({
        customer_id: yativoCustomerId,
        business_legal_name: input.businessLegalName,
        business_trade_name: input.businessTradeName,
        business_description: input.businessDescription,
        email: input.email,
        business_type: input.businessType,
        registration_number: input.registrationNumber,
        incorporation_date: input.incorporationDate,
        incorporation_country: input.incorporationCountry,
        tax_id: input.taxId,
        phone_calling_code: input.phoneCallingCode,
        phone_number: input.phoneNumber,
        business_industry: input.businessIndustry,
        primary_website: input.primaryWebsite,
        is_dao: input.isDao,
        statement_descriptor: input.statementDescriptor,
        registered_address: addressBody(input.registeredAddress),
        physical_address: {
          ...addressBody(input.physicalAddress),
          proof_of_address_file: input.physicalAddress.proofOfAddressFile,
        },
        associated_persons: input.associatedPersons.map((p) => ({
          first_name: p.firstName,
          last_name: p.lastName,
          birth_date: p.birthDate,
          nationality: p.nationality,
          email: p.email,
          ownership_percentage: p.ownershipPercentage,
          residential_address: addressBody(p.residentialAddress),
          identifying_information: businessIdDocsBody(p.identifyingInformation),
          phone: p.phone,
          title: p.title,
          relationship_established_at: p.relationshipEstablishedAt,
          has_ownership: p.hasOwnership,
          has_control: p.hasControl,
          is_signer: p.isSigner,
          is_director: p.isDirector,
        })),
        account_purpose: input.accountPurpose,
        account_purpose_other: input.accountPurposeOther,
        source_of_funds: input.sourceOfFunds,
        high_risk_activities: input.highRiskActivities,
        high_risk_activities_explanation: input.highRiskActivitiesExplanation,
        conducts_money_services: input.conductsMoneyServices,
        conducts_money_services_description: input.conductsMoneyServicesDescription,
        compliance_screening_explanation: input.complianceScreeningExplanation,
        estimated_annual_revenue_usd: input.estimatedAnnualRevenueUsd,
        expected_monthly_payments_usd: input.expectedMonthlyPaymentsUsd,
        operates_in_prohibited_countries: input.operatesInProhibitedCountries,
        ownership_threshold: input.ownershipThreshold,
        has_material_intermediary_ownership: input.hasMaterialIntermediaryOwnership,
        pep_status: input.pepStatus,
        third_party_msb_payments: input.thirdPartyMsbPayments,
        regulated_activity: {},
        documents: input.documents,
        usd_virtual_account: input.usdVirtualAccount,
        eur_virtual_account: input.eurVirtualAccount,
        eurde_virtual_account: input.eurdeVirtualAccount,
        gbp_virtual_account: input.gbpVirtualAccount,
      });

      const res = await ctx.request({
        baseUrl: ctx.config.kycBaseUrl,
        path: "/api/business-kyc/submit",
        method: "POST",
        headers: { "Idempotency-Key": `kyc:business:${yativoCustomerId}` },
        body,
        schema: submitResponseSchema,
        mockData: { success: true, message: "mock", data: { id: "kyb-mock-001", status: "submitted" } },
      });
      return { submissionId: res.data?.id !== undefined ? String(res.data.id) : null, status: res.data?.status ?? "submitted" };
    },
  };
}
