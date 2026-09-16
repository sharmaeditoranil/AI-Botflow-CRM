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
import { ArrowLeft, CheckCircle, Mail, Loader2 } from "lucide-react";
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

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
      <Card className="w-full border border-border/80 bg-card/85 p-2 sm:p-4 shadow-2xl backdrop-blur-xl rounded-2xl text-center">
        <CardHeader className="items-center text-center pb-6">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
            <CheckCircle className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {t("checkEmailTitle")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {t.rich("checkEmailDesc", {
              email,
              strong: (chunks) => (
                <span className="font-semibold text-foreground">{chunks}</span>
              ),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl border-border text-foreground hover:bg-muted font-medium"
            >
              {t("backToSignIn")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border border-border/80 bg-card/85 p-2 sm:p-4 shadow-2xl backdrop-blur-xl rounded-2xl transition-all">
      <CardHeader className="items-center text-center pb-6">
        <div className="mb-2 flex items-center justify-center lg:hidden">
          <BrandLogo size={56} variant="glow" priority />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          {t("title")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          {t("desc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-xs font-medium text-foreground">
              {t("emailLabel")}
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 pl-10 rounded-xl border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 w-full rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
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
          className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToSignIn")}
        </Link>
      </CardContent>
    </Card>
  );
}
