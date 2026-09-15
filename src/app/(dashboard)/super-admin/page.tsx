'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  CreditCard,
  PlugZap,
  DollarSign,
  TrendingUp,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SuperAdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<{
    totalTenants: number;
    activeSubscriptions: number;
    waConnectedCount: number;
    totalRevenue: number;
    totalContacts: number;
  }>({
    totalTenants: 0,
    activeSubscriptions: 0,
    waConnectedCount: 0,
    totalRevenue: 0,
    totalContacts: 0,
  });

  useEffect(() => {
    fetch('/api/super-admin/metrics')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setMetrics(data);
        }
      })
      .catch((err) => console.error('Error fetching metrics:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Organizations',
      value: metrics.totalTenants.toLocaleString(),
      desc: 'Registered tenant workspaces',
      icon: Users,
    },
    {
      title: 'Active Subscriptions',
      value: metrics.activeSubscriptions.toLocaleString(),
      desc: 'Paid / active customer plans',
      icon: CreditCard,
    },
    {
      title: 'WhatsApp Connected',
      value: metrics.waConnectedCount.toLocaleString(),
      desc: 'Active WABA connections',
      icon: PlugZap,
    },
    {
      title: 'Total Revenue',
      value: `₹${metrics.totalRevenue.toLocaleString()}`,
      desc: 'Gross invoiced payments',
      icon: DollarSign,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{c.title}</CardTitle>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{c.value}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{c.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Manage Customers</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              View tenant list, suspend or reactivate accounts, and inspect connection statuses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/super-admin/tenants">
              <Button size="sm" className="w-full text-xs">
                View All Tenants <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Plans & Quotas</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Configure subscription tiers, monthly prices, contact quotas, and broadcast limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/super-admin/plans">
              <Button size="sm" variant="outline" className="w-full text-xs">
                Manage Plans <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">API & Gateway Keys</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Set your Meta App credentials for Embedded Signup and Razorpay keys for billing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/super-admin/settings">
              <Button size="sm" variant="outline" className="w-full text-xs">
                Configure Credentials <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
