'use client';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { CustomersView } from '@/components/views-services';
import { CustomerProfileView } from '@/components/views-profiles';

/**
 * /customers — the list. A direct deep link /customers/<id> is served by
 * the Pages rewrite (see public/_redirects) through this same page, so the
 * pathname decides: an id segment renders that customer's profile.
 */
export default function Page() {
  const app = useApp();
  const pathname = usePathname();
  const m = pathname?.match(/^\/customers\/([^/]+)\/?$/);
  if (m) return <CustomerProfileView ctx={app} customerId={m[1]} />;
  return <CustomersView ctx={app} />;
}
