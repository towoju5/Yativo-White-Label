import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  businessKycSubmissionSchema,
  BUSINESS_TYPES,
  BUSINESS_DOCUMENT_PURPOSES,
  HIGH_RISK_ACTIVITIES,
  OPERATES_IN_PROHIBITED_COUNTRIES,
  type BusinessKycSubmissionInput,
  type KycAssociatedPerson,
  type KycCountry,
} from "@white-label/shared-types";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CountryField,
  FileField,
  FileRegistryProvider,
  AddressFields,
  BusinessPhotoIdFields,
  WizardShell,
  SearchableSelect,
  StepErrorSummary,
} from "./kycShared";
import { humanize, buildKycFormData } from "./kycUtils";
import { useFileRegistry, useKycBusinessIndustries, useKycLabelMap } from "./kycHooks";

function emptyAssociatedPerson(): KycAssociatedPerson {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    nationality: "",
    email: "",
    ownershipPercentage: 0,
    residentialAddress: { streetLine1: "", city: "", state: "", postalCode: "", country: "" },
    identifyingInformation: [
      { type: "tax_id", number: "" },
      { type: "", number: "", expiration: "", imageFront: "", imageBack: "" },
    ],
    hasOwnership: true,
    hasControl: false,
    isSigner: false,
    isDirector: false,
  };
}

