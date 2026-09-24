'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Wallet,
  Sparkles,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Info,
  ArrowRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_WALLET_RATES, type WalletRates } from '@/lib/billing/wallet';

interface WalletTopupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newBalance: number) => void;
  currentBalance?: number;
  rates?: WalletRates | null;
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000];

export function WalletTopupModal({
  open,
  onOpenChange,
  onSuccess,
  currentBalance = 0,
  rates,
}: WalletTopupModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeRates, setActiveRates] = useState<WalletRates>(rates || DEFAULT_WALLET_RATES);

  useEffect(() => {
    if (rates) {
      setActiveRates(rates);
    } else if (open) {
      fetch('/api/wallet')
        .then((res) => res.json())
        .then((data) => {
          if (data?.rates) setActiveRates(data.rates);
        })
        .catch(() => {});
    }
  }, [rates, open]);

  // Business GST details (optional)
  const [showGstDetails, setShowGstDetails] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingState, setBillingState] = useState('');

  const finalAmount = customAmount ? Number(customAmount) || 0 : selectedAmount;
  const gstAmount = Math.round(finalAmount * 0.18);
  const totalPayable = finalAmount + gstAmount;

  const marketingRate = activeRates.marketing || 0.85;
  const utilityRate = activeRates.utility || 0.15;
  const marketingCount = Math.floor(finalAmount / marketingRate);
  const utilityCount = Math.floor(finalAmount / utilityRate);

  const handleSelectPreset = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount('');
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    setSelectedAmount(0);
  };

  /** Load Razorpay checkout.js once and return when ready */
  const loadRazorpay = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      // Check if the script tag already exists (loading in progress)
      const existing = document.querySelector(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (existing) {
        // Wait for it to finish loading
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleInitiateTopup = async () => {
    if (finalAmount < 100) {
      toast.error('Minimum recharge amount is ₹100.');
      return;
    }

    try {
      setLoading(true);

      // Ensure SDK is ready before creating the order
      const sdkReady = await loadRazorpay();
      if (!sdkReady) {
        toast.error('Could not load payment gateway. Please check your internet connection and try again.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/wallet/topup/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmount,
          businessName: businessName.trim(),
          gstNumber: gstNumber.trim().toUpperCase(),
          billingAddress: billingAddress.trim(),
          billingState: billingState.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to initiate recharge order.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Aibotflow CRM',
        description: `Wallet Recharge: ₹${data.topupAmount} Credits (+18% GST)`,
        order_id: data.orderId,
        prefill: {
          email: data.userEmail || '',
        },
        notes: {
          purpose: 'wallet_topup',
          topupAmount: data.topupAmount,
        },
        theme: {
          color: '#10b981', // Emerald green
        },
        handler: async function (response: any) {
          toast.info('Verifying recharge payment...');
          try {
            const verifyRes = await fetch('/api/wallet/topup/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                topupAmount: data.topupAmount,
                taxableAmount: data.taxableAmount,
                gstAmount: data.gstAmount,
                businessName: businessName.trim(),
                gstNumber: gstNumber.trim().toUpperCase(),
                billingAddress: billingAddress.trim(),
                billingState: billingState.trim(),
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              toast.success(
                `🎉 ₹${finalAmount.toLocaleString()} added! New Balance: ₹${Number(verifyData.newBalance).toFixed(2)}`
              );
              onOpenChange(false);
              onSuccess?.(verifyData.newBalance);
            } else {
              toast.error(verifyData.error || 'Payment verification failed.');
            }
          } catch (err: any) {
            toast.error(err.message || 'Verification network error.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      });

      rzp.open();
    } catch (err: any) {
      toast.error(err.message || 'Payment initiation failed.');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border border-border/80 bg-background shadow-2xl rounded-2xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500 ring-1 ring-emerald-500/30">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Recharge WhatsApp Credits
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Instant balance for broadcast campaigns, automations, and live chats.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Current Available Balance</span>
            <span className="text-sm font-bold text-emerald-500">
              ₹{currentBalance.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Preset Buttons */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Select Top-up Amount
            </Label>
            <div className="grid grid-cols-4 gap-2.5 mt-2">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = selectedAmount === amt && !customAmount;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleSelectPreset(amt)}
                    className={`flex flex-col items-center justify-center rounded-xl py-3 px-2 text-sm font-bold transition-all border ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/30 shadow-sm'
                        : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/60 hover:border-border'
                    }`}
                  >
                    <span>₹{amt.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Amount Field */}
          <div>
            <Label className="text-xs text-muted-foreground">Or Enter Custom Amount (₹)</Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                min="100"
                step="50"
                placeholder="e.g. 3500"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="pl-8 text-sm font-semibold bg-muted/20 border-border/80 h-10"
              />
            </div>
          </div>

          {/* Estimated Messages Capacity Card */}
          {finalAmount > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Estimated Message Capacity</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-background/60 p-2 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Marketing Templates</span>
                  <span className="font-bold text-foreground text-sm">~{marketingCount.toLocaleString()}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">(₹{marketingRate.toFixed(2)}/msg)</span>
                </div>
                <div className="rounded-lg bg-background/60 p-2 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Utility / OTP</span>
                  <span className="font-bold text-foreground text-sm">~{utilityCount.toLocaleString()}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">(₹{utilityRate.toFixed(2)}/msg)</span>
                </div>
              </div>
            </div>
          )}

          {/* Optional GST Details Accordion */}
          <div className="border border-border/60 rounded-xl p-3 bg-muted/10 space-y-2.5">
            <button
              type="button"
              onClick={() => setShowGstDetails(!showGstDetails)}
              className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <span>Need GST Invoice for Tax Credit?</span>
              <span className="text-primary text-[11px]">
                {showGstDetails ? 'Hide Details' : '+ Add GST Details'}
              </span>
            </button>

            {showGstDetails && (
              <div className="space-y-2.5 pt-2 border-t border-border/40">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">GSTIN</Label>
                    <Input
                      placeholder="27AAAAA0000A1Z5"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      className="h-8 text-xs uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Business Name</Label>
                    <Input
                      placeholder="Company Name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Billing Address</Label>
                  <Input
                    placeholder="Street, City, State"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Pricing & GST Breakdown */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Wallet Credit Added</span>
              <span className="font-medium text-foreground">₹{finalAmount.toLocaleString()}.00</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Government GST (18%)</span>
              <span>₹{gstAmount.toLocaleString()}.00</span>
            </div>
            <div className="border-t border-border/60 pt-2 mt-1 flex justify-between font-bold text-foreground text-sm">
              <span>Total Payable</span>
              <span className="text-emerald-500">₹{totalPayable.toLocaleString()}.00</span>
            </div>
          </div>

          {/* Checkout CTA */}
          <Button
            type="button"
            onClick={handleInitiateTopup}
            disabled={loading || finalAmount < 100}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20 text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : (
              <>
                <span>Pay ₹{totalPayable.toLocaleString()} via UPI / Cards</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Secure 256-bit encrypted payment powered by Razorpay</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
