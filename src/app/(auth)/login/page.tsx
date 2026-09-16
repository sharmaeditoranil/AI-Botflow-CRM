"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  UsersRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    window.location.href = destination;
  };

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
            {inviteToken ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25">
                <UsersRound className="h-6 w-6" />
              </div>
            ) : (
              <BrandLogo size={42} showText variant="glow" priority textClassName="text-xl font-bold tracking-tight" />
            )}
          </div>

          {inviteToken ? (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-xs">
              <UsersRound className="h-3.5 w-3.5" />
              Team Invitation Pending
            </div>
          ) : (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              AI-Powered WhatsApp CRM
            </div>
          )}

          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {inviteToken ? t("titleAccept") : t("titleWelcome")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1 max-w-xs">
            {inviteToken ? t("descAccept") : t("descWelcome")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Email Field */}
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

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-foreground/90">
                  {t("passwordLabel")}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <div className="relative group">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pl-10 pr-10 rounded-xl border-border/80 bg-background/60 text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center justify-between pt-0.5">
              <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                />
                <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {t("rememberMe")}
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("signingIn")}
                </>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {t("signIn")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Button>
          </form>

          {/* Switch to Signup */}
          <div className="pt-2 text-center text-xs sm:text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="font-semibold text-primary hover:text-primary/80 transition-colors hover:underline"
            >
              {t("createAccount")}
            </Link>
          </div>

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

