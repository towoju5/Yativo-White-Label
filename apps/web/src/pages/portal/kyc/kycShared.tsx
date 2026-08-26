import { createContext, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, ChevronsUpDown, Loader2, Upload, X } from "lucide-react";
import { FILE_ACCEPT, type KycCountry } from "@white-label/shared-types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { humanize, validateFile, type AnyForm } from "./kycUtils";
import { useKycSubdivisions, useKycPostalCodeRule, useKycIdentificationTypes } from "./kycHooks";

function getAtPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[key]), obj);
}

type CollectedFieldError = { path: string; message: string };

/**
 * Recursively walks a react-hook-form error node (which may be a leaf `{type, message, ref}`, a
 * nested object for a sub-form like an address, or an array for a repeated section like
 * identifying documents) and flattens it into human-readable "Field: message" entries. Numeric
 * path segments (array indices) are dropped from the displayed label — this form only ever shows
 * one item per repeated section at a time, so "Identity Document 0: X" would just be noise.
 */
function collectFieldErrors(errNode: unknown, path: string[]): CollectedFieldError[] {
  if (!errNode || typeof errNode !== "object") return [];
  const node = errNode as Record<string, unknown>;
  if (typeof node.message === "string") {
    const label = path.filter((p) => !/^\d+$/.test(p)).map(humanize).join(" › ");
    return [{ path: label || "This field", message: node.message }];
  }
  const out: CollectedFieldError[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "ref" || key === "type" || key === "types" || value == null || typeof value !== "object") continue;
    out.push(...collectFieldErrors(value, [...path, key]));
  }
  return out;
}

/**
 * A visible, itemized summary of every validation error under the given field paths (plain keys
 * like "taxId", or dot-paths like "associatedPersons.0.firstName" — both are supported since the
 * two KYC wizards use each convention in different steps). Renders nothing when there are no
 * errors. Exists because most of this form's individual fields (and every shared field component
 * below — CountryField, AddressFields, IndividualIdDocFields) never rendered their own inline
 * error text, so a required field left blank silently blocked "Continue" with no visible reason —
 * confirmed live for Tax ID specifically, but the same gap applies broadly across both wizards.
 */
