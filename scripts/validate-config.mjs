import { pathToFileURL } from 'node:url';

export function validateConfiguration(env, production = false) {
  const problems = [];
  for (const key of [
    'APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
    if (!env[key]?.trim()) problems.push(`${key}: required`);
  for (const key of ['APP_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !production))
      )
        problems.push(
          `${key}: use an exact ${production ? 'HTTPS ' : ''}origin with no credentials, path, query or fragment`,
        );
    } catch {
      problems.push(`${key}: invalid URL`);
    }
  }
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username)
        problems.push('DATABASE_URL: use a PostgreSQL connection URI');
      if (production && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        problems.push('DATABASE_URL: production expects a remote managed database');
    } catch {
      problems.push('DATABASE_URL: invalid URI');
    }
  }
  if (production && (env.OPS_HEALTH_TOKEN?.length ?? 0) < 32)
    problems.push('OPS_HEALTH_TOKEN: use at least 32 random characters');
  if (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY
  )
    problems.push(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: must never contain the service credential',
    );
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (publicKey.startsWith('sb_secret_'))
    problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret key exposed');
  if (publicKey.split('.').length === 3) {
    try {
      if (
        JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role ===
        'service_role'
      )
        problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: service role key exposed');
    } catch {
      problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: malformed legacy key');
    }
  }
  const billingKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_BILLING_PLANS'];
  if (billingKeys.some((key) => env[key]?.trim())) {
    for (const key of billingKeys)
      if (!env[key]?.trim())
        problems.push(`${key}: configure all billing values or leave all blank`);
    if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_(test|live)_[a-zA-Z0-9]+$/.test(env.STRIPE_SECRET_KEY))
      problems.push('STRIPE_SECRET_KEY: invalid server key format');
    if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'))
      problems.push('STRIPE_WEBHOOK_SECRET: use the endpoint signing secret');
    if (env.STRIPE_BILLING_PLANS) {
      try {
        const plans = JSON.parse(env.STRIPE_BILLING_PLANS);
        if (
          !Array.isArray(plans) ||
          plans.length > 12 ||
          !plans.every(
            (plan) =>
              plan &&
              typeof plan === 'object' &&
              Object.keys(plan).length === 3 &&
              typeof plan.id === 'string' &&
              /^[a-z][a-z0-9-]{0,49}$/.test(plan.id) &&
              typeof plan.name === 'string' &&
              plan.name.trim().length > 0 &&
              plan.name.trim().length <= 100 &&
              typeof plan.priceId === 'string' &&
              /^price_[a-zA-Z0-9]+$/.test(plan.priceId),
          ) ||
          new Set(plans.map((plan) => plan.id)).size !== plans.length ||
          new Set(plans.map((plan) => plan.priceId)).size !== plans.length
        )
          throw new Error('Invalid plans');
      } catch {
        problems.push('STRIPE_BILLING_PLANS: use at most 12 unique {id,name,priceId} plan objects');
      }
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = validateConfiguration(process.env, process.argv.includes('--production'));
  for (const problem of problems) console.error(problem);
  console.log(
    problems.length
      ? `Configuration failed: ${problems.length} issue(s). Values were not printed.`
      : 'Configuration shape verified. Provider connectivity and email delivery still need acceptance tests.',
  );
  process.exitCode = problems.length ? 1 : 0;
}
