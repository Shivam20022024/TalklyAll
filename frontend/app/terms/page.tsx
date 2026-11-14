import LegalPageLayout from '@/components/legal/LegalPageLayout'

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="October 29, 2026">
      <section>
        <h2>1. Agreement to Terms</h2>
        <p>
          These Terms of Service ("Terms") govern your access to and use of TalklyAI, an AI-powered
          voice calling platform operated by Novalantis ("Novalantis", "we", "us"). By creating an
          account or using TalklyAI, you agree to be bound by these Terms. If you are using TalklyAI on
          behalf of a company, you represent that you are authorized to accept these Terms on that
          company's behalf.
        </p>
      </section>

      <section>
        <h2>2. The Service</h2>
        <p>
          TalklyAI lets businesses place and receive AI-driven voice calls for sales, support, and lead
          qualification. The platform places outbound calls and answers inbound calls using
          AI-generated speech, transcribes and analyzes conversations, and can sync call outcomes to
          your CRM or trigger follow-up messages (including WhatsApp). TalklyAI relies on third-party
          infrastructure to deliver this — including telephony carriers, speech and language models, and
          a payment processor — and availability of those third parties can affect service availability.
        </p>
      </section>

      <section>
        <h2>3. Your Account</h2>
        <p>
          You must provide accurate registration information and keep your login credentials
          confidential. You are responsible for all activity that happens under your account, including
          calls placed through it.
        </p>
      </section>

      <section>
        <h2>4. Acceptable Use &amp; Calling Compliance</h2>
        <p>
          You are solely responsible for how you use TalklyAI to contact people, including compliance
          with applicable telecom and data protection law — in India, this includes TRAI regulations on
          unsolicited commercial communication and the National Do Not Disturb (DND) registry. You must
          have a lawful basis (such as prior consent or an existing business relationship) before placing
          outbound calls to any number, and you must not use TalklyAI to harass, defraud, or mislead call
          recipients. We may suspend or terminate accounts that we reasonably believe are being used to
          violate calling regulations or send unlawful or abusive communications.
        </p>
      </section>

      <section>
        <h2>5. Call Recording, Transcription &amp; AI Analysis</h2>
        <p>
          Calls placed or received through TalklyAI may be recorded, transcribed, and analyzed by AI
          models to generate summaries, sentiment, and lead scoring, and to improve call quality. You are
          responsible for ensuring that call recording is disclosed to and lawful with respect to the
          people you call, as required under applicable law.
        </p>
      </section>

      <section>
        <h2>6. Billing, Trial Minutes &amp; Payments</h2>
        <p>
          New accounts receive a limited number of free trial minutes. Beyond that, usage is billed
          against a prepaid wallet balance, charged per second of connected call time. Payments are
          processed by Razorpay; TalklyAI does not store your card, UPI, or bank account details. See our{' '}
          <a href="/refund-policy">Refund &amp; Cancellation Policy</a> for how refunds are handled.
        </p>
      </section>

      <section>
        <h2>7. Third-Party Services</h2>
        <p>
          TalklyAI is built on third-party infrastructure, including telephony providers, AI speech and
          language model providers, and Razorpay for payments. We are not responsible for outages,
          errors, or data handling by these providers beyond what is disclosed in our{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>8. Termination</h2>
        <p>
          You may stop using TalklyAI at any time. We may suspend or terminate your access if you
          violate these Terms, misuse the platform for unlawful calling, or fail to pay amounts owed.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers &amp; Limitation of Liability</h2>
        <p>
          TalklyAI is provided "as is." AI-generated speech, transcripts, and analysis may contain
          errors and should not be relied on as the sole basis for business-critical decisions. To the
          maximum extent permitted by law, Novalantis is not liable for indirect, incidental, or
          consequential damages arising from your use of the platform.
        </p>
      </section>

      <section>
        <h2>10. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of TalklyAI after an update
          constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:info@novalantis.com">info@novalantis.com</a>.
        </p>
      </section>

      <p className="text-xs italic text-muted-foreground">
        This page is a working draft and has not yet been reviewed by a qualified lawyer. It should be
        reviewed for completeness and legal accuracy before being relied on for compliance purposes.
      </p>
    </LegalPageLayout>
  )
}
