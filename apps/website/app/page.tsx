import { LandingNav } from "../components/LandingNav";
import Link from "next/link";
import { ArrowRight, Database, Scale, Fingerprint } from "lucide-react";
import { getSiteCompany } from "../lib/company";
import { ncrRegistrationLine, professionalsLabel, monogram } from "../lib/company-format";

export default async function Home() {
  const company = await getSiteCompany();
  const ncrLine = ncrRegistrationLine(company);

  return (
    <div className="flex flex-col min-h-screen">
      <LandingNav />

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 md:px-12 overflow-hidden bg-brand-deep">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-cyan/10 blur-[140px] -z-10 rounded-full animate-pulse" />
        
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative">
          <div className="text-left">
            {company.isRegisteredDebtCounsellor && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
                <span className="w-2 h-2 rounded-full bg-brand-cyan animate-ping" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">NCR Registered: {company.ncrdcNumber}</span>
              </div>
            )}

            <h1 className="text-5xl md:text-8xl font-black mb-8 leading-[0.9] tracking-tighter">
              South Africa&apos;s <br />
              <span className="text-gradient-cyan italic">AI-Powered</span> <br />
              Credit Partner.
            </h1>

            <p className="text-xl text-slate-400 max-w-xl mb-12 leading-relaxed">
              We don&apos;t just consult; we move your case forward. Our {professionalsLabel(company)}, backed by technology that tracks your debt review status and prepares your documents, help you remove the barriers to your financial freedom.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Link 
                href="/assessment" 
                className="w-full sm:w-auto px-10 py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-cyan-500/30 hover:scale-105 transition-all group"
              >
                Free Assessment
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          <div className="hidden lg:block relative">
            <div className="glass rounded-[40px] p-1 border-white/10 overflow-hidden shadow-2xl">
              <div className="bg-[#0A1628] rounded-[38px] p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">How Your Case Moves</div>
                  <div className="px-3 py-1 rounded-md bg-brand-cyan/10 text-brand-cyan text-[10px] font-bold">EXAMPLE</div>
                </div>
                
                <div className="space-y-4">
                  {[
                    { label: "Credit Report Review", val: "Accounts and listings checked", status: "Done" },
                    { label: "Debt Review Status", val: "Confirming your status with the NCR", status: "In Progress" },
                    { label: "Document Preparation", val: "Clearance and dispute documents", status: "Pending" }
                  ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                        <div className="text-sm font-bold text-white">{s.val}</div>
                      </div>
                      <div className="text-[10px] font-black uppercase text-brand-gold">{s.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Technical Edge - INFORMATIVE SECTION */}
      <section className="py-32 bg-[#050E1A] relative px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter">The <span className="text-brand-gold">Technical</span> Advantage</h2>
            <p className="text-slate-400 max-w-2xl text-lg">
              Most agencies guess. We use data. Our systems help our team track your status and paperwork at every step.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-cyan/10 flex items-center justify-center text-brand-cyan">
                <Database className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">Debt Review Status Tracking</h3>
              <p className="text-slate-400 leading-relaxed">
                We check your status on the NCR Debt Help System to confirm when you were placed under debt review and which debt counsellor holds your file.
              </p>
            </div>

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 flex items-center justify-center text-brand-gold">
                <Scale className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">Legal Automation</h3>
              <p className="text-slate-400 leading-relaxed">
                We prepare Letters of Demand and Form 17.W clearance requests based on your NCA timeline. Every document is reviewed by our team before it is sent.
              </p>
            </div>

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-cyan/10 flex items-center justify-center text-brand-cyan">
                <Fingerprint className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">Credit Bureau Follow-up</h3>
              <p className="text-slate-400 leading-relaxed">
                Once your status changes, we follow up with the credit bureaus to have your records updated and keep you informed along the way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Stats — only facts held in the Company Profile. Marketing figures
          (success rates, amounts cleared) return once the profile can store
          evidence-backed values per company. */}
      {company.isRegisteredDebtCounsellor && (
        <section className="py-24 border-y border-white/5 bg-brand-deep/50">
          <div className="max-w-7xl mx-auto px-6 flex justify-center text-center">
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-5xl font-black text-brand-cyan tracking-tighter">{company.ncrdcNumber}</h3>
              <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">NCR Registration Number</p>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-20 bg-brand-deep border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 bg-brand-gold rounded-lg flex items-center justify-center">
              <span className="text-brand-dark font-black text-sm">{monogram(company)}</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">{company.shortName}</span>
          </div>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
            © {new Date().getFullYear()} {company.tradingName}.{ncrLine ? ` ${ncrLine}.` : ""} POPIA Compliant.
          </p>
          <p className="text-slate-600 text-xs max-w-2xl mx-auto mb-8 leading-relaxed">
            Outcomes depend on your individual circumstances and on decisions made by credit providers, credit bureaus
            and the courts. We do not guarantee the removal of any listing or a specific credit score.
          </p>
          <div className="flex justify-center gap-8 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Link href="/privacy" className="hover:text-brand-cyan">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-brand-cyan">Terms of Service</Link>
            <Link href="/compliance" className="hover:text-brand-cyan">Compliance Details</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
