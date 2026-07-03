import { Phone, Mail, MessageCircle, MapPin, Clock } from "lucide-react";
import { LandingNav } from "../../components/LandingNav";

export default function Contact() {
  return (
    <div className="min-h-screen bg-brand-deep pt-32 pb-24 px-6 text-white">
      <LandingNav />
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <div className="inline-block px-4 py-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 mb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-cyan italic">Connect With Us</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black mb-6 tracking-tighter leading-tight">Expert <span className="text-gradient-cyan italic">Support</span></h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Whether you are a new applicant or a current client, our technical and legal teams are ready to assist.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* WhatsApp Card */}
          <div className="glass rounded-[40px] p-12 text-center hover:border-brand-cyan/30 transition-all group relative overflow-hidden">
            <div className="w-20 h-20 bg-brand-cyan/10 rounded-3xl flex items-center justify-center text-brand-cyan mx-auto mb-10">
              <MessageCircle className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black mb-4">WhatsApp AI</h3>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed">Get instant status updates and basic legal guidance 24/7 via our AI Assistant.</p>
            <a 
              href="https://wa.me/27817477616" 
              className="inline-block w-full py-5 bg-brand-cyan text-brand-dark font-black rounded-2xl uppercase tracking-widest text-xs"
            >
              Start AI Chat
            </a>
          </div>

          {/* Call Card */}
          <div className="glass rounded-[40px] p-12 text-center hover:border-brand-gold/30 transition-all group relative overflow-hidden">
            <div className="w-20 h-20 bg-brand-gold/10 rounded-3xl flex items-center justify-center text-brand-gold mx-auto mb-10">
              <Phone className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black mb-4">Legal Support</h3>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed">Speak directly with an NCR-registered consultant about your case.</p>
            <a 
              href="tel:+27817477616" 
              className="inline-block w-full py-5 bg-brand-gold text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg shadow-gold-500/20"
            >
              081 747 7616
            </a>
          </div>

          {/* Office Card */}
          <div className="glass rounded-[40px] p-12 text-center hover:border-white/20 transition-all group relative overflow-hidden">
            <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center text-white mx-auto mb-10">
              <MapPin className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black mb-4">Johannesburg</h3>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed">
              Main Office Suite <br />
              Sandton Corporate Woods
            </p>
            <div className="text-brand-cyan font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              Response: &lt; 5 mins
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
