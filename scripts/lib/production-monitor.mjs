import { setTimeout as wait } from 'node:timers/promises';

const reviewedOrigins = new Set([
  'https://ecarteo-production.onrender.com',
  'https://app.ecarteo.fr',
  'https://ecarteo.fr',
]);
const publicPages = ['/', '/login', '/signup'];

export class ProductionCheckError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionCheckError';
    this.code = code;
  }
}

export function monitorConfiguration(env) {
  const { ORIGIN: origin, HEALTH_TOKEN: healthToken, CLEANUP_TOKEN: cleanupToken } = env;
  if (
    !reviewedOrigins.has(origin) ||
    typeof healthToken !== 'string' ||
    healthToken.length < 32 ||
    typeof cleanupToken !== 'string' ||
    cleanupToken.length < 32 ||
    healthToken === cleanupToken ||
    ![undefined, '', 'true', 'false'].includes(env.APPLY)
  )
    throw new ProductionCheckError('monitor_configuration_invalid');
  return { origin, healthToken, cleanupToken, apply: env.APPLY === 'true' };
}

export async function runProductionMonitor(config, options = {}) {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const log = options.log ?? console.log;
  const pause =
    options.pause ?? ((milliseconds, signal) => wait(milliseconds, undefined, { signal }));
  // Fail normally before the workflow's five-minute step deadline.
  const signal = options.signal ?? AbortSignal.timeout(270_000);

  async function request(path, token, method = 'GET', timeoutMs = 90_000) {
    signal.throwIfAborted();
    return fetchRequest(config.origin + path, {
      method,
      headers: token ? { authorization: 'Bearer ' + token } : { accept: 'text/html' },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
  }

  async function json(path, token, method = 'GET') {
    const response = await request(path, token, method);
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Unsuccessful check');
    }
    return response.json();
  }

  let ready = false;
  for (let attempt = 0; attempt < 2 && !ready; attempt++) {
    try {
      const result = await json('/api/ready', config.healthToken);
      ready =
        result.status === 'ready' &&
        ['configuration', 'database', 'schema', 'storage'].every(
          (key) => result.checks?.[key] === true,
        );
    } catch {
      // One bounded retry allows a sleeping Render service to start.
    }
    if (!ready && !attempt && !signal.aborted) {
      try {
        await pause(15_000, signal);
      } catch {
        break;
      }
    }
  }
  if (!ready) throw new ProductionCheckError('readiness_failed');
  log('Production readiness passed.');

  try {
    for (const path of publicPages) {
      // No operations token, cookies, form submission or response body is sent to logs.
      const response = await request(path, undefined, 'GET', 20_000);
      const valid =
        response.status === 200 &&
        /^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '');
      await response.body?.cancel();
      if (!valid) throw new Error('Public page unavailable');
    }
  } catch {
    throw new ProductionCheckError('public_entry_page_failed');
  }
  log('Public entry pages passed: /, /login, /signup.');

  const path = '/api/maintenance/staged-uploads';
  let eligible;
  try {
    const preview = await json(path, config.cleanupToken);
    if (!Number.isSafeInteger(preview.eligible) || preview.eligible < 0)
      throw new Error('Invalid preview');
    eligible = preview.eligible;
  } catch {
    throw new ProductionCheckError('cleanup_preview_failed');
  }
  log('Eligible expired staged uploads: ' + eligible);

  let removed = 0;
  if (config.apply && eligible) {
    try {
      const result = await json(path, config.cleanupToken, 'POST');
      if (!Number.isSafeInteger(result.removed) || result.removed < 0 || result.removed > 100)
        throw new Error('Invalid cleanup result');
      removed = result.removed;
      log('Removed expired staged uploads: ' + removed);
      if (removed < eligible || removed === 100) {
        const remaining = await json(path, config.cleanupToken);
        if (remaining.eligible !== 0) throw new ProductionCheckError('cleanup_backlog_remaining');
      }
    } catch (error) {
      if (error instanceof ProductionCheckError) throw error;
      throw new ProductionCheckError('cleanup_failed');
    }
  }
  return {
    status: 'ready',
    publicPages: publicPages.length,
    eligible,
    removed,
    apply: config.apply,
  };
}
