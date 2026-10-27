"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  MapPin,
  Globe,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Store,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL, apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "DeepKhata";

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    businessName: "",
    city: "",
    market: "",
    branchName: "Main Branch",
    industry: "",
    currency: "PKR",
    teamSize: "",
    address: "",
    phone: "",
    slug: "",
  });
  const [loadSampleData, setLoadSampleData] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const updateForm = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleComplete = async () => {
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const trim = (v: string) => v.trim();
      const payload = {
        shopName: trim(formData.businessName),
        city: trim(formData.city),
        ...(trim(formData.market) ? { market: trim(formData.market) } : {}),
        phone: trim(formData.phone),
        branchName: trim(formData.branchName) || "Main Branch",
        loadSampleData,
        acceptTerms: true as const,
        ...(formData.industry ? { industry: formData.industry } : {}),
        ...(formData.teamSize ? { teamSize: formData.teamSize } : {}),
        ...(formData.currency ? { currency: formData.currency } : {}),
        ...(trim(formData.address) ? { address: trim(formData.address) } : {}),
        ...(trim(formData.slug) ? { slug: trim(formData.slug) } : {}),
      };

      const res = await apiFetch(`${API_BASE_URL}/onboard/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        throw new Error(msg || "Onboarding failed");
      }

      // The session cookie is unchanged; refresh the profile (now has a business).
      await refreshUser();

      setSuccess(data?.message || "Onboarding successful");
      setIsSubmitting(false);
      // short delay so user sees the success message briefly
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err.message || "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-8 font-sans text-gray-900 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {/* Header & Progress */}
        <div className="mb-5 text-center">
          <div className="mb-3 flex justify-center">
            <div className="rounded-md bg-brand-700 p-2">
              <Store className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-heading font-semibold text-gray-900">
            Let&apos;s set up your workspace
          </h1>
          <p className="mt-1 text-body text-gray-500">Step {step} of 3</p>

          <div className="mx-auto mt-4 flex max-w-xs items-center justify-center gap-1.5">
            <div
              className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-brand-700" : "bg-gray-200"}`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-brand-700" : "bg-gray-200"}`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 3 ? "bg-brand-700" : "bg-gray-200"}`}
            />
          </div>
        </div>

        {/* Main card */}
        <div className="flex min-h-[380px] flex-col justify-between rounded-lg border border-border bg-card px-4 py-6 shadow-sm sm:px-8">
          {/* STEP 1: Core identity */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-300">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Building2 className="h-4 w-4 text-brand-700" />
                <h2 className="text-subtitle font-semibold text-gray-900">
                  Business Identity
                </h2>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Business Name *
                </label>
                <Input
                  type="text"
                  data-testid="onboarding-shop-name"
                  value={formData.businessName}
                  onChange={(e) => updateForm("businessName", e.target.value)}
                  placeholder="e.g. Al-Fatah Electronics"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    City *
                  </label>
                  <Input
                    type="text"
                    data-testid="onboarding-city"
                    value={formData.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    placeholder="e.g. Lahore"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Market / Bazaar
                  </label>
                  <Input
                    type="text"
                    data-testid="onboarding-market"
                    value={formData.market}
                    onChange={(e) => updateForm("market", e.target.value)}
                    placeholder="e.g. Hall Road"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Industry
                  </label>
                  <Select
                    value={formData.industry}
                    onChange={(e) => updateForm("industry", e.target.value)}
                  >
                    <option value="">Select industry...</option>
                    <option value="retail">Retail &amp; Shop</option>
                    <option value="wholesale">Wholesale / B2B</option>
                    <option value="services">Services &amp; Agency</option>
                    <option value="manufacturing">Manufacturing</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Team Size
                  </label>
                  <Select
                    value={formData.teamSize}
                    onChange={(e) => updateForm("teamSize", e.target.value)}
                  >
                    <option value="">Select size...</option>
                    <option value="1">Just me</option>
                    <option value="2-5">2 - 5 employees</option>
                    <option value="6-15">6 - 15 employees</option>
                    <option value="16+">16+ employees</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Location & contact */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-300">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <MapPin className="h-4 w-4 text-brand-700" />
                <h2 className="text-subtitle font-semibold text-gray-900">
                  Location &amp; Currency
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Base Currency
                  </label>
                  <div className="relative">
                    <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Select
                      value={formData.currency}
                      onChange={(e) => updateForm("currency", e.target.value)}
                      className="pl-9"
                    >
                      <option value="PKR">PKR - Pakistani Rupee</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="AED">AED - UAE Dirham</option>
                      <option value="GBP">GBP - British Pound</option>
                    </Select>
                  </div>
                  <p className="mt-1 text-caption text-gray-500">
                    This is how your invoices will be generated.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-caption font-medium text-gray-700">
                    Business Phone
                  </label>
                  <Input
                    type="tel"
                    data-testid="onboarding-phone"
                    value={formData.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    placeholder="03XX XXXXXXX"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  First Branch Name *
                </label>
                <Input
                  type="text"
                  data-testid="onboarding-branch-name"
                  value={formData.branchName}
                  onChange={(e) => updateForm("branchName", e.target.value)}
                  placeholder="Main Branch"
                />
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Headquarters / Shop Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-body text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Street address, City"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Customer portal */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-300">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Globe className="h-4 w-4 text-brand-700" />
                <h2 className="text-subtitle font-semibold text-gray-900">
                  Your Customer Portal
                </h2>
              </div>

              <div className="rounded-md border border-brand-100 bg-brand-50 p-3 text-body text-brand-800">
                {APP_NAME} gives you a public link to share invoices and let
                customers place orders directly. Let&apos;s claim your unique
                URL.
              </div>

              <div>
                <label className="mb-1 block text-caption font-medium text-gray-700">
                  Portal URL Slug (optional)
                </label>
                <div className="flex overflow-hidden rounded-md border border-border transition-shadow focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                  <span className="inline-flex items-center border-r border-border bg-gray-50 px-3 text-caption text-gray-500">
                    deepkhata.com/p/
                  </span>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      updateForm(
                        "slug",
                        e.target.value.toLowerCase().replace(/\s+/g, "-"),
                      )
                    }
                    className="block w-full flex-1 bg-card px-3 py-2 text-body text-gray-900 outline-none placeholder:text-gray-400"
                    placeholder="your-brand"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-body text-gray-700">
                <input
                  type="checkbox"
                  data-testid="onboarding-sample-data"
                  checked={loadSampleData}
                  onChange={(e) => setLoadSampleData(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-brand-700"
                />
                <span>
                  Load sample data (products, customers and a few udhar entries)
                  so I can try the app. I can wipe it later.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 text-body text-gray-700">
                <input
                  type="checkbox"
                  data-testid="onboarding-accept-terms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-brand-700"
                />
                <span>I accept the Terms of Service and Privacy Policy. *</span>
              </label>

              {formData.slug && (
                <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-bg p-2.5 text-body text-success-fg">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Your portal will be live at{" "}
                    <strong className="font-semibold">
                      deepkhata.com/p/{formData.slug}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p
              data-testid="onboarding-error"
              className="mt-3 rounded-md border border-danger/30 bg-danger-bg px-2.5 py-2 text-caption font-medium text-danger-fg"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              data-testid="onboarding-success"
              className="mt-3 rounded-md border border-success/30 bg-success-bg px-2.5 py-2 text-caption font-medium text-success-fg"
            >
              {success}
            </p>
          )}

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={step === 1 || isSubmitting}
              className={step === 1 ? "invisible" : ""}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                data-testid="onboarding-next"
                onClick={() => setStep(step + 1)}
                disabled={
                  step === 1 &&
                  (!formData.businessName.trim() || !formData.city.trim())
                }
              >
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="onboarding-submit"
                onClick={handleComplete}
                loading={isSubmitting}
                disabled={
                  !acceptTerms ||
                  !formData.phone.trim() ||
                  !formData.branchName.trim()
                }
              >
                {isSubmitting ? "Provisioning Workspace..." : "Go to Dashboard"}
                {!isSubmitting && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
