import { LandingNav } from "../components/LandingNav";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap, Users, Sparkles, Database, Scale, Fingerprint } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNav />

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 md:px-12 overflow-hidden bg-brand-deep">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-cyan/10 blur-[140px] -z-10 rounded-full animate-pulse" />
        
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
              <span className="w-2 h-2 rounded-full bg-brand-cyan animate-ping" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">NCR Registered: NCRDC3693</span>
            </div>

            <h1 className="text-5xl md:text-8xl font-black mb-8 leading-[0.9] tracking-tighter">
              South Africa&apos;s <br />
              <span className="text-gradient-cyan italic">AI-Powered</span> <br />
              Credit Authority.
            </h1>

            <p className="text-xl text-slate-400 max-w-xl mb-12 leading-relaxed">
              We don&apos;t just consult; we automate your financial recovery. Using real-time NCR DHS database scraping and AI-driven legal analysis, we remove barriers to your financial freedom.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Link 
                href="/assessment" 
                className="w-full sm:w-auto px-10 py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-cyan-500/30 hover:scale-105 transition-all group"
              >
                Free Real-Time Assessment
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          <div className="hidden lg:block relative">
            <div className="glass rounded-[40px] p-1 border-white/10 overflow-hidden shadow-2xl">
              <div className="bg-[#0A1628] rounded-[38px] p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Active DHS Search</div>
                  <div className="px-3 py-1 rounded-md bg-brand-cyan/10 text-brand-cyan text-[10px] font-bold">LIVE SYNC</div>
                </div>
                
                <div className="space-y-4">
                  {[
                    { label: "Bureau Sync", val: "TransUnion, Experian, XDS", status: "Done" },
                    { label: "NCR DHS Query", val: "Searching for 17.4 flags...", status: "In Progress" },
                    { label: "AI Legal Analysis", val: "Detecting NCA violations", status: "Pending" }
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
              Most agencies guess. We use data. Our proprietary engine connects directly to the South African financial infrastructure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-cyan/10 flex items-center justify-center text-brand-cyan">
                <Database className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">DHS Database Scraper</h3>
              <p className="text-slate-400 leading-relaxed">
                Our system uses automated Puppeteer engines to scrape the NCR Debt Help System in real-time. We find the exact date you were placed under review and identifying the Debt Counsellor responsible.
              </p>
            </div>

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 flex items-center justify-center text-brand-gold">
                <Scale className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">Legal Automation</h3>
              <p className="text-slate-400 leading-relaxed">
                We automatically generate Letters of Demand (LOD) and 17.W Withdrawal requests based on NCA timeline violations. Our AI ensures every document is legally bulletproof.
              </p>
            </div>

            <div className="space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-cyan/10 flex items-center justify-center text-brand-cyan">
                <Fingerprint className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">4-Bureau Sync</h3>
              <p className="text-slate-400 leading-relaxed">
                Your clearance is synchronized across TransUnion, Experian, XDS, and Lightstone simultaneously. We monitor your score daily until your record is 100% clean.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Stats */}
      <section className="py-24 border-y border-white/5 bg-brand-deep/50">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-5xl font-black text-brand-cyan tracking-tighter">99.8%</h3>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Compliance Success Rate</p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-5xl font-black text-brand-gold tracking-tighter">R35M+</h3>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Debt Cleared Monthly</p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-5xl font-black text-brand-cyan tracking-tighter">NCRDC3693</h3>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Verified Registration</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 bg-brand-deep border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 bg-brand-gold rounded-lg flex items-center justify-center">
              <span className="text-brand-dark font-black text-sm">Z</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Zenowethu</span>
          </div>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
            © 2026 Zenowethu Debt Management. Registered with the National Credit Regulator (NCRDC3693). POPIA Compliant.
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
