import { z } from 'zod';
import type { AppState } from '@/domain/types';
const localized = z.union([z.string(), z.object({ fr: z.string(), en: z.string() })]);
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
const comments = z.partialRecord(criterion, localized);
const scenario = z.object({
  id: z.string(),
  clientId: z.string(),
  title: localized,
  family: z.enum(['info', 'devis', 'tel', 'chat', 'recl', 'annul', 'lang', 'noresp']),
  objective: localized,
  channels: z.array(z.enum(['form', 'email', 'phone', 'whatsapp', 'chat', 'social'])),
  lang: z.enum(['FR', 'EN', 'ES', 'AR', 'DE', 'IT', 'PT', 'ZH']),
  persona: localized,
  steps: z.array(z.object({ label: localized, seuil: localized })),
  evidence: z.array(z.string()),
  limits: localized,
  status: z.enum(['draft', 'validated']),
  parentId: z.string().nullable(),
  createdAt: z.string(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
});
const evidence = z.object({
  id: z.string(),
  missionId: z.string(),
  type: z.enum(['capture', 'email', 'appel', 'note', 'fichier']),
  at: z.string(),
  label: localized,
  text: localized,
  img: z.string().nullable(),
  file: z.string().nullable(),
  fileId: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().nonnegative().optional(),
});
const action = z.object({
  id: z.string(),
  missionId: z.string(),
  critId: criterion,
  horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  done: z.boolean(),
  text: localized,
  owner: localized,
  dueAt: z.string(),
  completedAt: z.string().nullable(),
  completedBy: z.string().nullable(),
});
const report = z.object({
  missionId: z.string(),
  date: z.string(),
  operator: z.string(),
  scenario,
  criteriaVersion: z.string(),
  scores,
  comments,
  critical: z.boolean(),
  score: z.number().min(0).max(100),
  level: z.enum(['ok', 'warn', 'bad', 'crit']),
  evidence: z.array(evidence),
  actions: z.array(action),
  validatedBy: z.string(),
  validatedAt: z.string(),
});
const mission = z.object({
  id: z.string(),
  scenarioId: z.string(),
  scenarioSnapshot: scenario,
  criteriaVersion: z.string(),
  baselineMissionId: z.string().nullable(),
  date: z.string(),
  operator: z.string(),
  operatorId: z.string().optional(),
  status: z.enum(['todo', 'doing', 'review', 'done']),
  elapsed: z.number().nonnegative(),
  runningSince: z.number().nullable(),
  steps: z.array(z.object({ done: z.boolean(), at: z.string().nullable(), note: z.string() })),
  log: z.array(z.object({ at: z.string(), text: localized })),
  scores,
  comments,
  scoringDraft: z
    .object({
      revision: z.number().int().positive(),
      actions: z
        .array(
          z.object({
            critId: criterion,
            horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
            include: z.boolean(),
            owner: localized,
            text: localized,
          }),
        )
        .max(8),
    })
    .optional(),
  critical: z.boolean(),
  validatedBy: z.string().nullable(),
  validatedAt: z.string().nullable(),
  reportSnapshot: report.nullable(),
});
export const workspaceSchema: z.ZodType<AppState> = z.object({
  version: z.literal(1),
  clients: z.array(
    z.object({ id: z.string(), name: z.string(), sites: z.number().int().nonnegative() }),
  ),
  scenarios: z.array(scenario),
  missions: z.array(mission),
  evidence: z.array(evidence),
  actions: z.array(action),
});