export default function BusinessKycWizard({ countries, countriesLoading }: { countries: KycCountry[]; countriesLoading?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [sameAsRegistered, setSameAsRegistered] = useState(false);
  const files = useFileRegistry();

  const STEPS = [
    t("kycBusiness.steps.businessInfo.title", "Business info"),
    t("kycBusiness.steps.addresses.title", "Addresses"),
    t("kycBusiness.steps.ownersDirectors.title", "Owners & directors"),
    t("kycBusiness.steps.ownerIdDocuments.title", "Owner ID documents"),
    t("kycBusiness.steps.riskPurpose.title", "Risk & purpose"),
    t("kycBusiness.steps.businessDocument.title", "Business document"),
    t("kycBusiness.steps.review.title", "Review"),
  ];

  const industries = useKycBusinessIndustries();
  const accountPurposes = useKycLabelMap("business/account-purposes");
  const sourceOfFunds = useKycLabelMap("business/source-of-funds");

  const form = useForm<BusinessKycSubmissionInput>({
    resolver: zodResolver(businessKycSubmissionSchema),
    defaultValues: {
      phoneCallingCode: "+1",
      isDao: false,
      registeredAddress: { streetLine1: "", city: "", state: "", postalCode: "", country: "" },
      physicalAddress: { streetLine1: "", city: "", state: "", postalCode: "", country: "", proofOfAddressFile: "" },
      associatedPersons: [
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          nationality: "",
          email: "",
          ownershipPercentage: 100,
          residentialAddress: { streetLine1: "", city: "", state: "", postalCode: "", country: "" },
          identifyingInformation: [
            { type: "tax_id", number: "" },
            { type: "", number: "", expiration: "", imageFront: "", imageBack: "" },
          ],
          hasOwnership: true,
          hasControl: true,
          isSigner: true,
          isDirector: true,
        },
      ],
      highRiskActivities: [],
      conductsMoneyServices: false,
      pepStatus: false,
      thirdPartyMsbPayments: false,
      documents: [{ purpose: "business_registration", description: "", file: "" }],
      usdVirtualAccount: true,
      eurVirtualAccount: false,
      eurdeVirtualAccount: false,
      gbpVirtualAccount: false,
    },
  });

  const { fields: personFields, append: appendPerson, remove: removePerson } = useFieldArray({
    control: form.control,
    name: "associatedPersons",
  });

  const submitMutation = useMutation({
    mutationFn: (input: BusinessKycSubmissionInput) => portalApi.post("/portal/kyc/business", buildKycFormData(input, files)),
    onSuccess: () => {
      toast({
        title: t("kycBusiness.toast.submitted.title", "Verification submitted"),
        description: t("kycBusiness.toast.submitted.description", "We'll review your business details shortly."),
      });
      queryClient.invalidateQueries({ queryKey: ["portal", "kyc"] });
      navigate("/portal/profile");
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("kycBusiness.toast.submitFailed.title", "Submission failed"),
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const errors = form.formState.errors;
  const accountPurpose = form.watch("accountPurpose");
  const highRisk = form.watch("highRiskActivities") ?? [];
  const conductsMsb = form.watch("conductsMoneyServices");
  const eurde = form.watch("eurdeVirtualAccount");

  const getStepFields = (s: number): string[] => {
    switch (s) {
      case 0:
        return ["businessLegalName", "businessTradeName", "businessDescription", "email", "businessType", "registrationNumber", "incorporationDate", "incorporationCountry", "taxId", "phoneCallingCode", "phoneNumber", "businessIndustry", "primaryWebsite", "isDao", "statementDescriptor"];
      case 1:
        return ["registeredAddress", "physicalAddress"];
      case 2:
        return personFields.flatMap((_, i) => [
          `associatedPersons.${i}.firstName`,
          `associatedPersons.${i}.lastName`,
          `associatedPersons.${i}.birthDate`,
          `associatedPersons.${i}.nationality`,
          `associatedPersons.${i}.email`,
          `associatedPersons.${i}.ownershipPercentage`,
          `associatedPersons.${i}.residentialAddress`,
          `associatedPersons.${i}.phone`,
          `associatedPersons.${i}.title`,
        ]);
      case 3:
        return personFields.map((_, i) => `associatedPersons.${i}.identifyingInformation`).concat(["associatedPersons"]);
      case 4:
        return ["accountPurpose", "accountPurposeOther", "sourceOfFunds", "highRiskActivities", "highRiskActivitiesExplanation", "conductsMoneyServices", "conductsMoneyServicesDescription", "complianceScreeningExplanation", "pepStatus", "thirdPartyMsbPayments", "usdVirtualAccount", "eurVirtualAccount", "eurdeVirtualAccount", "gbpVirtualAccount"];
      case 5:
        return ["documents"];
      default:
        return [];
    }
  };

  const goNext = async () => {
    if (step === STEPS.length - 1) {
      form.handleSubmit((v) => submitMutation.mutate(v))();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await form.trigger(getStepFields(step) as any);
    if (ok) setStep((s) => s + 1);
    else
      toast({
        variant: "destructive",
        title: t("kycBusiness.toast.checkFields.title", "Check the fields below"),
        description: t("kycBusiness.toast.checkFields.description", "A few required fields still need your input."),
      });
  };
  const goBack = () => {
    if (step === 0) navigate(-1);
    else setStep((s) => s - 1);
  };

  const toggleSameAsRegistered = (on: boolean) => {
    setSameAsRegistered(on);
    if (on) {
      const reg = form.getValues("registeredAddress");
      form.setValue("physicalAddress", { ...reg, proofOfAddressFile: form.getValues("physicalAddress.proofOfAddressFile") }, { shouldValidate: true });
    }
  };

  const values = form.watch();

  return (
    <FileRegistryProvider registry={files}>
    <WizardShell
      title={t("kycBusiness.header.title", "Verify your business")}
      subtitle={t("kycBusiness.header.subtitle", "Business KYB — details on the company and its owners.")}
      steps={STEPS}
      current={step}
      onBack={goBack}
      onNext={goNext}
      nextLabel={step === STEPS.length - 1 ? t("kycBusiness.actions.submit", "Submit for review") : t("kycBusiness.actions.continue", "Continue")}
      isSubmitting={submitMutation.isPending}
    >
      {step < STEPS.length - 1 && <StepErrorSummary errors={errors} fields={getStepFields(step)} />}
      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.legalName", "Legal business name")}</Label>
            <Input {...form.register("businessLegalName")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.tradeName", "Trade name")}</Label>
            <Input {...form.register("businessTradeName")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("kycBusiness.steps.businessInfo.description", "Business description")}</Label>
            <Textarea {...form.register("businessDescription")} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.email", "Business email")}</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.businessType", "Business type")}</Label>
            <Select value={form.watch("businessType") ?? ""} onValueChange={(v) => form.setValue("businessType", v as BusinessKycSubmissionInput["businessType"])}>
              <SelectTrigger>
                <SelectValue placeholder={t("kycBusiness.common.select", "Select")} />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((bt) => (
                  <SelectItem key={bt} value={bt}>
                    {humanize(bt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.registrationNumber", "Registration number")}</Label>
            <Input {...form.register("registrationNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.incorporationDate", "Incorporation date")}</Label>
            <Input type="date" {...form.register("incorporationDate")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.incorporationCountry", "Incorporation country (optional)")}</Label>
            <CountryField form={form} name="incorporationCountry" countries={countries} isLoading={countriesLoading} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.taxId", "Tax ID (optional)")}</Label>
            <Input {...form.register("taxId")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.website", "Website (optional)")}</Label>
            <Input {...form.register("primaryWebsite")} placeholder={t("kycBusiness.steps.businessInfo.websitePlaceholder", "https://")} />
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <div className="space-y-1.5">
              <Label>{t("kycBusiness.steps.businessInfo.dialCode", "Dial code")}</Label>
              <Input {...form.register("phoneCallingCode")} placeholder={t("kycBusiness.steps.businessInfo.dialCodePlaceholder", "+1")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kycBusiness.steps.businessInfo.phone", "Phone")}</Label>
              <Input {...form.register("phoneNumber")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.businessInfo.industry", "Industry (optional)")}</Label>
            <SearchableSelect
              value={form.watch("businessIndustry") ?? ""}
              onChange={(v) => form.setValue("businessIndustry", v)}
              options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))}
              isLoading={industries.isLoading}
            />
          </div>
          {(errors.businessLegalName || errors.businessTradeName || errors.registrationNumber || errors.businessType) && (
            <p className="text-xs text-destructive sm:col-span-2">{t("kycBusiness.steps.businessInfo.requiredFieldsHint", "Fill in the required fields above.")}</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("kycBusiness.steps.addresses.registeredAddressHeading", "Registered address")}</h3>
            <AddressFields form={form} prefix="registeredAddress" countries={countries} countriesLoading={countriesLoading} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("kycBusiness.steps.addresses.physicalAddressHeading", "Physical address")}</h3>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("kycBusiness.steps.addresses.sameAsRegistered", "Same as registered")}
                <Switch checked={sameAsRegistered} onCheckedChange={toggleSameAsRegistered} />
              </label>
            </div>
            <AddressFields
              form={form}
              prefix="physicalAddress"
              countries={countries}
              countriesLoading={countriesLoading}
              proofField="physicalAddress.proofOfAddressFile"
              proofHint={t(
                "kycBusiness.steps.addresses.physicalProofHint",
                "Lease, utility bill, or similar — required if different from the registered address."
              )}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          {personFields.map((person, i) => (
            <div key={person.id} className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("kycBusiness.steps.ownersDirectors.ownerHeading", "Owner / director {{number}}", { number: i + 1 })}</h3>
                {personFields.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePerson(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.firstName", "First name")}</Label>
                  <Input {...form.register(`associatedPersons.${i}.firstName`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.lastName", "Last name")}</Label>
                  <Input {...form.register(`associatedPersons.${i}.lastName`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.personTitle", "Title")}</Label>
                  <Input {...form.register(`associatedPersons.${i}.title`)} placeholder={t("kycBusiness.steps.ownersDirectors.titlePlaceholder", "CEO, Managing Member…")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.email", "Email")}</Label>
                  <Input type="email" {...form.register(`associatedPersons.${i}.email`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.phoneOptional", "Phone (optional)")}</Label>
                  <Input {...form.register(`associatedPersons.${i}.phone`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.dateOfBirth", "Date of birth")}</Label>
                  <Input type="date" {...form.register(`associatedPersons.${i}.birthDate`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.nationality", "Nationality")}</Label>
                  <CountryField form={form} name={`associatedPersons.${i}.nationality`} countries={countries} isLoading={countriesLoading} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("kycBusiness.steps.ownersDirectors.ownershipPercent", "Ownership %")}</Label>
                  <Input type="number" min={0} max={100} {...form.register(`associatedPersons.${i}.ownershipPercentage`, { valueAsNumber: true })} />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["hasOwnership", t("kycBusiness.steps.ownersDirectors.hasOwnership", "Has ownership")],
                    ["hasControl", t("kycBusiness.steps.ownersDirectors.hasControl", "Has control")],
                    ["isSigner", t("kycBusiness.steps.ownersDirectors.authorizedSigner", "Authorized signer")],
                    ["isDirector", t("kycBusiness.steps.ownersDirectors.director", "Director")],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                    {label}
                    <Switch
                      checked={form.watch(`associatedPersons.${i}.${field}`)}
                      onCheckedChange={(v) => form.setValue(`associatedPersons.${i}.${field}`, v)}
                    />
                  </label>
                ))}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("kycBusiness.steps.ownersDirectors.residentialAddressHeading", "Residential address")}</h4>
                <AddressFields form={form} prefix={`associatedPersons.${i}.residentialAddress`} countries={countries} countriesLoading={countriesLoading} />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => appendPerson(emptyAssociatedPerson())}>
            <Plus className="h-4 w-4" /> {t("kycBusiness.steps.ownersDirectors.addAnother", "Add another owner / director")}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Two forms of ID are required for each owner/director: a tax ID (no image needed) plus one government photo ID.
          </p>
          {personFields.map((person, i) => {
            const personName = `${form.watch(`associatedPersons.${i}.firstName`)} ${form.watch(`associatedPersons.${i}.lastName`)}`.trim();
            const nationality = form.watch(`associatedPersons.${i}.nationality`);
            return (
              <div key={person.id} className="space-y-4 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">{personName || t("kycBusiness.steps.ownersDirectors.personFallbackName", "Owner / director {{index}}", { index: i + 1 })}</h3>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("kycBusiness.steps.ownersDirectors.taxIdHeading", "1. Tax ID")}</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>{t("kycBusiness.steps.ownersDirectors.taxId", "SSN / EIN / ITIN")}</Label>
                      <Input {...form.register(`associatedPersons.${i}.identifyingInformation.0.number`)} />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("kycBusiness.steps.ownersDirectors.photoIdHeading", "2. Government photo ID")}</h4>
                  <BusinessPhotoIdFields
                    form={form}
                    prefix={`associatedPersons.${i}.identifyingInformation.1`}
                    country={nationality}
                    countries={countries}
                    countriesLoading={countriesLoading}
                  />
                </div>
              </div>
            );
          })}
          {errors.associatedPersons && (
            <p className="text-xs text-destructive">
              {t("kycBusiness.steps.ownersDirectors.identityDocsRequired", "Both identity documents are required for every owner/director.")}
            </p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.accountInfo.accountPurpose", "Account purpose")}</Label>
            <Select value={accountPurpose ?? ""} onValueChange={(v) => form.setValue("accountPurpose", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder={t("kycBusiness.steps.accountInfo.selectPlaceholder", "Select")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {Object.entries(accountPurposes.data ?? {}).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.accountInfo.sourceOfFunds", "Source of funds")}</Label>
            <Select value={form.watch("sourceOfFunds") ?? ""} onValueChange={(v) => form.setValue("sourceOfFunds", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder={t("kycBusiness.steps.accountInfo.selectPlaceholder", "Select")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {Object.entries(sourceOfFunds.data ?? {}).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {accountPurpose === "other" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("kycBusiness.steps.accountInfo.describeAccountPurpose", "Describe account purpose")}</Label>
              <Input {...form.register("accountPurposeOther")} />
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>{t("kycBusiness.steps.accountInfo.highRiskActivities", "High-risk activities (select any that apply)")}</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {HIGH_RISK_ACTIVITIES.map((a) => (
                <label key={a} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
                  <Checkbox
                    checked={highRisk.includes(a)}
                    onCheckedChange={(v) => {
                      const next = v === true ? [...highRisk, a] : highRisk.filter((x) => x !== a);
                      form.setValue("highRiskActivities", next, { shouldValidate: true });
                    }}
                  />
                  {humanize(a)}
                </label>
              ))}
            </div>
            {highRisk.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <Label>{t("kycBusiness.steps.accountInfo.explainFlaggedActivity", "Explain the flagged activity")}</Label>
                <Textarea {...form.register("highRiskActivitiesExplanation")} rows={2} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{t("kycBusiness.steps.accountInfo.conductsMoneyServices", "Conducts money services")}</p>
              <p className="text-xs text-muted-foreground">
                {t("kycBusiness.steps.accountInfo.conductsMoneyServicesHint", "Remittance, currency exchange, or similar regulated MSB activity.")}
              </p>
            </div>
            <Switch checked={conductsMsb} onCheckedChange={(v) => form.setValue("conductsMoneyServices", v, { shouldValidate: true })} />
          </div>
          {conductsMsb && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("kycBusiness.steps.accountInfo.describeMoneyServicesActivity", "Describe the money services activity")}</Label>
                <Textarea {...form.register("conductsMoneyServicesDescription")} rows={2} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("kycBusiness.steps.accountInfo.complianceScreeningProgram", "Compliance screening program")}</Label>
                <Textarea {...form.register("complianceScreeningExplanation")} rows={2} />
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{t("kycBusiness.steps.accountInfo.pepStatus", "Politically exposed person (PEP)")}</p>
              <p className="text-xs text-muted-foreground">{t("kycBusiness.steps.accountInfo.pepStatusHint", "Any owner/director is a PEP or close associate of one.")}</p>
            </div>
            <Switch checked={form.watch("pepStatus")} onCheckedChange={(v) => form.setValue("pepStatus", v, { shouldValidate: true })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
            <p className="text-sm font-medium">{t("kycBusiness.steps.accountInfo.thirdPartyMsbPayments", "Processes payments for third-party MSBs")}</p>
            <Switch checked={form.watch("thirdPartyMsbPayments")} onCheckedChange={(v) => form.setValue("thirdPartyMsbPayments", v, { shouldValidate: true })} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.accountInfo.prohibitedCountries", "Operates in prohibited countries (optional)")}</Label>
            <Select value={form.watch("operatesInProhibitedCountries") ?? ""} onValueChange={(v) => form.setValue("operatesInProhibitedCountries", v as "yes" | "no")}>
              <SelectTrigger>
                <SelectValue placeholder={t("kycBusiness.steps.accountInfo.notSpecified", "Not specified")} />
              </SelectTrigger>
              <SelectContent>
                {OPERATES_IN_PROHIBITED_COUNTRIES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {humanize(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.accountInfo.estimatedAnnualRevenue", "Estimated annual revenue, USD (optional)")}</Label>
            <Input {...form.register("estimatedAnnualRevenueUsd")} placeholder={t("kycBusiness.steps.accountInfo.estimatedAnnualRevenuePlaceholder", "e.g. 1000000_to_5000000")} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>{t("kycBusiness.steps.accountInfo.virtualAccountsToProvision", "Virtual accounts to provision")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["usdVirtualAccount", "USD"],
                  ["eurVirtualAccount", "EUR"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <Checkbox checked={form.watch(field)} disabled={eurde} onCheckedChange={(v) => form.setValue(field, v === true, { shouldValidate: true })} />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <Checkbox
                  checked={eurde}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    form.setValue("eurdeVirtualAccount", on, { shouldValidate: true });
                    if (on) {
                      form.setValue("usdVirtualAccount", false);
                      form.setValue("eurVirtualAccount", false);
                    }
                  }}
                />
                {t("kycBusiness.steps.accountInfo.eurdeCombined", "EURDE (combined)")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <Checkbox checked={form.watch("gbpVirtualAccount")} onCheckedChange={(v) => form.setValue("gbpVirtualAccount", v === true)} />
                GBP <span className="text-xs text-muted-foreground">{t("kycBusiness.steps.accountInfo.extraFeeHint", "(may incur an extra fee)")}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.documents.documentPurpose", "Document purpose")}</Label>
            <Select value={form.watch("documents.0.purpose") ?? ""} onValueChange={(v) => form.setValue("documents.0.purpose", v as BusinessKycSubmissionInput["documents"][number]["purpose"])}>
              <SelectTrigger>
                <SelectValue placeholder={t("kycBusiness.steps.documents.selectPlaceholder", "Select")} />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_DOCUMENT_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {humanize(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("kycBusiness.steps.documents.description", "Description")}</Label>
            <Input {...form.register("documents.0.description")} placeholder={t("kycBusiness.steps.documents.descriptionPlaceholder", "Certificate of Incorporation")} />
          </div>
          <div className="sm:col-span-2">
            <FileField form={form} name="documents.0.file" label={t("kycBusiness.steps.documents.fileLabel", "File")} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {t(
              "kycBusiness.steps.documents.businessRegistrationRequiredHint",
              'A document with purpose "Business registration" is required — the default above satisfies that.',
            )}
          </p>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t("kycBusiness.steps.review.readyMessage", "Everything looks ready. Review, then submit.")}
          </div>
          <dl className="divide-y divide-border text-sm">
            {[
              [t("kycBusiness.steps.review.business", "Business"), values.businessLegalName],
              [t("kycBusiness.steps.review.tradeName", "Trade name"), values.businessTradeName],
              [t("kycBusiness.steps.review.type", "Type"), values.businessType ? humanize(values.businessType) : ""],
              [
                t("kycBusiness.steps.review.registeredAddress", "Registered address"),
                `${values.registeredAddress?.streetLine1}, ${values.registeredAddress?.city}, ${values.registeredAddress?.country}`,
              ],
              [
                t("kycBusiness.steps.review.ownersDirectors", "Owners / directors"),
                (values.associatedPersons ?? []).map((p) => `${p.firstName} ${p.lastName} (${p.ownershipPercentage}%)`).join(", "),
              ],
              [t("kycBusiness.steps.review.accountPurpose", "Account purpose"), accountPurpose ? humanize(accountPurpose) : ""],
              [
                t("kycBusiness.steps.review.highRiskActivities", "High-risk activities"),
                highRisk.length ? highRisk.map(humanize).join(", ") : t("kycBusiness.steps.review.none", "None"),
              ],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{val || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </WizardShell>
    </FileRegistryProvider>
  );
}
