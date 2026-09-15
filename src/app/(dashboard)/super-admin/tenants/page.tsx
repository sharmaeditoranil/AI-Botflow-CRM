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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Tenant {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  planName: string;
  planId?: string;
  subscriptionStatus: string;
  isSuspended: boolean;
  whatsappConnected: boolean;
  createdAt: string;
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/super-admin/tenants');
      const data = await res.json();
      if (res.ok && data.tenants) {
        setTenants(data.tenants);
      } else {
        toast.error(data.error || 'Failed to load tenants.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error fetching tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

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
        fetchTenants();
      } else {
        toast.error(data.error || 'Failed to update tenant.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating tenant.');
    } finally {
      setUpdatingId(null);
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
              All registered customer organizations using Aibotflow.
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
                    <tr key={tenant.id} className="hover:bg-muted/30">
                      <td className="py-3.5 font-medium text-foreground">{tenant.name}</td>
                      <td className="py-3.5 text-muted-foreground">{tenant.ownerEmail}</td>
                      <td className="py-3.5">
                        <Badge variant="outline" className="border-border bg-muted text-[11px]">
                          {tenant.planName}
                        </Badge>
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
                        ) : (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Active</Badge>
                        )}
                      </td>
                      <td className="py-3.5 text-muted-foreground">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
