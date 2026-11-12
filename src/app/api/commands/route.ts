import { z } from 'zod';
import { requireAccount } from '@/server/auth';
import { executeWorkspaceCommand } from '@/server/workspace';
import { assertSameOrigin, json, readJson, AppError } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
import { workspaceQuerySchema } from '@/lib/workspace-query';

export const runtime = 'nodejs';
const inputSchema = z
  .object({
    command: z.unknown(),
    idempotencyKey: z.uuid(),
    query: workspaceQuerySchema.optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await requireAccount();
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new AppError(400, 'INVALID_REQUEST', 'La commande ou sa clé de suivi est invalide.');
    return json(
      await executeWorkspaceCommand(account, parsed.data.command, {
        idempotencyKey: parsed.data.idempotencyKey,
        query: parsed.data.query,
      }),
    );
  } catch (error) {
    return workspaceError(error, request);
  }
}
