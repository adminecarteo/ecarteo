import { requireUser } from '@/server/auth';
import { apiError, assertSameOrigin, json, readJson } from '@/server/http';
import {
  claimRegistrationReceipt,
  clearRegistrationReceipt,
  readRegistrationReceipt,
  type RegistrationClaim,
} from '@/server/registration-analytics';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    const response = apiError(error, request);
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  let result: RegistrationClaim = { track: false, next: '/app' };
  try {
    // Invalid/oversized consent fails closed and consumes a valid activation opportunity.
    let input: unknown = null;
    try {
      input = await readJson(request, 1024);
    } catch {
      /* Registration remains usable without analytics. */
    }
    const consent =
      input && typeof input === 'object' && !Array.isArray(input) && 'consent' in input
        ? input.consent
        : null;
    const receipt = await readRegistrationReceipt();
    if (receipt) {
      const { user } = await requireUser();
      result = await claimRegistrationReceipt(user.id, receipt, consent);
    }
  } catch {
    /* Auth/database/analytics failure must not prevent access to an activated account. */
  }
  try {
    await clearRegistrationReceipt();
  } catch {
    /* Cookie failure cannot turn this optional measurement into a registration failure. */
  }
  const response = json(result);
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
