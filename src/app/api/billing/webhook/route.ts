import { json, readBody } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
import { verifyBillingWebhook, handleBillingWebhook } from '@/server/billing';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    // Stripe sends server-to-server requests: authentication is the signed RAW
    // body, never the browser session, an Origin header, or JSON metadata.
    const event = verifyBillingWebhook(
      await readBody(request, 1_048_576),
      request.headers.get('stripe-signature'),
    );
    await handleBillingWebhook(event);
    return json({ received: true });
  } catch (error) {
    return workspaceError(error, request);
  }
}
