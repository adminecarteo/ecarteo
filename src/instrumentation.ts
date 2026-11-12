import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = (_error, _request, context) => {
  // routePath is the framework route template, not a user URL or query string.
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled_request_error',
      at: new Date().toISOString(),
      route: context.routePath,
      category: context.routeType,
    }),
  );
};
