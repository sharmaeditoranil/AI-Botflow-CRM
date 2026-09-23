'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CreditCard, Edit2, Check, Loader2, Users, Radio, Zap, Wallet, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
}

export default function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
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

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    try {
      setSaving(true);
      const res = await fetch('/api/super-admin/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPlan),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Plan updated successfully!');
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
          <h2 className="text-lg font-bold text-foreground">Subscription Tiers & Quotas</h2>
          <p className="text-xs text-muted-foreground">
            Configure plan prices, maximum contact quotas, and broadcast sending allowances.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.id} className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-foreground">{p.name}</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingPlan({ ...p })}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CardDescription className="text-xs">{p.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-foreground">₹{p.price_monthly}</span>
                <span className="text-xs text-muted-foreground">/mo (₹{p.price_yearly}/yr)</span>
              </div>

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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Plan Dialog */}
      {editingPlan && (
        <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">
                Edit {editingPlan.name} Plan
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Update limits and pricing for this tier.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Monthly Price (₹)</Label>
                  <Input
                    type="number"
                    value={editingPlan.price_monthly}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, price_monthly: Number(e.target.value) })
                    }
                    className="border-border bg-muted"
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
                    className="border-border bg-muted"
                  />
                </div>
              </div>

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

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
