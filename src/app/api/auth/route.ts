import { getAuthInputSchema, safeNext } from '@/lib/auth-schema';
import { authText } from '@/lib/auth-copy';
import { requestLocale } from '@/lib/locale';
import { createAuthClient, requireUser } from '@/server/auth';
import { confirmedSignupPath } from '@/lib/audit-offer';
import { consumeAuthAttempt } from '@/server/auth-rate-limit';
import { isAuthProviderUnavailable } from '@/server/auth-provider-errors';
import { siteOrigin } from '@/server/config';
import { apiError, assertSameOrigin, json, readJson } from '@/server/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const locale = requestLocale(request);
  const text = (key: Parameters<typeof authText>[0]) => authText(key, locale);
  try {
    assertSameOrigin(request);
    const parsed = getAuthInputSchema(locale).safeParse(await readJson(request, 8 * 1024));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fieldErrors[String(issue.path[0] || 'form')] ||= [
          'invalid_type',
          'unrecognized_keys',
          'invalid_union',
        ].includes(issue.code)
          ? text('fields')
          : issue.message;
      return json({ error: text('fields'), fieldErrors }, 400);
    }
    const input = parsed.data;
    const client = await createAuthClient();
    if (
      input.action !== 'reset' &&
      input.action !== 'revoke-sessions' &&
      !(await consumeAuthAttempt(input.email))
    ) {
      return json({ error: text('rateLimit') }, 429);
    }
    if (input.action === 'login') {
      const { error } = await client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error)
        return json(
          {
            error:
              error.status === 429
                ? text('providerRateLimit')
                : isAuthProviderUnavailable(error)
                  ? text('authUnavailable')
                  : text('credentials'),
          },
          error.status === 429 ? 429 : isAuthProviderUnavailable(error) ? 503 : 400,
        );
      return json({ redirect: safeNext(input.next) });
    }
    if (input.action === 'signup') {
      const { data, error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            display_name: input.name,
            company_name: input.company,
            ...(input.offer ? { audit_offer: input.offer } : {}),
          },
          emailRedirectTo: `${siteOrigin()}/auth/callback`,
        },
      });
      // The owner explicitly chose to identify registered emails at signup.
      // Supabase may report a duplicate as an error or an obfuscated user.
      const duplicateError =
        error &&
        (error.status === 400 || error.status === 422) &&
        (error.code === 'user_already_exists' || error.code === 'email_exists');
      const obfuscatedUser = !error && !data.session && data.user?.identities?.length === 0;
      if (duplicateError || obfuscatedUser)
        return json(
          {
            code: 'EMAIL_ALREADY_REGISTERED',
            error: text('emailRegistered'),
            fieldErrors: { email: text('emailRegistered') },
          },
          409,
        );
      if (error)
        return json(
          {
            error:
              error.status === 429
                ? text('providerRateLimit')
                : isAuthProviderUnavailable(error)
                  ? text('authUnavailable')
                  : text('signupFailed'),
          },
          error.status === 429 ? 429 : isAuthProviderUnavailable(error) ? 503 : 400,
        );
      if (data.session && data.user?.email_confirmed_at)
        return json({ redirect: confirmedSignupPath(input.offer) });
      return json({
        message: text('signupSent'),
      });
    }
    if (input.action === 'forgot' || input.action === 'resend') {
      const result =
        input.action === 'forgot'
          ? await client.auth.resetPasswordForEmail(input.email, {
              redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
            })
          : await client.auth.resend({
              type: 'signup',
              email: input.email,
              options: { emailRedirectTo: `${siteOrigin()}/auth/callback` },
            });
      if (
        result.error &&
        !(result.error.status === 429 && result.error.code === 'over_email_send_rate_limit') &&
        (result.error.status === 429 || isAuthProviderUnavailable(result.error))
      )
        return json(
          { error: text('deliveryUnavailable') },
          result.error.status === 429 ? 429 : 503,
        );
      return json({
        message: input.action === 'forgot' ? text('recoverySent') : text('confirmationSent'),
      });
    }
    await requireUser();
    if (input.action === 'reset') {
      try {
        const { error } = await client.auth.updateUser({ password: input.password });
        if (error)
          return json(
            {
              error:
                error.status === 429
                  ? text('providerRateLimit')
                  : isAuthProviderUnavailable(error)
                    ? text('resetUnconfirmed')
                    : text('resetFailed'),
            },
            error.status === 429 ? 429 : isAuthProviderUnavailable(error) ? 503 : 400,
          );
      } catch {
        // A lost response may follow a committed password change. Do not claim
        // either success or rejection, or advance to session revocation.
        return json({ error: text('resetUnconfirmed') }, 503);
      }
    }
    const { error: signOutError } = await client.auth.signOut({ scope: 'global' });
    if (signOutError)
      return json(
        {
          passwordUpdated: true,
          error: text('revocationFailed'),
        },
        503,
      );
    return json({ redirect: '/login?notice=password-updated' });
  } catch (error) {
    return apiError(error, request);
  }
}
