"use client";

import { useState } from "react";
import { ChevronRight, ShieldCheck, Lock, Database, Search, Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { LandingNav } from "../../components/LandingNav";

type Service = "debt-review-removal" | "court-rescission" | "credit-repair" | "insurance";

const SERVICE_OPTIONS: { id: Service; label: string; sub: string }[] = [
  { id: "debt-review-removal", label: "Debt Review Removal (17.W)",  sub: "For settled or incorrect review flags" },
  { id: "court-rescission",    label: "Court Order Rescission",       sub: "Legal removal of court-ordered review" },
  { id: "credit-repair",       label: "Credit Repair / Judgments",    sub: "Clear defaults and judgments" },
  { id: "insurance",           label: "Lower Insurance Premiums",     sub: "Save 40% on Credit Life cover" },
];

type FormData = {
  firstName:    string;
  lastName:     string;
  idNumber:     string;
  phone:        string;
  email:        string;
  service:      Service;
  popiaConsent: boolean;
};

type SubmitState = "idle" | "loading" | "success" | "error";

export default function Assessment() {
  const [step, setStep]     = useState(1);
  const [formData, setFormData] = useState<FormData>({
    firstName:    "",
    lastName:     "",
    idNumber:     "",
    phone:        "",
    email:        "",
    service:      "debt-review-removal",
    popiaConsent: false,
  });
  const [errors, setErrors]       = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // Step 2 validation: names + optional ID
  const validateStep2 = (): boolean => {
    const next: typeof errors = {};
    if (!formData.firstName.trim()) next.firstName = "First name is required";
    if (!formData.lastName.trim())  next.lastName  = "Surname is required";
    if (formData.idNumber && !/^\d{13}$/.test(formData.idNumber.trim())) {
      next.idNumber = "ID number must be 13 digits";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleStep2Next = () => {
    if (validateStep2()) setStep(3);
  };

  const handleSubmit = async () => {
    // Validate step 3 fields
    const next: typeof errors = {};
    if (!formData.phone.trim() || formData.phone.trim().length < 10) {
      next.phone = "Valid mobile number is required";
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = "Enter a valid email address";
    }
    if (!formData.popiaConsent) {
      next.popiaConsent = "You must accept to proceed";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSubmitState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/leads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          firstName:    formData.firstName.trim(),
          lastName:     formData.lastName.trim(),
          idNumber:     formData.idNumber.trim() || null,
          phone:        formData.phone.trim(),
          email:        formData.email.trim() || null,
          service:      formData.service,
          popiaConsent: formData.popiaConsent,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      setSubmitState("success");
    } catch (err) {
      setSubmitState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-brand-deep flex items-center justify-center p-6 pt-32 text-white">
      <LandingNav />
      <div className="max-w-xl w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 mb-6">
            <Database className="w-3 h-3 text-brand-cyan" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-cyan italic">Real-Time NCR Sync</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter">
            Clear Your <span className="text-gradient-cyan">Record</span>.
          </h1>
          <p className="text-slate-400 text-sm">
            We verify your status directly with the NCR portal and all 4 major bureaus in seconds.
          </p>
        </div>

        <div className="glass rounded-[40px] p-8 md:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cyan/5 blur-3xl -z-10 rounded-full" />

          {/* ── Success screen ── */}
          {submitState === "success" ? (
            <div className="text-center space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-center">
                <CheckCircle2 className="w-16 h-16 text-brand-cyan" />
              </div>
              <h3 className="text-2xl font-black">Application Received!</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Thank you, <strong className="text-white">{formData.firstName}</strong>. A Zenowethu consultant
                will contact you within <strong className="text-white">24–48 hours</strong> to discuss your{" "}
                {SERVICE_OPTIONS.find(s => s.id === formData.service)?.label ?? "application"}.
              </p>
              <p className="text-slate-500 text-xs">
                In the meantime, you can reach us on{" "}
                <a href="tel:+27120351824" className="text-brand-cyan underline">012 035 1824</a>.
              </p>
            </div>
          ) : (
            <>
              {/* ── Progress bar ── */}
              <div className="flex gap-3 mb-12">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-1.5 flex-grow rounded-full transition-all duration-500 ${
                      step >= i ? "bg-brand-cyan shadow-[0_0_10px_rgba(0,229,255,0.5)]" : "bg-white/5"
                    }`}
                  />
                ))}
              </div>

              {/* ── Step 1: Service selection ── */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Search className="w-5 h-5 text-brand-gold" />
                    Select Your Service
                  </h3>
                  <div className="grid gap-4">
                    {SERVICE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => { setFormData(prev => ({ ...prev, service: opt.id })); setStep(2); }}
                        className="w-full p-6 glass rounded-[24px] text-left font-bold border-white/5 hover:border-brand-cyan/50 hover:bg-brand-cyan/5 transition-all group relative overflow-hidden"
                      >
                        <div className="flex justify-between items-center relative z-10">
                          <div>
                            <div className="text-sm mb-1">{opt.label}</div>
                            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">{opt.sub}</div>
                          </div>
                          <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity text-brand-cyan" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Identity ── */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Zap className="w-5 h-5 text-brand-cyan" />
                    Identity Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <input
                        type="text"
                        placeholder="First Names *"
                        value={formData.firstName}
                        onChange={set("firstName")}
                        className={`w-full p-5 bg-white/5 border rounded-2xl focus:outline-none focus:bg-brand-cyan/5 transition-all text-sm font-medium ${
                          errors.firstName ? "border-red-500 focus:border-red-400" : "border-white/10 focus:border-brand-cyan"
                        }`}
                      />
                      {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Surname *"
                        value={formData.lastName}
                        onChange={set("lastName")}
                        className={`w-full p-5 bg-white/5 border rounded-2xl focus:outline-none focus:bg-brand-cyan/5 transition-all text-sm font-medium ${
                          errors.lastName ? "border-red-500 focus:border-red-400" : "border-white/10 focus:border-brand-cyan"
                        }`}
                      />
                      {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="SA ID Number (Optional)"
                        value={formData.idNumber}
                        onChange={set("idNumber")}
                        maxLength={13}
                        className={`w-full p-5 bg-white/5 border rounded-2xl focus:outline-none focus:bg-brand-cyan/5 transition-all text-sm font-medium ${
                          errors.idNumber ? "border-red-500 focus:border-red-400" : "border-white/10 focus:border-brand-cyan"
                        }`}
                      />
                      {errors.idNumber && <p className="mt-1 text-xs text-red-400">{errors.idNumber}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleStep2Next}
                    className="w-full py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl shadow-xl shadow-cyan-500/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-xs mt-4"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full py-3 text-slate-500 text-xs hover:text-white transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              )}

              {/* ── Step 3: Contact + POPIA + submit ── */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Lock className="w-5 h-5 text-brand-gold" />
                    Contact Verification
                  </h3>

                  {submitState === "error" && (
                    <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300">{errorMessage}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <input
                        type="tel"
                        placeholder="Mobile Number *"
                        value={formData.phone}
                        onChange={set("phone")}
                        className={`w-full p-5 bg-white/5 border rounded-2xl focus:outline-none focus:bg-brand-cyan/5 transition-all text-sm font-medium ${
                          errors.phone ? "border-red-500 focus:border-red-400" : "border-white/10 focus:border-brand-cyan"
                        }`}
                      />
                      {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone}</p>}
                    </div>
                    <div>
                      <input
                        type="email"
                        placeholder="Email Address (Optional)"
                        value={formData.email}
                        onChange={set("email")}
                        className={`w-full p-5 bg-white/5 border rounded-2xl focus:outline-none focus:bg-brand-cyan/5 transition-all text-sm font-medium ${
                          errors.email ? "border-red-500 focus:border-red-400" : "border-white/10 focus:border-brand-cyan"
                        }`}
                      />
                      {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
                    </div>
                  </div>

                  {/* POPIA Consent */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.popiaConsent}
                      onChange={set("popiaConsent")}
                      className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-brand-cyan focus:ring-brand-cyan"
                    />
                    <span className="text-[11px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">
                      I consent to Zenowethu Debt Management (NCRDC3693) collecting and processing my
                      personal information in accordance with the{" "}
                      <a href="/privacy-policy" className="text-brand-cyan underline">POPIA Privacy Policy</a>{" "}
                      for the purpose of assessing my debt relief options and contacting me regarding my enquiry.
                    </span>
                  </label>
                  {errors.popiaConsent && (
                    <p className="text-xs text-red-400 -mt-2">{errors.popiaConsent}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitState === "loading"}
                    className="w-full py-5 bg-brand-gold text-white font-black rounded-2xl shadow-xl shadow-gold-500/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-xs mt-4 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                  >
                    {submitState === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      "Submit for DHS Analysis"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={submitState === "loading"}
                    className="w-full py-3 text-slate-500 text-xs hover:text-white transition-colors disabled:opacity-40"
                  >
                    ← Back
                  </button>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <ShieldCheck className="w-3 h-3 text-brand-cyan" />
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                      POPIA Secure • NCRDC3693 Verified
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
