import CTA from '@/components/landing/CTA'
import Collections from '@/components/landing/Collections'
import DashboardPreview from '@/components/landing/DashboardPreview'
import Features from '@/components/landing/Features'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import Industries from '@/components/landing/Industries'
import Integrations from '@/components/landing/Integrations'
import Stats from '@/components/landing/Stats'
import VoiceDemo from '@/components/landing/VoiceDemo'

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Stats />
      <Features />
      <Industries />
      <DashboardPreview />
      <HowItWorks />
      <VoiceDemo />
      <Collections />
      <Integrations />
      <CTA />
    </>
  )
}
