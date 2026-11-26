'use client';
import { useApp } from '@/lib/app-context';
import { CustomerProfileView } from '@/components/views-profiles';

/** /customers/<id> — one dedicated page per customer. */
export default function CustomerProfilePageClient({ id }: { id: string }) {
  const app = useApp();
  return <CustomerProfileView ctx={app} customerId={id} />;
}
