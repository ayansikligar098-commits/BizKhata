'use client';
import { useApp } from '@/lib/app-context';
import { SettingsView } from '@/components/views-reports';

/** /settings/<section> — Settings with that section scrolled into view. */
export default function SettingSectionPageClient({ section }: { section: string }) {
  const app = useApp();
  return <SettingsView ctx={app} section={section} />;
}
