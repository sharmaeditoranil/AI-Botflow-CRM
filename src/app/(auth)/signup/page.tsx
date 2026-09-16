"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  CheckCircle2,
  UsersRound,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Check,
  Inbox,
  RotateCcw,
  KeyRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("SignupPage");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Password strength score: 0 to 3
  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10 || (/[A-Z]/.test(password) && /[0-9]/.test(password))) score++;
    if (/[^A-Za-z0-9]/.test(password) && password.length >= 8) score++;
    return score;
  }, [password]);

  const passwordsMatch = useMemo(() => {
    return password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  }, [password, confirmPassword]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("passwordsMismatch"));
      return;
    }

    if (password.length < 6) {
      setError(t("passwordTooShort"));
      return;
    }

    setLoading(true);

    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If Supabase auto-confirmed user (email confirmation disabled)
    if (data?.session) {
      const destination = inviteToken
        ? `/join/${encodeURIComponent(inviteToken)}`
        : "/dashboard";
      window.location.href = destination;
      return;
    }

    // Supabase dispatched email confirmation with 6-digit OTP
    setSuccess(true);
    setResendCooldown(60);
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 6) return;

    setError(null);
    setOtpLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "signup",
    });

    if (error) {
      setError(error.message);
      setOtpLoading(false);
      return;
    }

    setVerifiedSuccess(true);
    setOtpLoading(false);

    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";

    setTimeout(() => {
      window.location.href = destination;
    }, 1000);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || otpLoading) return;
    setError(null);
    setResendNotice(false);
    setOtpLoading(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });

    setOtpLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setResendCooldown(60);
    setResendNotice(true);
    setTimeout(() => setResendNotice(false), 5000);
  };

  if (success) {
    return (
      <div className="relative w-full">
        <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/30 via-primary/20 to-purple-500/20 opacity-70 blur-xl dark:opacity-50" />

        <Card className="relative w-full overflow-hidden border border-border/80 bg-card/90 dark:bg-card/80 p-3 sm:p-6 shadow-2xl backdrop-blur-2xl rounded-2xl">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-400 via-primary to-purple-500" />

          <CardHeader className="items-center text-center pb-4 pt-3">
            {/* Centered Top Badge */}
            <div className="flex justify-center w-full">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Account Verification</span>
              </div>
            </div>

            <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-lg shadow-primary/10">
              <Mail className="h-7 w-7" />
            </div>

            <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Enter Verification Code
            </CardTitle>

            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-mono text-foreground max-w-full truncate">
              <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate font-semibold">{email}</span>
            </div>

            <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-xs">
              We&apos;ve sent a 6-digit verification code to your email. Enter it below to activate your workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {resendNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in-50">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>New 6-digit verification code sent to your email!</span>
              </div>
            )}

            {verifiedSuccess ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center animate-in fade-in-50">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 animate-bounce" />
                <p className="text-sm font-bold text-foreground">Email Verified Successfully!</p>
                <p className="text-xs text-muted-foreground mt-1">Redirecting to your workspace...</p>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signup-otp" className="text-xs font-semibold text-foreground/90">
                      6-Digit Verification Code
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setSuccess(false);
                        setError(null);
                        setOtp("");
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Wrong email? Edit
                    </button>
                  </div>
                  <Input
                    id="signup-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="· · · · · ·"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    required
                    autoFocus
                    className="h-12 text-center text-xl tracking-[0.35em] font-mono font-bold rounded-xl border-border/80 bg-background/60 text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={otpLoading || otp.length < 6}
                  className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
                >
                  {otpLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying Code...
                    </>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Verify & Activate Workspace
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  )}
                </Button>

                <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || otpLoading}
                    className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend 6-Digit Code"}
                  </button>
                  <Link
                    href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}

            <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-left text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Didn&apos;t receive the code?
              </div>
              <p>Check your Spam or Promotions folder. It usually arrives within a few seconds.</p>
            </div>
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

        <CardHeader className="items-center text-center pb-4 pt-3">
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
            <div className="flex justify-center w-full">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-xs">
                <UsersRound className="h-3.5 w-3.5" />
                <span>Accept Team Invitation</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-xs">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Start 14-Day Free Access</span>
              </div>
            </div>
          )}

          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {inviteToken ? t("titleJoin") : t("title")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1 max-w-xs">
            {inviteToken ? t("descJoin") : t("desc")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-semibold text-foreground/90">
                {t("fullNameLabel")}
              </Label>
              <div className="relative group">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder={t("fullNamePlaceholder")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11 pl-10 rounded-xl border-border/80 bg-background/60 text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Email */}
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

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground/90">
                {t("passwordLabel")}
              </Label>
              <div className="relative group">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="space-y-1 pt-1 animate-in fade-in-50 duration-200">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        passwordStrength >= 1 ? "bg-amber-500" : "bg-muted"
                      }`}
                    />
                    <div
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        passwordStrength >= 2 ? "bg-amber-400" : "bg-muted"
                      }`}
                    />
                    <div
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        passwordStrength >= 3 ? "bg-emerald-500" : "bg-muted"
                      }`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>
                      {passwordStrength <= 1
                        ? "Minimum 6 characters"
                        : passwordStrength === 2
                        ? "Medium security"
                        : "Strong password"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground/90">
                  {t("confirmPasswordLabel")}
                </Label>
                {passwordsMatch && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in-50">
                    <Check className="h-3 w-3" />
                    Matches
                  </span>
                )}
              </div>
              <div className="relative group">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 pl-10 pr-10 rounded-xl border-border/80 bg-background/60 text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Terms of Service Notice */}
            <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline font-medium">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:underline font-medium">
                Privacy Policy
              </Link>
              .
            </p>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {t("submit")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Button>
          </form>

          {/* Switch to Login */}
          <div className="pt-2 text-center text-xs sm:text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="font-semibold text-primary hover:text-primary/80 transition-colors hover:underline"
            >
              {t("signIn")}
            </Link>
          </div>

          {/* Enterprise Security Footer */}
          <div className="flex items-center justify-center gap-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>256-bit SSL encrypted · Official Meta Cloud API</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

