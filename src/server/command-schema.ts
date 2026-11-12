import { z } from 'zod';
import type { Command } from '@/domain/types';

const uuid = z.uuid();
const text = z.union([
  z.string().max(10000),
  z.strictObject({ fr: z.string().max(10000), en: z.string().max(10000) }),
]);
const criterion = z.enum([
  'dispo',
  'vitesse',
  'compr',
  'commercial',
  'omni',
  'lang',
  'sensible',
  'suivi',
]);
const scores = z.partialRecord(
  criterion,
  z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()]),
);
const comments = z.partialRecord(criterion, text);
const fingerprint = z.string().max(100000).optional();
const draft = z.strictObject({
  clientId: uuid,
  title: text,
  family: z.enum(['info', 'devis', 'tel', 'chat', 'recl', 'annul', 'lang', 'noresp']),
  objective: text,
  channels: z
    .array(z.enum(['form', 'email', 'phone', 'whatsapp', 'chat', 'social']))
    .min(1)
    .max(6),
  lang: z.enum(['FR', 'EN', 'ES', 'AR', 'DE', 'IT', 'PT', 'ZH']),
  persona: text,
  steps: z
    .array(z.strictObject({ label: text, seuil: text }))
    .min(1)
    .max(100),
  evidence: z.array(z.enum(['formcap', 'emails', 'calls', 'callnotes', 'chatcap', 'wacap'])).max(6),
  limits: text,
});
const action = z.strictObject({
  critId: criterion,
  horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  text,
  owner: text,
});
export const commandSchema: z.ZodType<Command> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('scenario.create'), draft }),
  z.strictObject({
    type: z.literal('scenario.update'),
    id: uuid,
    draft,
    expectedFingerprint: z.string().max(100000),
  }),
  z.strictObject({ type: z.literal('scenario.approve'), id: uuid }),
  z.strictObject({ type: z.literal('scenario.duplicate'), id: uuid }),
  z.strictObject({
    type: z.literal('mission.create'),
    scenarioId: uuid,
    date: z.string().max(40),
    operator: uuid,
  }),
  z.strictObject({ type: z.literal('mission.timer'), id: uuid, running: z.boolean() }),
  z.strictObject({
    type: z.literal('mission.step'),
    id: uuid,
    index: z.number().int().min(0).max(99),
    done: z.boolean().optional(),
    note: z.string().max(10000).optional(),
    expectedNote: z.string().max(10000).optional(),
  }),
  z.strictObject({
    type: z.literal('mission.submit'),
    id: uuid,
    allowIncomplete: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('evidence.add'),
    missionId: uuid,
    evidence: z.strictObject({
      type: z.enum(['capture', 'email', 'appel', 'note', 'fichier']),
      label: text,
      text,
      file: z.string().max(500).nullable().optional(),
      img: z.null().optional(),
      fileId: uuid.optional(),
      mimeType: z.string().max(150).optional(),
      size: z.number().int().min(1).max(10485760).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('mission.score'),
    id: uuid,
    scores,
    comments,
    critical: z.boolean(),
    expectedScoringFingerprint: fingerprint,
  }),
  z.strictObject({
    type: z.literal('mission.approve'),
    id: uuid,
    actions: z.array(action).max(100),
    scores: scores.optional(),
    comments: comments.optional(),
    critical: z.boolean().optional(),
    expectedScoringFingerprint: fingerprint,
  }),
  z.strictObject({ type: z.literal('mission.retest'), id: uuid }),
  z.strictObject({ type: z.literal('action.toggle'), id: uuid, done: z.boolean() }),
]);
export const idempotencyKeySchema = uuid;
