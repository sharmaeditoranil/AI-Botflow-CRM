import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy - AI Botflow CRM",
  description: "Digital service fulfillment and delivery policy for AI Botflow SaaS software.",
};

export default function ShippingPolicyPage() {
  return (
    <LegalLayout title="Shipping & Delivery Policy">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. Digital SaaS Fulfillment</h2>
        <p>
          <strong>AI Botflow</strong> is a 100% cloud-hosted Software-as-a-Service (SaaS) application. We do not sell, ship, or deliver any physical goods or merchandise.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. Delivery Timeline & Provisioning</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li><strong>Instant Access:</strong> Upon successful completion of payment via our payment gateway (Razorpay), your subscription plan and account limits (messages, broadcast recipients, multi-agent seats) are activated <strong>immediately (real-time)</strong>.</li>
          <li><strong>Email Confirmation:</strong> A payment confirmation receipt and invoice from Razorpay and AI Botflow will be delivered to your registered email address within <strong>1 to 5 minutes</strong> of payment.</li>
          <li><strong>Login Details:</strong> If you are purchasing a new account, your login access credentials are provided upon sign-up and verified via email immediately.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. Shipping Charges</h2>
        <p>
          Since all services, software access, and updates are provisioned electronically over the internet, there are <strong>zero shipping or handling charges</strong> associated with any of our subscription plans.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">4. Delivery Issues or Access Delays</h2>
        <p>
          In the rare event that your account limits or plan does not reflect automatically after a completed Razorpay payment (e.g. due to temporary bank network timeouts), please reach out with your Razorpay Payment ID:
        </p>
        <div className="rounded-lg bg-muted p-4 text-xs space-y-1 border border-border">
          <p><strong>Support Email:</strong> support@aibotflow.in</p>
          <p><strong>Helpline Phone:</strong> +91 92949 89812</p>
          <p><strong>Turnaround Time:</strong> Account issues are resolved within 2 hours during business hours.</p>
        </div>
      </section>
    </LegalLayout>
  );
}
