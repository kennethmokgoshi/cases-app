import Link from "next/link";
import { ShieldAlert, PiggyBank, HeartPulse, FileCheck, CheckCircle2 } from "lucide-react";
import { LandingNav } from "../../components/LandingNav";

export default function Insurance() {
  return (
    <div className="min-h-screen bg-brand-deep pt-32 pb-24 px-6">
      <LandingNav />
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-24 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 border border-brand-gold/20 mb-8">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold text-gradient-gold">Switch & Save Strategy</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-black mb-8 leading-[0.9] tracking-tighter">
              Lower your <br />
              <span className="text-brand-cyan italic">Credit Life</span> <br />
              Premiums.
            </h1>
            <p className="text-xl text-slate-400 mb-12 leading-relaxed">
              If you have a loan, you have Credit Life Insurance. You are likely paying up to <span className="text-white font-bold">40% more</span> than necessary. We help you switch to a more affordable policy with better coverage.
            </p>

            <div className="space-y-8 mb-12">
              {[
                { icon: PiggyBank, title: "Cost Efficiency", desc: "Our policies often cost half of what banks charge for the same loan amount." },
                { icon: HeartPulse, title: "Comprehensive Cover", desc: "Includes Death, Disability, and Retrenchment benefits as standard." },
                { icon: CheckCircle2, title: "NCR Approved", desc: "All our insurance partners are FSCA regulated and bank-approved." }
              ].map(item => (
                <div key={item.title} className="flex gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center text-brand-cyan">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link 
              href="/assessment" 
              className="inline-flex px-12 py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl shadow-xl shadow-cyan-500/20 hover:scale-105 transition-all"
            >
              Get a Comparative Quote
            </Link>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-brand-gold/10 blur-[120px] -z-10 rounded-full" />
            <div className="glass rounded-[60px] p-12 border-white/10 relative overflow-hidden">
              <div className="p-10 bg-[#0A1628] rounded-[48px] border border-white/5">
                <div className="text-center mb-12">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Monthly Premium Comparison</div>
                  <div className="text-sm text-slate-400">Based on a R250,000 Personal Loan</div>
                </div>

                <div className="space-y-12">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-tighter">Bank Policy</div>
                      <div className="text-4xl font-black text-white/20">R345.00</div>
                    </div>
                    <div className="w-32 h-20 bg-white/5 rounded-t-xl" />
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-sm font-bold text-brand-gold mb-2 uppercase tracking-tighter">Zenowethu Policy</div>
                      <div className="text-5xl font-black text-brand-gold">R168.00</div>
                    </div>
                    <div className="w-32 h-32 bg-brand-gold rounded-t-xl shadow-[0_0_40px_rgba(196,149,58,0.3)]" />
                  </div>
                </div>

                <div className="mt-16 p-6 bg-brand-cyan/5 border border-brand-cyan/20 rounded-3xl text-center">
                  <div className="text-2xl font-black text-brand-cyan mb-1">R2,124.00</div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Yearly Savings</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
