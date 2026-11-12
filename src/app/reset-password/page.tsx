import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthForm } from '@/components/auth/auth-form';
import { authConfigured } from '@/server/config';
import { safeNext } from '@/lib/auth-schema';
import { requireUser } from '@/server/auth';
import { redirect } from 'next/navigation';
import { AppError } from '@/server/http';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const french = (await getRequestLocale()) === 'fr';
  return {
    title: french ? 'Nouveau mot de passe · Écartéo' : 'New password · Écartéo',
    description: french ? 'Sécurisez votre accès Écartéo.' : 'Secure your Écartéo access.',
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (authConfigured()) {
    try {
      await requireUser();
    } catch (error) {
      if (error instanceof AppError && error.status === 401) redirect('/forgot-password');
      throw error;
    }
  }
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthForm
        mode="reset"
        configured={authConfigured()}
        next={safeNext(typeof params.next === 'string' ? params.next : undefined)}
        notice={typeof params.notice === 'string' ? params.notice : undefined}
      />
    </AuthShell>
  );
}
