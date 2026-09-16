"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
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
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "verify" | "done">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

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

  const handleSendResetEmail = async (e: React.FormEvent) => {
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

    setStep("verify");
    setResendCooldown(60);
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    setResendCooldown(60);
  };

  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setError("Please enter the verification code sent to your email.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    // Step A: Verify recovery OTP
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: cleanOtp,
      type: "recovery",
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }

    // Step B: Set new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setStep("done");
    setLoading(false);

    // Auto redirect after 2s
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 2000);
  };

  if (step === "done") {
    return (
      <div className="relative w-full">
        <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/30 via-primary/20 to-purple-500/20 opacity-70 blur-xl dark:opacity-50" />

        <Card className="relative w-full overflow-hidden border border-border/80 bg-card/90 dark:bg-card/80 p-3 sm:p-6 shadow-2xl backdrop-blur-2xl rounded-2xl text-center">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-400 via-primary to-purple-500" />

          <CardHeader className="items-center text-center pb-6 pt-4">
            <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>

            <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Password Changed!
            </CardTitle>

            <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-sm">
              Your password has been reset successfully. Redirecting you to your dashboard...
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Link href="/dashboard" className="block w-full">
              <Button className="h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg transition-all">
                Go to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/30 via-purple-500/20 to-emerald-500/20 opacity-70 blur-xl transition-opacity dark:opacity-50" />

      <Card className="relative w-full overflow-hidden border border-border/80 bg-card/90 dark:bg-card/80 p-2 sm:p-5 shadow-2xl backdrop-blur-2xl rounded-2xl transition-all">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary via-purple-500 to-emerald-400" />

        <CardHeader className="items-center text-center pb-4 pt-3">
          <div className="mb-3 flex items-center justify-center lg:hidden">
            <BrandLogo size={42} showText variant="glow" priority textClassName="text-xl font-bold tracking-tight" />
          </div>

          <div className="flex justify-center w-full">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary shadow-xs">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Account Recovery</span>
            </div>
          </div>

          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {step === "request" ? "Reset Password" : "Enter Recovery Code"}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1 max-w-xs">
            {step === "request"
              ? "Enter your work email and we will send you a 6-digit recovery code and reset link."
              : `We sent a 6-digit code to ${email}. Enter the code below to set your new password.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {step === "request" ? (
            <form onSubmit={handleSendResetEmail} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">
                  Work Email
                </Label>
                <div className="relative group">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
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
                    Sending Recovery Code...
                  </>
                ) : (
                  "Send Recovery Code & Link"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtpAndReset} className="flex flex-col gap-3.5">
              {/* 6-digit OTP Code Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="otp" className="text-xs font-semibold text-foreground/90">
                    Email Verification Code (OTP)
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("request");
                      setError(null);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Change email
                  </button>
                </div>
                <Input
                  id="otp"
                  type="text"
                  maxLength={8}
                  placeholder="Enter OTP Code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                  required
                  className="h-12 text-center text-xl tracking-[0.25em] font-mono font-bold rounded-xl border-border/80 bg-background/60 text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-foreground/90">
                  New Password
                </Label>
                <div className="relative group">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
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

                {password.length > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength >= 1 ? "bg-amber-500" : "bg-muted"}`} />
                      <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength >= 2 ? "bg-amber-400" : "bg-muted"}`} />
                      <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength >= 3 ? "bg-emerald-500" : "bg-muted"}`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground/90">
                    Confirm Password
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
                    placeholder="Repeat new password"
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

              <Button
                type="submit"
                disabled={loading || otp.length < 6}
                className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying & Setting Password...
                  </>
                ) : (
                  "Verify Code & Reset Password"
                )}
              </Button>

              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend OTP code"}
                </button>
                <span className="text-[11px]">Or click the link in your email</span>
              </div>
            </form>
          )}

          <Link
            href="/login"
            className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium py-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign in
          </Link>

          <div className="flex items-center justify-center gap-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>256-bit SSL encrypted · Official Meta Cloud API</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
