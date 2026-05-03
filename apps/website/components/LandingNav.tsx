import Link from "next/link";

export function LandingNav() {
  return (
    <nav className="fixed top-0 w-full z-50 glass border-b border-white/5 py-6 px-6 md:px-12 flex justify-between items-center transition-all duration-300 hover:bg-white/[0.02]">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-12 h-12 bg-brand-gold rounded-2xl flex items-center justify-center shadow-2xl shadow-gold-500/20 group-hover:scale-110 transition-transform">
          <span className="text-brand-dark font-black text-2xl tracking-tighter">Z</span>
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-black tracking-tighter text-white leading-none">Zenowethu</span>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-cyan mt-1">Legal Tech</span>
        </div>
      </Link>
      
      <div className="hidden md:flex items-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
        <Link href="/services" className="hover:text-brand-cyan transition-colors">Services</Link>
        <Link href="/insurance" className="hover:text-brand-cyan transition-colors">Insurance</Link>
        <Link href="/about" className="hover:text-brand-cyan transition-colors">About</Link>
        <Link href="/contact" className="hover:text-brand-cyan transition-colors">Contact</Link>
      </div>

      <Link 
        href="/assessment" 
        className="bg-white text-brand-dark px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] shadow-2xl shadow-white/10 hover:scale-105 transition-all"
      >
        Free Audit
      </Link>
    </nav>
  );
}
