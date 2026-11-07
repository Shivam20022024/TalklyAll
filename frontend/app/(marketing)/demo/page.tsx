'use client'

import { CalendarCheck, CircleCheck, ClipboardList, LoaderCircle, PhoneCall } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { contact } from '@/lib/landing-content'
import { submitDemoRequest, type DemoFormValues } from '@/lib/submitDemo'

const topics = ['Product demo', 'Getting started', 'Pricing', 'Collections', 'E-commerce COD']

const nextSteps = [
  { icon: ClipboardList, text: 'Share your use case and the languages you call in.' },
  { icon: PhoneCall, text: 'See how a TalklyAI conversation fits your campaign.' },
  { icon: CalendarCheck, text: 'Agree the next steps with the team.' },
]

type Errors = Partial<Record<keyof DemoFormValues, string>>

function validate(values: DemoFormValues): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = 'Enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid work email, such as name@company.com.'
  if (values.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a phone number with at least 10 digits.'
  if (!values.company.trim()) errors.company = 'Enter your company name.'
  return errors
}

function Field({
  label,
  name,
  error,
  children,
  optional,
}: {
  label: string
  name: string
  error?: string
  children: ReactNode
  optional?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold text-ink">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-sm text-[#b42318]">
          {error}
        </p>
      )}
    </div>
  )
}

export default function DemoPage() {
  return (
    <Suspense fallback={null}>
      <DemoForm />
    </Suspense>
  )
}

function DemoForm() {
  const params = useSearchParams()
  const requested = params.get('topic')
  const [values, setValues] = useState<DemoFormValues>({
    name: '',
    email: '',
    phone: '',
    company: '',
    topic: requested && topics.includes(requested) ? requested : topics[0],
    message: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [via, setVia] = useState<'email' | 'endpoint' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'Get a Demo | TalklyAI'
    return () => {
      document.title = 'TalklyAI | AI Voice Calling in Hindi, Hinglish and English'
    }
  }, [])

  useEffect(() => {
    if (state === 'sent') resultRef.current?.focus()
  }, [state])

  const update = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name as keyof DemoFormValues]) setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const fieldProps = (name: keyof DemoFormValues) => ({
    id: name,
    name,
    value: values[name],
    onChange: update,
    className: 'field',
    'aria-invalid': errors[name] ? ('true' as const) : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  })

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    const firstError = Object.keys(found)[0] as keyof DemoFormValues | undefined
    if (firstError) {
      (formRef.current?.elements.namedItem(firstError) as HTMLElement | null)?.focus()
      return
    }
    setState('sending')
    try {
      const result = await submitDemoRequest(values)
      setVia(result.via)
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="bg-gradient-to-b from-mist to-white">
      <div className="wrap grid gap-10 pb-20 pt-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:pt-16">
        <div>
          <h1 className="text-[clamp(2rem,3.6vw,2.875rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
            See TalklyAI on Your Own Use Case
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-pretty">
            Tell us who you call and what a good outcome looks like. The team will follow up to arrange a walkthrough.
          </p>
          <ul className="mt-8 space-y-4">
            {nextSteps.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[0.9375rem] text-ink">
                <span className="tile-icon h-10! w-10!">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[0.9375rem]">
            Prefer email? Write to{' '}
            <a href={`mailto:${contact.email}`} className="font-medium text-brand-dark underline underline-offset-2">
              {contact.email}
            </a>
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          {state === 'sent' ? (
            <div ref={resultRef} tabIndex={-1} role="status" className="py-8 text-center outline-none">
              <CircleCheck size={40} className="mx-auto text-brand" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">
                {via === 'email' ? 'Finish Sending in Your Email App' : 'Demo Request Sent'}
              </h2>
              <p className="mx-auto mt-3 max-w-[26rem] leading-relaxed">
                {via === 'email' ? (
                  <>
                    Your email app should now show the request, ready to send. If it did not open, email{' '}
                    <a href={`mailto:${contact.email}`} className="font-medium text-brand-dark underline underline-offset-2">
                      {contact.email}
                    </a>
                    .
                  </>
                ) : (
                  `The team will reply to ${values.email} to arrange your walkthrough.`
                )}
              </p>
              <Link href="/" className="btn btn-secondary mt-6">
                Back to Home
              </Link>
            </div>
          ) : (
            <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Get a Demo</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name" name="name" error={errors.name}>
                  <input {...fieldProps('name')} type="text" autoComplete="name" placeholder="Priya Sharma…" />
                </Field>
                <Field label="Work email" name="email" error={errors.email}>
                  <input {...fieldProps('email')} type="email" autoComplete="email" spellCheck={false} placeholder="name@company.com…" />
                </Field>
                <Field label="Phone" name="phone" error={errors.phone}>
                  <input {...fieldProps('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210…" />
                </Field>
                <Field label="Company" name="company" error={errors.company}>
                  <input {...fieldProps('company')} type="text" autoComplete="organization" placeholder="Your company…" />
                </Field>
              </div>
              <Field label="What would you like to discuss?" name="topic">
                <select {...fieldProps('topic')}>
                  {topics.map((topic) => (
                    <option key={topic}>{topic}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tell us about your calls" name="message" optional>
                <textarea {...fieldProps('message')} rows={4} placeholder="Who you call, how many calls a month, and which languages…" />
              </Field>
              {state === 'failed' && (
                <p role="alert" className="rounded-xl border border-[#f3c6bf] bg-[#fef3f1] px-4 py-3 text-sm text-[#912018]">
                  The request did not send. Check your connection and try again, or email {contact.email}.
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={state === 'sending'}>
                {state === 'sending' ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Sending…
                  </>
                ) : (
                  'Request Demo'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
