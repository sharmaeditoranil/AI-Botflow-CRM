'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Shield,
  CreditCard,
  Ban,
  RotateCcw,
  Sparkles,
  Edit2,
  Calendar,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Tenant {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  planName: string;
  planId?: string;
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  isSuspended: boolean;
  whatsappConnected: boolean;
  createdAt: string;
}

interface PlanOption {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal State for Manual Plan Change
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [selectedDuration, setSelectedDuration] = useState('keep');
  const [customDate, setCustomDate] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Deletion modals state
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [cancellingSubTenant, setCancellingSubTenant] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tenantsRes, plansRes] = await Promise.all([
        fetch('/api/super-admin/tenants'),
        fetch('/api/super-admin/plans'),
      ]);

      const tenantsData = await tenantsRes.json();
      const plansData = await plansRes.json();

      if (tenantsRes.ok && tenantsData.tenants) {
        setTenants(tenantsData.tenants);
      } else {
        toast.error(tenantsData.error || 'Failed to load tenants.');
      }

      if (plansRes.ok && plansData.plans) {
        setPlans(plansData.plans);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenPlanModal = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setSelectedPlanId(tenant.planId || (plans[0]?.id ?? ''));
    setSelectedStatus(tenant.subscriptionStatus || 'active');
    setSelectedDuration('keep');
    setCustomDate('');
  };

  const handleSavePlanChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant || !selectedPlanId) return;

    try {
      setSavingPlan(true);

      const payload: Record<string, any> = {
        accountId: editingTenant.id,
        planId: selectedPlanId,
        subscriptionStatus: selectedStatus,
      };

      const now = new Date();

      if (selectedDuration === '30_days') {
        now.setDate(now.getDate() + 30);
        payload.currentPeriodEnd = now.toISOString();
        payload.trialEndsAt = null;
      } else if (selectedDuration === '90_days') {
        now.setDate(now.getDate() + 90);
        payload.currentPeriodEnd = now.toISOString();
        payload.trialEndsAt = null;
      } else if (selectedDuration === '365_days') {
        now.setDate(now.getDate() + 365);
        payload.currentPeriodEnd = now.toISOString();
        payload.trialEndsAt = null;
      } else if (selectedDuration === 'lifetime') {
        now.setFullYear(now.getFullYear() + 25);
        payload.currentPeriodEnd = now.toISOString();
        payload.trialEndsAt = null;
      } else if (selectedDuration === '14_days_trial') {
        now.setDate(now.getDate() + 14);
        payload.trialEndsAt = now.toISOString();
        payload.subscriptionStatus = 'trialing';
      } else if (selectedDuration === 'custom' && customDate) {
        const chosen = new Date(customDate);
        chosen.setHours(23, 59, 59, 999);
        payload.currentPeriodEnd = chosen.toISOString();
        payload.trialEndsAt = null;
      }

      const res = await fetch('/api/super-admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Plan updated for ${editingTenant.name}!`);
        setEditingTenant(null);
        fetchData();
      } else {
        toast.error(data.error || 'Failed to update plan.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating tenant plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleToggleSuspend = async (tenant: Tenant) => {
    const action = tenant.isSuspended ? 'reactivate' : 'suspend';
    if (!confirm(`Are you sure you want to ${action} ${tenant.name}?`)) return;

    try {
      setUpdatingId(tenant.id);
      const res = await fetch('/api/super-admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: tenant.id,
          isSuspended: !tenant.isSuspended,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
        fetchData();
      } else {
        toast.error(data.error || 'Failed to update tenant.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating tenant.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteTenant = async () => {
    if (!deletingTenant) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/super-admin/tenants?accountId=${deletingTenant.id}&action=delete_account`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete tenant');
        return;
      }
      toast.success(`Tenant "${deletingTenant.name}" has been permanently deleted.`);
      setTenants((prev) => prev.filter((t) => t.id !== deletingTenant.id));
      setDeletingTenant(null);
    } catch (err: any) {
      toast.error(err.message || 'Error deleting tenant');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancellingSubTenant) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/super-admin/tenants?accountId=${cancellingSubTenant.id}&action=delete_subscription`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to cancel subscription');
        return;
      }
      toast.success(`Subscription for "${cancellingSubTenant.name}" cancelled.`);
      setTenants((prev) =>
        prev.map((t) =>
          t.id === cancellingSubTenant.id
            ? {
                ...t,
                subscriptionStatus: 'cancelled',
                planName: 'Free Trial',
                currentPeriodEnd: null,
                trialEndsAt: null,
              }
            : t
        )
      );
      setCancellingSubTenant(null);
      if (editingTenant?.id === cancellingSubTenant.id) {
        setEditingTenant(null);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error cancelling subscription');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.ownerEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-foreground">Tenant Workspaces</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Manage tenant subscriptions, change plans manually, and monitor account access.
            </CardDescription>
          </div>

          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs border-border bg-muted"
            />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No tenants found matching your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-3 font-semibold">Workspace Name</th>
                    <th className="pb-3 font-semibold">Owner Email</th>
                    <th className="pb-3 font-semibold">Plan</th>
                    <th className="pb-3 font-semibold">WhatsApp</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Created</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 font-medium text-foreground">{tenant.name}</td>
                      <td className="py-3.5 text-muted-foreground">{tenant.ownerEmail}</td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`border-border text-[11px] font-medium ${
                              tenant.planName.toLowerCase().includes('enterprise')
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : tenant.planName.toLowerCase().includes('growth')
                                ? 'bg-primary/10 text-primary border-primary/30'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            {tenant.planName}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleOpenPlanModal(tenant)}
                            title="Change Plan"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5">
                        {tenant.whatsappConnected ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground/60" /> Not connected
                          </span>
                        )}
                      </td>
                      <td className="py-3.5">
                        {tenant.isSuspended ? (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Suspended</Badge>
                        ) : tenant.subscriptionStatus === 'active' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Active</Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                            {tenant.subscriptionStatus === 'trialing' ? 'Trial' : tenant.subscriptionStatus}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 text-muted-foreground">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPlanModal(tenant)}
                            className="h-7 text-xs border-border bg-card hover:bg-muted"
                          >
                            <CreditCard className="mr-1 h-3 w-3 text-primary" /> Change Plan
                          </Button>

                          <Button
                            size="sm"
                            variant={tenant.isSuspended ? 'outline' : 'destructive'}
                            disabled={updatingId === tenant.id}
                            onClick={() => handleToggleSuspend(tenant)}
                            className="h-7 text-xs"
                          >
                            {updatingId === tenant.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : tenant.isSuspended ? (
                              <>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reactivate
                              </>
                            ) : (
                              <>
                                <Ban className="mr-1 h-3.5 w-3.5" /> Suspend
                              </>
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeletingTenant(tenant)}
                            title="Delete Tenant Account"
                            className="h-7 px-2 text-xs bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-500/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Change Plan Dialog */}
      <Dialog open={!!editingTenant} onOpenChange={(open) => !open && setEditingTenant(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Change Tenant Plan
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Manually upgrade, downgrade, or assign a plan to{' '}
              <strong className="text-foreground">{editingTenant?.name}</strong> ({editingTenant?.ownerEmail}).
            </DialogDescription>
          </DialogHeader>

          {editingTenant && (
            <form onSubmit={handleSavePlanChange} className="space-y-4 pt-2">
              {/* Current Status Overview */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Plan:</span>
                  <Badge variant="outline" className="border-border font-semibold text-foreground">
                    {editingTenant.planName}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Subscription Status:</span>
                  <span className="capitalize font-semibold text-foreground">
                    {editingTenant.subscriptionStatus || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Active Expiry / Trial:</span>
                  <span className="font-medium text-foreground">
                    {editingTenant.currentPeriodEnd
                      ? new Date(editingTenant.currentPeriodEnd).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : editingTenant.trialEndsAt
                      ? `Trial ends ${new Date(editingTenant.trialEndsAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}`
                      : 'Not set (Unlimited)'}
                  </span>
                </div>
              </div>

              {/* Select Plan */}
              <div className="space-y-1.5">
                <Label htmlFor="plan" className="text-xs font-semibold text-foreground">
                  Select New Plan
                </Label>
                <select
                  id="plan"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/60 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — (Monthly: ₹{p.price_monthly}, Yearly: ₹{p.price_yearly})
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Subscription Status */}
              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-xs font-semibold text-foreground">
                  Subscription Status
                </Label>
                <select
                  id="status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/60 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="active">Active (Full features enabled)</option>
                  <option value="trialing">Trialing (Free Trial mode)</option>
                  <option value="past_due">Past Due (Payment overdue)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Plan Validity / Duration Extension */}
              <div className="space-y-1.5">
                <Label htmlFor="duration" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Validity / Expiry Action
                </Label>
                <select
                  id="duration"
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/60 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="keep">Keep Current Expiry (No change to dates)</option>
                  <option value="30_days">Set Valid for +30 Days (1 Month)</option>
                  <option value="90_days">Set Valid for +90 Days (3 Months)</option>
                  <option value="365_days">Set Valid for +1 Year (365 Days)</option>
                  <option value="lifetime">Lifetime / Permanent Access (25 Years)</option>
                  <option value="14_days_trial">Reset to 14 Days Free Trial</option>
                  <option value="custom">Pick Custom Expiry Date...</option>
                </select>

                {selectedDuration === 'custom' && (
                  <div className="pt-2">
                    <Label htmlFor="customDate" className="text-[11px] font-semibold text-foreground">
                      Choose Expiry Date
                    </Label>
                    <Input
                      id="customDate"
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="mt-1 text-xs border-border bg-muted"
                      required
                    />
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Controls when the account’s subscription will renew or require payment.
                </p>
              </div>

              {/* Cancel / Reset Subscription Option */}
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-500 block">Cancel Active Subscription</span>
                  <span className="text-[11px] text-muted-foreground">Reset plan to Free Trial and revoke premium tier.</span>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setCancellingSubTenant(editingTenant)}
                  className="h-7 text-xs bg-rose-500 hover:bg-rose-600 text-white"
                >
                  Cancel Plan
                </Button>
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTenant(null)}
                  className="text-xs"
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingPlan}
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {savingPlan ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </span>
                  ) : (
                    'Update Plan Now'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Account Confirmation Dialog */}
      <Dialog open={!!deletingTenant} onOpenChange={(open) => !open && setDeletingTenant(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-500">
              <Trash2 className="h-5 w-5 text-rose-500" />
              Permanently Delete Tenant Account?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 space-y-2">
              <p>
                Are you sure you want to permanently delete{' '}
                <strong className="text-foreground">{deletingTenant?.name}</strong> (
                <span className="text-foreground font-mono">{deletingTenant?.ownerEmail}</span>)?
              </p>
              <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs">
                ⚠️ <strong>Irreversible Action:</strong> All WhatsApp chats, broadcast logs, contacts, automations, flows, and user profiles associated with this tenant will be permanently wiped.
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingTenant(null)}
              disabled={isDeleting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteTenant}
              disabled={isDeleting}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting...
                </span>
              ) : (
                'Yes, Delete Account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Tenant Subscription Confirmation Dialog */}
      <Dialog open={!!cancellingSubTenant} onOpenChange={(open) => !open && setCancellingSubTenant(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-500">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cancel Active Subscription?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 space-y-2">
              <p>
                Are you sure you want to cancel the paid subscription for{' '}
                <strong className="text-foreground">{cancellingSubTenant?.name}</strong> (
                <span className="text-foreground font-mono">{cancellingSubTenant?.ownerEmail}</span>)?
              </p>
              <p>
                This will immediately reset their plan to <strong>Free Trial / Cancelled</strong>, clear their active billing period, and revoke premium tier features.
              </p>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancellingSubTenant(null)}
              disabled={isDeleting}
              className="text-xs"
            >
              Keep Subscription
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCancelSubscription}
              disabled={isDeleting}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? (
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
    </div>
  );
}
