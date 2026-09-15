"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import {
  WhatsAppIcon,
  MessengerIcon,
  InstagramIcon,
} from "@/components/icons/social-icons";
import type { MetaSocialConfig } from "@/types";

export function SocialChannelsConfig() {
  const t = useTranslations("Settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states
  const [fbPageId, setFbPageId] = useState("");
  const [fbPageName, setFbPageName] = useState("");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [fbConnected, setFbConnected] = useState(false);

  const [igAccountId, setIgAccountId] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [igConnected, setIgConnected] = useState(false);

  const [verifyToken, setVerifyToken] = useState("wacrm_social_webhook_token");
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/api/meta/social/webhook`);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/meta/social/config");
      const data = await res.json();

      if (data.config) {
        const c: MetaSocialConfig = data.config;
        setFbPageId(c.facebook_page_id || "");
        setFbPageName(c.facebook_page_name || "");
        setFbAccessToken(c.facebook_page_access_token ? "••••••••••••••••" : "");
        setFbConnected(c.facebook_status === "connected");

        setIgAccountId(c.instagram_account_id || "");
        setIgUsername(c.instagram_username || "");
        setIgConnected(c.instagram_status === "connected");

        if (c.verify_token) {
          setVerifyToken(c.verify_token);
        }
      }
    } catch (err) {
      console.error("Failed to load social config:", err);
      toast.error("Failed to load social configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/meta/social/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facebook_page_id: fbPageId,
          facebook_page_name: fbPageName,
          facebook_page_access_token: fbAccessToken,
          facebook_status: fbPageId && fbAccessToken ? "connected" : "disconnected",
          instagram_account_id: igAccountId,
          instagram_username: igUsername,
          instagram_status: igAccountId ? "connected" : "disconnected",
          verify_token: verifyToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      toast.success("Social channels configuration saved successfully!");
      loadConfig();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error saving configuration";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          Social Channels Integration
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your Facebook Page and Instagram Professional Account to receive and reply to customer DMs directly from the CRM Inbox.
        </p>
      </div>

      {/* Overview Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Facebook Messenger Status */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-[#0084FF]">
              <MessengerIcon className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">Facebook Messenger</h4>
              <p className="text-xs text-muted-foreground">
                {fbPageName || (fbPageId ? `Page ID: ${fbPageId}` : "Not configured")}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              fbConnected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                : "border-border text-muted-foreground"
            }
          >
            {fbConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Instagram DM Status */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500">
              <InstagramIcon className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">Instagram Direct Messages</h4>
              <p className="text-xs text-muted-foreground">
                {igUsername ? `@${igUsername}` : (igAccountId ? `ID: ${igAccountId}` : "Not configured")}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              igConnected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                : "border-border text-muted-foreground"
            }
          >
            {igConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </div>

      {/* Facebook Messenger Settings Card */}
      <Card className="border-border bg-card shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <MessengerIcon className="h-5 w-5 fill-[#0084FF]" />
            <CardTitle className="text-base">Facebook Page Connection</CardTitle>
          </div>
          <CardDescription>
            Messages sent to your Facebook Page will automatically show in the Inbox with a Messenger badge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fb-page-name">Facebook Page Name</Label>
              <Input
                id="fb-page-name"
                placeholder="e.g. My Business Brand"
                value={fbPageName}
                onChange={(e) => setFbPageName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-page-id">Facebook Page ID</Label>
              <Input
                id="fb-page-id"
                placeholder="e.g. 104829104829104"
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-token">Page Access Token</Label>
            <Input
              id="fb-token"
              type="password"
              placeholder="EAA..."
              value={fbAccessToken}
              onChange={(e) => setFbAccessToken(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Never shared with clients. Encrypted securely in the database with AES-256-GCM.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Instagram Settings Card */}
      <Card className="border-border bg-card shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <InstagramIcon className="h-5 w-5 fill-[#E1306C]" />
            <CardTitle className="text-base">Instagram Professional Account</CardTitle>
          </div>
          <CardDescription>
            Connect your Instagram Business or Creator account that is linked to your Facebook Page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ig-username">Instagram Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">@</span>
                <Input
                  id="ig-username"
                  className="pl-7"
                  placeholder="brand_handle"
                  value={igUsername}
                  onChange={(e) => setIgUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-account-id">Instagram Business Account ID</Label>
              <Input
                id="ig-account-id"
                placeholder="e.g. 17841400000000000"
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration Card */}
      <Card className="border-border bg-card shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Meta Webhook Setup</CardTitle>
          </div>
          <CardDescription>
            Configure this Webhook Callback URL and Verify Token in your Meta App Dashboard under <strong>Messenger &gt; Webhooks</strong> and <strong>Instagram &gt; Webhooks</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">Callback URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                readOnly
                value={callbackUrl}
                className="font-mono text-xs bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(callbackUrl, "url")}
                title="Copy Webhook URL"
              >
                {copiedField === "url" ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="verify-token">Verify Token</Label>
            <div className="flex gap-2">
              <Input
                id="verify-token"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(verifyToken, "token")}
                title="Copy Verify Token"
              >
                {copiedField === "token" ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5 border border-border/50">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-primary" /> Required Webhook Subscription Fields:
            </div>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>Page (Messenger):</strong> Subscribe to <code>messages</code>, <code>messaging_postbacks</code></li>
              <li><strong>Instagram:</strong> Subscribe to <code>messages</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Save Action */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="gap-2 min-w-32"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
}
