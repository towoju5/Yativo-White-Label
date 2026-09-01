import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Beneficiary, BeneficiaryFormField, CreateBeneficiaryInput, PayoutCountry, PayoutMethod } from "@white-label/shared-types";
import { ArrowLeft, ArrowRight, Banknote, Check, Landmark, Loader2, Pencil, Plus, Trash2, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect, Stepper } from "@/pages/portal/kyc/kycShared";
import { humanize } from "@/pages/portal/kyc/kycUtils";

export default function BeneficiariesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [countryIso3, setCountryIso3] = useState("");
  const [gatewayId, setGatewayId] = useState("");
  const [paymentData, setPaymentData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Beneficiary | null>(null);
  const [removing, setRemoving] = useState<Beneficiary | null>(null);

  const STEPS = [
    t("beneficiaries.steps.recipient", "Recipient"),
    t("beneficiaries.steps.payoutMethod", "Payout method"),
    t("beneficiaries.steps.paymentDetails", "Payment details"),
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "beneficiaries"],
    queryFn: () => portalApi.get<Beneficiary[]>("/portal/beneficiaries"),
  });

  const countriesQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "countries"],
    queryFn: () => portalApi.get<PayoutCountry[]>("/portal/beneficiaries/countries"),
  });

  const payoutMethodsQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "payout-methods", countryIso3],
    queryFn: () => portalApi.get<PayoutMethod[]>("/portal/beneficiaries/payout-methods", { country: countryIso3 }),
    enabled: !!countryIso3,
  });

  const formQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "form", gatewayId],
    queryFn: () => portalApi.get<BeneficiaryFormField[]>(`/portal/beneficiaries/form/${gatewayId}`),
    enabled: !!gatewayId,
  });

  const selectedCountry = countriesQuery.data?.find((c) => c.iso3 === countryIso3);
  const selectedMethod = payoutMethodsQuery.data?.find((m) => m.gatewayId === gatewayId);

  // A field with no `when` always shows; otherwise only once the field it depends on currently
  // holds the expected value (e.g. "Nombre completo" only once "Tipo de cliente" is "natural").
  const isFieldVisible = (f: BeneficiaryFormField) => !f.when || paymentData[f.when.key] === f.when.value;
  const visibleFields = useMemo(() => (formQuery.data ?? []).filter(isFieldVisible), [formQuery.data, paymentData]);
  // Hidden fields (e.g. Nigeria's gateway 1271 destination_type) carry a fixed value that must be
  // submitted verbatim in payment_data but should never be shown as an input.
  const renderableFields = useMemo(() => visibleFields.filter((f) => f.type !== "hidden"), [visibleFields]);

  // Real Yativo schemas mark almost nothing `required: true` and instead rely on `min` — a field
  // is only truly mandatory when it says so explicitly or declares a positive minimum length.
  const isFieldRequired = (f: BeneficiaryFormField) => f.required || (f.min ?? 0) > 0;

  // Seeds payment_data with every hidden field's fixed value as soon as the form schema loads (or
  // the gateway changes), so validation/submission see it without the user ever touching it.
  useEffect(() => {
    const defaults = Object.fromEntries(
      (formQuery.data ?? []).filter((f) => f.type === "hidden" && f.defaultValue !== undefined).map((f) => [f.key, f.defaultValue!]),
    );
    if (Object.keys(defaults).length > 0) setPaymentData((d) => ({ ...defaults, ...d }));
  }, [formQuery.data]);

  const resetWizard = () => {
    setStep(0);
    setName("");
    setCountryIso3("");
    setGatewayId("");
    setPaymentData({});
    setFieldErrors({});
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateBeneficiaryInput) => portalApi.post<Beneficiary>("/portal/beneficiaries", input),
    onSuccess: () => {
      toast({ title: t("beneficiaries.added", "Beneficiary added") });
      queryClient.invalidateQueries({ queryKey: ["portal", "beneficiaries"] });
      resetWizard();
      setOpen(false);
    },
    onError: (e) =>
      toast({ variant: "destructive", title: t("beneficiaries.addError", "Couldn't add beneficiary"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => portalApi.del(`/portal/beneficiaries/${id}`),
    onSuccess: () => {
      toast({ title: t("beneficiaries.removed", "Beneficiary removed") });
      queryClient.invalidateQueries({ queryKey: ["portal", "beneficiaries"] });
      setRemoving(null);
      setSelected(null);
    },
    onError: (e) =>
      toast({ variant: "destructive", title: t("beneficiaries.removeError", "Couldn't remove beneficiary"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name: newName }: { id: string; name: string }) => portalApi.patch<Beneficiary>(`/portal/beneficiaries/${id}`, { name: newName }),
    onSuccess: (updated) => {
      toast({ title: t("beneficiaries.updated", "Beneficiary updated") });
      queryClient.invalidateQueries({ queryKey: ["portal", "beneficiaries"] });
      setSelected(updated);
    },
    onError: (e) =>
      toast({ variant: "destructive", title: t("beneficiaries.updateError", "Couldn't update beneficiary"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const goNext = () => {
    if (step === 0) {
      if (!name.trim() || !countryIso3) {
        toast({ variant: "destructive", title: t("beneficiaries.nameAndCountryRequired", "Enter a name and pick a country to continue") });
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!selectedMethod) {
        toast({ variant: "destructive", title: t("beneficiaries.payoutMethodRequired", "Pick a payout method to continue") });
        return;
      }
      setStep(2);
      return;
    }
    submitBeneficiary();
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const submitBeneficiary = () => {
    if (!selectedMethod) return;

    const errors: Record<string, string> = {};
    for (const f of visibleFields) {
      const value = paymentData[f.key]?.trim() ?? "";
      if (isFieldRequired(f) && !value) {
        errors[f.key] = t("beneficiaries.fieldRequiredError", "{{field}} is required", { field: f.name });
      } else if (value && f.min !== undefined && value.length < f.min) {
        errors[f.key] = t("beneficiaries.minCharsError", "At least {{min}} characters", { min: f.min });
      } else if (value && f.max !== undefined && value.length > f.max) {
        errors[f.key] = t("beneficiaries.maxCharsError", "At most {{max}} characters", { max: f.max });
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Only currently-visible fields are submitted — a field hidden by its `when` condition
    // shouldn't leak a stale value into payment_data.
    const submittedPaymentData = Object.fromEntries(visibleFields.map((f) => [f.key, paymentData[f.key] ?? ""]));
    createMutation.mutate({
      name,
      type: "BANK_ACCOUNT",
      details: { gatewayId: Number(gatewayId), currency: selectedMethod.currency, paymentData: submittedPaymentData },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("beneficiaries.title", "Beneficiaries")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("beneficiaries.subtitle", "People and accounts you send money to")}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetWizard();
          }}
        >
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t("beneficiaries.addBeneficiary", "Add beneficiary")}
          </Button>

          <DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle className="font-heading text-xl">{t("beneficiaries.addABeneficiary", "Add a beneficiary")}</DialogTitle>
              <div className="pt-2">
                <Stepper steps={STEPS} current={step} />
              </div>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
              {step === 0 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" /> {t("beneficiaries.whoAreYouSendingTo", "Who are you sending to?")}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("beneficiaries.recipientName", "Recipient name")}</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("beneficiaries.recipientNamePlaceholder", "Jane Doe")}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("beneficiaries.country", "Country")}</Label>
                    <SearchableSelect
                      value={countryIso3}
                      onChange={(v) => {
                        setCountryIso3(v);
                        setGatewayId("");
                        setPaymentData({});
                      }}
                      options={(countriesQuery.data ?? []).map((c) => ({ value: c.iso3, label: c.name }))}
                      placeholder={t("beneficiaries.selectCountryPlaceholder", "Select a country")}
                      isLoading={countriesQuery.isLoading}
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Landmark className="h-4 w-4" />
                    {t("beneficiaries.payoutMethodQuestion", "How should {{name}} in {{country}} get paid?", {
                      name: name || t("beneficiaries.thisRecipient", "this recipient"),
                      country: selectedCountry?.name ?? t("beneficiaries.thisCountry", "this country"),
                    })}
                  </div>

                  {payoutMethodsQuery.isLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-24" />
                      ))}
                    </div>
                  ) : (payoutMethodsQuery.data ?? []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      {t("beneficiaries.noPayoutMethods", "No active payout methods for this country yet.")}
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(payoutMethodsQuery.data ?? []).map((m) => {
                        const selected = m.gatewayId === gatewayId;
                        return (
                          <button
                            key={m.gatewayId}
                            type="button"
                            onClick={() => {
                              setGatewayId(m.gatewayId);
                              setPaymentData({});
                            }}
                            className={cn(
                              "relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                              selected ? "border-primary bg-primary/5 shadow-soft" : "border-border hover:bg-muted/50",
                            )}
                          >
                            {selected && (
                              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="pr-6 text-sm font-semibold leading-tight">{m.methodName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">{m.currency}</Badge>
                              {m.estimatedDelivery && <span className="text-xs text-muted-foreground">{m.estimatedDelivery}</span>}
                            </div>
                            {(m.minimumWithdrawal || m.maximumWithdrawal) && (
                              <p className="text-xs text-muted-foreground">
                                {t("beneficiaries.transferRange", "{{min}}–{{max}} {{currency}} per transfer", {
                                  min: m.minimumWithdrawal ?? "0",
                                  max: m.maximumWithdrawal ?? "∞",
                                  currency: m.currency,
                                })}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Landmark className="h-4 w-4" />
                    {t("beneficiaries.methodDetailsHeading", "{{method}} details", { method: selectedMethod?.methodName })}
                  </div>

                  {formQuery.isLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : renderableFields.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      {t("beneficiaries.noExtraDetailsNeeded", "This payout method doesn't need any extra details.")}
                    </p>
                  ) : (
                    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                      {renderableFields.map((f) => (
                        <div key={f.key} className="space-y-1.5">
                          <Label>
                            {f.name}
                            {isFieldRequired(f) && <span className="text-destructive"> *</span>}
                          </Label>
                          {f.type === "select" ? (
                            <Select
                              value={paymentData[f.key] ?? ""}
                              onValueChange={(v) => {
                                setPaymentData((d) => ({ ...d, [f.key]: v }));
                                setFieldErrors((e) => ({ ...e, [f.key]: "" }));
                              }}
                            >
                              <SelectTrigger className={fieldErrors[f.key] ? "border-destructive" : undefined}>
                                <SelectValue placeholder={t("beneficiaries.selectFieldPlaceholder", "Select {{field}}", { field: f.name.toLowerCase() })} />
                              </SelectTrigger>
                              <SelectContent>
                                {(f.options ?? []).map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={paymentData[f.key] ?? ""}
                              maxLength={f.max}
                              className={fieldErrors[f.key] ? "border-destructive" : undefined}
                              onChange={(e) => {
                                setPaymentData((d) => ({ ...d, [f.key]: e.target.value }));
                                setFieldErrors((err) => ({ ...err, [f.key]: "" }));
                              }}
                            />
                          )}
                          {fieldErrors[f.key] && <p className="text-xs text-destructive">{fieldErrors[f.key]}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
              <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || createMutation.isPending}>
                <ArrowLeft className="h-4 w-4" /> {t("beneficiaries.back", "Back")}
              </Button>
              <Button type="button" onClick={goNext} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step === 2 ? (
                  t("beneficiaries.addBeneficiary", "Add beneficiary")
                ) : (
                  <>
                    {t("beneficiaries.continue", "Continue")} <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("beneficiaries.empty", "No beneficiaries yet. Add one to start sending money.")}</p>
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("beneficiaries.table.name", "Name")}</TableHead>
                  <TableHead>{t("beneficiaries.table.currency", "Currency")}</TableHead>
                  <TableHead>{t("beneficiaries.table.added", "Added")}</TableHead>
                  <TableHead className="text-right">{t("beneficiaries.table.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => setSelected(b)}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeof b.details.currency === "string" ? b.details.currency : b.type.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoving(b);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 sm:hidden">
            {data.map((b) => (
              <div
                key={b.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-soft active:bg-muted/40"
                onClick={() => setSelected(b)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge variant="outline">{typeof b.details.currency === "string" ? b.details.currency : b.type.replace("_", " ")}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemoving(b);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <BeneficiaryDetailSheet
        beneficiary={selected}
        onOpenChange={(v) => !v && setSelected(null)}
        onSave={(name) => selected && updateMutation.mutate({ id: selected.id, name })}
        onRemove={() => selected && setRemoving(selected)}
        isSaving={updateMutation.isPending}
      />

      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("beneficiaries.removeDialogTitle", "Remove {{name}}?", { name: removing?.name })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("beneficiaries.removeDialogDescription", "You'll need to add them again to send money here in future. This doesn't affect any past payouts.")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t("beneficiaries.cancel", "Cancel")}
            </Button>
            <Button variant="destructive" disabled={removeMutation.isPending} onClick={() => removing && removeMutation.mutate(removing.id)}>
              {t("beneficiaries.remove", "Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BeneficiaryDetailSheet({
  beneficiary,
  onOpenChange,
  onSave,
  onRemove,
  isSaving,
}: {
  beneficiary: Beneficiary | null;
  onOpenChange: (v: boolean) => void;
  onSave: (name: string) => void;
  onRemove: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (beneficiary) {
      setName(beneficiary.name);
      setEditing(false);
    }
  }, [beneficiary]);

  if (!beneficiary) return null;

  const { gatewayId, currency, paymentData, ...rest } = beneficiary.details;
  void gatewayId;
  const detailRows = Object.entries((paymentData as Record<string, unknown>) ?? rest ?? {}).filter(([, v]) => v !== "" && v !== null && v !== undefined);

  return (
    <Sheet open={!!beneficiary} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full space-y-6 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("beneficiaries.detail.title", "Beneficiary details")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-1.5">
          <Label>{t("beneficiaries.detail.name", "Name")}</Label>
          {editing ? (
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <Button size="sm" disabled={!name.trim() || isSaving} onClick={() => onSave(name.trim())}>
                {t("beneficiaries.detail.save", "Save")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm font-medium">{beneficiary.name}</span>
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={t("beneficiaries.detail.editName", "Edit name")}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>{t("beneficiaries.detail.type", "Type")}</Label>
          <p className="text-sm">{beneficiary.type.replace("_", " ")}</p>
        </div>

        {typeof currency === "string" && (
          <div className="space-y-1.5">
            <Label>{t("beneficiaries.detail.currency", "Currency")}</Label>
            <p className="text-sm">{currency}</p>
          </div>
        )}

        {detailRows.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t("beneficiaries.detail.paymentDetails", "Payment details")}</Label>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              {detailRows.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">{humanize(key)}</dt>
                  <dd className="truncate font-mono text-xs">{String(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("beneficiaries.detail.editHint", "Payment details can't be edited here — remove this beneficiary and add a new one if they've changed.")}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("beneficiaries.detail.added", "Added")}</Label>
          <p className="text-sm text-muted-foreground">{new Date(beneficiary.createdAt).toLocaleString()}</p>
        </div>

        <Button variant="outline" className="w-full text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" /> {t("beneficiaries.detail.removeBeneficiary", "Remove beneficiary")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
