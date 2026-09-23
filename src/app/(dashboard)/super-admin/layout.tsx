'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  Users,
  CreditCard,
  Sliders,
  Settings,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!profileLoading && !isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [isSuperAdmin, profileLoading, router]);

  if (profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  const navLinks = [
    { href: '/super-admin', label: 'Overview', icon: Sliders, exact: true },
    { href: '/super-admin/tenants', label: 'Tenants / Customers', icon: Users },
    { href: '/super-admin/plans', label: 'Plans & Limits', icon: CreditCard },
    { href: '/super-admin/settings', label: 'Gateway, Wallet & Rates', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Super Admin Top Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <BrandLogo size={42} variant="glow" priority />
          <div>
            <h1 className="text-lg font-bold text-amber-200">Aibotflow Super-Admin Console</h1>
            <p className="text-xs text-amber-300/80">
              Manage platform tenants, operational credentials, plans, and subscriptions.
            </p>
          </div>
        </div>

        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-200 hover:bg-amber-500/20">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Customer CRM
          </Button>
        </Link>
      </div>

      {/* Nav Tabs */}
      <div className="flex border-b border-border">
        <nav className="flex gap-2">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);

            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page Content */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
