import { requireAccount } from '@/server/auth';
import { getAttachment, deleteStagedAttachment } from '@/server/workspace';
import { assertSameOrigin, privateHeaders } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const file = await getAttachment(await requireAccount(), id);
    return new Response(file.bytes as BodyInit, {
      headers: {
        ...privateHeaders,
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await deleteStagedAttachment(await requireAccount(), (await context.params).id);
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    return workspaceError(error, request);
  }
}
