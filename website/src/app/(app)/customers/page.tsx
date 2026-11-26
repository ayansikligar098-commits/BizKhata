'use client';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { CustomersView } from '@/components/views-services';
import { CustomerProfileView } from '@/components/views-profiles';

/**
 * /customers — the list. A profile opens as /customers?id=<id> (query
 * param): the site is a static export, so /customers/<id> has no
 * prerendered page and client navigation to it 404s. The query form
 * always serves this page's HTML and renders the profile. Old
 * /customers/<id> deep links (served through the Pages rewrite in
 * public/_redirects) still work via the pathname fallback below.
 */
function PageInner() {
  const app = useApp();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = search?.get('id') || pathname?.match(/^\/customers\/([^/]+)\/?$/)?.[1] || null;
  if (id) return <CustomerProfileView ctx={app} customerId={id} />;
  return <CustomersView ctx={app} />;
}

export default function Page() {
  return (
    <Suspense>
      <PageInner />
    </Suspense>
  );
}
