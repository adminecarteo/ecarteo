import { requireAccount, requireUser } from '@/server/auth';
import { AppError, apiError, json } from '@/server/http';

export const runtime = 'nodejs';

/** Browser-facing identity bootstrap; never returns provider tokens or SDK objects. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') ?? 'account';
    if (
      !['user', 'account'].includes(mode) ||
      params.getAll('mode').length > 1 ||
      [...params.keys()].some((key) => key !== 'mode')
    )
      throw new AppError(400, 'INVALID_REQUEST', 'La demande est invalide.');
    if (mode === 'user') {
      // Invited identities and recovery sessions may not have an application profile yet.
      const { user } = await requireUser();
      return json({ user: { id: user.id, email: user.email ?? null } });
    }
    const { user, profile } = await requireAccount();
    return json({
      user: { id: user.id, email: user.email ?? null },
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        role: profile.role,
        client_id: profile.client_id,
        active: profile.active,
      },
    });
  } catch (error) {
    return apiError(error, request);
  }
}
