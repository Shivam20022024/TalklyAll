import { Mail, MapPin, Phone } from 'lucide-react'
import { company, contact } from '@/lib/landing-content'
import Logo from './Logo'
import SmartLink from './SmartLink'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/#features' },
      { label: 'Dashboard', to: '/#dashboard' },
      { label: 'How It Works', to: '/#how-it-works' },
      { label: 'Integrations', to: '/#integrations' },
    ],
  },
  {
    title: 'Industries',
    links: [
      { label: 'Real Estate', to: '/#industries' },
      { label: 'Healthcare', to: '/#industries' },
      { label: 'EdTech', to: '/#industries' },
      { label: 'BFSI / Lending', to: '/#industries' },
      { label: 'Collections', to: '/#collections' },
      { label: 'B2B Sales', to: '/#industries' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', to: company.blog },
      { label: 'Product Overview', to: company.overview },
      { label: 'Get a Demo', to: '/demo' },
    ],
  },
]

const linkClass = 'text-[0.9375rem] transition-colors hover:text-brand-dark'

export default function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="wrap grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_1.4fr] lg:gap-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-[19rem] text-[0.9375rem] leading-relaxed">
            AI voice calling for Indian businesses, in Hindi, Hinglish, and English. A product of {company.name}.
          </p>
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">{column.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <SmartLink to={link.to} className={linkClass}>{link.label}</SmartLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">Contact</h2>
          <ul className="mt-4 space-y-3 text-[0.9375rem]">
            <li className="flex gap-2.5">
              <Mail size={17} className="mt-0.5 flex-none text-muted" aria-hidden="true" />
              <a href={`mailto:${contact.email}`} className="break-all transition-colors hover:text-brand-dark">{contact.email}</a>
            </li>
            <li className="flex gap-2.5">
              <Phone size={17} className="mt-0.5 flex-none text-muted" aria-hidden="true" />
              <span className="grid gap-1">
                {contact.phones.map((phone) => (
                  <a key={phone.href} href={phone.href} className="tabular-nums transition-colors hover:text-brand-dark">{phone.label}</a>
                ))}
              </span>
            </li>
            <li className="flex gap-2.5">
              <MapPin size={17} className="mt-0.5 flex-none text-muted" aria-hidden="true" />
              <address className="not-italic leading-relaxed">{contact.address}</address>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col gap-3 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {company.name}. All rights reserved.</p>
          <ul className="flex gap-5">
            <li><SmartLink to={company.privacy} className="transition-colors hover:text-brand-dark">Privacy Policy</SmartLink></li>
            <li><SmartLink to={company.terms} className="transition-colors hover:text-brand-dark">Terms and Conditions</SmartLink></li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
