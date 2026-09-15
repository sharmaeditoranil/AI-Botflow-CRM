import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Data Deletion Instructions - AI Botflow CRM",
  description: "User data deletion instructions for Meta, Facebook, and Instagram integration with AI Botflow CRM.",
};

export default function DataDeletionPage() {
  return (
    <LegalLayout title="User Data Deletion Instructions">
      <section className="space-y-3">
        <p className="text-base text-muted-foreground">
          In accordance with Meta Platforms, Inc. policies and global privacy standards, AI Botflow provides users with clear instructions and mechanisms to request the deletion of their personal data and account records.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. How to Disconnect AI Botflow from Your Facebook Account</h2>
        <p className="text-sm text-muted-foreground">
          If you wish to remove AI Botflow&apos;s access to your Facebook Page or Instagram account, you can do so directly from Facebook:
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm">
          <li>Log in to your Facebook account and go to <strong>Settings &amp; Privacy &gt; Settings</strong>.</li>
          <li>In the left sidebar, click on <strong>Business Integrations</strong> (or <strong>Apps and Websites</strong>).</li>
          <li>Locate <strong>Aibot / AI Botflow</strong> in the list of connected applications.</li>
          <li>Click <strong>Remove</strong> to revoke all Page access and messaging permissions.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. How to Request Complete Deletion of Stored CRM Data</h2>
        <p className="text-sm text-muted-foreground">
          To delete all customer messages, contacts, and account metadata stored on AI Botflow servers:
        </p>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm">
          <p>
            Send an email to <strong>support@aibotflow.in</strong> with the subject line:
            <br />
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono font-semibold text-primary mt-1 inline-block">
              Request for Personal Data Deletion - [Your Account Email]
            </code>
          </p>
          <p className="text-xs text-muted-foreground">
            Please include your registered email address and your connected Facebook Page ID or WhatsApp Number ID.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. Processing &amp; Verification Timeframe</h2>
        <p className="text-sm text-muted-foreground">
          Upon receiving your request:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>We will verify ownership of the account within <strong>24 hours</strong>.</li>
          <li>All associated conversation histories, contacts, and access tokens will be permanently purged from our active database and backup systems within <strong>48 hours</strong>.</li>
          <li>A written confirmation with a deletion confirmation code will be emailed back to you.</li>
        </ul>
      </section>

      <section className="space-y-3 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">4. Direct Contact</h2>
        <p className="text-sm text-muted-foreground">
          For urgent data protection inquiries, contact our Data Protection Officer at:
          <br />
          <strong>Email:</strong> <a href="mailto:support@aibotflow.in" className="text-primary hover:underline font-medium">support@aibotflow.in</a>
          <br />
          <strong>Phone:</strong> <a href="tel:+919294989812" className="text-primary hover:underline font-medium">+91 92949 89812</a>
        </p>
      </section>
    </LegalLayout>
  );
}
