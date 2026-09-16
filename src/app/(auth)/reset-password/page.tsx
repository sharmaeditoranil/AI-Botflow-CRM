"use client";

import { useState, useMemo } from "react";
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
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Check,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Auto redirect after 2.5s
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 2500);
  };

  if (success) {
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
              Password Updated!
            </CardTitle>

            <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-sm">
              Your password has been reset successfully. Redirecting you to your dashboard...
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Link href="/dashboard" className="block w-full">
              <Button
                className="h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg transition-all"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
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
              <span>Set New Password</span>
            </div>
          </div>

          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Choose a New Password
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1 max-w-xs">
            Create a strong password of at least 6 characters for your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive dark:text-red-400 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

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
                  placeholder="Repeat your new password"
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
              disabled={loading}
              className="mt-2 h-11 w-full rounded-xl bg-gradient-to-r from-primary via-primary/95 to-purple-600 text-primary-foreground font-semibold shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Update Password & Sign In
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="pt-2 text-center text-xs sm:text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary/80 transition-colors hover:underline"
            >
              Back to Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
