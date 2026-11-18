import type { CSSProperties } from 'react'
import { AudioLines, CalendarCheck, CheckCircle2, ScanSearch, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/landing/Logo'

const BLUE = [36, 99, 235]
const PURPLE = [121, 85, 232]

// Fixed values (no randomness), so server and client markup always match.
function waveBars(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const position = i / (count - 1)
    const envelope = Math.sin(position * Math.PI) ** 0.6
    const detail = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))
    const color = BLUE.map((channel, c) => Math.round(channel + (PURPLE[c] - channel) * position))
    return {
      height: `${Math.round(Math.max(0.18, envelope * detail) * 100)}%`,
      backgroundColor: `rgb(${color.join(' ')})`,
      animationDelay: `${((i * 137) % 1000) * -1}ms`,
      animationDuration: `${950 + ((i * 71) % 550)}ms`,
    }
  })
}

export function LoginWaveform({ count = 32, className = 'h-10' }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`login-wave ${className}`}>
      {waveBars(count).map((style, index) => (
        <span key={index} style={style} />
      ))}
    </div>
  )
}

export function LoginLogo() {
  return (
    <a href="/" aria-label="TalklyAI home" className="inline-flex items-center gap-2.5">
      <LogoMark className="h-7 w-7" />
      <span translate="no" className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#111827]">
        TalklyAI
      </span>
    </a>
  )
}

const capabilities = [
  { icon: AudioLines, title: 'AI Voice Calling', text: 'Natural, real-time AI conversations.' },
  { icon: ScanSearch, title: 'Post-call Intelligence', text: 'Call analysis and lead qualification.' },
  { icon: CalendarCheck, title: 'Automated Actions', text: 'Appointment booking and WhatsApp follow-ups.' },
]

const rise = (ms: number) => ({ '--rise-delay': `${ms}ms` }) as CSSProperties

/** Desktop brand panel (shown from the lg breakpoint). Purely presentational. */
export default function LoginBrandPanel() {
  return (
    <aside
      aria-label="About TalklyAI"
      className="login-brand relative hidden min-h-dvh flex-col overflow-hidden border-r border-[#E2E8F0] px-10 py-10 lg:flex xl:px-14 xl:py-12"
    >
      <div className="login-fade" style={rise(0)}>
        <LoginLogo />
      </div>

      <div className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col justify-center py-6">
        <h2
          className="login-rise text-[2.25rem] font-semibold leading-[1.12] tracking-[-0.025em] text-[#111827] xl:text-[2.625rem]"
          style={rise(80)}
        >
          Welcome to <span className="text-[#2463EB]">Smarter Conversations.</span>
        </h2>
        <p className="login-rise mt-4 max-w-[28rem] text-[1.0625rem] leading-relaxed text-[#475569]" style={rise(140)}>
          Automate conversations, qualify leads and grow your business with AI-powered voice calling.
        </p>

        {/* Product visual: a sample call and the outcomes it leads to. Needs the xl panel width so the
            floating cards sit beside the call card instead of covering it; hidden on short screens. */}
        <div
          aria-hidden="true"
          className="login-rise relative mt-8 hidden h-[18rem] xl:block [@media(max-height:880px)]:hidden"
          style={rise(220)}
        >
          {/* The call card starts below the top status card and ends above the bottom one, so they never cover it. */}
          <div className="absolute left-0 top-14 w-[19.5rem] rounded-2xl border border-[#E2E8F0] bg-white/95 p-4 shadow-[0_1px_2px_rgb(30_58_138/0.04),0_16px_36px_-18px_rgb(36_70_170/0.28)]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#EEF3FF] text-sm font-semibold text-[#2463EB]">
                PS
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#111827]">Priya Sharma</p>
                <p className="text-xs text-[#475569]">Sample call · Hinglish</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[0.6875rem] font-semibold text-[#14714d]">
                <span className="login-live h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                Live
              </span>
            </div>
            <LoginWaveform count={34} className="mt-4 h-9 justify-between" />
            <p className="mt-3 truncate rounded-xl bg-[#F8FAFC] px-3 py-2 text-[0.8125rem] leading-snug text-[#475569]">
              “Saturday ko site visit theek rahega.”
            </p>
          </div>

          <div className="login-float absolute right-0 top-0 flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-[0_12px_28px_-16px_rgb(36_70_170/0.35)]">
            <CheckCircle2 size={18} className="text-[#16a34a]" />
            <div>
              <p className="text-[0.8125rem] font-semibold text-[#111827]">Lead Qualified</p>
              <p className="text-[0.6875rem] text-[#475569]">Budget and timeline confirmed</p>
            </div>
          </div>

          <div
            className="login-float absolute bottom-0 right-4 flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-[0_12px_28px_-16px_rgb(121_85_232/0.4)]"
            style={{ animationDelay: '-3s' }}
          >
            <CalendarCheck size={18} className="text-[#7955E8]" />
            <div>
              <p className="text-[0.8125rem] font-semibold text-[#111827]">Appointment Booked</p>
              <p className="text-[0.6875rem] text-[#475569]">Site visit, Saturday</p>
            </div>
          </div>
        </div>

        <ul className="mt-8 space-y-4">
          {capabilities.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="login-rise flex items-start gap-3.5" style={rise(300 + index * 60)}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white text-[#2463EB]">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[0.9375rem] font-semibold text-[#111827]">{title}</span>
                <span className="block text-sm text-[#475569]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="login-fade flex items-center gap-1.5 text-[0.8125rem] text-[#475569]" style={rise(400)}>
        <Sparkles size={14} aria-hidden="true" className="text-[#7955E8]" />
        A product by <span className="font-semibold text-[#111827]">Novalantis</span>
      </p>
    </aside>
  )
}
