import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and Conditions of Service for Aibotflow WhatsApp & Social Multi-channel CRM.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service | Aibotflow",
    description: "Terms and Conditions of Service for Aibotflow WhatsApp CRM.",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms and Conditions of Service">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. Agreement to Terms</h2>
        <p>
          By accessing or using <strong>AI Botflow CRM</strong> (the &ldquo;Service&rdquo;), operated by <strong>AI Botflow</strong>, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access or use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
        <p>
          AI Botflow is a cloud-hosted software-as-a-service (SaaS) platform providing unified customer communication management across WhatsApp Cloud API, Facebook Messenger, and Instagram Direct Messages, including automation workflows, broadcasting, and agent inbox functionality.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. User Accounts & Responsibilities</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>You must provide accurate, complete, and up-to-date registration information.</li>
          <li>You are responsible for safeguarding your login credentials and for all activities that occur under your account.</li>
          <li>You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">4. Acceptable Use Policy & Anti-Spam Compliance</h2>
        <p>When using AI Botflow to communicate with end-users:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>You must comply with Meta Platform Policies, the WhatsApp Business Policy, and WhatsApp Commerce Policy.</li>
          <li>You must obtain clear, prior consent (opt-in) from recipients before sending proactive marketing or promotional template messages.</li>
          <li>You shall not transmit spam, unsolicited commercial messages, harassing, obscene, fraudulent, or illegal content.</li>
          <li>Violation of messaging policies may result in immediate suspension or termination of your account without notice or refund.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">5. Subscription Plans, Pricing & Payments</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>All subscription charges for AI Botflow plans are billed in advance on a monthly or annual cycle.</li>
          <li>Online payments are securely processed via our payment gateway partner, <strong>Razorpay</strong>. We accept Credit Cards, Debit Cards, UPI, Net Banking, and authorized digital wallets.</li>
          <li>Applicable taxes (including GST) will be calculated and displayed during checkout.</li>
          <li>Meta conversation charges (billed directly by Meta for WhatsApp template/service conversations) are separate and subject to Meta&apos;s pricing schedule.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">6. Limitation of Liability</h2>
        <p>
          In no event shall AI Botflow, its directors, employees, or partners be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising out of your use or inability to use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">7. Governing Law & Dispute Resolution</h2>
        <p>
          These Terms shall be governed and construed in accordance with the laws of <strong>India</strong>. Any disputes arising in connection with these Terms shall be subject to the exclusive jurisdiction of the competent courts in India.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">8. Contact Information</h2>
        <p>For any queries regarding these Terms of Service, please contact us:</p>
        <div className="rounded-lg bg-muted p-4 text-xs space-y-1 border border-border">
          <p><strong>Business Name:</strong> AI Botflow</p>
          <p><strong>Email:</strong> support@aibotflow.in</p>
          <p><strong>Phone:</strong> +91 92949 89812</p>
          <p><strong>Operating Portal:</strong> https://dash.aibotflow.in</p>
        </div>
      </section>
    </LegalLayout>
  );
}
