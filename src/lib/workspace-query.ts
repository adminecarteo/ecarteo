import { z } from 'zod';
import type { CorrectiveAction, Localized } from '@/domain/types';

export const workspaceQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  q: z.string().trim().max(120).default(''),
  client: z.uuid().optional(),
  id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  view: z
    .enum([
      'tableau',
      'scenarios',
      'missions',
      'notation',
      'preuves',
      'rapport',
      'retest',
      'bibliotheque',
    ])
    .optional(),
});
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;
export type WorkspaceQueryInput = z.input<typeof workspaceQuerySchema>;
export interface WorkspacePage {
  nextCursor: string | null;
  hasPrevious: boolean;
  count: number;
  limit: number;
}
export interface WorkspaceSummary {
  completed: number;
  inProgress: number;
  openActions: number;
  urgentActions: number;
  completedActions: number;
  averageScore: number | null;
  averageHours: number;
  months: { month: string; score: number }[];
  criteria: Record<string, number | null>;
  clientDashboard?: ClientDashboardSummary;
}
export interface ClientDashboardSummary {
  /** Up to twelve reports, oldest publication first. */
  reports: { missionId: string; title: Localized; publishedAt: string; score: number }[];
  nextAction: Pick<CorrectiveAction, 'id' | 'missionId' | 'text' | 'owner' | 'dueAt'> | null;
}
export function workspaceQueryParams(params: URLSearchParams): WorkspaceQueryInput {
  const input: Record<string, string> = {};
  for (const key of ['cursor', 'q', 'client', 'id', 'limit', 'view']) {
    const value = params.get(key);
    if (value && !(key === 'client' && value === 'all')) input[key] = value;
  }
  return input;
}
