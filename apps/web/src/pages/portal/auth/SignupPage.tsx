import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { createCustomerSchema, type Country, type CreateCustomerInput } from "@white-label/shared-types";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, publicApi } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function PortalSignupPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, signup } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: countries } = useQuery({
    queryKey: ["locations", "countries"],
    queryFn: () => publicApi.get<Country[]>("/locations/countries"),
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { type: "INDIVIDUAL" },
  });
  const type = watch("type");
  const countryCode = watch("countryCode");

  if (!authLoading && isAuthenticated) return <Navigate to="/portal" replace />;

  const onSubmit = async (values: CreateCustomerInput) => {
    setError(null);
    setSubmitting(true);
    try {
      await signup(values);
      navigate("/portal", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("signup.genericError", "Unable to create your account."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
          <span className="font-heading text-lg font-semibold">{branding?.productName ?? t("signup.defaultProductName", "White Label")}</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("signup.createYourAccount", "Create your account")}</CardTitle>
            <CardDescription>{t("signup.startSendingDescription", "Start sending, holding and spending in minutes")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("signup.accountTypeLabel", "Account type")}</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    const nextType = v as CreateCustomerInput["type"];
                    setValue("type", nextType);
                    // Only one of these renders at a time — clear the other so a stale empty
                    // value from the hidden field can't fail validation for the visible one.
                    setValue("fullName", undefined);
                    setValue("businessName", undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">{t("signup.individual", "Individual")}</SelectItem>
                    <SelectItem value="BUSINESS">{t("signup.business", "Business")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "BUSINESS" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="businessName">{t("signup.businessNameLabel", "Business name")}</Label>
                  <Input id="businessName" {...register("businessName")} />
                  {errors.businessName && <p className="text-xs text-destructive">{errors.businessName.message}</p>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">{t("signup.fullNameLabel", "Full name")}</Label>
                  <Input id="fullName" {...register("fullName")} />
                  {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("signup.emailLabel", "Email")}</Label>
                <Input id="email" type="email" autoComplete="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t("signup.countryLabel", "Country")}</Label>
                <Select
                  value={countryCode}
                  onValueChange={(iso3) => {
                    const country = countries?.find((c) => c.iso3 === iso3);
                    setValue("countryCode", iso3, { shouldValidate: true });
                    // Yativo returns some calling codes with a territory suffix (e.g. "+1-684" for
                    // American Samoa) or empty (Antarctica) — only the leading "+<digits>" is a
                    // valid E.164 calling code, so strip anything else before storing it.
                    const normalized = country?.callingCode.match(/^\+\d{1,4}/)?.[0];
                    if (normalized) setValue("callingCode", normalized, { shouldValidate: true });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("signup.selectCountryPlaceholder", "Select your country")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries?.map((c) => (
                      <SelectItem key={c.iso3} value={c.iso3}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.countryCode && <p className="text-xs text-destructive">{errors.countryCode.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t("signup.phoneNumberLabel", "Phone number")}</Label>
                <div className="flex gap-2">
                  <Input
                    className="w-16 shrink-0 text-center"
                    value={watch("callingCode") ?? ""}
                    readOnly
                    tabIndex={-1}
                    aria-label={t("signup.callingCodeAriaLabel", "Calling code")}
                  />
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder={t("signup.phonePlaceholder", "5551234567")}
                    {...register("phone")}
                    className="flex-1"
                  />
                </div>
                {(errors.callingCode || errors.phone) && (
                  <p className="text-xs text-destructive">{errors.phone?.message ?? errors.callingCode?.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("signup.passwordLabel", "Password")}</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("signup.creatingAccount", "Creating account…") : t("signup.createAccount", "Create account")}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("signup.alreadyHaveAccount", "Already have an account?")}{" "}
              <Link to="/portal/login" className="font-medium text-primary hover:underline">
                {t("signup.signIn", "Sign in")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
