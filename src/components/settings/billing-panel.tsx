'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Zap,
  Users,
  Radio,
  FileText,
  Clock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SettingsPanelHead } from './settings-panel-head';
import type { AccountUsageInfo } from '@/lib/billing/limits';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function BillingPanel() {
  const [loading, setLoading] = useState(true);
  const [usageInfo, setUsageInfo] = useState<AccountUsageInfo | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [upgradingPlanId, setUpgradingPlanId] = useState<string | null>(null);

  const fetchUsageAndPlans = async () => {
    try {
      setLoading(true);
      const [usageRes, plansRes] = await Promise.all([
        fetch('/api/billing/usage'),
        fetch('/api/billing/plans'),
      ]);

      if (usageRes.ok) {
        const uData = await usageRes.json();
        setUsageInfo(uData);
      }

      if (plansRes.ok) {
        const pData = await plansRes.json();
        setPlans(pData.plans || []);
      }
    } catch (err) {
      console.error('Error loading billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageAndPlans();
    loadRazorpayScript();
  }, []);

  const loadRazorpayScript = () => {
    if (window.Razorpay) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  };

  const handleCheckout = async (planId: string) => {
    try {
      setUpgradingPlanId(planId);

      const res = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingCycle, couponCode: couponCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to initiate checkout.');
        return;
      }

      if (data.freeActivation) {
        toast.success(data.message || 'Plan activated!');
        setUpgradeModalOpen(false);
        fetchUsageAndPlans();
        return;
      }

      if (!window.Razorpay) {
        toast.error('Razorpay SDK failed to load. Please refresh the page.');
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Aibotflow',
        description: `Upgrade to ${data.planName} (${billingCycle})`,
        order_id: data.orderId,
        prefill: {
          email: data.userEmail || '',
        },
        theme: {
          color: '#7c3aed',
        },
        handler: async function (response: any) {
          toast.info('Verifying payment...');
          const verifyRes = await fetch('/api/billing/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId,
              billingCycle,
              amount: data.amount,
            }),
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.success) {
            toast.success('Payment verified and plan activated!');
            setUpgradeModalOpen(false);
            fetchUsageAndPlans();
          } else {
            toast.error(verifyData.error || 'Payment verification failed.');
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err.message || 'Error opening payment gateway.');
    } finally {
      setUpgradingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = usageInfo?.plan;
  const usage = usageInfo?.usage;
  const subscription = usageInfo?.subscription;

  const getPercent = (used: number, max: number) => {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  };

  return (
    <section className="space-y-6">
      <SettingsPanelHead
        title="Subscription & Billing"
        description="Manage your Aibotflow subscription plan, usage limits, and invoices."
      />

      {/* Current Plan Overview Card */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl text-foreground">
                {currentPlan?.name || 'Free Trial'}
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  subscription?.status === 'active'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                }
              >
                {subscription?.status === 'trialing' ? 'Free Trial' : subscription?.status || 'Active'}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-muted-foreground">
              {currentPlan?.description || 'Your current Aibotflow subscription plan.'}
            </CardDescription>
          </div>

          <Button
            onClick={() => setUpgradeModalOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Upgrade Plan
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {subscription?.trial_ends_at && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                Your free trial ends on{' '}
                <strong>{new Date(subscription.trial_ends_at).toLocaleDateString()}</strong>. Upgrade anytime to avoid interruptions.
              </span>
            </div>
          )}

          {/* Usage Meters */}
          <div>
            <h4 className="mb-4 text-sm font-semibold text-foreground">Usage & Quotas</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Contacts */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="h-4 w-4 text-primary" /> Contacts
                  </span>
                  <span className="text-muted-foreground">
                    {usage?.contacts || 0} / {currentPlan?.max_contacts || '1,000'}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${getPercent(usage?.contacts || 0, currentPlan?.max_contacts || 1000)}%` }}
                  />
                </div>
              </div>

              {/* Monthly Broadcasts */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Radio className="h-4 w-4 text-primary" /> Monthly Broadcasts
                  </span>
                  <span className="text-muted-foreground">
                    {usage?.broadcasts_month || 0} / {currentPlan?.max_broadcasts_monthly || '5,000'}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${getPercent(usage?.broadcasts_month || 0, currentPlan?.max_broadcasts_monthly || 5000)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Team Members */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="h-4 w-4 text-primary" /> Team Members
                  </span>
                  <span className="text-muted-foreground">
                    {usage?.team_members || 1} / {currentPlan?.max_team_members || 2}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${getPercent(usage?.team_members || 1, currentPlan?.max_team_members || 2)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Automations */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Zap className="h-4 w-4 text-primary" /> Automations & Flows
                  </span>
                  <span className="text-muted-foreground">
                    {(usage?.automations || 0) + (usage?.flows || 0)} / {currentPlan?.max_automations || 5}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${getPercent((usage?.automations || 0) + (usage?.flows || 0), currentPlan?.max_automations || 5)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Modal */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="max-w-4xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              Upgrade Your Aibotflow Plan
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose the right plan to scale your WhatsApp marketing and customer relationships.
            </DialogDescription>
          </DialogHeader>

          {/* Billing Cycle Toggle */}
          <div className="my-3 flex justify-center">
            <div className="flex items-center rounded-lg border border-border bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yearly Billing
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-400">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const price = billingCycle === 'yearly' ? p.price_yearly : p.price_monthly;
              const isCurrent = currentPlan?.id === p.id;

              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-between rounded-xl border p-5 ${
                    p.slug === 'growth'
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border bg-card'
                  }`}
                >
                  <div>
                    {p.slug === 'growth' && (
                      <span className="mb-2 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                        Most Popular
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>

                    <div className="my-4">
                      <span className="text-2xl font-extrabold text-foreground">₹{price}</span>
                      <span className="text-xs text-muted-foreground">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>

                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        <span>Up to {p.max_contacts.toLocaleString()} Contacts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        <span>{p.max_broadcasts_monthly.toLocaleString()} Monthly Broadcasts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        <span>{p.max_team_members} Team Members</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        <span>{p.max_automations} Automations & Flows</span>
                      </li>
                      {p.ai_agents_enabled && (
                        <li className="flex items-center gap-2 font-medium text-foreground">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>AI Chatbot & Knowledge Base</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="mt-6">
                    <Button
                      onClick={() => handleCheckout(p.id)}
                      disabled={isCurrent || upgradingPlanId === p.id}
                      className={`w-full text-xs ${
                        p.slug === 'growth'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-muted/80'
                      }`}
                    >
                      {upgradingPlanId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isCurrent ? (
                        'Current Plan'
                      ) : (
                        `Upgrade to ${p.name}`
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coupon Input */}
          <div className="mt-2 flex items-center gap-2">
            <Input
              placeholder="Have a promo code? (e.g. LAUNCH50)"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="max-w-xs border-border bg-muted text-xs"
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
