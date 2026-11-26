'use client';
import { useApp } from '@/lib/app-context';
import { SettingsView } from '@/components/views-reports';

export default function Page() {
  const app = useApp();
  return <SettingsView ctx={app} />;
}
