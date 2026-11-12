export type DeploymentTarget = 'fullstack' | 'frontend' | 'backend';

export function deploymentTarget(): DeploymentTarget {
  const target = process.env.ECARTEO_DEPLOYMENT_TARGET?.trim() || 'fullstack';
  if (target !== 'fullstack' && target !== 'frontend' && target !== 'backend')
    throw new Error('ECARTEO_DEPLOYMENT_TARGET must be fullstack, frontend or backend');
  return target;
}

export function isFrontendDeployment(): boolean {
  return deploymentTarget() === 'frontend';
}

/** A deployment-owned destination, never derived from request headers or user input. */
export function backendOrigin(): string | undefined {
  const value = process.env.ECARTEO_BACKEND_ORIGIN?.trim();
  if (!isFrontendDeployment()) {
    if (value) throw new Error('ECARTEO_BACKEND_ORIGIN is only valid on the frontend');
    return undefined;
  }
  if (!value) throw new Error('ECARTEO_BACKEND_ORIGIN is required on the frontend');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ECARTEO_BACKEND_ORIGIN must be an exact origin');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (local && process.env.NODE_ENV === 'production') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production'))
  )
    throw new Error('ECARTEO_BACKEND_ORIGIN must be an exact HTTPS origin');
  if (process.env.APP_URL && new URL(process.env.APP_URL).origin === url.origin)
    throw new Error('Frontend and backend origins must differ');
  for (const key of [
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_CA_CERT',
    'OPS_HEALTH_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_BILLING_PLANS',
  ]) {
    if (process.env[key]?.trim()) throw new Error(`${key} must only be configured on the backend`);
  }
  return url.origin;
}
