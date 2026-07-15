import { LandingNav } from "../components/landing/LandingNav";
import { Hero } from "../components/landing/Hero";
import { TrustBar } from "../components/landing/TrustBar";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Features } from "../components/landing/Features";
import { Pricing } from "../components/landing/Pricing";
import { CTASection } from "../components/landing/CTASection";
import { LandingFooter } from "../components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <TrustBar />
        <HowItWorks />
        <Features />
        <Pricing />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
