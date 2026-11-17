import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { AuthShell } from '@/components/auth/auth-shell';
import { authConfigured } from '@/server/config';
import { getRequestLocale } from '@/server/locale';
import { safeNext } from '@/lib/auth-schema';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      (await getRequestLocale()) === 'fr'
        ? 'Confirmer mon email · Écartéo'
        : 'Confirm your email · Écartéo',
    robots: { index: false, follow: false },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <AuthForm
        mode="resend"
        configured={authConfigured()}
        next={safeNext(typeof next === 'string' ? next : undefined)}
      />
    </AuthShell>
  );
}
