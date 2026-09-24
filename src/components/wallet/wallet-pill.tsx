'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { WalletTopupModal } from './wallet-topup-modal';
import { cn } from '@/lib/utils';

export function WalletPill() {
  const [balance, setBalance] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      if (res.ok) {
        const data = await res.json();
        if (data.wallet) {
          setBalance(Number(data.wallet.balance || 0));
          setIsSuperAdmin(Boolean(data.wallet.is_super_admin));
        }
      }
    } catch (err) {
      console.warn('[WalletPill] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();

    const handleUpdate = (e: any) => {
      if (typeof e.detail?.balance === 'number') {
        setBalance(e.detail.balance);
      } else {
        fetchBalance();
      }
    };

    window.addEventListener('wallet:updated', handleUpdate);
    return () => window.removeEventListener('wallet:updated', handleUpdate);
  }, [fetchBalance]);

  const currentBalance = balance ?? 0;
  const isLow = !isSuperAdmin && currentBalance < 50;
  const isCritical = !isSuperAdmin && currentBalance <= 5;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all shadow-sm',
          isSuperAdmin
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-medium'
            : isCritical
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
            : isLow
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
            : 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/15'
        )}
      >
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 focus:outline-none"
          title={isSuperAdmin ? "Direct Meta Card Billing (Super-Admin)" : "Click to recharge WhatsApp credits"}
        >
          <Wallet className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold tabular-nums text-[11px] sm:text-xs">
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin inline" />
            ) : isSuperAdmin ? (
              'Meta Card Active'
            ) : (
              `₹${currentBalance.toFixed(2)}`
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Add credits"
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-full transition-colors text-[10px] font-bold',
            isCritical
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : isLow
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          )}
          title="Add money to wallet"
        >
          <Plus className="h-3 w-3 stroke-[3]" />
        </button>
      </div>

      <WalletTopupModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        currentBalance={currentBalance}
        onSuccess={(newBal) => {
          setBalance(newBal);
          window.dispatchEvent(new CustomEvent('wallet:updated', { detail: { balance: newBal } }));
        }}
      />
    </>
  );
}
