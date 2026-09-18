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
import { API_BASE_URL } from "@/lib/auth";

export default function OnboardingPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    businessName: "",
    industry: "",
    currency: "PKR",
    teamSize: "",
    address: "",
    phone: "",
    slug: "",
  });

  const updateForm = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleComplete = async () => {
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const rawUser = localStorage.getItem("user");
      if (!rawUser)
        throw new Error("You must be signed in to complete onboarding");
      const user = JSON.parse(rawUser);
      const ownerId = user.id || user.ID || user.userId || user?.id;
      if (!ownerId) throw new Error("Unable to determine owner id");

      const payload = {
        name: formData.businessName,
        industry: formData.industry,
        teamSize: formData.teamSize,
        currency: formData.currency,
        phone: formData.phone,
        address: formData.address,
        slug: formData.slug,
        ownerId,
      };

      const res = await fetch(`${API_BASE_URL}/onboard/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Onboarding failed");

      const storedUser = localStorage.getItem("user");
      let currentUser: any = {};
      if (storedUser) {
        try {
          currentUser = JSON.parse(storedUser);
        } catch {}
      }

      const updatedUser = {
        ...currentUser,
        businessId: data?.business?.id || currentUser.businessId,
        role: "OWNER",
      };

      if (data?.accessToken) {
        setSession(data.accessToken, updatedUser);
      } else {
        const existingToken = localStorage.getItem("accessToken");
        if (existingToken) {
          setSession(existingToken, updatedUser);
        }
      }

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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {/* Header & Progress Bar */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-sm">
              <Store className="w-6 h-6 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 mb-2">
            Let's set up your workspace
          </h2>
          <p className="text-slate-600">Step {step} of 3</p>

          {/* Progress Indicator */}
          <div className="mt-6 flex items-center justify-center gap-2 max-w-xs mx-auto">
            <div
              className={`h-2 flex-1 rounded-full ${step >= 1 ? "bg-blue-600" : "bg-slate-200"} transition-colors`}
            />
            <div
              className={`h-2 flex-1 rounded-full ${step >= 2 ? "bg-blue-600" : "bg-slate-200"} transition-colors`}
            />
            <div
              className={`h-2 flex-1 rounded-full ${step >= 3 ? "bg-blue-600" : "bg-slate-200"} transition-colors`}
            />
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100 min-h-[400px] flex flex-col justify-between">
          {/* 🟢 STEP 1: Core Identity */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold">Business Identity</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => updateForm("businessName", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="e.g. Al-Fatah Electronics"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Industry
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => updateForm("industry", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="">Select industry...</option>
                    <option value="retail">Retail & Shop</option>
                    <option value="wholesale">Wholesale / B2B</option>
                    <option value="services">Services & Agency</option>
                    <option value="manufacturing">Manufacturing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Team Size
                  </label>
                  <select
                    value={formData.teamSize}
                    onChange={(e) => updateForm("teamSize", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="">Select size...</option>
                    <option value="1">Just me</option>
                    <option value="2-5">2 - 5 employees</option>
                    <option value="6-15">6 - 15 employees</option>
                    <option value="16+">16+ employees</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 🟢 STEP 2: Localization & Contact */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold">Location & Currency</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Base Currency
                  </label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <select
                      value={formData.currency}
                      onChange={(e) => updateForm("currency", e.target.value)}
                      className="w-full border border-slate-300 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      <option value="PKR">PKR - Pakistani Rupee</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="AED">AED - UAE Dirham</option>
                      <option value="GBP">GBP - British Pound</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    This is how your invoices will be generated.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Business Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="+92 300 1234567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Headquarters / Shop Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="Street address, City"
                />
              </div>
            </div>
          )}

          {/* 🟢 STEP 3: Customer Portal Settings */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Globe className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold">Your Customer Portal</h3>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4">
                <p className="text-sm text-blue-800">
                  BizFlow gives you a public link to share invoices and let
                  customers place orders directly. Let's claim your unique URL.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Portal URL Slug *
                </label>
                <div className="flex rounded-xl shadow-sm border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                  <span className="inline-flex items-center px-4 bg-slate-50 text-slate-500 text-sm border-r border-slate-300">
                    bizflow.com/p/
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
                    className="flex-1 block w-full py-3 px-4 outline-none text-slate-900"
                    placeholder="your-brand"
                  />
                </div>
              </div>

              {/* Real-time preview */}
              {formData.slug && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4" />
                  Your portal will be live at{" "}
                  <strong>bizflow.com/p/{formData.slug}</strong>
                </div>
              )}
            </div>
          )}

          {/* 🟢 NAVIGATION BUTTONS */}
          <div className="pt-8 mt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 1 || isSubmitting}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                step === 1
                  ? "text-transparent cursor-default"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!formData.businessName && step === 1}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={!formData.slug || isSubmitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
              >
                {isSubmitting ? "Provisioning Workspace..." : "Go to Dashboard"}
                {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
