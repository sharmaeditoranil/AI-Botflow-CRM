import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: "Cancellation and Refund Policy for Aibotflow subscriptions and services.",
  alternates: {
    canonical: "/refund-policy",
  },
  openGraph: {
    title: "Cancellation & Refund Policy | Aibotflow",
    description: "Cancellation and Refund terms for Aibotflow subscriptions.",
    url: "/refund-policy",
  },
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Cancellation & Refund Policy">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. Overview</h2>
        <p>
          At <strong>AI Botflow</strong>, we strive to ensure our customers are completely satisfied with our multi-channel WhatsApp and Social CRM platform. This policy outlines our terms for subscription cancellations and refunds.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. Subscription Cancellation</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>You can cancel your subscription at any time directly through your CRM account under <strong>Settings &gt; Billing &amp; Subscription</strong>, or by emailing <code>support@aibotflow.in</code>.</li>
          <li>Upon cancellation, your subscription will remain active until the end of the current billing cycle, after which you will not be billed further.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. 7-Day Money-Back Guarantee (First-Time Subscriptions)</h2>
        <p>
          We offer a <strong>7-day money-back guarantee</strong> for first-time subscribers to our paid plans:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>If you are dissatisfied with our software within 7 calendar days of your initial purchase, you may request a full refund of your subscription fee.</li>
          <li>To request a refund, email <code>support@aibotflow.in</code> with your registered account email and Razorpay payment receipt ID.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">4. Refund Processing Timeline</h2>
        <p>
          Once your refund request is approved:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>Refunds are initiated immediately via our payment gateway partner, <strong>Razorpay</strong>.</li>
          <li>The amount will be credited back to the original source payment method (Credit/Debit Card, UPI, or Net Banking) within <strong>5 to 7 working days</strong>, depending on your issuing bank.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">5. Non-Refundable Items</h2>
        <p>The following charges are non-refundable:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>Direct conversation charges billed by Meta Platforms for WhatsApp conversations already delivered.</li>
          <li>Subscription renewals where cancellation was not requested prior to the renewal date.</li>
          <li>Accounts terminated due to violations of our Anti-Spam or Meta Platform Policies.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">6. Contact Support for Refunds</h2>
        <div className="rounded-lg bg-muted p-4 text-xs space-y-1 border border-border">
          <p><strong>Support Email:</strong> support@aibotflow.in</p>
          <p><strong>Helpline Phone:</strong> +91 92949 89812</p>
          <p><strong>Hours of Operation:</strong> Monday – Saturday, 10:00 AM – 7:00 PM IST</p>
        </div>
      </section>
    </LegalLayout>
  );
}
