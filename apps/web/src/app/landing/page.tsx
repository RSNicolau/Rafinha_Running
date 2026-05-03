'use client';
import { useState } from 'react';
import { LandingNav } from './_components/LandingNav';
import { HeroSection } from './_components/HeroSection';
import { SocialProofStrip } from './_components/SocialProofStrip';
import { FeaturesSection } from './_components/FeaturesSection';
import { ResultsSection } from './_components/ResultsSection';
import { TestimonialsSection } from './_components/TestimonialsSection';
import { PricingSection } from './_components/PricingSection';
import { FaqSection } from './_components/FaqSection';
import { FooterSection } from './_components/FooterSection';
import { AudienceToggle } from './_components/AudienceToggle';

export type Audience = 'coach' | 'athlete';

export default function LandingPage() {
  const [audience, setAudience] = useState<Audience>('coach');

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <LandingNav />
      <AudienceToggle audience={audience} onChange={setAudience} />
      <HeroSection audience={audience} />
      <SocialProofStrip />
      <FeaturesSection audience={audience} />
      <ResultsSection />
      <TestimonialsSection />
      <PricingSection audience={audience} />
      <FaqSection />
      <FooterSection />
    </div>
  );
}
