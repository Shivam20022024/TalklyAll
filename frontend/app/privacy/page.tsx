import LegalPageLayout from '@/components/legal/LegalPageLayout'

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="October 29, 2026">
      <section>
        <h2>1. Overview</h2>
        <p>
          This Privacy Policy explains what personal data TalklyAI (operated by Novalantis) collects,
          how we use it, who we share it with, and the choices you have. It applies to businesses that
          use TalklyAI ("you", "your company") and, where relevant, to the people your company calls
          through the platform.
        </p>
      </section>

      <section>
        <h2>2. What We Collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, email, company name, and login credentials.</li>
          <li>
            <strong>Call data:</strong> phone numbers you call or that call you, call recordings,
            transcripts, AI-generated summaries, sentiment, and lead-qualification data.
          </li>
          <li>
            <strong>Payment data:</strong> transaction and wallet-balance records. Card, UPI, and bank
            details are collected and processed directly by our payment processor, Razorpay — we do not
            store this data ourselves.
          </li>
          <li><strong>Usage data:</strong> login activity, feature usage, and basic technical logs.</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use It</h2>
        <ul>
          <li>To operate the calling platform — placing/receiving calls, transcription, and AI analysis.</li>
          <li>To sync call outcomes to your CRM and trigger follow-up messages (e.g. WhatsApp) when you've configured those integrations.</li>
          <li>To process payments and maintain your wallet balance.</li>
          <li>To provide support, send service notifications, and improve reliability.</li>
        </ul>
      </section>

      <section>
        <h2>4. Who We Share It With</h2>
        <p>We share data only with the third parties needed to deliver the service:</p>
        <ul>
          <li><strong>Telephony &amp; voice AI providers</strong> — to place and receive calls and generate AI speech.</li>
          <li><strong>Speech and language model providers</strong> — to transcribe calls and generate summaries/analysis.</li>
          <li><strong>Razorpay</strong> — to process wallet top-up payments.</li>
          <li><strong>Your own configured integrations</strong> (CRM webhook, WhatsApp) — only call outcomes you've chosen to sync.</li>
        </ul>
        <p>We do not sell personal data to third parties for marketing purposes.</p>
      </section>

      <section>
        <h2>5. Multi-Tenant Data Isolation</h2>
        <p>
          TalklyAI is a multi-tenant platform. Each company's data — calls, leads, prompts, and billing
          — is logically isolated and scoped to that company's account; one customer cannot access
          another's data through the platform.
        </p>
      </section>

      <section>
        <h2>6. Data Retention</h2>
        <p>
          We retain call records, transcripts, and billing history for as long as your account is active
          and as needed to meet legal, billing, and dispute-resolution obligations. You may request
          deletion of your account data as described below, subject to records we're required to keep by
          law (e.g. billing records).
        </p>
      </section>

      <section>
        <h2>7. Your Rights</h2>
        <p>
          Under India's Digital Personal Data Protection Act, 2023, and other applicable law, you may
          have the right to access, correct, or request erasure of your personal data, and to withdraw
          consent for processing where consent is the basis for it. To exercise these rights, contact us
          at <a href="mailto:info@novalantis.com">info@novalantis.com</a>.
        </p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>
          We use encrypted authentication (JWT-based sessions) and tenant-scoped access controls to
          protect account and call data. No system is perfectly secure, and we encourage you to use a
          strong, unique password for your account.
        </p>
      </section>

      <section>
        <h2>9. Cookies &amp; Local Storage</h2>
        <p>
          TalklyAI uses browser local storage to keep you signed in and may use basic analytics to
          understand product usage. We do not use third-party advertising trackers.
        </p>
      </section>

      <section>
        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time; material changes will be reflected by the "Last updated" date above.</p>
      </section>

      <section>
        <h2>11. Contact / Grievance Officer</h2>
        <p>
          For privacy questions, data requests, or complaints, contact{' '}
          <a href="mailto:info@novalantis.com">info@novalantis.com</a>.
        </p>
      </section>

      <p className="text-xs italic text-muted-foreground">
        This page is a working draft and has not yet been reviewed by a qualified lawyer. It should be
        reviewed for completeness and legal accuracy — including a named Grievance Officer as may be
        required under applicable Indian data protection law — before being relied on for compliance
        purposes.
      </p>
    </LegalPageLayout>
  )
}
