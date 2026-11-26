import { Shell } from '@/components/shell';

/**
 * Shared private layout: dark navy sidebar + top nav + bottom nav around
 * every authenticated page. The Shell also gates access — guests are sent
 * to /login?next=<this page> and never see private content.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
