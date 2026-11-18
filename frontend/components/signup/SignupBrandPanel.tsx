import type { CSSProperties, ReactNode } from 'react'
import { CalendarCheck, CheckCircle2, MessageCircle, Pause, Phone, PhoneOff, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/landing/Logo'
import { LoginLogo, LoginWaveform } from '@/components/login/LoginBrandPanel'

// Shares the login page's logo, waveform and animation classes (components/login/login.css)
// so both auth screens read as one product. Purely presentational.

const rise = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as CSSProperties

const capabilities = [
  { icon: Phone, title: 'AI Voice Calling', text: 'Natural, real-time conversations with your customers.' },
  { icon: ScanSearch, title: 'Post-call Intelligence', text: 'Call analysis and lead qualification.' },
  { icon: ShieldCheck, title: 'Compliance & Guardrails', text: 'Identity verification and secure, reliable calling.' },
]

function StatusCard({ icon, title, delay, className }: { icon: ReactNode; title: string; delay: string; className: string }) {
  return (
    <div
      className={`login-float absolute flex items-center gap-2.5 whitespace-nowrap rounded-xl border border-[#E2E8F0] bg-white py-2.5 pl-2.5 pr-4 shadow-[0_12px_28px_-16px_rgb(36_70_170/0.35)] ${className}`}
      style={{ animationDelay: delay }}
    >
      {icon}
      <span className="text-[0.8125rem] font-semibold text-[#111827]">{title}</span>
    </div>
  )
}

/** A compact phone showing a simulated call, with the outcomes it leads to beside it. Decorative. */
function PhoneScene() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[19rem] w-full max-w-[27rem]">
      {/* Faint waveform behind the phone */}
      <LoginWaveform count={44} className="absolute inset-x-0 top-1/2 h-24 -translate-y-1/2 justify-between opacity-[0.18]" />

      <div className="absolute left-[8%] top-0 h-full w-[12.5rem] rounded-[2rem] border-[5px] border-[#1E293B] bg-white p-3.5 shadow-[0_2px_6px_rgb(30_58_138/0.06),0_30px_60px_-28px_rgb(36_70_170/0.45)]">
        <div className="mx-auto h-4 w-16 rounded-full bg-[#1E293B]" />
        <div className="mt-3 flex flex-col items-center text-center">
          <LogoMark className="h-4 w-4" />
          <span translate="no" className="mt-0.5 text-[0.6875rem] font-semibold text-[#111827]">TalklyAI</span>
          <span className="mt-2 rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[#067647]">Sample call</span>
          <span className="mt-3 text-[0.9375rem] font-semibold text-[#111827]">Rohit Malhotra</span>
          <span className="mt-0.5 text-[0.6875rem] text-[#475569]">+91 98••• ••210</span>
          <span className="mt-1 text-[0.6875rem] tabular-nums text-[#475569]">00:07</span>
        </div>
        <LoginWaveform count={26} className="mt-3 h-8 justify-between" />
        <div className="mt-4 flex items-center justify-center gap-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] text-[#475569]">
            <Pause size={15} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EF4444] text-white">
            <PhoneOff size={15} />
          </span>
        </div>
      </div>

      {/* Outcome cards sit beside the phone and only overlap its frame, never its content. */}
      <StatusCard
        className="left-[calc(8%+11.25rem)] top-[14%]"
        delay="0s"
        title="Lead Qualified"
        icon={<span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#16a34a] text-white"><CheckCircle2 size={15} /></span>}
      />
      <StatusCard
        className="left-[calc(8%+12.75rem)] top-[40%]"
        delay="-2s"
        title="Appointment Booked"
        icon={<span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#EEF3FF] text-[#2463EB]"><CalendarCheck size={15} /></span>}
      />
      <StatusCard
        className="left-[calc(8%+11.75rem)] top-[66%]"
        delay="-4s"
        title="WhatsApp Follow-up"
        icon={<span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#22c55e] text-white"><MessageCircle size={15} /></span>}
      />
    </div>
  )
}

/** Desktop brand panel (lg and up). Sticky, so it stays in view while the form scrolls. */
export default function SignupBrandPanel() {
  return (
    <aside
      aria-label="About TalklyAI"
      className="relative hidden flex-col px-10 py-8 lg:sticky lg:top-0 lg:flex lg:h-dvh xl:px-14"
    >
      <div className="login-fade" style={rise(0)}>
        <LoginLogo />
      </div>

      <div className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center py-4">
        <span
          className="login-rise inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EEF3FF] px-3 py-1.5 text-[0.8125rem] font-semibold text-[#2463EB]"
          style={rise(40)}
        >
          <Sparkles size={14} aria-hidden="true" />
          Start Your Free Trial
        </span>
        <h2
          className="login-rise mt-4 text-[2.25rem] font-semibold leading-[1.12] tracking-[-0.025em] text-[#111827] [text-wrap:balance] xl:text-[2.625rem]"
          style={rise(80)}
        >
          Create Your <span translate="no">TalklyAI</span> Workspace
        </h2>
        <p className="login-rise mt-4 max-w-[30rem] text-[1.0625rem] leading-relaxed text-[#475569]" style={rise(140)}>
          Get started with 10&nbsp;free AI voice calling minutes and experience how TalklyAI can grow your business.
        </p>

        {/* Hidden where it would crowd the panel: narrow (below xl) or short screens. */}
        <div className="login-rise mt-6 hidden xl:block [@media(max-height:860px)]:hidden" style={rise(220)}>
          <PhoneScene />
        </div>

        <ul className="mt-6 space-y-3">
          {capabilities.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="login-rise flex items-start gap-3.5" style={rise(300 + index * 60)}>
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white text-[#2463EB] shadow-[0_6px_16px_-10px_rgb(36_70_170/0.35)]">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold text-[#111827]">{title}</span>
                <span className="block text-sm text-[#475569]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
