import { ShieldCheck, Target, Users, MapPin, Phone } from "lucide-react";
import { LandingNav } from "../../components/LandingNav";

export default function About() {
  return (
    <div className="min-h-screen bg-brand-deep pt-32 pb-24 px-6">
      <LandingNav />
      <div className="max-w-7xl mx-auto">
        {/* Mission */}
        <div className="grid md:grid-cols-2 gap-24 items-center mb-32">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 mb-8">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-cyan">Our Mission</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-black mb-8 tracking-tighter leading-[0.9]">
              Legal <br />
              <span className="text-gradient-cyan italic">Advocates</span> <br />
              for you.
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed mb-10">
              Zenowethu is a specialized debt management firm registered with the National Credit Regulator (NCRDC3693). We bridge the gap between consumers and the complex legal infrastructure of the South African credit market.
            </p>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="p-6 glass rounded-2xl">
                <h4 className="text-3xl font-black text-brand-cyan mb-1">081 747 7616</h4>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Direct Support</p>
              </div>
              <div className="p-6 glass rounded-2xl">
                <h4 className="text-3xl font-black text-brand-gold">NCRDC3693</h4>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Registration No.</p>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 bg-brand-cyan/10 blur-[100px] -z-10 rounded-full" />
            <div className="glass rounded-[60px] p-12 border-white/10">
              <h3 className="text-3xl font-black mb-8 tracking-tight">The Zenowethu Pledge</h3>
              <div className="space-y-10">
                {[
                  { icon: ShieldCheck, title: "Total POPIA Compliance", desc: "Your sensitive financial data is encrypted and protected under the highest security standards." },
                  { icon: Target, title: "Real-Time Tracking", desc: "Access our client portal to see every legal filing and bureau update as they happen." },
                  { icon: Users, title: "Expert Human Support", desc: "While we use AI for speed, our NCR-registered counsellors provide the final legal oversight." }
                ].map(val => (
                  <div key={val.title} className="flex gap-6">
                    <div className="w-12 h-12 rounded-xl bg-brand-cyan/10 flex-shrink-0 flex items-center justify-center text-brand-cyan">
                      <val.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">{val.title}</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">{val.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
