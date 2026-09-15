'use client';

import { Suspense } from 'react';
import { BillingPanel } from '@/components/settings/billing-panel';

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPanel />
    </Suspense>
  );
}
