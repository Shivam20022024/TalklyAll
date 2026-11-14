import LegalPageLayout from '@/components/legal/LegalPageLayout'
import { Mail, Phone, Clock } from 'lucide-react'

export default function ContactPage() {
  return (
    <LegalPageLayout title="Contact Us" lastUpdated="October 29, 2026">
      <p className="text-sm text-muted-foreground">
        TalklyAI is a product by Novalantis. Reach out for billing and refund requests, data/privacy
        requests, or general support.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail size={18} />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">Email</h3>
          <a href="mailto:info@novalantis.com" className="mt-1 block text-sm text-primary hover:underline">
            info@novalantis.com
          </a>
          <p className="mt-1 text-xs text-muted-foreground">We aim to respond within 2 business days.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Phone size={18} />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">Phone</h3>
          {/* TODO: replace with the real support number once provided */}
          <p className="mt-1 text-sm text-muted-foreground">Coming soon — email support for now.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 sm:col-span-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock size={18} />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">Support Hours</h3>
          <p className="mt-1 text-sm text-muted-foreground">Monday – Saturday, 10:00 AM – 7:00 PM IST</p>
        </div>
      </div>
    </LegalPageLayout>
  )
}
