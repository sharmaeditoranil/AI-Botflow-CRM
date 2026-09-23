"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy,
  Check,
  ShieldCheck,
  Loader2,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Unlink,
} from "lucide-react";
import {
  MessengerIcon,
  InstagramIcon,
} from "@/components/icons/social-icons";
import type { MetaSocialConfig } from "@/types";

interface AvailablePage {
  id: string;
  name: string;
  category?: string;
  has_instagram?: boolean;
  instagram_id?: string | null;
  instagram_username?: string | null;
}

export function SocialChannelsConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [switchingPage, setSwitchingPage] = useState(false);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [metaAppConfigured, setMetaAppConfigured] = useState<boolean | null>(null);
  const [repairingContacts, setRepairingContacts] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<'all' | 'facebook' | 'instagram' | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // Form states
  const [fbPageId, setFbPageId] = useState("");
  const [fbPageName, setFbPageName] = useState("");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [fbConnected, setFbConnected] = useState(false);

  const [igAccountId, setIgAccountId] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [igConnected, setIgConnected] = useState(false);

  const [availablePages, setAvailablePages] = useState<AvailablePage[]>([]);
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

      if (typeof data.metaAppConfigured === 'boolean') {
        setMetaAppConfigured(data.metaAppConfigured);
      }

      if (data.config) {
        const c: MetaSocialConfig = data.config;
        const isFbConnected = c.facebook_status === "connected" && Boolean(c.facebook_page_id);
        const isIgConnected = c.instagram_status === "connected" && Boolean(c.instagram_account_id);

        setFbPageId(isFbConnected ? (c.facebook_page_id || "") : "");
        setFbPageName(isFbConnected ? (c.facebook_page_name || "") : "");
        setFbAccessToken(isFbConnected && c.facebook_page_access_token ? "••••••••••••••••" : "");
        setFbConnected(isFbConnected);

        setIgAccountId(isIgConnected ? (c.instagram_account_id || "") : "");
        setIgUsername(isIgConnected ? (c.instagram_username || "") : "");
        setIgConnected(isIgConnected);

        if (c.verify_token) {
          setVerifyToken(c.verify_token);
        }

        const meta = c.metadata as { available_pages?: AvailablePage[] } | undefined;
        if (isFbConnected && meta?.available_pages) {
          setAvailablePages(meta.available_pages);
        } else {
          setAvailablePages([]);
        }
      } else {
        setFbPageId("");
        setFbPageName("");
        setFbAccessToken("");
        setFbConnected(false);
        setIgAccountId("");
        setIgUsername("");
        setIgConnected(false);
        setAvailablePages([]);
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

  // Handle URL redirect query params from OAuth
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "true") {
        const page = params.get("pageName") || "Facebook Page";
        const hasIg = params.get("hasIg") === "true";
        const igUser = params.get("igUser");
        if (hasIg && igUser) {
          toast.success(`Connected ${page} and Instagram (@${igUser}) successfully!`);
        } else {
          toast.success(`Connected ${page} successfully!`);
        }
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=social");
        loadConfig();
      } else if (params.get("error")) {
        toast.error(`Connection failed: ${decodeURIComponent(params.get("error")!)}`);
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=social");
      }
    }
  }, [loadConfig]);

  const handleLaunchOAuth = async () => {
    if (metaAppConfigured === false) {
      toast.error("Meta App credentials (App ID & Secret) are not configured. Super-Admin must configure them in Super Admin > Settings.");
      return;
    }

    try {
      setConnectingOAuth(true);
      const redirectUri = `${window.location.origin}/api/meta/social/oauth/callback`;
      const res = await fetch(`/api/meta/social/oauth/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      if (!res.ok || !data.oauthUrl) {
        throw new Error(data.error || "Failed to initialize Facebook login.");
      }
      window.location.href = data.oauthUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch Facebook login";
      toast.error(msg);
      setConnectingOAuth(false);
    }
  };

  const handleSwitchPage = async (pageId: string) => {
    try {
      setSwitchingPage(true);
      const res = await fetch("/api/meta/social/switch-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to switch active page");
      }
      toast.success("Active Facebook Page updated!");
      loadConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to switch page";
      toast.error(msg);
    } finally {
      setSwitchingPage(false);
    }
  };

  const handleRepairContacts = async () => {
    try {
      setRepairingContacts(true);
      const res = await fetch("/api/meta/social/repair-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Contact repair failed");
      }
      if (data.fixed > 0) {
        toast.success(`✅ ${data.fixed} contact(s) ka naam update ho gaya!`);
      } else {
        toast.info("Koi generic naam wala contact nahi mila, ya Meta API se naam nahi aaya.");
      }
      if (data.failed > 0) {
        toast.warning(`⚠️ ${data.failed} contact(s) update nahi ho sake. Token ya Meta API permissions check karein.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Contact repair failed";
      toast.error(msg);
    } finally {
      setRepairingContacts(false);
    }
  };

  const handleOpenDisconnect = (target: 'all' | 'facebook' | 'instagram') => {
    setDisconnectTarget(target);
    setShowDisconnectDialog(true);
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    try {
      setDisconnecting(true);
      const res = await fetch("/api/meta/social/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: disconnectTarget }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect channel");
      }
      toast.success(data.message || "Disconnected successfully!");
      setShowDisconnectDialog(false);
      setDisconnectTarget(null);
      await loadConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      toast.error(msg);
    } finally {
      setDisconnecting(false);
    }
  };


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

      {/* 1-Click Embedded OAuth Sign-up Card */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-blue-500/5 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none flex gap-2">
          <MessengerIcon className="h-28 w-28 fill-current text-blue-500" />
          <InstagramIcon className="h-28 w-28 fill-current text-pink-500" />
        </div>
        <CardHeader className="pb-3 relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0084FF] to-[#E1306C] text-white shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">1-Click Embedded Connect (Recommended)</CardTitle>
                <CardDescription className="text-xs">
                  Login with Facebook to automatically link your Facebook Page and Instagram Account. Zero manual token entry required.
                </CardDescription>
              </div>
            </div>
            {(fbConnected || igConnected) && (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium">
                <Check className="h-3.5 w-3.5" /> Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          {metaAppConfigured === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <span className="font-semibold">Meta Tech Provider credentials not configured yet.</span>
                <p className="mt-0.5 text-muted-foreground text-[11px]">
                  Super-Admin ko platform settings me Meta App ID aur Secret daalna hoga taaki 1-click connect chalu ho sake.{' '}
                  <a href="/super-admin/settings" className="font-medium underline text-foreground hover:text-primary">
                    Open Super Admin Settings &rarr;
                  </a>
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleLaunchOAuth}
              disabled={connectingOAuth || switchingPage || disconnecting}
              className="bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium shadow-sm transition-all gap-2 px-5 h-11 text-sm"
            >
              {connectingOAuth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="flex items-center gap-1.5">
                  <MessengerIcon className="h-4 w-4 fill-current" />
                  <InstagramIcon className="h-4 w-4 fill-current text-pink-200" />
                </div>
              )}
              <span>{fbConnected ? "Reconnect or Change Accounts" : "Connect with Facebook & Instagram"}</span>
            </Button>

            {(fbConnected || igConnected) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenDisconnect("all")}
                disabled={connectingOAuth || switchingPage || disconnecting}
                className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 font-medium transition-all gap-1.5 px-4 h-11 text-sm"
              >
                <Unlink className="h-4 w-4" />
                <span>Disconnect</span>
              </Button>
            )}

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Auto-subscribes webhooks and securely saves permanent Page Access Tokens.
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground border border-border/40 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              <strong>Instagram Note:</strong> Instagram DMs CRM me aane ke liye aapka Instagram Professional/Business account Meta Business Suite me Facebook Page se linked hona zaroori hai.
            </span>
          </div>

          {availablePages.length > 1 && (
            <div className="pt-3 border-t border-border/40 flex flex-wrap items-center gap-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Switch Active Facebook Page:</Label>
              <select
                value={fbPageId}
                disabled={switchingPage || disconnecting}
                onChange={(e) => handleSwitchPage(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-hidden"
              >
                {availablePages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.has_instagram ? `(IG: @${p.instagram_username})` : ""}
                  </option>
                ))}
              </select>
              {switchingPage && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
          )}
        </CardContent>
      </Card>

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
                {fbPageName || (fbPageId ? `Page ID: ${fbPageId}` : "Not connected")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            {fbConnected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenDisconnect("facebook")}
                disabled={disconnecting}
                className="h-7 px-2.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                title="Disconnect Facebook Messenger"
              >
                Disconnect
              </Button>
            )}
          </div>
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
                {igUsername ? `@${igUsername}` : (igAccountId ? `ID: ${igAccountId}` : "Not connected")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            {igConnected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenDisconnect("instagram")}
                disabled={disconnecting}
                className="h-7 px-2.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                title="Disconnect Instagram Direct Messages"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fix Contact Names Card */}
      {(fbConnected || igConnected) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Contact Names Fix करें</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Agar inbox mein &ldquo;Facebook User&rdquo; / &ldquo;Instagram User&rdquo; dikh raha hai to yeh button dabayein — Meta API se asli naam fetch ho jayenge.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRepairContacts}
            disabled={repairingContacts}
            className="shrink-0 gap-2 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-600 text-amber-700 dark:text-amber-400"
          >
            {repairingContacts ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {repairingContacts ? "Fix ho raha hai..." : "Fix Contact Names"}
          </Button>
        </div>
      )}

      {/* Webhook Configuration Card */}
      <Card className="border-border bg-card shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Meta Webhook Configuration</CardTitle>
          </div>
          <CardDescription>
            Configure this Webhook Callback URL and Verify Token in your Meta Developer Portal under <strong>Messenger &gt; Webhooks</strong> and <strong>Instagram &gt; Webhooks</strong>.
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
              <Info className="h-3.5 w-3.5 text-primary" /> Required Webhook Subscription Fields in Meta Console:
            </div>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>Page (Messenger):</strong> Subscribe to <code>messages</code> and <code>messaging_postbacks</code></li>
              <li><strong>Instagram:</strong> Subscribe to <code>messages</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Manual Credentials Configuration */}
      <div className="pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowManualConfig(!showManualConfig)}
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
        >
          <span>Manual Configuration (Advanced)</span>
          {showManualConfig ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        {showManualConfig && (
          <div className="mt-3 space-y-4">
            {/* Facebook Messenger Settings Card */}
            <Card className="border-border bg-card shadow-2xs">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-foreground">
                  <MessengerIcon className="h-5 w-5 fill-[#0084FF]" />
                  <CardTitle className="text-base">Facebook Page Manual Connection</CardTitle>
                </div>
                <CardDescription>
                  Manually paste Facebook Page credentials if not using 1-Click Connect.
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
                    Encrypted securely in the database with AES-256-GCM.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Instagram Settings Card */}
            <Card className="border-border bg-card shadow-2xs">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-foreground">
                  <InstagramIcon className="h-5 w-5 fill-[#E1306C]" />
                  <CardTitle className="text-base">Instagram Professional Account Manual Connection</CardTitle>
                </div>
                <CardDescription>
                  Manually enter Instagram Business Account details.
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

            {/* Save Action for Manual Config */}
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
                  "Save Manual Settings"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Modal */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {disconnectTarget === "instagram"
                ? "Instagram Account Disconnect करें?"
                : disconnectTarget === "facebook"
                  ? "Facebook Page Disconnect करें?"
                  : "Social Channels Disconnect करें?"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              {disconnectTarget === "instagram"
                ? "Aapka Instagram Direct Messages CRM se unlink ho jayega aur customers ke naye DMs aana band ho jayenge. Kya aap disconnect karna chahte hain?"
                : disconnectTarget === "facebook"
                  ? "Facebook Page disconnect karne se Facebook Messenger aur linked Instagram dono disconnect ho jayenge kyunki Instagram Facebook Page token use karta hai. Kya aap aage badhna chahte hain?"
                  : "Facebook Messenger aur Instagram Direct Messages dono CRM se unlink ho jayenge aur customer messages aana band ho jayenge. Kya aap confirm karte hain?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDisconnect}
              disabled={disconnecting}
              className="gap-2 bg-destructive hover:bg-destructive/90 text-white"
            >
              {disconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Yes, Disconnect</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
