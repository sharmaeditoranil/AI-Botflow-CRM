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
  ShieldCheck,
  Lock,
  Tag,
  X,
  ArrowRight,
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

interface AppliedCoupon {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  description: string;
}

export function BillingPanel() {
  const [loading, setLoading] = useState(true);
  const [usageInfo, setUsageInfo] = useState<AccountUsageInfo | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
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

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      toast.error('Please enter a coupon code.');
      return;
    }

    try {
      setValidatingCoupon(true);
      const res = await fetch('/api/billing/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Invalid coupon code.');
        return;
      }

      setAppliedCoupon({
        code: data.code,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        description: data.description,
      });
      toast.success(`Coupon ${data.code} applied (${data.description})!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply coupon.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    toast.info('Coupon removed.');
  };

  const calculatePrice = (basePrice: number) => {
    if (!appliedCoupon) return basePrice;
    if (appliedCoupon.discount_type === 'percentage') {
      return Math.round(basePrice * (1 - appliedCoupon.discount_value / 100));
    }
    return Math.max(0, basePrice - appliedCoupon.discount_value);
  };

  const handleCheckout = async (planId: string) => {
    try {
      setUpgradingPlanId(planId);

      const res = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingCycle,
          couponCode: appliedCoupon?.code || couponCode.trim(),
        }),
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

  // Only display paid upgrade tiers in the 3-column pricing grid
  const paidPlans = plans.filter((p) => p.slug !== 'founder' && p.slug !== 'trial');

  const daysRemaining = subscription?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null;

  return (
    <section className="space-y-8">
      <SettingsPanelHead
        title="Subscription & Billing"
        description="Manage your Aibotflow subscription plan, usage limits, and invoices."
      />

      {/* Current Plan Overview Card */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                {currentPlan?.name || 'Free Trial'}
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  subscription?.status === 'active'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-medium'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400 font-medium'
                }
              >
                {subscription?.status === 'trialing' ? 'Free Trial' : subscription?.status || 'Active'}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {currentPlan?.description || 'Your current Aibotflow subscription plan.'}
            </CardDescription>
          </div>

          <Button
            onClick={() => setUpgradeModalOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm transition-all"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Upgrade Plan
          </Button>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {subscription?.trial_ends_at && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <span className="font-semibold text-amber-200">
                    {daysRemaining !== null && daysRemaining > 0
                      ? `${daysRemaining} days left in your Free Trial`
                      : 'Your Free Trial has expired'}
                  </span>
                  <span className="hidden sm:inline text-amber-300/80 ml-2">
                    (Ends on {new Date(subscription.trial_ends_at).toLocaleDateString()}).
                  </span>
                  <span className="block text-xs text-amber-300/80 mt-0.5">
                    Upgrade anytime to keep your broadcasts, WhatsApp numbers, and automated flows running without interruption.
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setUpgradeModalOpen(true)}
                className="shrink-0 bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
              >
                Upgrade Now
              </Button>
            </div>
          )}

          {/* Usage Meters */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Usage & Quotas</h4>
              <span className="text-xs text-muted-foreground">
                Quotas reset every billing cycle
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Contacts */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="h-4 w-4 text-primary" /> Contacts
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {(usage?.contacts || 0).toLocaleString()} / {(currentPlan?.max_contacts || 1000).toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{ width: `${getPercent(usage?.contacts || 0, currentPlan?.max_contacts || 1000)}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {getPercent(usage?.contacts || 0, currentPlan?.max_contacts || 1000)}% used
                </div>
              </div>

              {/* Monthly Broadcasts */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Radio className="h-4 w-4 text-primary" /> Monthly Broadcasts
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {(usage?.broadcasts_month || 0).toLocaleString()} / {(currentPlan?.max_broadcasts_monthly || 5000).toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{
                      width: `${getPercent(usage?.broadcasts_month || 0, currentPlan?.max_broadcasts_monthly || 5000)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {getPercent(usage?.broadcasts_month || 0, currentPlan?.max_broadcasts_monthly || 5000)}% used
                </div>
              </div>

              {/* Team Members */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="h-4 w-4 text-primary" /> Team Seats
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {usage?.team_members || 1} / {currentPlan?.max_team_members || 2}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{
                      width: `${getPercent(usage?.team_members || 1, currentPlan?.max_team_members || 2)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {getPercent(usage?.team_members || 1, currentPlan?.max_team_members || 2)}% seats occupied
                </div>
              </div>

              {/* Automations */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Zap className="h-4 w-4 text-primary" /> Automations & Flows
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {(usage?.automations || 0) + (usage?.flows || 0)} / {currentPlan?.max_automations || 5}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{
                      width: `${getPercent((usage?.automations || 0) + (usage?.flows || 0), currentPlan?.max_automations || 5)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {getPercent((usage?.automations || 0) + (usage?.flows || 0), currentPlan?.max_automations || 5)}% active
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison Section Directly on Billing Page */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              Available Subscription Plans
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Select the plan that fits your business scale. Upgrade or downgrade anytime with instant activation.
            </p>
          </div>

          {/* Billing Cycle Switcher */}
          <div className="flex items-center rounded-xl border border-border bg-muted/60 p-1 text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-lg px-4 py-1.5 font-medium transition-all ${
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
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-medium transition-all ${
                billingCycle === 'yearly'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly Billing
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* 3-Column Plan Grid */}
        <div className="grid gap-6 md:grid-cols-3 items-stretch">
          {paidPlans.map((p) => {
            const rawPrice = billingCycle === 'yearly' ? p.price_yearly : p.price_monthly;
            const displayPrice = calculatePrice(rawPrice);
            const isCurrent = currentPlan?.id === p.id;
            const isGrowth = p.slug === 'growth';

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-200 ${
                  isGrowth
                    ? 'border-primary bg-primary/[0.03] shadow-lg shadow-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card shadow-sm hover:border-border/80'
                }`}
              >
                <div>
                  {/* Fixed Header / Badge Slot */}
                  <div className="flex h-7 items-center justify-between">
                    {isGrowth ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                        <Sparkles className="h-3 w-3" /> Most Popular
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {p.slug === 'enterprise' ? 'Enterprise Volume' : 'Small Business'}
                      </span>
                    )}

                    {isCurrent && (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>

                  {/* Plan Name & Tagline */}
                  <div className="mt-3 min-h-[58px]">
                    <h3 className="text-xl font-bold tracking-tight text-foreground">{p.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {p.description}
                    </p>
                  </div>

                  {/* Pricing Box */}
                  <div className="my-5 rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground">
                        ₹{displayPrice.toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        /{billingCycle === 'yearly' ? 'year' : 'month'}
                      </span>
                      {appliedCoupon && (
                        <span className="ml-auto text-xs text-muted-foreground line-through">
                          ₹{rawPrice.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                    {billingCycle === 'yearly' ? (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span>Equiv. ₹{Math.round(displayPrice / 12).toLocaleString('en-IN')}/mo (2 Months Free)</span>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        Billed monthly, cancel anytime
                      </div>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3 text-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Features Included:
                    </div>
                    <ul className="space-y-2.5">
                      <li className="flex items-start gap-2.5 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>
                          <strong className="text-foreground">{p.max_contacts.toLocaleString('en-IN')}</strong> Contacts
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>
                          <strong className="text-foreground">{p.max_broadcasts_monthly.toLocaleString('en-IN')}</strong> Monthly Broadcasts
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>
                          <strong className="text-foreground">{p.max_team_members}</strong> Team Member Seats
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>
                          <strong className="text-foreground">{p.max_automations}</strong> Automations & Flows
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        {p.ai_agents_enabled ? (
                          <>
                            <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                            <span className="font-semibold text-foreground">
                              AI Chatbot & Knowledge Base
                            </span>
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                            <span className="text-muted-foreground/50 line-through">
                              AI Chatbot & Knowledge Base
                            </span>
                          </>
                        )}
                      </li>
                      <li className="flex items-start gap-2.5 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>
                          {p.slug === 'enterprise' ? (
                            <strong className="text-foreground">24/7 Dedicated Support & Custom API</strong>
                          ) : isGrowth ? (
                            <span>Priority Support & Social Integrations</span>
                          ) : (
                            <span>Standard WhatsApp Support</span>
                          )}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Card CTA */}
                <div className="mt-6 pt-4 border-t border-border/60">
                  <Button
                    onClick={() => handleCheckout(p.id)}
                    disabled={isCurrent || upgradingPlanId === p.id}
                    className={`w-full font-semibold shadow-sm transition-all ${
                      isGrowth
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
                        : isCurrent
                        ? 'bg-muted text-muted-foreground border border-border cursor-default'
                        : 'bg-card text-foreground border border-border hover:bg-muted'
                    }`}
                  >
                    {upgradingPlanId === p.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                      </span>
                    ) : isCurrent ? (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Current Plan
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        Upgrade to {p.name} <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Promo Code & Trust Footer on Page */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Tag className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">Have a Promo or Coupon Code?</div>
                <div className="text-xs text-muted-foreground">
                  {appliedCoupon
                    ? `Active Coupon: ${appliedCoupon.code} (${appliedCoupon.description}) applied to all plans above!`
                    : 'Enter your coupon code to unlock exclusive discounts on monthly and annual subscriptions.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {appliedCoupon ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveCoupon}
                  className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  Remove Coupon ({appliedCoupon.code})
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="e.g. LAUNCH50"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                    className="w-36 sm:w-48 text-xs uppercase bg-muted/40 border-border h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyCoupon}
                    disabled={validatingCoupon || !couponCode.trim()}
                    className="text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                  >
                    {validatingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply Code'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border/60 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>100% Safe & Secure Payment via <strong>Razorpay</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px]">
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">UPI</span>
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">Google Pay</span>
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">PhonePe</span>
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">Credit/Debit Cards</span>
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">NetBanking</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Instant Activation • Cancel Anytime</span>
            </div>
          </div>
        </div>
      </div>

      {/* Redesigned Upgrade Modal (Triggered via "Upgrade Plan" buttons) */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 border-border bg-card overflow-hidden shadow-2xl">
          {/* Modal Header */}
          <div className="p-6 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Upgrade Your Aibotflow Plan
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-muted-foreground">
                  Choose the right plan to scale your WhatsApp marketing, automated broadcasts, and AI chatbots.
                </DialogDescription>
              </div>

              {/* Billing Cycle Switcher */}
              <div className="flex items-center rounded-xl border border-border bg-muted/60 p-1 text-xs shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`rounded-lg px-3 py-1 font-medium transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium transition-all ${
                    billingCycle === 'yearly'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Yearly
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-400">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Body: Scrollable 3-Column Plan Grid */}
          <div className="overflow-y-auto p-6 space-y-6 flex-1">
            <div className="grid gap-5 md:grid-cols-3 items-stretch">
              {paidPlans.map((p) => {
                const rawPrice = billingCycle === 'yearly' ? p.price_yearly : p.price_monthly;
                const displayPrice = calculatePrice(rawPrice);
                const isCurrent = currentPlan?.id === p.id;
                const isGrowth = p.slug === 'growth';

                return (
                  <div
                    key={p.id}
                    className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                      isGrowth
                        ? 'border-primary bg-primary/[0.04] shadow-md shadow-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:border-border/80'
                    }`}
                  >
                    <div>
                      {/* Fixed Top Badge Slot to Align Titles */}
                      <div className="flex h-6 items-center justify-between">
                        {isGrowth ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/20">
                            <Sparkles className="h-3 w-3" /> Most Popular
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {p.slug === 'enterprise' ? 'High Volume' : 'Starter Tier'}
                          </span>
                        )}

                        {isCurrent && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px]">
                            Current Plan
                          </Badge>
                        )}
                      </div>

                      {/* Plan Name & Tagline */}
                      <div className="mt-2 min-h-[50px]">
                        <h3 className="text-lg font-bold tracking-tight text-foreground">{p.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {p.description}
                        </p>
                      </div>

                      {/* Pricing Box */}
                      <div className="my-4 rounded-xl border border-border/60 bg-muted/30 p-3.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-extrabold tracking-tight text-foreground">
                            ₹{displayPrice.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground">
                            /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                          </span>
                          {appliedCoupon && (
                            <span className="ml-auto text-xs text-muted-foreground line-through">
                              ₹{rawPrice.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        {billingCycle === 'yearly' ? (
                          <div className="mt-1 text-[10px] font-medium text-emerald-500">
                            Equiv. ₹{Math.round(displayPrice / 12).toLocaleString('en-IN')}/mo (2 Mos Free)
                          </div>
                        ) : (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Billed monthly, cancel anytime
                          </div>
                        )}
                      </div>

                      {/* Features List with Top-Aligned Checkmarks */}
                      <div className="space-y-2.5 text-xs">
                        <ul className="space-y-2">
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span>
                              <strong className="text-foreground">{p.max_contacts.toLocaleString('en-IN')}</strong> Contacts
                            </span>
                          </li>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span>
                              <strong className="text-foreground">{p.max_broadcasts_monthly.toLocaleString('en-IN')}</strong> Broadcasts/mo
                            </span>
                          </li>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span>
                              <strong className="text-foreground">{p.max_team_members}</strong> Team Members
                            </span>
                          </li>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span>
                              <strong className="text-foreground">{p.max_automations}</strong> Automations & Flows
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            {p.ai_agents_enabled ? (
                              <>
                                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                                <span className="font-semibold text-foreground">
                                  AI Chatbot & Knowledge Base
                                </span>
                              </>
                            ) : (
                              <>
                                <X className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                                <span className="text-muted-foreground/50 line-through">
                                  AI Chatbot
                                </span>
                              </>
                            )}
                          </li>
                          <li className="flex items-start gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span>
                              {p.slug === 'enterprise' ? (
                                <strong className="text-foreground">24/7 Dedicated Support</strong>
                              ) : isGrowth ? (
                                <span>Priority Meta Support</span>
                              ) : (
                                <span>Standard Support</span>
                              )}
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 pt-3 border-t border-border/60">
                      <Button
                        onClick={() => handleCheckout(p.id)}
                        disabled={isCurrent || upgradingPlanId === p.id}
                        className={`w-full text-xs font-semibold shadow-sm transition-all ${
                          isGrowth
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : isCurrent
                            ? 'bg-muted text-muted-foreground border border-border cursor-default'
                            : 'bg-card text-foreground border border-border hover:bg-muted'
                        }`}
                      >
                        {upgradingPlanId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isCurrent ? (
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Current Plan
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1">
                            Upgrade to {p.name} <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input in Modal */}
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <Tag className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">Have a Promo Code?</div>
                  <div className="text-muted-foreground text-[11px]">
                    {appliedCoupon
                      ? `Applied: ${appliedCoupon.code} (${appliedCoupon.description})`
                      : 'Apply coupon code before checkout for extra discount.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {appliedCoupon ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveCoupon}
                    className="text-xs text-destructive hover:bg-destructive/10 h-8"
                  >
                    Remove ({appliedCoupon.code})
                  </Button>
                ) : (
                  <>
                    <Input
                      placeholder="e.g. LAUNCH50"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      className="w-32 sm:w-40 text-xs uppercase bg-card border-border h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponCode.trim()}
                      className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {validatingCoupon ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modal Trust Footer */}
          <div className="p-4 px-6 bg-muted/20 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Secured by <strong>Razorpay</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5">UPI</span>
              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5">Google Pay</span>
              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5">PhonePe</span>
              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5">Cards</span>
              <span className="rounded border border-border/80 bg-background px-1.5 py-0.5">NetBanking</span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span>Instant Activation</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
