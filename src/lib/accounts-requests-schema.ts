import type { AuditOfferId } from './audit-offer';
import { z } from 'zod';

export const invitationSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    role: z.enum(['qualite', 'operateur', 'client']),
    clientId: z.uuid().nullable(),
    isClientAdmin: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) => (value.role === 'client') === Boolean(value.clientId),
    'Organisation invalide.',
  )
  .refine((value) => !value.isClientAdmin || value.role === 'client', 'Rôle invalide.');

export const memberSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string().trim().min(2).max(120),
    active: z.boolean(),
    isClientAdmin: z.boolean(),
    expected: z
      .object({ displayName: z.string(), active: z.boolean(), isClientAdmin: z.boolean() })
      .strict(),
  })
  .strict();
export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    displayName: z.string().trim().min(2).max(120),
  })
  .strict();
export const requestSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(5).max(160),
    sector: z.enum(['hospitality', 'health', 'training', 'property']),
    channels: z
      .array(z.enum(['form', 'email', 'phone', 'whatsapp', 'chat', 'social']))
      .min(1)
      .max(6)
      .refine((values) => new Set(values).size === values.length),
    siteCount: z.number().int().min(1).max(10000),
    preferredDate: z.iso.date().nullable(),
    brief: z.string().trim().min(20).max(5000),
  })
  .strict();
export const reviewRequestSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().min(1),
    action: z.enum(['accept', 'decline', 'cancel', 'convert']),
    note: z.string().trim().max(2000).default(''),
  })
  .strict();
export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(160).default(''),
    status: z
      .enum(['all', 'submitted', 'accepted', 'declined', 'cancelled', 'converted'])
      .default('all'),
  })
  .strict();
export const requestListQuerySchema = listQuerySchema.extend({
  status: z
    .enum(['all', 'submitted', 'accepted', 'declined', 'cancelled', 'converted', 'published'])
    .default('all'),
});

export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  clientId: string | null;
  clientName: string | null;
  active: boolean;
  isClientAdmin: boolean;
}
export interface InvitationRecord {
  id: string;
  email: string;
  role: string;
  clientName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  expired: boolean;
}
export interface AuditRequestRecord {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  sector: string;
  channels: string[];
  siteCount: number;
  preferredDate: string | null;
  brief: string;
  status: string;
  reviewNote: string;
  scenarioId: string | null;
  publishedReports: { missionId: string; publishedAt: string; isRetest: boolean }[];
  revision: number;
  createdAt: string;
}
export interface RequestPage {
  suggestedOffer?: AuditOfferId;
  items: AuditRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}
export interface TeamPage {
  members: MemberRecord[];
  invitations: InvitationRecord[];
  clients: { id: string; name: string }[];
  clientTotal: number;
  total: number;
  page: number;
  pageSize: number;
}
export interface OrganizationPage {
  clients: { id: string; name: string }[];
  total: number;
  page: number;
  pageSize: number;
}
