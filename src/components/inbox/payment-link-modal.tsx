'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreditCard, Loader2, IndianRupee, Send, Link as LinkIcon, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendLink: (message: string) => void;
  customerName?: string;
  customerPhone?: string;
}

export function PaymentLinkModal({
  open,
  onOpenChange,
  onSendLink,
  customerName = '',
  customerPhone = '',
}: PaymentLinkModalProps) {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [customLink, setCustomLink] = useState('');
  const [useCustomLink, setUseCustomLink] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleCreateAndSend = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    try {
      setGenerating(true);
      let payUrl = customLink.trim();

      if (!payUrl) {
        const res = await fetch('/api/billing/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: num,
            description: purpose.trim() || 'Payment Request',
            customerName,
            customerPhone,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          payUrl = data.paymentLink || data.upiLink;
        } else {
          payUrl = `https://dash.aibotflow.in/pay?amt=${num}&ref=${Date.now()}`;
        }
      }

      // Format WhatsApp Payment Card Message
      const message = `💳 *Payment Request*\n\n` +
        `👤 *Customer:* ${customerName || 'Customer'}\n` +
        `💰 *Amount Payable:* ₹${num.toLocaleString('en-IN')}\n` +
        `📝 *Purpose:* ${purpose.trim() || 'Services / Products'}\n\n` +
        `🔗 *Click to Pay Securely via UPI / Cards:*\n${payUrl}\n\n` +
        `_Please reply here once payment is complete._`;

      onSendLink(message);
      toast.success(`Payment link for ₹${num} sent to WhatsApp!`);
      onOpenChange(false);
      setAmount('');
      setPurpose('');
      setCustomLink('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create payment link.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <CreditCard className="h-5 w-5 text-emerald-500" />
            Send Payment Link via WhatsApp
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Generate and send a direct payment link to {customerName || 'the customer'} in this WhatsApp chat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Amount (₹ INR) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm font-bold text-muted-foreground">₹</span>
              <Input
                type="number"
                placeholder="500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8 text-base font-bold bg-muted/40 border-border"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Purpose / Description
            </label>
            <Input
              placeholder="e.g. Order Advance, Consultation Fee, Balance Due"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="text-xs bg-muted/40 border-border"
            />
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setUseCustomLink(!useCustomLink)}
              className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
            >
              <LinkIcon className="h-3 w-3" />
              {useCustomLink ? 'Use auto-generated payment link' : 'Or paste your custom Razorpay / UPI link'}
            </button>

            {useCustomLink && (
              <div className="mt-2">
                <Input
                  placeholder="https://rzp.io/l/... or UPI link"
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  className="text-xs bg-muted/40 border-border"
                />
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-[11px] text-emerald-500 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Customer can pay instantly using Google Pay, PhonePe, Paytm, Cards, or NetBanking.</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateAndSend}
            disabled={!amount || generating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-sm"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send Payment Link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
