import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { AppError, apiError, json } from '@/server/http';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AppError(404, 'NOT_FOUND', 'Rapport introuvable.');
    const { client } = await requireUser();
    // Authenticated PostgREST uses the provider token and report visibility RLS.
    const { data: report, error: reportError } = await client
      .from('published_reports')
      .select('mission_id')
      .eq('mission_id', id)
      .maybeSingle();
    if (reportError || !report) throw new AppError(404, 'NOT_FOUND', 'Rapport introuvable.');
    const { data, error } = await client
      .from('report_addenda')
      .select('id,body,created_at')
      .eq('mission_id', id)
      .order('created_at')
      .order('id');
    if (error) throw error;
    return json({ addenda: data });
  } catch (error) {
    return apiError(error, request);
  }
}
