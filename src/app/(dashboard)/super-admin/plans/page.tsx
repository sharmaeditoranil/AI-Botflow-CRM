'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CreditCard, Edit2, Check, Loader2, Users, Radio, Zap } from 'lucide-react';
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

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/super-admin/plans');
      const data = await res.json();
      if (res.ok && data.plans) {
        setPlans(data.plans);
      } else {
        toast.error(data.error || 'Failed to fetch plans.');
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
