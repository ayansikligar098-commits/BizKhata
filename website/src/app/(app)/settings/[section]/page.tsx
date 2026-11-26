import { SETTING_SECTIONS } from '@/lib/routes';
import SettingSectionPageClient from './client';

/** /settings/profile | /settings/business | /settings/language | /settings/receipt | /settings/security */
export function generateStaticParams() {
  return SETTING_SECTIONS.map((section) => ({ section }));
}

export default function SettingSectionPage({ params }: { params: { section: string } }) {
  return <SettingSectionPageClient section={params.section} />;
}
