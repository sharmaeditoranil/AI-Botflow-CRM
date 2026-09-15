import Link from "next/link";
import { MessageSquare, ShieldCheck, Mail, Phone } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

export function LegalLayout({ title, lastUpdated = "September 16, 2026", children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-base tracking-tight hover:opacity-90 transition-opacity">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span>AI Botflow CRM</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact Support
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-10 px-4 sm:px-6">
        <article className="mx-auto max-w-3xl">
          <div className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Last updated: {lastUpdated}</span>
              <span>•</span>
              <span>AI Botflow SaaS Platform</span>
            </p>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
            {children}
          </div>
        </article>
      </main>

      {/* Footer with Mandatory Compliance Links */}
      <footer className="border-t border-border bg-muted/30 py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">AI Botflow CRM</p>
              <p className="mt-0.5">Cloud-based WhatsApp & Social Multi-channel CRM Platform</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <Link href="/refund-policy" className="hover:text-foreground transition-colors">Cancellation & Refund</Link>
              <Link href="/shipping-policy" className="hover:text-foreground transition-colors">Shipping & Delivery</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
              <Link href="/data-deletion" className="hover:text-foreground transition-colors">Data Deletion</Link>
            </div>
          </div>
          <div className="mt-6 border-t border-border/40 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <p>© {new Date().getFullYear()} AI Botflow. All rights reserved.</p>
            <p className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> support@aibotflow.in</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> +91 92949 89812</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
