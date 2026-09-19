"use client";

import { useAuth } from "@/hooks/use-auth";
import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldCheck,
  Building2,
  Calendar,
  Lock,
  ArrowUpRight,
  Sparkles,
  KeyRound,
  BellRing,
} from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, profile, account, accountRole } = useAuth();

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "Recently";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Hero Profile Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/5 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-16 ring-2 ring-primary/30 shadow-md">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? "User"} />
              ) : null}
              <AvatarFallback className="bg-primary/20 text-xl font-bold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground sm:text-2xl tracking-tight">
                  {profile?.full_name || "Account Profile"}
                </h1>
                {accountRole && (
                  <Badge variant="outline" className="capitalize text-xs font-semibold px-2 py-0.5 border-primary/40 bg-primary/10 text-primary">
                    <ShieldCheck className="size-3 mr-1" />
                    {accountRole}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings?tab=security"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <KeyRound className="size-3.5 text-muted-foreground" />
              Security Settings
            </Link>
          </div>
        </div>

        {/* Quick Meta Strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/50 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-3.5 text-primary" />
            <span className="truncate">Org: <strong className="text-foreground">{account?.name || "Personal"}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-3.5 text-primary" />
            <span>Joined: <strong className="text-foreground">{memberSince}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span>Status: <strong className="text-emerald-400">Verified</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>Plan: <strong className="text-foreground capitalize">{account?.subscription_status || "Free Trial"}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Profile Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Form and Identity */}
        <div className="lg:col-span-2 space-y-6">
          <ProfileForm />
        </div>

        {/* Right 1 Col: Security, Quick Cards & Shortcuts */}
        <div className="space-y-6">
          {/* Security & Password Card */}
          <Card className="rounded-2xl border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Lock className="size-4 text-primary" />
                Security & Authentication
              </CardTitle>
              <CardDescription className="text-xs">
                Manage your credentials and login safety
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Password Protection</span>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Active</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Regularly update your password to maintain optimal account security.
                </p>
                <Link
                  href="/settings?tab=security"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline pt-1"
                >
                  Change Password <ArrowUpRight className="size-3" />
                </Link>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Active Sessions</span>
                  <span className="text-[11px] text-muted-foreground">Current device</span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  You are logged into this browser session securely.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Connected Workspaces & Role */}
          <Card className="rounded-2xl border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                Workspace Permissions
              </CardTitle>
              <CardDescription className="text-xs">
                Your role and access rights in this CRM
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span>Account Role</span>
                <span className="font-semibold text-foreground capitalize">{accountRole || "Member"}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span>WhatsApp Messaging</span>
                <span className="font-semibold text-emerald-400">Enabled</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span>Automations & AI</span>
                <span className="font-semibold text-emerald-400">Enabled</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span>GMB & Local SEO</span>
                <span className="font-semibold text-emerald-400">Full Access</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
