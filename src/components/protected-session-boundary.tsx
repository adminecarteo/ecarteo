'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { useLocale } from '@/lib/locale-context';
import { SESSION_EXPIRED_EVENT } from '@/lib/workspace-client';
import styles from '@/components/auth/auth.module.css';

/** Remove rendered private data when access is lost. Server authorization remains mandatory. */
export function ProtectedSessionBoundary({ children }: { children: ReactNode }) {
  const { copy } = useLocale();
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const expire = () => {
      try {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith('ecarteo:'))
          .forEach((key) => sessionStorage.removeItem(key));
      } catch {
        // Storage can be unavailable; private components must still be removed.
      }
      setExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ecarteo-workspace');
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'signed-out') expire();
      };
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
      channel?.close();
    };
  }, []);

  if (!expired) return children;
  return (
    <AuthShell>
      <div className={styles.formContent} role="alert">
        <h1>{copy('Votre session a expiré', 'Your session has expired')}</h1>
        <p className={styles.description}>
          {copy(
            'Reconnectez-vous pour retrouver votre espace. Si votre accès a été désactivé, contactez votre interlocuteur Écartéo.',
            'Sign in again to return to your workspace. If your access has been disabled, contact your Écartéo representative.',
          )}
        </p>
        <Link href={`/login?next=${encodeURIComponent(pathname || '/app')}`}>
          {copy('Se reconnecter', 'Sign in again')}
        </Link>
      </div>
    </AuthShell>
  );
}
