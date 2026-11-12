import { z } from 'zod';
import type { Locale } from './i18n';
import { authText } from './auth-copy';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
export type AuthResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  redirect?: string;
  passwordUpdated?: boolean;
};
export function getAuthInputSchema(locale: Locale) {
  const text = (key: Parameters<typeof authText>[0]) => authText(key, locale);
  const email = z.email(text('email')).max(254, text('emailLength'));
  const password = z
    .string()
    .min(12, text('passwordMin'))
    .refine((value) => new TextEncoder().encode(value).length <= 72, text('passwordBytes'));
  return z
    .discriminatedUnion('action', [
      z
        .object({
          action: z.literal('login'),
          email,
          password: z.string().min(1, text('passwordRequired')).max(256, text('passwordLength')),
          next: z.string().max(2048, text('redirectLength')).optional(),
        })
        .strict(),
      z
        .object({
          action: z.literal('signup'),
          name: z.string().trim().min(2, text('name')).max(120, text('nameLength')),
          company: z.string().trim().min(2, text('company')).max(250, text('companyLength')),
          email,
          password,
          confirmPassword: z.string().max(256, text('passwordLength')),
        })
        .strict(),
      z.object({ action: z.literal('forgot'), email }).strict(),
      z.object({ action: z.literal('resend'), email }).strict(),
      z.object({ action: z.literal('revoke-sessions') }).strict(),
      z
        .object({
          action: z.literal('reset'),
          password,
          confirmPassword: z.string().max(256, text('passwordLength')),
        })
        .strict(),
    ])
    .superRefine((input, ctx) => {
      if (
        (input.action === 'signup' || input.action === 'reset') &&
        input.password !== input.confirmPassword
      ) {
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: text('confirmation') });
      }
    });
}

export const authInputSchema = getAuthInputSchema('fr');

/** Only authenticated console destinations may be used as post-login redirects. */
export function safeNext(value?: string | null): string {
  if (!value || !/^\/app(?:[/?]|$)/.test(value) || /[\\\u0000-\u001f]/.test(value)) return '/app';
  const url = new URL(value, 'https://ecarteo.invalid');
  return url.origin === 'https://ecarteo.invalid' &&
    (url.pathname === '/app' || url.pathname.startsWith('/app/'))
    ? `${url.pathname}${url.search}`
    : '/app';
}
