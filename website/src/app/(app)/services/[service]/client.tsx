'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { ServicesView } from '@/components/views-services';
import { serviceFromSlug } from '@/lib/routes';

/** /services/<slug> — one dedicated page per service; ?new=1 opens the add form. */
export default function ServicePageClient({ slug }: { slug: string }) {
  const app = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 'Money Transfer' is a separate top-level module, not a job service —
  // an old link to it goes to the real Money Transfer page.
  if (slug === 'money-transfer') {
    router.replace('/money-transfer');
    return null;
  }
  const service = serviceFromSlug(slug);
  const openForm = searchParams.get('new') === '1';
  if (!service) return <p className="empty">Unknown service: {slug}.</p>;
  return <ServicesView ctx={app} service={service} openForm={openForm} />;
}
