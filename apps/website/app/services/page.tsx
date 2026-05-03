import { LandingNav } from "../../components/LandingNav";
import { Shield, Search, CheckCircle, Scale, FileText, Gavel } from "lucide-react";

const services = [
  {
    title: "Debt Review Removal (17.W)",
    description: "For consumers who have settled their debts or were placed under review incorrectly. We force the removal of the debt review flag from the NCR portal and all credit bureaus.",
    features: ["Form 17.W Generation", "DHS Portal Updates", "NCR Dispute Management"],
    icon: Shield,
    color: "text-brand-cyan"
  },
  {
    title: "Court Rescissions",
    description: "If you have a court order for debt review, we handle the legal process to rescind that order, allowing you to re-enter the credit market with a clean slate.",
    features: ["Legal Representation", "Court Order Rescission", "Attorney Collaboration"],
    icon: Gavel,
    color: "text-brand-gold"
  },
  {
    title: "Bureau Record Clearance",
    description: "Removing adverse information like judgments, defaults, and late payments. We ensure your report matches your current financial reality.",
    features: ["Judgment Removal", "Default Deletion", "Score Restoration"],
    icon: Search,
    color: "text-brand-cyan"
  }
];

export default function Services() {
  return (
    <div className="min-h-screen bg-brand-deep pt-32 pb-24 px-6">
      <LandingNav />
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <div className="inline-block px-4 py-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 mb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-cyan">Professional Legal Services</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black mb-8 tracking-tighter leading-tight">
            How we <span className="text-gradient-cyan italic">Clear</span> your record.
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
            We use a combination of High-Tech Database Syncing and High-Touch Legal Advocacy to restore your creditworthiness.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-32">
          {services.map((s) => (
            <div key={s.title} className="glass rounded-[40px] p-12 flex flex-col hover:border-white/20 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl -z-10 rounded-full group-hover:bg-brand-cyan/10 transition-colors" />
              
              <div className={`w-16 h-16 rounded-2xl glass flex items-center justify-center mb-8 ${s.color}`}>
                <s.icon className="w-8 h-8" />
              </div>
              
              <h3 className="text-2xl font-black mb-6 tracking-tight">{s.title}</h3>
              <p className="text-slate-400 mb-10 leading-relaxed text-sm flex-grow">{s.description}</p>
              
              <div className="space-y-4 mb-12">
                {s.features.map(f => (
                  <div key={f} className="flex items-center gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-cyan shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
                    <span className="text-sm font-bold text-slate-200">{f}</span>
                  </div>
                ))}
              </div>

              <a 
                href="/assessment" 
                className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl text-center font-black text-xs uppercase tracking-widest hover:bg-white hover:text-brand-dark transition-all"
              >
                Apply for Removal
              </a>
            </div>
          ))}
        </div>

        {/* The Process Section */}
        <div className="bg-[#0A1628] rounded-[60px] p-12 md:p-24 border border-white/5 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-black mb-16 tracking-tighter">Our 4-Step <span className="text-brand-gold">Clearance</span> Pipeline</h2>
            
            <div className="grid md:grid-cols-4 gap-12">
              {[
                { step: "01", title: "DHS Sync", desc: "We pull your records directly from the NCR portal." },
                { step: "02", title: "LOD Issued", desc: "Letters of Demand sent to non-compliant counsellors." },
                { step: "03", title: "Legal Filing", desc: "17.W or Court Rescission documents submitted." },
                { step: "04", title: "Bureau Update", desc: "Records cleared across all 4 major bureaus." }
              ].map(p => (
                <div key={p.step} className="relative">
                  <div className="text-6xl font-black text-white/5 absolute -top-10 -left-4 select-none">{p.step}</div>
                  <h4 className="text-xl font-bold mb-3 relative">{p.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
