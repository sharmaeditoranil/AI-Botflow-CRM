'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Settings,
  Save,
  Loader2,
  PlugZap,
  CreditCard,
  Mail,
  ShieldCheck,
  AlertCircle,
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SuperAdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    meta_app_id: '',
    meta_app_secret: '',
    meta_config_id: '',
    razorpay_key_id: '',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',
    google_client_id: '',
    google_client_secret: '',
    admin_openai_api_key: '',
    admin_gemini_api_key: '',
    admin_ai_model: 'gpt-4o-mini',
    support_email: 'support@aibotflow.in',
    support_phone: '',
  });

  useEffect(() => {
    fetch('/api/super-admin/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.settings) {
          setForm({
            meta_app_id: data.settings.meta_app_id || '',
            meta_app_secret: data.settings.meta_app_secret || '',
            meta_config_id: data.settings.meta_config_id || '',
            razorpay_key_id: data.settings.razorpay_key_id || '',
            razorpay_key_secret: data.settings.razorpay_key_secret || '',
            razorpay_webhook_secret: data.settings.razorpay_webhook_secret || '',
            google_client_id: data.settings.google_client_id || '',
            google_client_secret: data.settings.google_client_secret || '',
            admin_openai_api_key: data.settings.admin_openai_api_key || '',
            admin_gemini_api_key: data.settings.admin_gemini_api_key || '',
            admin_ai_model: data.settings.admin_ai_model || 'gpt-4o-mini',
            support_email: data.settings.support_email || 'support@aibotflow.in',
            support_phone: data.settings.support_phone || '',
          });
        }
      })
      .catch((err) => console.error('Error fetching settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch('/api/super-admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Operational credentials saved successfully!');
      } else {
        toast.error(data.error || 'Failed to save settings.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Meta Tech Provider Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-[#1877F2]" />
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Meta Tech Provider (Embedded Signup)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Credentials from your Meta Developer App used to allow customers to 1-click connect their WABA on{' '}
                <strong>https://dash.aibotflow.in</strong>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Meta App ID</Label>
              <Input
                placeholder="e.g. 123456789012345"
                value={form.meta_app_id}
                onChange={(e) => setForm({ ...form, meta_app_id: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Meta App Secret</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={form.meta_app_secret}
                onChange={(e) => setForm({ ...form, meta_app_secret: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Embedded Signup Config ID</Label>
              <Input
                placeholder="e.g. 987654321098765"
                value={form.meta_config_id}
                onChange={(e) => setForm({ ...form, meta_config_id: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <strong>Webhook URL for Meta App:</strong>{' '}
            <code className="text-primary font-semibold">https://dash.aibotflow.in/api/whatsapp/webhook</code>
          </div>
        </CardContent>
      </Card>

      {/* Razorpay Gateway Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-400" />
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Razorpay Payment Gateway
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Live / Test API keys from Razorpay Dashboard (Settings ➔ API Keys).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Razorpay Key ID</Label>
              <Input
                placeholder="rzp_live_... or rzp_test_..."
                value={form.razorpay_key_id}
                onChange={(e) => setForm({ ...form, razorpay_key_id: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Razorpay Key Secret</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={form.razorpay_key_secret}
                onChange={(e) => setForm({ ...form, razorpay_key_secret: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Razorpay Webhook Secret</Label>
              <Input
                type="password"
                placeholder="Webhook secret for signature"
                value={form.razorpay_webhook_secret}
                onChange={(e) => setForm({ ...form, razorpay_webhook_secret: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <strong>Webhook URL for Razorpay:</strong>{' '}
            <code className="text-primary font-semibold">https://dash.aibotflow.in/api/webhooks/razorpay</code>
          </div>
        </CardContent>
      </Card>

      {/* Google Cloud API & Business Profile (GMB) Credentials */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <span className="font-bold text-xs">G</span>
            </div>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Google Business Profile (GMB) OAuth API
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                OAuth 2.0 Web Application credentials from Google Cloud Console used for 1-click Google Business Profile connect.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Google Client ID</Label>
              <Input
                placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                value={form.google_client_id}
                onChange={(e) => setForm({ ...form, google_client_id: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Google Client Secret</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={form.google_client_secret}
                onChange={(e) => setForm({ ...form, google_client_secret: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
            <p>
              <strong>Authorized Redirect URI for Google Console:</strong>{' '}
              <code className="text-primary font-semibold">https://dash.aibotflow.in/api/google/oauth/callback</code>
            </p>
            <p className="text-[10px] text-muted-foreground/80">
              Enable &quot;My Business Account Management API&quot; &amp; &quot;My Business Business Information API&quot; in your Google Cloud project.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Platform Master AI Model Settings */}
      <Card className="border-purple-500/40 bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Platform Master AI Model Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Yeh Master AI key platform ke sabhi features (Smart CRM AI Follow-up, Lead Scoring, Review Generator, Composer Drafts) me use hoti hai. End-users ko in features ke liye apna key dene ki zaroorat nahi hai (User apna key sirf WhatsApp live chat auto-reply bot ke liye dega).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Master OpenAI API Key</Label>
              <Input
                type="password"
                placeholder="sk-proj-..."
                value={form.admin_openai_api_key}
                onChange={(e) => setForm({ ...form, admin_openai_api_key: e.target.value })}
                className="border-border bg-muted font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Defaults to server OPENAI_API_KEY environment variable if empty.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Master Google Gemini API Key</Label>
              <Input
                type="password"
                placeholder="AQ.Ab8..."
                value={form.admin_gemini_api_key}
                onChange={(e) => setForm({ ...form, admin_gemini_api_key: e.target.value })}
                className="border-border bg-muted font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Defaults to server GEMINI_API_KEY environment variable if empty.
              </p>
            </div>
          </div>
          <div className="space-y-1 sm:w-1/2">
            <Label className="text-muted-foreground">Preferred Default Model</Label>
            <Input
              placeholder="gpt-4o-mini"
              value={form.admin_ai_model}
              onChange={(e) => setForm({ ...form, admin_ai_model: e.target.value })}
              className="border-border bg-muted text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Operational Support Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Support & Contact Details
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Customer support contact channels displayed in invoices and system notices.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Support Email</Label>
              <Input
                placeholder="support@aibotflow.in"
                value={form.support_email}
                onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Support Phone / WhatsApp</Label>
              <Input
                placeholder="+91..."
                value={form.support_phone}
                onChange={(e) => setForm({ ...form, support_phone: e.target.value })}
                className="border-border bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Save Operational Settings
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
