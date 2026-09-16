import { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: "Contact Us — Technical Support & Onboarding",
  description: "Contact the Aibotflow WhatsApp CRM team for onboarding, billing inquiries, enterprise WhatsApp API setup, or technical assistance.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact Us | Aibotflow WhatsApp CRM",
    description: "Reach our onboarding and support desk via WhatsApp, Phone (+91 92949 89812), or Email (support@aibotflow.in).",
    url: "/contact",
  },
};

export default function ContactUsPage() {
  return (
    <LegalLayout title="Contact Us">
      <section className="space-y-3">
        <p className="text-base text-muted-foreground">
          Have questions about AI Botflow CRM, billing, plans, or need technical assistance with your WhatsApp or Social integration? Our team is here to assist you.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-2xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Email Support</h3>
          <p className="text-xs text-muted-foreground">For general inquiries, account assistance, and billing queries.</p>
          <a href="mailto:support@aibotflow.in" className="text-sm font-medium text-primary hover:underline block pt-1">
            support@aibotflow.in
          </a>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-2xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Phone className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Phone &amp; WhatsApp</h3>
          <p className="text-xs text-muted-foreground">Speak directly with our technical support and onboarding desk.</p>
          <a href="tel:+919294989812" className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline block pt-1">
            +91 92949 89812
          </a>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-2xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Clock className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Operating Hours</h3>
          <p className="text-xs text-muted-foreground">Our support team is available during Indian Standard Time:</p>
          <p className="text-sm font-medium text-foreground pt-1">
            Mon – Sat: 10:00 AM – 7:00 PM IST
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-2xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
            <MapPin className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Registered Office</h3>
          <p className="text-xs text-muted-foreground">Digital SaaS Operations &amp; Commercial Office:</p>
          <p className="text-sm font-medium text-foreground pt-1">
            AI Botflow, India
          </p>
        </div>
      </div>

      <section className="space-y-3 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2.5">
          <BrandLogo size={22} /> Live Customer Portal
        </h2>
        <p className="text-sm text-muted-foreground">
          Existing customers can also open a support ticket or manage their billing profile by logging into the CRM dashboard at{" "}
          <a href="https://dash.aibotflow.in" className="text-primary underline font-medium">https://dash.aibotflow.in</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