export function StepErrorSummary({ errors, fields }: { errors: Record<string, unknown>; fields: string[] }) {
  const { t } = useTranslation();
  const seen = new Set<string>();
  const entries: CollectedFieldError[] = [];
  for (const field of fields) {
    const pathParts = field.split(".");
    const sub = getAtPath(errors, pathParts);
    for (const entry of collectFieldErrors(sub, pathParts)) {
      const key = `${entry.path}:${entry.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  if (entries.length === 0) return null;
  return (
    <div className="mb-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{t("kycShared.fixBeforeContinuing", "Please fix the following before continuing:")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {entries.map((entry) => (
            <li key={`${entry.path}:${entry.message}`}>
              <span className="font-medium">{entry.path}</span>: {entry.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Fallback for file fields Yativo's API can't accept as real binary (see the `KycFile` doc
 * comment in the SDK's kyc.ts) — a confirmed server-side bug drops any *nested* binary file
 * field the instant the rest of the submission validates. Only used where FileField is given
 * `encoding="base64"` (the default — binary is opt-in, for the one field proven safe).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/** Strips a PHP/JS-style "/pattern/flags" regex string down to a usable RegExp, or null if unparseable. */
function parseServerRegex(pattern: string | null): RegExp | null {
  if (!pattern) return null;
  const m = pattern.match(/^\/(.*)\/([a-z]*)$/i);
  try {
    if (m) {
      const [, body, flags] = m;
      return new RegExp(body ?? pattern, (flags ?? "").replace("u", ""));
    }
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

// --- file upload registry ---------------------------------------------------
//
// Files are uploaded as real binary (multipart), never base64-in-JSON. react-hook-form's field
// value for a file input just holds the filename (a plain string, so the existing zod
// required-string validation keeps working for free-form step-gating) — the actual File object
// lives in this side-registry, keyed by the exact same dot-path used as the RHF field name (e.g.
// "identifyingInformation.0.imageFront"), so it works unmodified for the dynamic multi-owner
// paths too. buildKycFormData() (kycUtils.ts) reunites the two at submit time.

const FileRegistryContext = createContext<Map<string, File> | null>(null);

/** Wraps a wizard's fields so every nested FileField can reach the same registry. */
export function FileRegistryProvider({ registry, children }: { registry: Map<string, File>; children: React.ReactNode }) {
  return <FileRegistryContext.Provider value={registry}>{children}</FileRegistryContext.Provider>;
}

// --- shared field widgets ----------------------------------------------------

type Option = { value: string; label: string };

/** Popover + filtered list — a lightweight combobox for large option sets (countries, occupations, industries). */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  isLoading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 200) : options.slice(0, 200);
  const effectivePlaceholder = placeholder ?? t("kycShared.selectPlaceholder", "Select…");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
          disabled={isLoading}
        >
          <span className="truncate">{isLoading ? t("kycShared.loadingEllipsis", "Loading…") : (selected?.label ?? effectivePlaceholder)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b border-border p-2">
          <Input autoFocus placeholder={t("kycShared.searchPlaceholder", "Search…")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">{t("kycShared.noMatches", "No matches.")}</p>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                o.value === value && "bg-muted font-medium",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CountryField({ form, name, countries, isLoading }: { form: AnyForm; name: string; countries: KycCountry[]; isLoading?: boolean }) {
  const { t } = useTranslation();
  return (
    <SearchableSelect
      value={form.watch(name) ?? ""}
      onChange={(v) => form.setValue(name, v, { shouldValidate: true })}
      options={countries.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
      placeholder={t("kycShared.selectCountryPlaceholder", "Select a country")}
      isLoading={isLoading}
    />
  );
}

export function FileField({
  form,
  name,
  label,
  hint,
  onValidated,
  encoding = "base64",
}: {
  form: AnyForm;
  name: string;
  label: string;
  hint?: string;
  onValidated?: (file: File) => void;
  /**
   * "binary" sends the real file as a multipart part (needs FileRegistryProvider up the tree).
   * "base64" (default) embeds it as a data URI directly in the JSON payload instead — required
   * for every *nested* file field because of a confirmed Yativo server-side bug (see KycFile's
   * doc comment in the SDK). Only mark a field "binary" once it's verified safe.
   */
  encoding?: "binary" | "base64";
}) {
  const { t } = useTranslation();
  const files = useContext(FileRegistryContext);
  const [state, setState] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = form.watch(name) as string | undefined;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-muted/50",
          error ? "border-destructive/50" : value ? "border-success/50 bg-success/5" : "border-border",
        )}
      >
        <input
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const err = validateFile(file);
            if (err) {
              setError(err);
              setState(null);
              files?.delete(name);
              form.setValue(name, "", { shouldValidate: true });
              return;
            }
            setError(null);
            setState({ name: file.name, size: file.size });
            if (encoding === "binary") {
              files?.set(name, file);
              // The real File lives in the registry (see FileRegistryProvider) — this field only
              // needs a non-empty placeholder so the existing required-string validation still
              // gates step navigation correctly.
              form.setValue(name, file.name, { shouldValidate: true });
            } else {
              files?.delete(name);
              form.setValue(name, await fileToBase64(file), { shouldValidate: true });
            }
            onValidated?.(file);
          }}
        />
        {value ? <Check className="h-4 w-4 shrink-0 text-success" /> : <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {state ? (
            <>
              <span className="text-foreground">{state.name}</span> · {formatBytes(state.size)}
            </>
          ) : (
            t("kycShared.clickToUpload", "Click to upload")
          )}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setState(null);
              files?.delete(name);
              form.setValue(name, "", { shouldValidate: true });
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AddressFields({
  form,
  prefix,
  countries,
  countriesLoading,
  proofField,
  proofHint,
}: {
  form: AnyForm;
  prefix: string;
  countries: KycCountry[];
  countriesLoading?: boolean;
  proofField?: string;
  proofHint?: string;
}) {
  const { t } = useTranslation();
  const country = form.watch(`${prefix}.country`) as string | undefined;
  const subdivisions = useKycSubdivisions(country);
  const postalRule = useKycPostalCodeRule(country);
  const postalValue = form.watch(`${prefix}.postalCode`) as string | undefined;

  const regex = parseServerRegex(postalRule.data?.ruleRegex ?? null);
  const postalError =
    postalValue && regex && postalRule.data?.usesPostalCodes && !regex.test(postalValue)
      ? postalRule.data.ruleSamples[0]
        ? t("kycShared.postalCodeFormatErrorWithExample", "Doesn't match the expected format (e.g. {{example}}).", {
            example: postalRule.data.ruleSamples[0],
          })
        : t("kycShared.postalCodeFormatError", "Doesn't match the expected format.")
      : null;

  const hasSubdivisions = (subdivisions.data?.length ?? 0) > 0;
  const stateProvinceLabel = t("kycShared.stateProvinceLabel", "State / province");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("kycShared.countryLabel", "Country")}</Label>
        <CountryField form={form} name={`${prefix}.country`} countries={countries} isLoading={countriesLoading} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("kycShared.streetAddressLabel", "Street address")}</Label>
        <Input {...form.register(`${prefix}.streetLine1`)} placeholder={t("kycShared.streetAddressPlaceholder", "123 Main St")} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("kycShared.streetAddress2Label", "Street address 2 (optional)")}</Label>
        <Input {...form.register(`${prefix}.streetLine2`)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.cityLabel", "City")}</Label>
        <Input {...form.register(`${prefix}.city`)} />
      </div>
      <div className="space-y-1.5">
        <Label>{stateProvinceLabel}</Label>
        {hasSubdivisions ? (
          <SearchableSelect
            value={form.watch(`${prefix}.state`) ?? ""}
            onChange={(v) => form.setValue(`${prefix}.state`, v, { shouldValidate: true })}
            options={(subdivisions.data ?? []).map((s) => ({ value: s.code, label: `${humanize(s.name)} (${s.code})` }))}
            placeholder={t("kycShared.selectOption", "Select")}
          />
        ) : (
          <Input {...form.register(`${prefix}.state`)} placeholder={subdivisions.isFetching ? t("kycShared.loadingEllipsis", "Loading…") : stateProvinceLabel} />
        )}
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.postalCodeLabel", "Postal code")}</Label>
        <Input {...form.register(`${prefix}.postalCode`)} disabled={postalRule.data?.usesPostalCodes === false} />
        {postalError && <p className="text-xs text-destructive">{postalError}</p>}
        {postalRule.data?.usesPostalCodes === false && (
          <p className="text-xs text-muted-foreground">{t("kycShared.noPostalCodesText", "This country doesn't use postal codes.")}</p>
        )}
      </div>
      {proofField && (
        <div className="sm:col-span-2">
          <FileField
            form={form}
            name={proofField}
            label={t("kycShared.proofOfAddressLabel", "Proof of address")}
            hint={proofHint ?? t("kycShared.proofOfAddressHint", "Utility bill, bank statement, or lease.")}
          />
        </div>
      )}
    </div>
  );
}

/** Individual KYC's identifying_information[] entry — country-scoped document type, front/back images. */
export function IndividualIdDocFields({ form, prefix, countries, countriesLoading }: { form: AnyForm; prefix: string; countries: KycCountry[]; countriesLoading?: boolean }) {
  const { t } = useTranslation();
  const issuingCountry = form.watch(`${prefix}.issuingCountry`) as string | undefined;
  const idTypes = useKycIdentificationTypes(issuingCountry);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("kycShared.issuingCountryLabel", "Issuing country")}</Label>
        <CountryField form={form} name={`${prefix}.issuingCountry`} countries={countries} isLoading={countriesLoading} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.documentTypeLabel", "Document type")}</Label>
        <SearchableSelect
          value={form.watch(`${prefix}.type`) ?? ""}
          onChange={(v) => form.setValue(`${prefix}.type`, v, { shouldValidate: true })}
          options={(idTypes.data ?? []).map((it) => ({ value: it.type, label: it.description }))}
          placeholder={issuingCountry ? t("kycShared.selectOption", "Select") : t("kycShared.chooseCountryFirstPlaceholder", "Choose a country first")}
          isLoading={idTypes.isFetching}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("kycShared.documentNumberLabel", "Document number")}</Label>
        <Input {...form.register(`${prefix}.number`)} placeholder={t("kycShared.documentNumberPlaceholder", "e.g. P00012345")} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.dateIssuedLabel", "Date issued")}</Label>
        <Input type="date" {...form.register(`${prefix}.dateIssued`)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.expirationDateLabel", "Expiration date")}</Label>
        <Input type="date" {...form.register(`${prefix}.expirationDate`)} />
      </div>
      <div className="sm:col-span-2">
        <FileField form={form} name={`${prefix}.imageFront`} label={t("kycShared.documentFrontLabel", "Document — front")} />
      </div>
      <div className="sm:col-span-2">
        <FileField form={form} name={`${prefix}.imageBack`} label={t("kycShared.documentBackOptionalLabel", "Document — back (optional)")} />
      </div>
    </div>
  );
}

/** Business associated-person photo-ID entry (image_front/image_back/expiration — no issuing_country/date_issued). */
export function BusinessPhotoIdFields({
  form,
  prefix,
  country,
  countries,
  countriesLoading,
}: {
  form: AnyForm;
  prefix: string;
  /** The person's nationality — used to scope the document-type list. */
  country: string | undefined;
  countries: KycCountry[];
  countriesLoading?: boolean;
}) {
  const { t } = useTranslation();
  const idTypes = useKycIdentificationTypes(country);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("kycShared.documentTypeLabel", "Document type")}</Label>
        <SearchableSelect
          value={form.watch(`${prefix}.type`) ?? ""}
          onChange={(v) => form.setValue(`${prefix}.type`, v, { shouldValidate: true })}
          options={(idTypes.data ?? []).filter((it) => it.type !== "tax_id").map((it) => ({ value: it.type, label: it.description }))}
          placeholder={country ? t("kycShared.selectOption", "Select") : t("kycShared.setNationalityFirstPlaceholder", "Set nationality first")}
          isLoading={idTypes.isFetching}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.documentNumberLabel", "Document number")}</Label>
        <Input {...form.register(`${prefix}.number`)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("kycShared.expirationDateOptionalLabel", "Expiration date (optional)")}</Label>
        <Input type="date" {...form.register(`${prefix}.expiration`)} />
      </div>
      <div className="hidden sm:block" />
      <div className="sm:col-span-2">
        <FileField form={form} name={`${prefix}.imageFront`} label={t("kycShared.documentFrontLabel", "Document — front")} />
      </div>
      <div className="sm:col-span-2">
        <FileField form={form} name={`${prefix}.imageBack`} label={t("kycShared.documentBackOptionalLabel", "Document — back (optional)")} />
      </div>
      {countriesLoading /* keep countries prop referenced without an unused-var lint even though this variant doesn't render a country field */ && null}
      {countries.length === 0 && null}
    </div>
  );
}

// --- wizard chrome -----------------------------------------------------------

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const { t } = useTranslation();
  const pct = ((current + 1) / steps.length) * 100;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {t("kycShared.stepOf", "Step {{current}} of {{total}}", { current: current + 1, total: steps.length })}
        </span>
        <span className="text-muted-foreground">{steps[current]}</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

export function WizardShell({
  title,
  subtitle,
  steps,
  current,
  children,
  onBack,
  onNext,
  nextLabel,
  isSubmitting,
  backDisabled,
}: {
  title: string;
  subtitle?: string;
  steps: string[];
  current: number;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  isSubmitting?: boolean;
  backDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/30 px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
          <div className="border-b border-border px-6 py-4 sm:px-8">
            <Stepper steps={steps} current={current} />
          </div>
          <div className="px-6 py-6 sm:px-8 sm:py-8">{children}</div>
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4 sm:px-8">
            <Button type="button" variant="ghost" onClick={onBack} disabled={backDisabled || isSubmitting}>
              {t("kycShared.backButton", "Back")}
            </Button>
            <Button type="button" onClick={onNext} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : nextLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
