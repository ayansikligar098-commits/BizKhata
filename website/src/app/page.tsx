'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useApp, useLastPath } from '@/lib/app-context';
import { LoadingScreen, OfflineScreen } from '@/components/shell';
import { isPrivatePath } from '@/lib/routes';

/**
 * Root `/`: never shows the app or the login form itself. While the session
 * is being verified a branded loading screen is shown (no login flash);
 * afterwards the user is sent to their last private page (or Dashboard),
 * or to /login when there is no valid session.
 */
export default function RootPage() {
  const app = useApp();
  const router = useRouter();
  const last = useLastPath();

  React.useEffect(() => {
    if (app.authStatus === 'authed') {
      router.replace(last && isPrivatePath(last) ? last : '/dashboard');
    } else if (app.authStatus === 'guest') {
      router.replace('/login');
    }
  }, [app.authStatus, last, router]);

  if (app.authStatus === 'offline') return <OfflineScreen />;
  return <LoadingScreen />;
}
