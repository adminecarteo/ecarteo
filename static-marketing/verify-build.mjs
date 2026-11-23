import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'out/marketing/public');
const routes = ['/', '/methode', '/offres', '/mentions-legales', '/confidentialite', '/conditions'];
const google = 'ecarteo_public_verification_example_2026';
const privateSentinel = 'ecarteo_private_configuration_must_never_be_bundled';
const cases = [
  { name: 'canonical production', origin: 'https://ecarteo.fr', index: true, google },
  {
    name: 'invalid verification tag',
    origin: 'https://ecarteo.fr/',
    index: true,
    google: '<meta>',
  },
  { name: 'lookalike origin', origin: 'https://ecarteo.fr.example.test', index: false, google },
  { name: 'backend only', origin: 'https://ecarteo.fr', target: 'backend', index: false, google },
  { name: 'development', origin: 'https://ecarteo.fr', mode: 'development', index: false, google },
  // Leave a fail-closed preview artifact for local review after the tests.
  { name: 'unconfigured preview', origin: '', index: false, google },
];

for (const scenario of cases) {
  try {
    execFileSync(process.execPath, ['scripts/build-marketing.mjs'], {
      cwd: project,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: scenario.mode ?? 'production',
        APP_URL: scenario.origin,
        ECARTEO_DEPLOYMENT_TARGET: scenario.target ?? 'fullstack',
        GOOGLE_SITE_VERIFICATION: scenario.google,
        DATABASE_URL: privateSentinel,
        SUPABASE_SERVICE_ROLE_KEY: privateSentinel,
      },
      stdio: 'pipe',
      timeout: 30_000,
    });
  } catch (error) {
    throw new Error(`Marketing build failed: ${scenario.name}`, { cause: error });
  }
  const robots = await readFile(path.join(output, 'robots.txt'), 'utf8');
  const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
  assert.equal(robots.includes('Allow: /'), scenario.index);
  assert.equal(robots.includes('Disallow: /\n'), !scenario.index);
  assert.equal(robots.includes('Sitemap: https://ecarteo.fr/sitemap.xml'), scenario.index);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(
    locations,
    scenario.index ? routes.map((route) => `https://ecarteo.fr${route}`) : [],
  );
  const assets = await readdir(path.join(output, 'marketing-assets'));
  const scripts = assets.filter((file) => file.endsWith('.js'));
  const css = (
    await Promise.all(
      assets
        .filter((file) => file.endsWith('.css'))
        .map((file) => readFile(path.join(output, 'marketing-assets', file), 'utf8')),
    )
  ).join('\n');
  assert(scripts.length > 0 && css.length > 0);
  for (const script of scripts) {
    const body = await readFile(path.join(output, 'marketing-assets', script), 'utf8');
    assert(
      !body.includes(privateSentinel),
      'Private environment must never reach the static bundle.',
    );
    assert(
      !body.includes('process.env'),
      'Static browser code must not depend on Node environment.',
    );
    assert(
      !body.includes('/_next/') && !body.includes('__next_f'),
      'No Next runtime in marketing.',
    );
  }
  const pageFiles = (await readdir(output)).filter((file) => file.endsWith('.html')).sort();
  assert.deepEqual(
    pageFiles,
    ['index.html', ...routes.slice(1).map((route) => `${route.slice(1)}.html`)].sort(),
  );
  for (const route of routes) {
    const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
    const html = await readFile(path.join(output, file), 'utf8');
    assert(html.includes(`<link rel="canonical" href="https://ecarteo.fr${route}">`));
    assert(
      html.includes(
        `<meta name="robots" content="${scenario.index ? 'index, follow' : 'noindex, nofollow'}">`,
      ),
    );
    assert(html.includes('<html lang="fr">') && html.includes('<h1') && html.includes('<main'));
    assert(
      !html.includes('/_next/') && !html.includes('__next_f') && !html.includes(privateSentinel),
    );
    assert.equal(
      html.includes('name="google-site-verification"'),
      scenario.index && scenario.google === google,
    );
    for (const match of html.matchAll(/class="([^"]+)"/g)) {
      for (const name of match[1].split(/\s+/)) {
        assert(css.includes(`.${name}`), `SSR CSS class missing from browser build: ${name}`);
      }
    }
    for (const match of html.matchAll(/(?:href|src)="(\/marketing-assets\/[^"?#]+)"/g)) {
      assert(
        (await readFile(path.join(output, match[1]))).length > 0,
        'Missing local marketing asset.',
      );
    }
  }
  console.log(
    `PASS: ${scenario.name} — six complete pages, discovery rules, verification and isolated assets.`,
  );
}
