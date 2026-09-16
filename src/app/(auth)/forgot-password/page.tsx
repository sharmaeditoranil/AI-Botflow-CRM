"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Mail,
  Loader2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  Inbox,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function ForgotPasswordPage() {
  const t = useTranslations("ForgotPasswordPage");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="relative w-full">
        <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/30 via-primary/20 to-purple-500/20 opacity-70 blur-xl dark:opacity-50" />
        
        <Card className="relative w-full overflow-hidden border border-border/80 bg-card/90 dark:bg-card/80 p-3 sm:p-6 shadow-2xl backdrop-blur-2xl rounded-2xl text-center">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-400 via-primary to-purple-500" />
          
          <CardHeader className="items-center text-center pb-6 pt-4">
            <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 items-center justify-center text-[9px] text-white">✓</span>
              </span>
              <Inbox className="h-8 w-8" />
            </div>

            <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {t("checkEmailTitle")}
            </CardTitle>

            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-mono text-foreground max-w-full truncate">
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate font-semibold">{email}</span>
            </div>

            <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-3 leading-relaxed max-w-sm">
              We&apos;ve dispatched password reset instructions to your inbox. Click the recovery link inside to establish a new password.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-left text-xs text-muted-foreground space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Check spam if missing
              </div>
              <p>The reset email is valid for 60 minutes. Check your junk or spam folder if it doesn&apos;t arrive immediately.</p>
            </div>

            <Link href="/login" className="block w-full">
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl border-border/80 text-foreground hover:bg-muted font-semibold transition-all shadow-xs"
              >
                {t("backToSignIn")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Outer ambient glow behind card */}
      <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/30 via-purple-500/20 to-emerald-500/20 opacity-70 blur-xl transition-opacity dark:opacity-50" />

      <Card className="relative w-full overflow-hidden border border-border/80 bg-card/90 dark:bg-card/80 p-2 sm:p-5 shadow-2xl backdrop-blur-2xl rounded-2xl transition-all">
        {/* Top subtle gradient accent line */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary via-purple-500 to-emerald-400" />

        <CardHeader className="items-center text-center pb-5 pt-3">
          {/* Mobile Logo Display */}
          <div className="mb-3 flex items-center justify-center lg:hidden">
            <BrandLogo size={42} showText variant="glow" priority textClassName="text-xl font-bold tracking-tight" />
          </div>

          <div className="flex justify-center w-full">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary shadow-xs">
              <KeyRound className="h-3 w-3" />
              <span>Account Security</span>
            </div>
          </div>

          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {t("title")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1 max-w-xs">
            {t("desc")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">
                {t("emailLabel")}
              </Label>
              <div className="relative group">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 pl-10 rounded-xl border-border/80 bg-background/60 text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("sending")}
                </>
              ) : (
                t("sendLink")
              )}
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium py-1"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToSignIn")}
          </Link>

          {/* Enterprise Security Footer */}
          <div className="flex items-center justify-center gap-2 border-t border-border/50 pt-4 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>256-bit SSL encrypted · Official Meta Cloud API</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

