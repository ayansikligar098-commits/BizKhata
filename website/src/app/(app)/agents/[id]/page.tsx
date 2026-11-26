import AgentProfilePageClient from './client';

/**
 * Agent ids are created by the user at runtime, so no static HTML can be
 * prerendered for a specific id. A direct deep link is served by the Pages
 * rewrite in public/_redirects through /agents (which renders the profile
 * from the pathname); this route handles client-side navigation.
 *
 * NOTE: Next's static export requires generateStaticParams to return at
 * least one route, so one harmless placeholder id is prerendered. Real
 * agent ids are `agt-…`, so `placeholder` can never be a real agent.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export const dynamicParams = false;

export default function AgentPage({ params }: { params: { id: string } }) {
  return <AgentProfilePageClient id={params.id} />;
}
