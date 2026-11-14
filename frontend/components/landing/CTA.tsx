import { ArrowRight, CalendarCheck, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import Reveal from './Reveal'
import Waveform from './Waveform'

export default function CTA() {
  return (
    <section className="wrap pb-16 lg:pb-24">
      <Reveal amount={0.2}>
        <div className="relative overflow-hidden rounded-3xl border border-[#dbe3fb] bg-gradient-to-br from-[#e6eeff] via-[#eff0ff] to-[#f0ebff] px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
          <div className="relative z-10 max-w-[36rem]">
            <h2 className="h-section">Let TalklyAI Handle Your Customer Conversations</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink/75 text-pretty">
              Automate conversations, qualify leads, and drive business growth with AI-powered voice calling.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/demo?topic=Getting%20started" className="btn btn-primary">
                Get Started
                <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
              </Link>
              <Link href="/demo" className="btn btn-secondary">
                Schedule a Demo
              </Link>
            </div>
          </div>

          <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-[44%] items-center lg:flex">
            <div className="h-40 w-full text-brand/35 [mask-image:linear-gradient(90deg,transparent,#000_30%)]">
              <Waveform bars={46} barWidth={3.5} gap={6} />
            </div>
            <div className="float-sm absolute left-[20%] top-[18%]">
              <div className="flex items-center gap-2 rounded-[14px] border border-white bg-white py-2 pl-2 pr-3 text-[0.8125rem] font-semibold text-ink shadow-card">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fdebef] text-[#d03f5c]">
                  <CalendarCheck size={15} />
                </span>
                Appointment booked
              </div>
            </div>
            <div className="float-sm absolute bottom-[18%] right-[10%]" style={{ animationDelay: '-2.4s' }}>
              <div className="flex items-center gap-2 rounded-[14px] border border-white bg-white py-2 pl-2 pr-3 text-[0.8125rem] font-semibold text-ink shadow-card">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e4f6ee] text-[#16855a]">
                  <MessageCircle size={15} />
                </span>
                WhatsApp sent
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
