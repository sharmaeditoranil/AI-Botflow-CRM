import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Aibotflow account to manage your WhatsApp conversations, AI agents, and broadcasts.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Sign In | Aibotflow WhatsApp CRM",
    description: "Sign in to your Aibotflow account to manage your WhatsApp conversations, AI agents, and broadcasts.",
    url: "/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
