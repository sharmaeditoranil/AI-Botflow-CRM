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
  Wallet,
  ArrowUpRight,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import type { AccountUsageInfo } from '@/lib/billing/limits';
import { BrandLogo } from '@/components/brand/brand-logo';
import { GstInvoiceModal, type InvoiceRecord } from './gst-invoice-modal';
import { WalletTopupModal } from '@/components/wallet/wallet-topup-modal';

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
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [accountDetails, setAccountDetails] = useState<any>({});
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [upgradingPlanId, setUpgradingPlanId] = useState<string | null>(null);

  // GST & Business details for invoicing
  const [businessName, setBusinessName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingState, setBillingState] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [gstModalOpen, setGstModalOpen] = useState(false);

  const [walletData, setWalletData] = useState<{
    wallet: { balance: number; currency: string; is_active: boolean };
    rates: { marketing: number; utility: number; service: number; auth: number; enabled: boolean };
    transactions: any[];
  } | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Dedicated Subscription Checkout Modal with GST Option
  const [checkoutPlan, setCheckoutPlan] = useState<any | null>(null);
  const [showSubscriptionGst, setShowSubscriptionGst] = useState(false);

  // Cancel Subscription Dialog State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);

  const handleCancelSubscription = async () => {
    try {
      setCancellingSubscription(true);
      const res = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to cancel subscription.');
        return;
      }
      toast.success(data.message || 'Subscription cancelled successfully.');
      setCancelModalOpen(false);
      fetchUsageAndPlans();
    } catch (err: any) {
      toast.error(err.message || 'Error cancelling subscription.');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const fetchUsageAndPlans = async () => {
    try {
      setLoading(true);
      const [usageRes, plansRes, invoicesRes, walletRes] = await Promise.all([
        fetch('/api/billing/usage'),
        fetch('/api/billing/plans'),
        fetch('/api/billing/invoices'),
        fetch('/api/wallet'),
      ]);

      if (usageRes.ok) {
        const uData = await usageRes.json();
        setUsageInfo(uData);
      }

      if (plansRes.ok) {
        const pData = await plansRes.json();
        setPlans(pData.plans || []);
      }

      if (invoicesRes.ok) {
        const iData = await invoicesRes.json();
        setInvoices(iData.invoices || []);
        if (iData.account) {
          setAccountDetails(iData.account);
          if (iData.account.business_name) setBusinessName(iData.account.business_name);
          if (iData.account.gst_number) {
            setGstNumber(iData.account.gst_number);
            setShowSubscriptionGst(true);
          }
          if (iData.account.billing_address) setBillingAddress(iData.account.billing_address);
          if (iData.account.billing_state) setBillingState(iData.account.billing_state);
        }
      }

      if (walletRes.ok) {
        const wData = await walletRes.json();
        setWalletData(wData);
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
          businessName: businessName.trim(),
          gstNumber: gstNumber.trim().toUpperCase(),
          billingAddress: billingAddress.trim(),
          billingState: billingState.trim(),
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
        setCheckoutPlan(null);
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
        description: `Upgrade to ${data.planName} (${billingCycle}) + 18% GST`,
        order_id: data.orderId,
        prefill: {
          email: data.userEmail || '',
        },
        notes: {
          gstNumber: gstNumber.trim().toUpperCase(),
          businessName: businessName.trim(),
        },
        theme: {
          color: '#7c3aed',
        },
        modal: {
          ondismiss: function () {
            setUpgradingPlanId(null);
          },
        },
        handler: async function (response: any) {
          toast.info('Verifying payment and generating GST invoice...');
          try {
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
                taxableAmount: data.taxableAmount,
                gstAmount: data.gstAmount,
                gstRate: 18,
                businessName: businessName.trim(),
                gstNumber: gstNumber.trim().toUpperCase(),
                billingAddress: billingAddress.trim(),
                billingState: billingState.trim(),
                couponCode: appliedCoupon?.code || couponCode.trim(),
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              toast.success(`Payment verified! GST Invoice ${verifyData.invoiceNumber || ''} generated.`);
              setUpgradeModalOpen(false);
              setCheckoutPlan(null);
              fetchUsageAndPlans();
            } else {
              toast.error(verifyData.error || 'Payment verification failed.');
            }
          } catch (verifyErr: any) {
            toast.error(verifyErr.message || 'Payment verification network error.');
          } finally {
            setUpgradingPlanId(null);
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

          <div className="flex items-center gap-2">
            {subscription?.status === 'active' && currentPlan?.slug !== 'trial' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelModalOpen(true)}
                className="text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
              >
                Cancel Subscription
              </Button>
            )}

            <Button
              onClick={() => setUpgradeModalOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm transition-all"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Button>
          </div>
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

      {/* Prepaid WhatsApp Wallet & Credits Section */}
      <Card className="border-border/80 bg-card shadow-sm overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500 ring-1 ring-emerald-500/30 shrink-0">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold tracking-tight text-foreground">
                    Prepaid WhatsApp Credits & Wallet
                  </h3>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold">
                    Instant UPI
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No Meta card needed! Recharge with UPI/Razorpay and credits are automatically deducted per message.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block">
                  Available Balance
                </span>
                <span className="text-xl font-bold text-emerald-500 tabular-nums">
                  ₹{Number(walletData?.wallet?.balance || 0).toFixed(2)}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setWalletModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-sm gap-1.5"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                Add Money
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-5 space-y-5">
          {/* Rate Cards */}
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Standard Per-Message Rates
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <span className="text-muted-foreground block text-[11px]">Marketing Template</span>
                <span className="text-base font-bold text-foreground">
                  ₹{Number(walletData?.rates?.marketing ?? 0.85).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">per broadcast message</span>
              </div>
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <span className="text-muted-foreground block text-[11px]">Utility / Orders</span>
                <span className="text-base font-bold text-foreground">
                  ₹{Number(walletData?.rates?.utility ?? 0.15).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">order updates & alerts</span>
              </div>
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <span className="text-muted-foreground block text-[11px]">Authentication / OTP</span>
                <span className="text-base font-bold text-foreground">
                  ₹{Number(walletData?.rates?.auth ?? 0.15).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">security verification codes</span>
              </div>
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <span className="text-muted-foreground block text-[11px]">Service / Live Chat</span>
                <span className="text-base font-bold text-foreground">
                  ₹{Number(walletData?.rates?.service ?? 0.35).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">within 24hr support window</span>
              </div>
            </div>
          </div>

          {/* Transactions Passbook */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Credit Activity & Passbook
              </span>
              <span className="text-[11px] text-muted-foreground">
                Last {walletData?.transactions?.length || 0} transactions
              </span>
            </div>

            {(!walletData?.transactions || walletData.transactions.length === 0) ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No wallet transactions yet. Click <strong>&quot;Add Money&quot;</strong> to top-up your credits.
              </div>
            ) : (
              <div className="rounded-xl border border-border/80 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground text-left">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-center">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-right">Balance After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {walletData.transactions.map((tx: any) => {
                      const isCredit = tx.type === 'credit';
                      return (
                        <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-foreground">
                            {tx.description}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold uppercase ${
                                isCredit
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}
                            >
                              {tx.type}
                            </Badge>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                            isCredit ? 'text-emerald-500' : 'text-foreground'
                          }`}>
                            {isCredit ? '+' : '-'}₹{Number(tx.amount).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap font-medium">
                            ₹{Number(tx.balance_after).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                    {/* 18% GST indicator */}
                    <div className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>+18% GST: <strong className="text-foreground">₹{Math.round(displayPrice * 0.18).toLocaleString('en-IN')}</strong></span>
                      <span className="font-bold text-foreground">Total: ₹{(displayPrice + Math.round(displayPrice * 0.18)).toLocaleString('en-IN')}</span>
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
                    onClick={() => setCheckoutPlan(p)}
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

        {/* Payment History & GST Tax Invoices Section */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Payment History & GST Invoices
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review all your past subscription payments and download official GST tax invoices with 18% GST breakdown.
              </p>
            </div>
            {accountDetails.gst_number && (
              <div className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <span className="font-semibold">Registered GSTIN:</span>
                <span className="font-mono font-bold">{accountDetails.gst_number}</span>
              </div>
            )}
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No past payments recorded yet. Your invoices will appear here immediately after subscribing.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground font-semibold uppercase text-[11px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Plan / Description</th>
                    <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                    <th className="py-2.5 px-3 text-right">18% GST (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Paid (₹)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoices.map((inv) => {
                    const invTotal = Number(inv.amount) || 0;
                    const invTaxable = inv.taxable_amount ? Number(inv.taxable_amount) : Math.round((invTotal / 1.18) * 100) / 100;
                    const invGst = inv.gst_amount ? Number(inv.gst_amount) : Math.round((invTotal - invTaxable) * 100) / 100;
                    const invNum = inv.invoice_number || `INV-${inv.id.slice(0, 8).toUpperCase()}`;

                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-foreground whitespace-nowrap">
                          {invNum}
                        </td>
                        <td className="py-3 px-3 font-medium text-foreground">
                          {inv.subscription?.plan?.name || 'Aibotflow Plan'}
                          <span className="text-[10px] text-muted-foreground ml-1.5 capitalize">
                            ({inv.subscription?.billing_cycle || 'monthly'})
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-muted-foreground font-medium whitespace-nowrap">
                          ₹{invTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-500 font-medium whitespace-nowrap">
                          +₹{invGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-foreground whitespace-nowrap">
                          ₹{invTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] uppercase font-bold">
                            {inv.status || 'PAID'}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setGstModalOpen(true);
                            }}
                            className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <FileText className="h-3 w-3" />
                            GST Invoice
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Redesigned Upgrade Modal (Triggered via "Upgrade Plan" buttons) */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent
          style={{ width: 'min(96vw, 1180px)', maxWidth: 'min(96vw, 1180px)' }}
          className="max-h-[92vh] flex flex-col p-0 border-border bg-card overflow-hidden shadow-2xl"
        >
          {/* Modal Header */}
          <div className="p-6 pb-5 border-b border-border/60 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                  <BrandLogo size={38} variant="glow" priority />
                  Upgrade Your Aibotflow Plan
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                  Choose the right plan to scale your WhatsApp marketing, automated broadcasts, and AI chatbots.
                </DialogDescription>
              </div>

              {/* Billing Cycle Switcher */}
              <div className="flex items-center rounded-xl border border-border bg-muted/70 p-1 text-xs shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`rounded-lg px-4 py-2 font-medium transition-all ${
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
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-medium transition-all ${
                    billingCycle === 'yearly'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Yearly Billing
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Body: Scrollable 3-Column Plan Grid */}
          <div className="overflow-y-auto p-6 md:p-8 space-y-6 flex-1">
            <div className="grid gap-6 grid-cols-1 md:grid-cols-3 items-stretch">
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
                        ? 'border-primary bg-primary/[0.04] shadow-lg shadow-primary/10 ring-2 ring-primary/40'
                        : 'border-border bg-card shadow-sm hover:border-border/80'
                    }`}
                  >
                    <div>
                      {/* Fixed Top Badge Slot to Align Titles */}
                      <div className="flex h-7 items-center justify-between">
                        {isGrowth ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-0.5 text-xs font-semibold text-primary border border-primary/30">
                            <Sparkles className="h-3.5 w-3.5" /> Most Popular
                          </span>
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {p.slug === 'enterprise' ? 'High Volume' : 'Small Business'}
                          </span>
                        )}

                        {isCurrent && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[11px] font-medium">
                            Current Plan
                          </Badge>
                        )}
                      </div>

                      {/* Plan Name & Tagline */}
                      <div className="mt-3 min-h-[54px]">
                        <h3 className="text-xl font-bold tracking-tight text-foreground">{p.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {p.description}
                        </p>
                      </div>

                      {/* Pricing Box */}
                      <div className="my-4 rounded-xl border border-border/70 bg-muted/40 p-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-extrabold tracking-tight text-foreground">
                            ₹{displayPrice.toLocaleString('en-IN')}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">
                            /{billingCycle === 'yearly' ? 'year' : 'month'}
                          </span>
                          {appliedCoupon && (
                            <span className="ml-auto text-sm text-muted-foreground line-through font-medium">
                              ₹{rawPrice.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        {/* 18% GST display */}
                        <div className="mt-2 pt-2 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
                          <span>+18% GST: <strong className="text-foreground">₹{Math.round(displayPrice * 0.18).toLocaleString('en-IN')}</strong></span>
                          <span className="font-bold text-foreground">Total: ₹{(displayPrice + Math.round(displayPrice * 0.18)).toLocaleString('en-IN')}</span>
                        </div>
                        {billingCycle === 'yearly' ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>Equiv. ₹{Math.round(displayPrice / 12).toLocaleString('en-IN')}/mo (2 Months Free)</span>
                          </div>
                        ) : (
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            Billed monthly, cancel anytime
                          </div>
                        )}
                      </div>

                      {/* Features List with Top-Aligned Checkmarks */}
                      <div className="space-y-3 text-xs flex-1">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Plan Features:
                        </div>
                        <ul className="space-y-2.5">
                          <li className="flex items-start gap-2.5 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-xs">
                              <strong className="text-foreground">{p.max_contacts.toLocaleString('en-IN')}</strong> Contacts
                            </span>
                          </li>
                          <li className="flex items-start gap-2.5 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-xs">
                              <strong className="text-foreground">{p.max_broadcasts_monthly.toLocaleString('en-IN')}</strong> Monthly Broadcasts
                            </span>
                          </li>
                          <li className="flex items-start gap-2.5 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-xs">
                              <strong className="text-foreground">{p.max_team_members}</strong> Team Member Seats
                            </span>
                          </li>
                          <li className="flex items-start gap-2.5 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-xs">
                              <strong className="text-foreground">{p.max_automations}</strong> Automations & Flows
                            </span>
                          </li>
                          <li className="flex items-start gap-2.5">
                            {p.ai_agents_enabled ? (
                              <>
                                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                                <span className="text-xs font-semibold text-foreground">
                                  AI Chatbot & Knowledge Base
                                </span>
                              </>
                            ) : (
                              <>
                                <X className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                                <span className="text-xs text-muted-foreground/50 line-through">
                                  AI Chatbot & Knowledge Base
                                </span>
                              </>
                            )}
                          </li>
                          <li className="flex items-start gap-2.5 text-muted-foreground">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-xs">
                              {p.slug === 'enterprise' ? (
                                <strong className="text-foreground">24/7 Dedicated Support & VIP API</strong>
                              ) : isGrowth ? (
                                <span>Priority Support & Social Channels</span>
                              ) : (
                                <span>Standard WhatsApp Support</span>
                              )}
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-6 pt-4 border-t border-border/60">
                      <Button
                        onClick={() => {
                          setUpgradeModalOpen(false);
                          setCheckoutPlan(p);
                        }}
                        disabled={isCurrent || upgradingPlanId === p.id}
                        className={`w-full font-semibold shadow-sm transition-all text-sm h-11 ${
                          isGrowth
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
                            : isCurrent
                            ? 'bg-muted text-muted-foreground border border-border cursor-default'
                            : 'bg-card text-foreground border border-border hover:bg-muted'
                        }`}
                      >
                        {isCurrent ? (
                          <span className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Current Plan
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            Choose {p.name} • ₹{displayPrice.toLocaleString('en-IN')}/{billingCycle === 'yearly' ? 'yr' : 'mo'} <ArrowRight className="h-4 w-4" />
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input in Modal */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-foreground">Have a Promo or Coupon Code?</div>
                  <div className="text-muted-foreground text-xs">
                    {appliedCoupon
                      ? `Applied: ${appliedCoupon.code} (${appliedCoupon.description}) — discounts reflected on cards above!`
                      : 'Enter promo code to apply instant discounts before checkout.'}
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
                    className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 h-9"
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
                      className="w-36 sm:w-44 text-xs uppercase bg-card border-border h-9"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponCode.trim()}
                      className="text-xs h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                    >
                      {validatingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply Code'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* GST & Business Name Input Section for Tax Invoice */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-bold text-foreground">
                    Business Name & GST Details (Optional for Input Tax Credit)
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">18% GST Applicable (SAC 998313)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Company / Trade Name
                  </label>
                  <Input
                    placeholder="e.g. Acme Tech Solutions"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="h-8 text-xs bg-card border-border"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    GSTIN Number (15-digit)
                  </label>
                  <Input
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    maxLength={15}
                    className="h-8 text-xs font-mono uppercase bg-card border-border"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Billing Address
                    </label>
                    <Input
                      placeholder="e.g. Suite 402, Cyber Tower, Noida"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      className="h-8 text-xs bg-card border-border"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      State / State Code
                    </label>
                    <Input
                      placeholder="e.g. Uttar Pradesh (09)"
                      value={billingState}
                      onChange={(e) => setBillingState(e.target.value)}
                      className="h-8 text-xs bg-card border-border"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                * Entering your GST number will print your company details on the official GST invoice, allowing you to claim full 18% Input Tax Credit (ITC).
              </p>
            </div>
          </div>

          {/* Modal Trust Footer */}
          <div className="p-4 px-6 md:px-8 bg-muted/30 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>100% Safe & Secure Checkout via <strong>Razorpay</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-medium">UPI</span>
              <span className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-medium">Google Pay</span>
              <span className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-medium">PhonePe</span>
              <span className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-medium">Cards</span>
              <span className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-medium">NetBanking</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Instant Activation • Cancel Anytime</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* GST Tax Invoice Viewer & Printable Modal */}
      <GstInvoiceModal
        open={gstModalOpen}
        onOpenChange={setGstModalOpen}
        invoice={selectedInvoice}
        account={accountDetails}
      />

      {/* Prepaid Wallet Recharge Modal */}
      <WalletTopupModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        currentBalance={Number(walletData?.wallet?.balance || 0)}
        rates={walletData?.rates}
        onSuccess={() => {
          fetchUsageAndPlans();
          window.dispatchEvent(new CustomEvent('wallet:updated'));
        }}
      />

      {/* Subscription Checkout Modal with GST & 18% ITC Option */}
      <Dialog open={!!checkoutPlan} onOpenChange={(open) => !open && setCheckoutPlan(null)}>
        <DialogContent className="max-w-xl p-0 overflow-hidden border border-border/80 bg-background shadow-2xl rounded-2xl">
          {/* Modal Header */}
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BrandLogo size={32} />
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Subscribe to {checkoutPlan?.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {checkoutPlan?.description}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center rounded-xl border border-border bg-muted/60 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
                    billingCycle === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
                    billingCycle === 'yearly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Yearly (-17%)
                </button>
              </div>
            </div>
          </div>

          {(() => {
            const rawBasePrice = checkoutPlan
              ? billingCycle === 'yearly'
                ? Number(checkoutPlan.price_yearly || 0)
                : Number(checkoutPlan.price_monthly || 0)
              : 0;

            let discountVal = 0;
            if (appliedCoupon && rawBasePrice > 0) {
              if (appliedCoupon.discount_type === 'percentage') {
                discountVal = Math.round(rawBasePrice * (appliedCoupon.discount_value / 100));
              } else {
                discountVal = Math.min(rawBasePrice, Math.round(appliedCoupon.discount_value));
              }
            }

            const taxableVal = Math.max(0, rawBasePrice - discountVal);
            const gstVal = Math.round(taxableVal * 0.18);
            const totalPayableVal = taxableVal + gstVal;

            return (
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Promo Code Input Section */}
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      Have a Coupon / Promo Code?
                    </span>
                    {appliedCoupon && (
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] text-destructive hover:underline font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {!appliedCoupon ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="ENTER COUPON CODE"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="h-9 text-xs uppercase font-mono tracking-wider bg-background"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleApplyCoupon}
                        disabled={validatingCoupon || !couponCode.trim()}
                        className="h-9 text-xs shrink-0 font-semibold"
                      >
                        {validatingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                      <span className="font-semibold text-emerald-500 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Code &quot;{appliedCoupon.code}&quot; applied! ({appliedCoupon.description})
                      </span>
                      <span className="text-emerald-500 font-bold">-₹{discountVal.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                {/* GST Details Box */}
                <div className="border border-border/70 rounded-xl p-3.5 bg-muted/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          Claim 18% GST Input Tax Credit (ITC)
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Enter your business GSTIN to receive an official B2B tax invoice.
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSubscriptionGst}
                      onChange={(e) => setShowSubscriptionGst(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
                    />
                  </div>

                  {showSubscriptionGst && (
                    <div className="space-y-3 pt-2.5 border-t border-border/50 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <Label className="text-[11px] text-muted-foreground font-medium">GSTIN Number (15-digit)</Label>
                          <Input
                            placeholder="e.g. 07AAAAA0000A1Z5"
                            value={gstNumber}
                            onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                            maxLength={15}
                            className="h-8 text-xs font-mono uppercase bg-background"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground font-medium">Company / Business Name</Label>
                          <Input
                            placeholder="e.g. Acme Tech Solutions Pvt Ltd"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2">
                          <Label className="text-[11px] text-muted-foreground font-medium">Billing Address</Label>
                          <Input
                            placeholder="Street, Area, City"
                            value={billingAddress}
                            onChange={(e) => setBillingAddress(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground font-medium">State / State Code</Label>
                          <Input
                            placeholder="e.g. Uttar Pradesh (09)"
                            value={billingState}
                            onChange={(e) => setBillingState(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        * Your company details will be printed on the official GST invoice (SAC 998313) so you can claim 18% Input Tax Credit.
                      </p>
                    </div>
                  )}
                </div>

                {/* Pricing & GST Breakdown */}
                <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Base Plan Price ({billingCycle === 'yearly' ? 'Annual' : 'Monthly'})</span>
                    <span className="font-medium text-foreground">
                      ₹{rawBasePrice.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-500 font-semibold">
                      <span>Coupon Discount ({appliedCoupon.code})</span>
                      <span>-₹{discountVal.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxable Amount</span>
                    <span className="text-foreground">₹{taxableVal.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>Government GST (18%)</span>
                    <span className="text-foreground">+₹{gstVal.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="border-t border-border/60 pt-2 flex justify-between font-bold text-foreground text-sm">
                    <span>Total Amount Payable</span>
                    <span className="text-primary text-base">
                      ₹{totalPayableVal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Checkout Action Button */}
                <Button
                  type="button"
                  onClick={async () => {
                    if (!checkoutPlan) return;
                    await handleCheckout(checkoutPlan.id);
                  }}
                  disabled={upgradingPlanId === checkoutPlan?.id}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl shadow-lg shadow-primary/20 text-sm flex items-center justify-center gap-2"
                >
                  {upgradingPlanId === checkoutPlan?.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Initiating Checkout...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        Pay ₹{totalPayableVal.toLocaleString('en-IN')} via UPI / Cards / NetBanking
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>100% Safe & Secure Checkout via <strong>Razorpay</strong> • Instant Activation</span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Confirmation Dialog */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-500">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Cancel Subscription?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 space-y-2">
              <p>
                Are you sure you want to cancel your <strong>{currentPlan?.name || 'current'}</strong> subscription?
              </p>
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs">
                ⚠️ Your account will be downgraded to the <strong>Free Trial</strong> tier, and premium features (unlimited broadcasts, high contact limits, and priority AI replies) will be paused.
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancellingSubscription}
              className="text-xs"
            >
              Keep My Plan
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCancelSubscription}
              disabled={cancellingSubscription}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {cancellingSubscription ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelling...
                </span>
              ) : (
                'Yes, Cancel Subscription'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
