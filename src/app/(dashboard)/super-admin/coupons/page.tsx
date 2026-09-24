'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Ticket,
  Plus,
  Trash2,
  Copy,
  Check,
  Percent,
  IndianRupee,
  Calendar,
  Users,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  max_redemptions: number | null;
  redemptions_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default function SuperAdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'flat',
    discount_value: '20',
    max_redemptions: '',
    expires_at: '',
    is_active: true,
  });

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/super-admin/coupons');
      const data = await res.json();
      if (res.ok && data.coupons) {
        setCoupons(data.coupons);
      } else {
        toast.error(data.error || 'Failed to fetch coupons.');
      }
    } catch {
      toast.error('Network error loading coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success(`Copied "${code}" to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleActive = async (coupon: Coupon) => {
    const newStatus = !coupon.is_active;
    // Optimistic UI update
    setCoupons((prev) =>
      prev.map((c) => (c.id === coupon.id ? { ...c, is_active: newStatus } : c))
    );

    try {
      const res = await fetch(`/api/super-admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to update status');
        fetchCoupons();
      } else {
        toast.success(`Coupon "${coupon.code}" is now ${newStatus ? 'active' : 'inactive'}.`);
      }
    } catch {
      toast.error('Error updating coupon');
      fetchCoupons();
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Are you sure you want to permanently delete coupon "${coupon.code}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/super-admin/coupons/${coupon.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Coupon "${coupon.code}" deleted.`);
        setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to delete coupon');
      }
    } catch {
      toast.error('Network error deleting coupon');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      toast.error('Please enter a coupon code.');
      return;
    }

    const val = Number(formData.discount_value);
    if (isNaN(val) || val <= 0) {
      toast.error('Please enter a valid discount amount.');
      return;
    }

    if (formData.discount_type === 'percentage' && val > 100) {
      toast.error('Percentage discount cannot exceed 100%.');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/super-admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create coupon.');
        return;
      }

      toast.success(data.message || 'Coupon created successfully!');
      setModalOpen(false);
      setFormData({
        code: '',
        discount_type: 'percentage',
        discount_value: '20',
        max_redemptions: '',
        expires_at: '',
        is_active: true,
      });
      fetchCoupons();
    } catch {
      toast.error('Network error creating coupon.');
    } finally {
      setCreating(false);
    }
  };

  // Metrics
  const totalCoupons = coupons.length;
  const activeCoupons = coupons.filter((c) => c.is_active).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.redemptions_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Ticket className="h-6 w-6 text-amber-500" />
            Coupons & Promo Codes
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Create discount codes that customers can apply during subscription checkout and plan upgrades.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          className="bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-md shadow-amber-600/20 text-xs sm:text-sm self-start sm:self-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create Coupon
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium">Total Promo Codes</CardDescription>
            <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Ticket className="h-5 w-5 text-amber-500" />
              {totalCoupons}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium">Active & Redeemable</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              {activeCoupons}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border bg-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium">Total Redemptions Used</CardDescription>
            <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {totalRedemptions}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Coupons List */}
      <Card className="border-border bg-card">
        <CardHeader className="p-5 pb-3 border-b border-border/60">
          <CardTitle className="text-base font-semibold text-foreground">
            All Promotional Coupons
          </CardTitle>
          <CardDescription className="text-xs">
            Manage your discount codes. When users enter these codes in the billing checkout, their invoice total is discounted automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-14 px-4 space-y-3">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                <Ticket className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">No coupons created yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create promotional coupons like <strong>WELCOME50</strong> or <strong>FLAT200</strong> to attract more subscribers and offer seasonal deals.
              </p>
              <Button
                onClick={() => setModalOpen(true)}
                size="sm"
                className="mt-2 bg-amber-600 hover:bg-amber-500 text-white text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create First Coupon
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-3 px-4">Coupon Code</th>
                    <th className="py-3 px-4">Discount</th>
                    <th className="py-3 px-4">Usage / Redemptions</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {coupons.map((coupon) => {
                    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
                    const isExhausted = coupon.max_redemptions && coupon.redemptions_count >= coupon.max_redemptions;

                    return (
                      <tr key={coupon.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-foreground bg-muted/70 px-2.5 py-1 rounded border border-border">
                              {coupon.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(coupon.code, coupon.id)}
                              className="text-muted-foreground hover:text-foreground p-1 transition-colors rounded hover:bg-muted"
                              title="Copy Code"
                            >
                              {copiedId === coupon.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 font-semibold text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {coupon.discount_type === 'percentage' ? (
                              <>
                                <Percent className="h-3 w-3" />
                                {coupon.discount_value}% OFF
                              </>
                            ) : (
                              <>
                                <IndianRupee className="h-3 w-3" />
                                ₹{coupon.discount_value} FLAT OFF
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <span>{coupon.redemptions_count || 0}</span>
                              <span className="text-muted-foreground">
                                / {coupon.max_redemptions ? `${coupon.max_redemptions} max` : 'Unlimited'}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground/80 font-normal">
                              1 use / customer
                            </div>
                            {coupon.max_redemptions && (
                              <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full"
                                  style={{
                                    width: `${Math.min(100, ((coupon.redemptions_count || 0) / coupon.max_redemptions) * 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {coupon.expires_at ? (
                            <span
                              className={`flex items-center gap-1 text-xs ${
                                isExpired ? 'text-destructive font-medium' : 'text-muted-foreground'
                              }`}
                            >
                              <Calendar className="h-3 w-3" />
                              {new Date(coupon.expires_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                              {isExpired && ' (Expired)'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">Never Expires</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              <XCircle className="h-3 w-3" /> Expired
                            </span>
                          ) : isExhausted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                              <Clock className="h-3 w-3" /> Limit Reached
                            </span>
                          ) : coupon.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(coupon)}
                              className="h-7 px-2 text-[11px]"
                            >
                              {coupon.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(coupon)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Coupon Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Create Discount Coupon
            </DialogTitle>
            <DialogDescription className="text-xs">
              Generate a promotional promo code for customers to use at checkout.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCoupon} className="space-y-4 pt-2">
            {/* Coupon Code */}
            <div>
              <Label className="text-xs font-semibold">Coupon Code</Label>
              <Input
                placeholder="e.g. WELCOME50, DIWALI2026"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                  })
                }
                required
                className="mt-1 font-mono uppercase tracking-wider text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Letters, numbers, dashes, and underscores only. Automatically capitalized.
              </p>
            </div>

            {/* Discount Type & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Discount Type</Label>
                <div className="grid grid-cols-2 gap-1.5 mt-1 border border-border rounded-lg p-1 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, discount_type: 'percentage' })}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      formData.discount_type === 'percentage'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    }`}
                  >
                    % Percent
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, discount_type: 'flat' })}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      formData.discount_type === 'flat'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    }`}
                  >
                    ₹ Flat
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  {formData.discount_type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={formData.discount_type === 'percentage' ? '100' : '99999'}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            {/* Max Redemptions & Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Max Uses (Optional)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={formData.max_redemptions}
                  onChange={(e) => setFormData({ ...formData, max_redemptions: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Expiry Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* One-time use protection note */}
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-400">
              🔒 <strong>Anti-Abuse Protection:</strong> Each coupon is automatically restricted to <strong>1 redemption per customer account</strong> so users cannot repeatedly apply the discount on every subsequent renewal.
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
              <div>
                <span className="text-xs font-medium text-foreground block">Active Immediately</span>
                <span className="text-[11px] text-muted-foreground">Customers can apply it right after creation.</span>
              </div>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Submit */}
            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Promo Code'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
