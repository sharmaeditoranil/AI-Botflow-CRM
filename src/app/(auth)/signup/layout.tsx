import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — Start 14-Day Free Access",
  description: "Get started with Aibotflow WhatsApp CRM. Official Meta Cloud API integration, autonomous AI conversation memory, and zero per-message markups.",
  alternates: {
    canonical: "/signup",
  },
  openGraph: {
    title: "Create Account | Aibotflow WhatsApp CRM",
    description: "Start your 14-day free access. Enterprise WhatsApp CRM with AI memory and zero message markups.",
    url: "/signup",
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
