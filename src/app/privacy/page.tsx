import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Aibotflow WhatsApp & Social Multi-channel CRM platform.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | Aibotflow",
    description: "Privacy Policy and data protection standards for Aibotflow WhatsApp CRM.",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
        <p>
          Welcome to <strong>AI Botflow</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), accessible via <code>https://dash.aibotflow.in</code> and <code>https://aibotflow.in</code>.
          We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you access and use our WhatsApp Business API, Facebook Messenger, and Instagram DM CRM services.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
        <p>We collect information necessary to provide and optimize our multi-channel CRM services:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li><strong>Account Registration Information:</strong> Your name, business name, email address, phone number, and password credentials.</li>
          <li><strong>Meta & WhatsApp Channel Information:</strong> WhatsApp Business Account (WABA) IDs, Phone Number IDs, Facebook Page IDs, and Instagram Business Account details when connected via Meta OAuth.</li>
          <li><strong>Customer Communications Data:</strong> Message texts, media attachments, sender identifiers (phone numbers, Facebook PSIDs, Instagram scoped IDs), and timestamps processed through connected webhooks.</li>
          <li><strong>Billing & Payment Information:</strong> Transaction IDs, subscription plans, and order details. All credit/debit card, UPI, and net banking payments are securely processed by our authorized payment gateway partner, <strong>Razorpay Software Private Limited</strong>. We do not store raw card numbers or CVVs on our servers.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
        <p>The collected information is used strictly to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>Deliver CRM inbox features, message syncing, and two-way conversations across WhatsApp, Facebook Messenger, and Instagram DMs.</li>
          <li>Execute automated flows, auto-replies, and broadcast campaigns authorized by your account.</li>
          <li>Process billing and subscription renewals via Razorpay.</li>
          <li>Ensure security, fraud prevention, and compliance with Meta Platform Terms and WhatsApp Business Messaging Policies.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">4. Payment Processing (Razorpay)</h2>
        <p>
          We use <strong>Razorpay</strong> for processing online subscription payments. Razorpay complies with the Payment Card Industry Data Security Standard (PCI-DSS) and follows standard encryption protocols. Your purchase transaction data is stored only as long as necessary to complete your purchase transaction.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">5. Data Security & Storage</h2>
        <p>
          We implement rigorous technical and organizational security measures:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>Sensitive access tokens (Facebook Page tokens, WhatsApp system tokens) are encrypted in the database using industry-standard <strong>AES-256-GCM</strong> encryption.</li>
          <li>All communication between your browser and our servers, as well as with Meta Graph APIs and Razorpay APIs, is encrypted in transit using <strong>TLS 1.3 / SSL</strong>.</li>
          <li>Access control is strictly partitioned using multi-tenant Row Level Security (RLS).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">6. Third-Party Services & Meta Compliance</h2>
        <p>
          Our services integrate directly with Meta Platforms, Inc. (WhatsApp Cloud API, Facebook Graph API, Instagram Graph API). Your usage is subject to the respective Meta Terms and WhatsApp Business Messaging Policy. We do not sell, rent, or trade your personal data to any third-party advertisers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">7. User Rights & Data Deletion</h2>
        <p>
          You have the right to request access to, update, or delete your personal data stored within AI Botflow at any time. You can disconnect social channels directly from your CRM settings, or submit a formal data deletion request via our <a href="/data-deletion" className="text-primary underline font-medium">Data Deletion page</a> or by emailing <code>support@aibotflow.in</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">8. Contact Us</h2>
        <p>
          If you have any questions or concerns regarding this Privacy Policy, please reach out to us:
        </p>
        <div className="rounded-lg bg-muted p-4 text-xs space-y-1 border border-border">
          <p><strong>Entity Name:</strong> AI Botflow</p>
          <p><strong>Support Email:</strong> support@aibotflow.in</p>
          <p><strong>Support Phone:</strong> +91 92949 89812</p>
          <p><strong>Website:</strong> https://dash.aibotflow.in</p>
        </div>
      </section>
    </LegalLayout>
  );
}
