import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  individualKycSubmissionSchema,
  IMMIGRATION_STATUSES,
  type IndividualKycSubmissionInput,
  type KycCountry,
} from "@white-label/shared-types";
import { CheckCircle2 } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CountryField,
  FileField,
  FileRegistryProvider,
  AddressFields,
  IndividualIdDocFields,
  WizardShell,
  SearchableSelect,
  StepErrorSummary,
} from "./kycShared";
import { humanize, buildKycFormData } from "./kycUtils";
import { useFileRegistry, useKycOccupations, useKycLabelMap } from "./kycHooks";

const STEPS = ["Personal info", "Address", "Identity document", "Financial profile", "Review"];

export default function IndividualKycWizard({ countries, countriesLoading }: { countries: KycCountry[]; countriesLoading?: boolean }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const files = useFileRegistry();

  const occupations = useKycOccupations();
  const accountPurposes = useKycLabelMap("individual/account-purposes");
  const sourceOfFunds = useKycLabelMap("individual/source-of-funds");
  const expectedMonthlyPayments = useKycLabelMap("individual/expected-monthly-payments");

  const form = useForm<IndividualKycSubmissionInput>({
    resolver: zodResolver(individualKycSubmissionSchema),
    defaultValues: {
      callingCode: "+1",
      gender: "male",
      currentEmployer: "",
      residentialAddress: { streetLine1: "", city: "", state: "", postalCode: "", country: "", proofOfAddressFile: "" },
      identifyingInformation: [{ type: "", issuingCountry: "", number: "", dateIssued: "", expirationDate: "", imageFront: "" }],
      uploadedDocuments: [],
      actingAsIntermediary: false,
      selfieImage: "",
      usdVirtualAccount: true,
      eurVirtualAccount: false,
      eurdeVirtualAccount: false,
      gbpVirtualAccount: false,
    },
  });

  const submitMutation = useMutation({
    mutationFn: (input: IndividualKycSubmissionInput) => portalApi.post("/portal/kyc/individual", buildKycFormData(input, files)),
    onSuccess: () => {
      toast({ title: "Verification submitted", description: "We'll review your details shortly." });
      queryClient.invalidateQueries({ queryKey: ["portal", "kyc"] });
      navigate("/portal/profile");
    },
    onError: (e) => toast({ variant: "destructive", title: "Submission failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const errors = form.formState.errors;
  const nationality = form.watch("nationality");
  const residentialCountry = form.watch("residentialAddress.country");
  const needsNigeriaFields = nationality === "NG" || residentialCountry === "NG";
  const accountPurpose = form.watch("accountPurpose");
  const eurde = form.watch("eurdeVirtualAccount");

  const stepFields: Record<number, (keyof IndividualKycSubmissionInput)[]> = {
    0: ["firstName", "middleName", "lastName", "email", "callingCode", "phone", "birthDate", "nationality", "gender", "taxId", "currentEmployer", "immigrationStatus", "bvn", "nin"],
    1: ["residentialAddress"],
    2: ["identifyingInformation", "selfieImage"],
    3: ["employmentStatus", "mostRecentOccupationCode", "expectedMonthlyPaymentsUsd", "sourceOfFunds", "accountPurpose", "accountPurposeOther", "actingAsIntermediary", "usdVirtualAccount", "eurVirtualAccount", "eurdeVirtualAccount", "gbpVirtualAccount"],
  };

  const goNext = async () => {
    if (step === STEPS.length - 1) {
      form.handleSubmit((v) => submitMutation.mutate(v))();
      return;
    }
    const ok = await form.trigger(stepFields[step]);
    if (ok) setStep((s) => s + 1);
    else toast({ variant: "destructive", title: "Check the fields below", description: "A few required fields still need your input." });
  };
  const goBack = () => {
    if (step === 0) navigate(-1);
    else setStep((s) => s - 1);
  };

  const values = form.watch();

  return (
    <FileRegistryProvider registry={files}>
    <WizardShell
      title="Verify your identity"
      subtitle="A few details so we can confirm who you are."
      steps={STEPS}
      current={step}
      onBack={goBack}
      onNext={goNext}
      nextLabel={step === STEPS.length - 1 ? "Submit for review" : "Continue"}
      isSubmitting={submitMutation.isPending}
    >
      {step < STEPS.length - 1 && <StepErrorSummary errors={errors} fields={stepFields[step] ?? []} />}
      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First name</Label>
            <Input {...form.register("firstName")} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Middle name (optional)</Label>
            <Input {...form.register("middleName")} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input {...form.register("lastName")} />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...form.register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.watch("gender")} onValueChange={(v) => form.setValue("gender", v as "male" | "female")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" {...form.register("birthDate")} />
            {errors.birthDate && <p className="text-xs text-destructive">{errors.birthDate.message}</p>}
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <div className="space-y-1.5">
              <Label>Dial code</Label>
              <Input {...form.register("callingCode")} placeholder="+1" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...form.register("phone")} placeholder="5551234567" />
            </div>
          </div>
          {(errors.callingCode || errors.phone) && (
            <p className="text-xs text-destructive sm:col-span-2 sm:-mt-2">Dial code like "+1", phone digits only (8-15 digits).</p>
          )}
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <CountryField form={form} name="nationality" countries={countries} isLoading={countriesLoading} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax ID</Label>
            <Input {...form.register("taxId")} placeholder="SSN / national tax number" />
            {errors.taxId && <p className="text-xs text-destructive">{errors.taxId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Current employer (optional)</Label>
            <Input {...form.register("currentEmployer")} />
          </div>
          <div className="space-y-1.5">
            <Label>Immigration status (optional)</Label>
            <Select value={form.watch("immigrationStatus") ?? ""} onValueChange={(v) => form.setValue("immigrationStatus", v as IndividualKycSubmissionInput["immigrationStatus"])}>
              <SelectTrigger>
                <SelectValue placeholder="Not applicable" />
              </SelectTrigger>
              <SelectContent>
                {IMMIGRATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsNigeriaFields && (
            <>
              <div className="space-y-1.5">
                <Label>BVN</Label>
                <Input {...form.register("bvn")} maxLength={11} placeholder="11 digits" />
              </div>
              <div className="space-y-1.5">
                <Label>NIN</Label>
                <Input {...form.register("nin")} maxLength={11} placeholder="11 digits" />
              </div>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <AddressFields form={form} prefix="residentialAddress" countries={countries} countriesLoading={countriesLoading} proofField="residentialAddress.proofOfAddressFile" />
      )}

      {step === 2 && (
        <div className="space-y-6">
          <FileField form={form} name="selfieImage" label="Selfie photo" hint="A clear photo of your face." encoding="binary" />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Government-issued ID</h3>
            <IndividualIdDocFields form={form} prefix="identifyingInformation.0" countries={countries} countriesLoading={countriesLoading} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Employment status</Label>
            <Select value={form.watch("employmentStatus") ?? ""} onValueChange={(v) => form.setValue("employmentStatus", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {["Employed", "Exempt", "Homemaker", "Retired", "SelfEmployed", "Student", "Unemployed"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Occupation</Label>
            <SearchableSelect
              value={form.watch("mostRecentOccupationCode") ?? ""}
              onChange={(v) => form.setValue("mostRecentOccupationCode", v, { shouldValidate: true })}
              options={(occupations.data ?? []).map((o) => ({ value: o.code, label: o.label }))}
              isLoading={occupations.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expected monthly payments (USD)</Label>
            <Select value={form.watch("expectedMonthlyPaymentsUsd") ?? ""} onValueChange={(v) => form.setValue("expectedMonthlyPaymentsUsd", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(expectedMonthlyPayments.data ?? {}).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source of funds</Label>
            <Select value={form.watch("sourceOfFunds") ?? ""} onValueChange={(v) => form.setValue("sourceOfFunds", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Account purpose</Label>
            <Select value={accountPurpose ?? ""} onValueChange={(v) => form.setValue("accountPurpose", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
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
          {accountPurpose === "Other" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Describe account purpose</Label>
              <Input {...form.register("accountPurposeOther")} />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Acting as an intermediary</p>
              <p className="text-xs text-muted-foreground">On behalf of someone else, not for yourself.</p>
            </div>
            <Switch checked={form.watch("actingAsIntermediary")} onCheckedChange={(v) => form.setValue("actingAsIntermediary", v)} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Virtual accounts to provision</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["usdVirtualAccount", "USD"],
                  ["eurVirtualAccount", "EUR"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <Checkbox
                    checked={form.watch(field)}
                    disabled={eurde}
                    onCheckedChange={(v) => form.setValue(field, v === true, { shouldValidate: true })}
                  />
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
                EURDE (combined)
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <Checkbox checked={form.watch("gbpVirtualAccount")} onCheckedChange={(v) => form.setValue("gbpVirtualAccount", v === true)} />
                GBP <span className="text-xs text-muted-foreground">(may incur an extra fee)</span>
              </label>
            </div>
            {(errors.usdVirtualAccount || errors.eurdeVirtualAccount) && (
              <p className="text-xs text-destructive">Choose USD and/or EUR, or EURDE alone.</p>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Everything looks ready. Review, then submit.
          </div>
          <dl className="divide-y divide-border text-sm">
            {[
              ["Name", `${values.firstName} ${values.middleName ? values.middleName + " " : ""}${values.lastName}`],
              ["Email", values.email],
              ["Phone", `${values.callingCode} ${values.phone}`],
              ["Nationality", values.nationality],
              ["Address", `${values.residentialAddress?.streetLine1}, ${values.residentialAddress?.city}, ${values.residentialAddress?.country}`],
              ["ID document", humanize(values.identifyingInformation?.[0]?.type ?? "")],
              ["Account purpose", values.accountPurpose ? humanize(values.accountPurpose) : ""],
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
