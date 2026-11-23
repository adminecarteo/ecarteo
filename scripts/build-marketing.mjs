import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'out/marketing');
const publicOutput = path.join(output, 'public');
const serverOutput = path.join(output, 'server');
const source = (file) => path.join(project, 'static-marketing', file);

// No .env files are loaded. Only explicit public site configuration influences this output.
process.env.NODE_ENV ??= 'production';
const shared = {
  configFile: false,
  root: project,
  mode: 'production',
  logLevel: 'warn',
  envDir: false,
  publicDir: false,
  base: '/',
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: source('link.tsx') },
      { find: /^@\/lib\/locale-context$/, replacement: source('locale-context.tsx') },
      { find: '@', replacement: path.join(project, 'src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  build: {
    sourcemap: false,
    assetsDir: 'marketing-assets',
    emptyOutDir: true,
    rolldownOptions: {
      onwarn(warning, warn) {
        // Shared components retain Next's directive; this independent client/SSR build has no RSC.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
          return;
        warn(warning);
      },
    },
  },
};

const client = await build({
  ...shared,
  build: {
    ...shared.build,
    outDir: publicOutput,
    manifest: true,
    rolldownOptions: { ...shared.build.rolldownOptions, input: source('entry-client.tsx') },
  },
});
assert(!Array.isArray(client) && 'output' in client, 'Expected one static client bundle.');
const clientModules = client.output
  .filter((entry) => entry.type === 'chunk')
  .flatMap((entry) => Object.keys(entry.modules));
assert(
  clientModules.every(
    (id) =>
      !/\/(?:src\/server|src\/app\/(?:api|auth)|src\/components\/auth|node_modules\/(?:next|@supabase|postgres|stripe))\//.test(
        id,
      ),
  ),
  'Static marketing must not bundle Next routing, authentication or backend code.',
);

await build({
  ...shared,
  build: {
    ...shared.build,
    outDir: serverOutput,
    ssr: source('entry-server.tsx'),
    rolldownOptions: {
      ...shared.build.rolldownOptions,
      output: { entryFileNames: 'entry-server.mjs' },
    },
  },
});

const { render, configuration } = await import(
  pathToFileURL(path.join(serverOutput, 'entry-server.mjs')).href
);
const config = configuration();
const manifest = JSON.parse(await readFile(path.join(publicOutput, '.vite/manifest.json'), 'utf8'));
const entry = manifest['static-marketing/entry-client.tsx'];
assert(entry?.isEntry && entry.file.startsWith('marketing-assets/'), 'Missing marketing entry.');
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const css = (entry.css ?? [])
  .map((file) => `<link rel="stylesheet" href="/${escape(file)}">`)
  .join('\n');
const robots = config.index
  ? `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: ${config.origin}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n';
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
  config.index
    ? config.paths.map((route) => `<url><loc>${config.origin}${route}</loc></url>`).join('')
    : ''
}</urlset>\n`;
for (const route of config.paths) {
  const page = render(route);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="${config.index ? 'index, follow' : 'noindex, nofollow'}">
<link rel="canonical" href="${escape(page.canonical)}">
${typeof config.google === 'string' ? `<meta name="google-site-verification" content="${escape(config.google)}">` : ''}
<link rel="icon" href="/icon.svg" type="image/svg+xml">
${css}
<script type="module" src="/${escape(entry.file)}"></script>
</head>
<body><div id="marketing-root" data-page="${escape(route)}">${page.html}</div></body>
</html>
`;
  assert(html.includes('<h1') && html.includes('<main'), `Missing rendered content: ${route}`);
  assert(!html.includes('/_next/') && !html.includes('__next_f'), 'Unexpected Next/RSC payload.');
  const file = path.join(publicOutput, route === '/' ? 'index.html' : `${route.slice(1)}.html`);
  await writeFile(file, html);
}
await writeFile(path.join(publicOutput, 'robots.txt'), robots);
await writeFile(path.join(publicOutput, 'sitemap.xml'), sitemap);
await cp(path.join(project, 'src/app/icon.svg'), path.join(publicOutput, 'icon.svg'));
// The SSR renderer/manifest stay out of the publish directory; no private app artifacts are copied.
await rm(path.join(publicOutput, '.vite'), { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, 'build-receipt.json'),
  JSON.stringify(
    {
      routes: config.paths,
      indexable: config.index,
      googleVerificationIncluded: typeof config.google === 'string',
      clientModuleCount: clientModules.length,
      privateOrNextClientModules: 0,
      publishDirectory: 'out/marketing/public',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Static marketing: ${config.paths.length} prerendered pages; indexing ${config.index ? 'enabled' : 'blocked'}; no Next/auth/backend client modules.`,
);
