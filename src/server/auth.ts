import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authConfig, authConfigured } from './config';
import { AppError } from './http';
import { isAuthProviderUnavailable } from './auth-provider-errors';

const profileSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: z.enum(['qualite', 'operateur', 'client']),
  client_id: z.uuid().nullable(),
  active: z.boolean(),
});
export type Account = {
  user: { id: string; email?: string };
  profile: z.infer<typeof profileSchema>;
};

export async function createAuthClient() {
  if (!authConfigured())
    throw new AppError(
      503,
      'AUTH_NOT_CONFIGURED',
      'Les connexions ne sont pas encore activées. Veuillez réessayer après la mise en service.',
    );
  const { url, key } = authConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    // This application uses server endpoints exclusively; no browser SDK reads tokens.
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) cookieStore.set(name, value, options);
        } catch {
          /* Server Components cannot set cookies. The proxy performs refreshes. */
        }
      },
    },
  });
}
export async function requireUser() {
  const client = await createAuthClient();
  const { data, error } = await client.auth.getUser();
  if (isAuthProviderUnavailable(error))
    throw new AppError(
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      'La vérification de votre accès est temporairement indisponible. Réessayez dans quelques instants.',
    );
  if (error || !data.user)
    throw new AppError(401, 'UNAUTHENTICATED', 'Votre session a expiré. Reconnectez-vous.');
  if (!data.user.email_confirmed_at || data.user.is_anonymous)
    throw new AppError(
      403,
      'EMAIL_NOT_CONFIRMED',
      'Vérifiez votre adresse email pour accéder à votre espace.',
    );
  return { client, user: data.user };
}
export async function requireAccount(): Promise<Account> {
  const { client, user } = await requireUser();
  const { data, error, status } = await client
    .from('profiles')
    .select('id,display_name,role,client_id,active')
    .eq('id', user.id)
    .single();
  if (isAuthProviderUnavailable(error, status))
    throw new AppError(
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      'La vérification de votre accès est temporairement indisponible. Réessayez dans quelques instants.',
    );
  if (error || !data)
    throw new AppError(
      403,
      'ACCOUNT_UNAVAILABLE',
      'Votre accès n’est pas disponible. Contactez votre interlocuteur Écartéo.',
    );
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success || !parsed.data.active)
    throw new AppError(
      403,
      'ACCOUNT_DISABLED',
      'Votre accès n’est pas disponible. Contactez votre interlocuteur Écartéo.',
    );
  return { user: { id: user.id, email: user.email }, profile: parsed.data };
}
