'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  Edit2,
  Check,
  X,
  Loader2,
  Users,
  Radio,
  Zap,
  Wallet,
  Save,
  Sparkles,
  MessageCircle,
  QrCode,
  Globe,
  Bot,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import { InstagramIcon } from '@/components/icons/social-icons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { PlanFeaturesConfig } from '@/lib/billing/plan-features';
import { DEFAULT_PLAN_FEATURES } from '@/lib/billing/plan-features';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_contacts: number;
  max_team_members: number;
  max_broadcasts_monthly: number;
  max_automations: number;
  is_active: boolean;
  features?: PlanFeaturesConfig;
}

export default function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [featuresConfig, setFeaturesConfig] = useState<Record<string, PlanFeaturesConfig>>(DEFAULT_PLAN_FEATURES);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<PlanFeaturesConfig>(DEFAULT_PLAN_FEATURES.starter);
  const [saving, setSaving] = useState(false);

  // WhatsApp Per-Message Rates State
  const [walletRates, setWalletRates] = useState({
    wallet_system_enabled: true,
    wallet_rate_marketing: 0.85,
    wallet_rate_utility: 0.15,
    wallet_rate_service: 0.35,
    wallet_rate_auth: 0.15,
  });
  const [savingRates, setSavingRates] = useState(false);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const [plansRes, settingsRes] = await Promise.all([
        fetch('/api/super-admin/plans'),
        fetch('/api/super-admin/settings'),
      ]);

      const data = await plansRes.json();
      if (plansRes.ok && data.plans) {
        setPlans(data.plans);
        if (data.featuresConfig) {
          setFeaturesConfig(data.featuresConfig);
        }
      } else {
        toast.error(data.error || 'Failed to fetch plans.');
      }

      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (sData.settings) {
          setWalletRates({
            wallet_system_enabled: sData.settings.wallet_system_enabled !== false,
            wallet_rate_marketing: Number(sData.settings.wallet_rate_marketing ?? 0.85),
            wallet_rate_utility: Number(sData.settings.wallet_rate_utility ?? 0.15),
            wallet_rate_service: Number(sData.settings.wallet_rate_service ?? 0.35),
            wallet_rate_auth: Number(sData.settings.wallet_rate_auth ?? 0.15),
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error loading plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openEditModal = (p: Plan) => {
    setEditingPlan({ ...p });
    const resolved =
      p.features ||
      featuresConfig[p.slug] ||
      DEFAULT_PLAN_FEATURES[p.slug] ||
      DEFAULT_PLAN_FEATURES.starter;
    setEditingFeatures({ ...resolved });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    try {
      setSaving(true);
      const [planRes, featRes] = await Promise.all([
        fetch('/api/super-admin/plans', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...editingPlan,
            ai_agents_enabled: editingFeatures.ai_agents_enabled,
          }),
        }),
        fetch('/api/super-admin/plans/features', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planSlug: editingPlan.slug,
            updates: editingFeatures,
          }),
        }),
      ]);

      const data = await planRes.json();
      if (planRes.ok && data.success) {
        toast.success(`Plan "${editingPlan.name}" & Features updated successfully!`);
        setEditingPlan(null);
        fetchPlans();
      } else {
        toast.error(data.error || 'Failed to update plan.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWalletRates = async () => {
    try {
      setSavingRates(true);
      const res = await fetch('/api/super-admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(walletRates),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('WhatsApp per-message credit rates saved successfully!');
      } else {
        toast.error(data.error || 'Failed to save rates.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving rates.');
    } finally {
      setSavingRates(false);
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
    <div className="space-y-6">
      {/* WhatsApp Per-Message Credit Rates Card */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                <Wallet className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Prepaid WhatsApp Per-Message Credit Pricing
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Customers pay these per-message rates from their CRM wallet balance when sending messages.
                </CardDescription>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleSaveWalletRates}
              disabled={savingRates}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-sm gap-1.5 self-start sm:self-auto"
            >
              {savingRates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Message Rates
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-[11px] font-semibold">Marketing (₹ / msg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={walletRates.wallet_rate_marketing}
                onChange={(e) => setWalletRates({ ...walletRates, wallet_rate_marketing: Number(e.target.value) })}
                className="border-border bg-muted font-bold text-foreground h-9 text-sm"
              />
              <span className="text-[10px] text-muted-foreground block">Meta Base ~₹0.78 + Margin</span>
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground text-[11px] font-semibold">Utility / Orders (₹ / msg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={walletRates.wallet_rate_utility}
                onChange={(e) => setWalletRates({ ...walletRates, wallet_rate_utility: Number(e.target.value) })}
                className="border-border bg-muted font-bold text-foreground h-9 text-sm"
              />
              <span className="text-[10px] text-muted-foreground block">Meta Base ~₹0.12 + Margin</span>
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground text-[11px] font-semibold">Auth / OTP (₹ / msg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={walletRates.wallet_rate_auth}
                onChange={(e) => setWalletRates({ ...walletRates, wallet_rate_auth: Number(e.target.value) })}
                className="border-border bg-muted font-bold text-foreground h-9 text-sm"
              />
              <span className="text-[10px] text-muted-foreground block">Meta Base ~₹0.12 + Margin</span>
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground text-[11px] font-semibold">Service Chat (₹ / msg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={walletRates.wallet_rate_service}
                onChange={(e) => setWalletRates({ ...walletRates, wallet_rate_service: Number(e.target.value) })}
                className="border-border bg-muted font-bold text-foreground h-9 text-sm"
              />
              <span className="text-[10px] text-muted-foreground block">24hr customer chat window</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Subscription Tiers, Quotas & Feature Toggles</h2>
          <p className="text-xs text-muted-foreground">
            Configure plan prices, maximum contact quotas, and toggle features (WhatsApp, Instagram, AI Agents, GMB) ON or OFF.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const planFeat = p.features || featuresConfig[p.slug] || DEFAULT_PLAN_FEATURES[p.slug] || DEFAULT_PLAN_FEATURES.starter;

          return (
            <Card key={p.id} className="border-border bg-card flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-foreground">{p.name}</CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditModal(p)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <CardDescription className="text-xs line-clamp-2">{p.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pb-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-foreground">₹{p.price_monthly}</span>
                    <span className="text-xs text-muted-foreground">/mo (₹{p.price_yearly}/yr)</span>
                  </div>

                  {/* Quotas */}
                  <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-primary" /> Contacts
                      </span>
                      <span className="font-semibold text-foreground">{p.max_contacts.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Radio className="h-3.5 w-3.5 text-primary" /> Monthly Broadcasts
                      </span>
                      <span className="font-semibold text-foreground">{p.max_broadcasts_monthly.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-primary" /> Team Members
                      </span>
                      <span className="font-semibold text-foreground">{p.max_team_members}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5 text-primary" /> Automations
                      </span>
                      <span className="font-semibold text-foreground">{p.max_automations}</span>
                    </div>
                  </div>

                  {/* Feature Status Badges (ON / OFF) */}
                  <div className="space-y-1.5 border-t border-border pt-3 text-[11px]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Channel & Feature Status:
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {planFeat.whatsapp_enabled ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                          <Check className="h-3 w-3" /> WhatsApp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/50 border border-border line-through">
                          <X className="h-3 w-3" /> WhatsApp
                        </span>
                      )}

                      {planFeat.instagram_fb_enabled ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                          <Check className="h-3 w-3" /> Instagram & FB
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/50 border border-border line-through">
                          <X className="h-3 w-3" /> Instagram & FB
                        </span>
                      )}

                      {planFeat.ai_agents_enabled ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                          <Check className="h-3 w-3" /> AI Agents
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/50 border border-border line-through">
                          <X className="h-3 w-3" /> AI Agents
                        </span>
                      )}

                      {planFeat.gmb_ai_suite ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                          <Check className="h-3 w-3" /> Full GMB Suite
                        </span>
                      ) : planFeat.gmb_magic_qr ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                          <Check className="h-3 w-3" /> GMB QR
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/50 border border-border line-through">
                          <X className="h-3 w-3" /> GMB
                        </span>
                      )}

                      {planFeat.webhooks_api_enabled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                          <Check className="h-3 w-3" /> REST API
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Action Button at bottom */}
              <div className="p-4 pt-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(p)}
                  className="w-full text-xs font-semibold gap-1.5 border-border hover:bg-muted"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Configure Plan & Features
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Comprehensive Edit Plan & Feature Toggles Dialog */}
      {editingPlan && (
        <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
          <DialogContent className="border-border bg-card max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Edit {editingPlan.name} Plan & Features
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set prices, limits, and toggle specific features (WhatsApp, Instagram, AI Agents, GMB) ON or OFF.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs pt-1">
              {/* Description */}
              <div className="space-y-1">
                <Label className="text-muted-foreground">Plan Description</Label>
                <Input
                  type="text"
                  value={editingPlan.description || ''}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, description: e.target.value })
                  }
                  placeholder="e.g. Omnichannel CRM (WhatsApp, Instagram, FB) + AI Agents & Full GMB Suite"
                  className="border-border bg-muted"
                />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Monthly Price (₹)</Label>
                  <Input
                    type="number"
                    value={editingPlan.price_monthly}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, price_monthly: Number(e.target.value) })
                    }
                    className="border-border bg-muted font-bold text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Yearly Price (₹)</Label>
                  <Input
                    type="number"
                    value={editingPlan.price_yearly}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, price_yearly: Number(e.target.value) })
                    }
                    className="border-border bg-muted font-bold text-foreground"
                  />
                </div>
              </div>

              {/* Contacts & Broadcasts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Max Contacts</Label>
                  <Input
                    type="number"
                    value={editingPlan.max_contacts}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_contacts: Number(e.target.value) })
                    }
                    className="border-border bg-muted"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Max Monthly Broadcasts</Label>
                  <Input
                    type="number"
                    value={editingPlan.max_broadcasts_monthly}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        max_broadcasts_monthly: Number(e.target.value),
                      })
                    }
                    className="border-border bg-muted"
                  />
                </div>
              </div>

              {/* Seats & Automations */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Max Team Members</Label>
                  <Input
                    type="number"
                    value={editingPlan.max_team_members}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        max_team_members: Number(e.target.value),
                      })
                    }
                    className="border-border bg-muted"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Max Automations</Label>
                  <Input
                    type="number"
                    value={editingPlan.max_automations}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        max_automations: Number(e.target.value),
                      })
                    }
                    className="border-border bg-muted"
                  />
                </div>
              </div>

              {/* Feature Toggles (ON / OFF Switches) */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Feature Access & Capabilities (Turn ON / OFF)
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Toggle specific channels and superpowers on or off for this plan.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* WhatsApp Cloud API */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp Cloud API
                      </span>
                      <span className="text-[10px] text-muted-foreground block">Team Shared Inbox</span>
                    </div>
                    <Switch
                      checked={editingFeatures.whatsapp_enabled}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, whatsapp_enabled: checked })}
                    />
                  </div>

                  {/* Instagram & Facebook CRM */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <InstagramIcon className="h-3.5 w-3.5 fill-purple-400" /> Instagram & FB CRM
                      </span>
                      <span className="text-[10px] text-muted-foreground block">Instagram DM & Messenger</span>
                    </div>
                    <Switch
                      checked={editingFeatures.instagram_fb_enabled}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, instagram_fb_enabled: checked })}
                    />
                  </div>

                  {/* GMB Magic QR */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <QrCode className="h-3.5 w-3.5 text-blue-400" /> GMB Magic QR
                      </span>
                      <span className="text-[10px] text-muted-foreground block">Google Reviews Booster</span>
                    </div>
                    <Switch
                      checked={editingFeatures.gmb_magic_qr}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, gmb_magic_qr: checked })}
                    />
                  </div>

                  {/* Full GMB AI Suite */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-amber-400" /> Full GMB AI Suite
                      </span>
                      <span className="text-[10px] text-muted-foreground block">AI Auto-Reply & Posts</span>
                    </div>
                    <Switch
                      checked={editingFeatures.gmb_ai_suite}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, gmb_ai_suite: checked })}
                    />
                  </div>

                  {/* Autonomous AI Agents */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-indigo-400" /> Autonomous AI Agents
                      </span>
                      <span className="text-[10px] text-muted-foreground block">OpenAI / Gemini Bot</span>
                    </div>
                    <Switch
                      checked={editingFeatures.ai_agents_enabled}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, ai_agents_enabled: checked })}
                    />
                  </div>

                  {/* Chatbot Flows & Automations */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-400" /> Flows & Automations
                      </span>
                      <span className="text-[10px] text-muted-foreground block">Visual canvas builder</span>
                    </div>
                    <Switch
                      checked={editingFeatures.automations_enabled}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, automations_enabled: checked })}
                    />
                  </div>

                  {/* Developer Webhooks & API */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20 sm:col-span-2">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Share2 className="h-3.5 w-3.5 text-cyan-400" /> Developer Webhooks & REST API
                      </span>
                      <span className="text-[10px] text-muted-foreground block">API Keys, Inbound & Outbound Webhooks</span>
                    </div>
                    <Switch
                      checked={editingFeatures.webhooks_api_enabled}
                      onCheckedChange={(checked) => setEditingFeatures({ ...editingFeatures, webhooks_api_enabled: checked })}
                    />
                  </div>
                </div>

                {/* Additional Settings: Max GMB Locations & Support Level */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-[11px]">Max GMB Locations Allowed</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editingFeatures.gmb_locations_limit || 1}
                      onChange={(e) => setEditingFeatures({ ...editingFeatures, gmb_locations_limit: Math.max(1, Number(e.target.value)) })}
                      className="border-border bg-muted h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-[11px]">Support Level Label</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Priority WhatsApp & Email Support"
                      value={editingFeatures.support_level || ''}
                      onChange={(e) => setEditingFeatures({ ...editingFeatures, support_level: e.target.value })}
                      className="border-border bg-muted h-8"
                    />
                  </div>
                </div>
              </div>

              {/* Form Footer */}
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground font-semibold">
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save Plan & Features
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
