import { LandingNav } from './_components/LandingNav';
import { HeroSection } from './_components/HeroSection';
import { SocialProofStrip } from './_components/SocialProofStrip';
import { FeaturesSection } from './_components/FeaturesSection';
import { ResultsSection } from './_components/ResultsSection';
import { TestimonialsSection } from './_components/TestimonialsSection';
import { PricingSection } from './_components/PricingSection';
import { FaqSection } from './_components/FaqSection';
import { FooterSection } from './_components/FooterSection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <LandingNav />
      <HeroSection />
      <SocialProofStrip />
      <FeaturesSection />
      <ResultsSection />
      <TestimonialsSection />
      <PricingSection />
      <FaqSection />
      <FooterSection />
    </div>
  );
}
