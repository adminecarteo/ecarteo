import { requireAccount } from '@/server/auth';
import { assertSameOrigin, json, readJson, AppError } from '@/server/http';
import { workspaceError } from '@/server/workspace-http';
import {
  billingActionSchema,
  loadBilling,
  createCheckout,
  createBillingPortal,
  cancelCheckout,
} from '@/server/billing';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json(await loadBilling(await requireAccount()));
  } catch (error) {
    return workspaceError(error, request);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await requireAccount();
    const parsed = billingActionSchema.safeParse(await readJson(request, 4_096));
    if (!parsed.success)
      throw new AppError(400, 'INVALID_BILLING_REQUEST', 'La demande de facturation est invalide.');
    const input = parsed.data;
    if (input.action === 'checkout') return json(await createCheckout(account, input.plan));
    if (input.action === 'portal') return json(await createBillingPortal(account));
    return json(await cancelCheckout(account));
  } catch (error) {
    return workspaceError(error, request);
  }
}
