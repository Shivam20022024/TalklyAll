import CTA from '@/components/landing/CTA'
import Collections from '@/components/landing/Collections'
import DashboardPreview from '@/components/landing/DashboardPreview'
import Features from '@/components/landing/Features'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import Industries from '@/components/landing/Industries'
import Integrations from '@/components/landing/Integrations'
import ProductDemo from '@/components/landing/ProductDemo'

// The statistics strip (components/landing/Stats.tsx) is left out until verified figures exist;
// it only had placeholder values ("0,000+", "00%"). Put <Stats /> back after the hero to restore it.
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <Industries />
      <DashboardPreview />
      <ProductDemo />
      <HowItWorks />
      <Collections />
      <Integrations />
      <CTA />
    </>
  )
}
