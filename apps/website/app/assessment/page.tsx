"use client";

import { useState } from "react";
import { ChevronRight, ShieldCheck, Lock, Database, Search, Zap } from "lucide-react";
import { LandingNav } from "../../components/LandingNav";

export default function Assessment() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    phone: "",
    email: "",
    service: "debt-review-removal"
  });

  const nextStep = () => setStep(step + 1);

  return (
    <div className="min-h-screen bg-brand-deep flex items-center justify-center p-6 pt-32 text-white">
      <LandingNav />
      <div className="max-w-xl w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 mb-6">
            <Database className="w-3 h-3 text-brand-cyan" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-cyan italic">Real-Time NCR Sync</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter">Clear Your <span className="text-gradient-cyan">Record</span>.</h1>
          <p className="text-slate-400 text-sm">We verify your status directly with the NCR portal and all 4 major bureaus in seconds.</p>
        </div>

        <div className="glass rounded-[40px] p-8 md:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cyan/5 blur-3xl -z-10 rounded-full" />
          
          {/* Progress Bar */}
          <div className="flex gap-3 mb-12">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-1.5 flex-grow rounded-full transition-all duration-500 ${step >= i ? 'bg-brand-cyan shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'bg-white/5'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                <Search className="w-5 h-5 text-brand-gold" />
                Select Your Service
              </h3>
              <div className="grid gap-4">
                {[
                  { id: "debt-review-removal", label: "Debt Review Removal (17.W)", sub: "For settled or incorrect review flags" },
                  { id: "court-rescission", label: "Court Order Rescission", sub: "Legal removal of court-ordered review" },
                  { id: "credit-repair", label: "Credit Repair / Judgments", sub: "Clear defaults and judgments" },
                  { id: "insurance", label: "Lower Insurance Premiums", sub: "Save 40% on Credit Life cover" }
                ].map(opt => (
                  <button 
                    key={opt.id}
                    onClick={() => { setFormData({...formData, service: opt.id}); nextStep(); }}
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

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                <Zap className="w-5 h-5 text-brand-cyan" />
                Identity Details
              </h3>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="First Names" 
                  className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-brand-cyan focus:bg-brand-cyan/5 transition-all text-sm font-medium"
                />
                <input 
                  type="text" 
                  placeholder="Surname" 
                  className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-brand-cyan focus:bg-brand-cyan/5 transition-all text-sm font-medium"
                />
                <input 
                  type="text" 
                  placeholder="SA ID Number (For DHS Check)" 
                  className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-brand-cyan focus:bg-brand-cyan/5 transition-all text-sm font-medium"
                />
              </div>
              <button 
                onClick={nextStep}
                className="w-full py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl shadow-xl shadow-cyan-500/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-xs mt-4"
              >
                Validate Identity
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                <Lock className="w-5 h-5 text-brand-gold" />
                Contact Verification
              </h3>
              <div className="space-y-4">
                <input 
                  type="tel" 
                  placeholder="Mobile Number" 
                  className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-brand-cyan focus:bg-brand-cyan/5 transition-all text-sm font-medium"
                />
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-brand-cyan focus:bg-brand-cyan/5 transition-all text-sm font-medium"
                />
              </div>
              <button 
                onClick={() => alert("Connecting to Zenowethu DHS Scraper...")}
                className="w-full py-5 bg-brand-gold text-white font-black rounded-2xl shadow-xl shadow-gold-500/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-xs mt-4"
              >
                Submit for DHS Analysis
              </button>
              <div className="flex items-center justify-center gap-2 pt-4">
                <ShieldCheck className="w-3 h-3 text-brand-cyan" />
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">POPIA Secure • NCRDC3693 Verified</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
