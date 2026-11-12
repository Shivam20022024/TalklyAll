'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, Target, Phone, Sparkles, TrendingUp, CreditCard, Activity } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/ui/MetricCard';
import { fetchApi } from '@/lib/api';

export default function PlatformDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi('/api/v1/admin/dashboard')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const metrics = [
    ['Total companies', data?.total_companies ?? '0', '', Building2, 'blue'],
    ['Active companies', data?.active_companies ?? '0', '', Activity, 'green'],
    ['Total users', data?.total_users ?? '0', '', Users, 'violet'],
    ['Total campaigns', data?.total_campaigns ?? '0', '', Target, 'orange'],
    ['Total leads', data?.total_leads ?? '0', '', Users, 'blue'],
    ['Total calls', data?.total_calls ?? '0', '', Phone, 'violet'],
    ['Interested leads', data?.interested_leads ?? '0', '', Sparkles, 'green'],
    ['Conversions', data?.conversions ?? '0', '', TrendingUp, 'orange'],
    ['Revenue (₹)', data ? Number(data.revenue).toLocaleString() : '0', '', CreditCard, 'green'],
  ] as const;

  return (
    <AppLayout title="Platform Dashboard">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Platform / Overview</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">All Companies</h1>
          <p className="mt-2 text-sm text-muted-foreground">Global metrics across every tenant on Voice AI.</p>
        </div>
        <Link href="/admin/companies" className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90">
          <Building2 size={15} />Manage Companies
        </Link>
      </section>

      {loading ? (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">Loading…</div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((m) => (
            <MetricCard key={m[0]} label={m[0] as string} value={String(m[1])} change={m[2] as string} Icon={m[3] as any} tone={m[4] as any} />
          ))}
        </section>
      )}
    </AppLayout>
  );
}
