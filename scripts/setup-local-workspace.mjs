#!/usr/bin/env node
// Explicit local onboarding utility. No production route, auth bypass or automatic app seed.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { request } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--accounts-only', '--seed'].includes(mode)) {
  console.error('Usage: node scripts/setup-local-workspace.mjs --accounts-only | --seed');
  process.exit(1);
}
const files = {
  environment: resolve(root, '.env.local'),
  accounts: resolve(root, '.env.local-accounts'),
  tests: resolve(root, '.env.e2e.local'),
};
const read = (file) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {});
const credentials = read(files.accounts);
let environment = {};
let db;
const contexts = [];
function save(file, values, description) {
  const temporary = `${file}.tmp`;
  const content = `# ${description}\n# Local only. Never commit or share provider keys.\n${Object.entries(
    values,
  )
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join('\n')}\n`;
  writeFileSync(temporary, content, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}
const saveAccounts = () =>
  save(
    files.accounts,
    credentials,
    'Écartéo local account credentials and idempotent sample-workflow receipts',
  );
function loopback(value, label) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error(`${label} must use loopback. Refusing hosted or remote resources.`);
  return url;
}
function passphrase() {
  const words = [
    'Amber',
    'Birch',
    'Cedar',
    'Cloud',
    'Coral',
    'Dawn',
    'Ember',
    'Fern',
    'Flint',
    'Frost',
    'Harbor',
    'Hazel',
    'Indigo',
    'Jade',
    'Lake',
    'Maple',
    'Meadow',
    'Moon',
    'Ocean',
    'Olive',
    'Opal',
    'Orchid',
    'Pebble',
    'Pine',
    'Reed',
    'River',
    'Rose',
    'Sage',
    'Stone',
    'Sun',
    'Willow',
    'Wind',
  ];
  return [
    ...Array.from({ length: 3 }, () => words[randomInt(words.length)]),
    randomBytes(12).toString('base64url'),
  ].join('-');
}
function localCommandResult(command, args) {
  // Status contains generated keys: capture it privately and never inherit stdout.
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      'Local Supabase status failed. Start the ecarteo-local project first; no configuration was changed.',
    );
  }
}
async function provision(admin, key, email, role, displayName) {
  const matches =
    await db`select id,email_confirmed_at,raw_user_meta_data from auth.users where lower(email)=${email}`;
  let user = matches[0];
  if (
    user &&
    credentials[`${key}_USER_ID`] !== user.id &&
    user.raw_user_meta_data?.ecarteo_local_fixture_id !== credentials.SETUP_INSTANCE_ID
  )
    throw new Error(
      `${email} already exists outside this setup's ownership. Its password, role and data were not modified.`,
    );
  if (user && !credentials[`${key}_PASSWORD`])
    throw new Error(
      `The saved password for ${email} is missing. Existing credentials were not reset.`,
    );
  credentials[`${key}_EMAIL`] = email;
  credentials[`${key}_PASSWORD`] ||= passphrase();
  saveAccounts();
  if (!user) {
    const result = await admin.auth.admin.createUser({
      email,
      password: credentials[`${key}_PASSWORD`],
      email_confirm: role === 'client',
      user_metadata: {
        display_name: displayName,
        company_name: 'Maison Écartéo — exemple local',
        ecarteo_local_fixture_id: credentials.SETUP_INSTANCE_ID,
      },
    });
    if (result.error || !result.data.user)
      throw new Error(`Could not create the local ${key.toLowerCase()} identity.`);
    user = result.data.user;
    credentials[`${key}_USER_ID`] = user.id;
    saveAccounts();
  }
  if (role !== 'client') {
    await db.begin(async (tx) => {
      const profiles = await tx`select * from public.profiles where id=${user.id} for update`;
      if (!profiles.length)
        await tx`insert into public.profiles(id,display_name,role,client_id,active,is_client_admin)
        values(${user.id},${displayName},${role},null,true,false)`;
      else if (profiles[0].role !== role || profiles[0].client_id !== null || !profiles[0].active)
        throw new Error(
          `The local ${key.toLowerCase()} profile was changed manually. It was preserved.`,
        );
    });
    if (!user.email_confirmed_at) {
      const result = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
      if (result.error)
        throw new Error(`Could not confirm the local ${key.toLowerCase()} identity.`);
    }
  }
  const profile = (await db`select * from public.profiles where id=${user.id}`)[0];
  if (
    !profile ||
    profile.role !== role ||
    !profile.active ||
    (role === 'client' && !profile.client_id)
  )
    throw new Error(
      `The local ${key.toLowerCase()} account is not in its expected active role. No existing access was changed.`,
    );
  credentials[`${key}_USER_ID`] = user.id;
  if (role === 'client') credentials.CLIENT_ORGANIZATION_ID = profile.client_id;
  saveAccounts();
  const verifier = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const checked = await verifier.auth.signInWithPassword({
    email,
    password: credentials[`${key}_PASSWORD`],
  });
  if (checked.error || checked.data.user?.id !== user.id)
    throw new Error(`Saved login verification failed for ${email}. No password was reset.`);
  await verifier.auth.signOut({ scope: 'local' });
}
async function session(key) {
  const api = await request.newContext({
    baseURL: environment.APP_URL,
    extraHTTPHeaders: { Origin: environment.APP_URL },
    timeout: 30000,
  });
  contexts.push(api);
  const response = await api.post('/api/auth', {
    data: {
      action: 'login',
      email: credentials[`${key}_EMAIL`],
      password: credentials[`${key}_PASSWORD`],
    },
  });
  if (!response.ok())
    throw new Error(
      `Application login failed for ${key.toLowerCase()} (${response.status()}). Start Next using the new .env.local, then rerun --seed.`,
    );
  return api;
}
async function command(api, name, payload) {
  if (credentials[`DONE_${name}`] === 'true') return credentials[`ENTITY_${name}`];
  credentials[`KEY_${name}`] ||= randomUUID();
  saveAccounts();
  const response = await api.post('/api/commands', {
    data: { command: payload, idempotencyKey: credentials[`KEY_${name}`] },
  });
  if (!response.ok())
    throw new Error(
      `Sample workflow ${name} failed (${response.status()}); existing data and retry receipts were preserved.`,
    );
  const result = await response.json();
  credentials[`DONE_${name}`] = 'true';
  if (result.entityId) credentials[`ENTITY_${name}`] = result.entityId;
  saveAccounts();
  return result.entityId;
}
const text = (fr, en) => ({ fr, en });
async function seed() {
  const quality = await session('ADMIN');
  const operator = await session('OPERATOR');
  credentials.SAMPLE_DATE ||= new Date().toISOString().slice(0, 10);
  credentials.PLANNED_DATE ||= new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  saveAccounts();
  const draft = {
    clientId: credentials.CLIENT_ORGANIZATION_ID,
    title: text('Exemple local — demande de réservation', 'Local example — booking enquiry'),
    family: 'info',
    objective: text(
      'Observer la clarté de la réponse et la prochaine étape proposée. Données fictives pour tester le produit.',
      'Observe response clarity and the proposed next step. Fictional data for product testing.',
    ),
    channels: ['email', 'phone'],
    lang: 'FR',
    persona: text(
      'Prospect fictif préparant un séjour de deux nuits. Aucun client réel.',
      'Fictional prospect planning a two-night stay. No real customer.',
    ),
    steps: [
      {
        label: text(
          'Préparer une demande fictive de disponibilité.',
          'Prepare a fictional availability enquiry.',
        ),
        seuil: text(
          'Consigner la date et le canal. Aucun message externe.',
          'Record date and channel. No external message.',
        ),
      },
      {
        label: text(
          'Consigner la réponse simulée et les informations reçues.',
          'Record the simulated response and information received.',
        ),
        seuil: text(
          'Vérifier prix total, conditions et prochaine étape.',
          'Check total price, terms and next step.',
        ),
      },
      {
        label: text(
          'Documenter le suivi proposé au prospect.',
          'Document the follow-up offered to the prospect.',
        ),
        seuil: text(
          'Identifier un responsable et un délai de rappel.',
          'Identify an owner and callback deadline.',
        ),
      },
    ],
    evidence: ['emails', 'callnotes'],
    limits: text(
      'Exemple fictif uniquement. Ne contacter personne, ne réserver ni payer.',
      'Fictional example only. Do not contact anyone, book or pay.',
    ),
  };
  const scenario = await command(quality, 'SCENARIO', { type: 'scenario.create', draft });
  await command(quality, 'APPROVE_SCENARIO', { type: 'scenario.approve', id: scenario });
  await command(quality, 'PLANNED_MISSION', {
    type: 'mission.create',
    scenarioId: scenario,
    date: credentials.PLANNED_DATE,
    operator: credentials.OPERATOR_USER_ID,
  });
  const mission = await command(quality, 'PUBLISHED_MISSION', {
    type: 'mission.create',
    scenarioId: scenario,
    date: credentials.SAMPLE_DATE,
    operator: credentials.OPERATOR_USER_ID,
  });
  await command(operator, 'START_MISSION', { type: 'mission.timer', id: mission, running: true });
  if (credentials.DONE_EVIDENCE !== 'true') {
    if (!credentials.SAMPLE_ATTACHMENT) {
      const uploaded = await operator.post('/api/attachments', {
        multipart: {
          missionId: mission,
          file: {
            name: 'ecarteo-exemple-local.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from(
              'ÉCARTÉO — LOCAL TEST EVIDENCE\nFictional booking enquiry. No external contact occurred.\nSimulated response omitted a callback deadline.\n',
            ),
          },
        },
      });
      if (!uploaded.ok())
        throw new Error(
          `Sample evidence upload failed (${uploaded.status()}); no published data was changed.`,
        );
      credentials.SAMPLE_ATTACHMENT = JSON.stringify(await uploaded.json());
      saveAccounts();
    }
    const file = JSON.parse(credentials.SAMPLE_ATTACHMENT);
    await command(operator, 'EVIDENCE', {
      type: 'evidence.add',
      missionId: mission,
      evidence: {
        type: 'note',
        label: text(
          'Observation fictive — accueil et suivi',
          'Fictional observation — reception and follow-up',
        ),
        text: text(
          'Réponse simulée claire sur la disponibilité, mais délai de rappel absent. Exemple de preuve pour tester téléchargement et rapport.',
          'Simulated response was clear on availability but omitted a callback deadline. Sample evidence for testing downloads and reports.',
        ),
        ...file,
      },
    });
  }
  const notes = [
    'Demande fictive préparée; aucun envoi externe.',
    'Réponse simulée documentée; prix total indiqué.',
    'Aucun délai de rappel dans la réponse simulée.',
  ];
  for (let index = 0; index < draft.steps.length; index++)
    await command(operator, `STEP_${index}`, {
      type: 'mission.step',
      id: mission,
      index,
      done: true,
      note: notes[index],
      expectedNote: '',
    });
  await command(operator, 'SUBMIT_MISSION', { type: 'mission.submit', id: mission });
  await command(quality, 'PUBLISH_REPORT', {
    type: 'mission.approve',
    id: mission,
    scores: {
      dispo: 4,
      vitesse: 2,
      compr: 3,
      commercial: 2,
      omni: 3,
      lang: 3,
      sensible: 4,
      suivi: 2,
    },
    comments: {
      vitesse: text(
        'Exemple : réponse obtenue mais engagement de délai absent.',
        'Example: response received without a promised deadline.',
      ),
      commercial: text(
        'Exemple : prochaine étape commerciale peu précise.',
        'Example: the next commercial step was unclear.',
      ),
      suivi: text(
        'Exemple : responsable du rappel non précisé.',
        'Example: callback ownership was not specified.',
      ),
    },
    critical: false,
    actions: [
      {
        critId: 'vitesse',
        horizon: 7,
        text: text(
          'Définir un délai de réponse cible par canal.',
          'Define a target response time for each channel.',
        ),
        owner: text('Responsable accueil', 'Reception manager'),
      },
      {
        critId: 'commercial',
        horizon: 30,
        text: text(
          'Ajouter une prochaine étape explicite aux réponses types.',
          'Add an explicit next step to response templates.',
        ),
        owner: text('Responsable commercial', 'Sales manager'),
      },
      {
        critId: 'suivi',
        horizon: 90,
        text: text(
          'Retester le parcours après mise en place du suivi.',
          'Retest the journey after implementing follow-up.',
        ),
        owner: text('Responsable qualité', 'Quality manager'),
      },
    ],
  });
  await command(quality, 'DRAFT_SCENARIO', {
    type: 'scenario.create',
    draft: {
      ...draft,
      title: text('Brouillon local — accueil bilingue', 'Local draft — bilingual reception'),
      family: 'lang',
      lang: 'EN',
      objective: text(
        'Adapter ce brouillon avant de le valider et de planifier une nouvelle mission.',
        'Adapt this draft before approval and scheduling a new mission.',
      ),
    },
  });
  const client = await session('CLIENT');
  const response = await client.get(`/api/workspace?id=${mission}`);
  if (!response.ok()) throw new Error('Client verification failed after sample publication.');
  const visible = await response.json();
  if (!visible.state.missions.some((item) => item.id === mission && item.status === 'done'))
    throw new Error('The sample report was not visible to its customer.');
  credentials.SAMPLE_READY = 'true';
  saveAccounts();
}

try {
  if (
    !/^project_id\s*=\s*"ecarteo-local"\s*$/m.test(
      readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'),
    )
  )
    throw new Error('This setup is restricted to the ecarteo-local project.');
  const status = JSON.parse(
    localCommandResult('npx', ['--yes', 'supabase@3.0.0', 'status', '-o', 'json']),
  );
  loopback(status.API_URL, 'Supabase API');
  loopback(status.DB_URL, 'Database');
  loopback(status.MAILPIT_URL, 'Mailpit');
  const old = read(files.environment);
  for (const [key, wanted] of [
    ['NEXT_PUBLIC_SUPABASE_URL', status.API_URL],
    ['DATABASE_URL', status.DB_URL],
  ])
    if (old[key] && old[key] !== wanted)
      throw new Error(
        `${key} already targets a different backend. Existing configuration was preserved.`,
      );
  const origin = old.APP_URL || 'http://127.0.0.1:3000';
  const app = loopback(origin, 'Application');
  if (app.origin !== origin)
    throw new Error('APP_URL must contain only the exact loopback origin.');
  environment = {
    ...read(resolve(root, '.env.example')),
    ...old,
    APP_URL: origin,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
    DATABASE_URL: status.DB_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    OPS_HEALTH_TOKEN: old.OPS_HEALTH_TOKEN || randomBytes(32).toString('hex'),
  };
  save(
    files.environment,
    environment,
    'Écartéo local Supabase connection; generated secrets are private',
  );
  db = postgres(status.DB_URL, { ssl: false, max: 2, prepare: false });
  credentials.SETUP_INSTANCE_ID ||= randomUUID();
  saveAccounts();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await provision(admin, 'ADMIN', 'admin@ecarteo.test', 'qualite', 'Admin Écartéo');
  await provision(admin, 'OPERATOR', 'operator@ecarteo.test', 'operateur', 'Opérateur Écartéo');
  await provision(admin, 'CLIENT', 'client@ecarteo.test', 'client', 'Client Écartéo');
  save(
    files.tests,
    {
      ...read(files.tests),
      E2E_QUALITY_EMAIL: credentials.ADMIN_EMAIL,
      E2E_QUALITY_PASSWORD: credentials.ADMIN_PASSWORD,
      E2E_CLIENT_EMAIL: credentials.CLIENT_EMAIL,
      E2E_CLIENT_PASSWORD: credentials.CLIENT_PASSWORD,
      E2E_CLIENT_ID: credentials.CLIENT_ORGANIZATION_ID,
      E2E_OPERATOR_EMAIL: credentials.OPERATOR_EMAIL,
      E2E_OPERATOR_PASSWORD: credentials.OPERATOR_PASSWORD,
      PLAYWRIGHT_BASE_URL: environment.APP_URL,
      E2E_MAILPIT_URL: status.MAILPIT_URL,
    },
    'Dedicated local browser acceptance accounts',
  );
  if (mode === '--seed') await seed();
  console.log(
    mode === '--seed'
      ? 'Local sample workspace is ready. Existing records were preserved.'
      : 'Confirmed local accounts are ready. Start the app, then run this script with --seed.',
  );
  console.log(`Account details: ${files.accounts}`);
  console.log(
    `Application: ${environment.APP_URL}; Supabase API: ${status.API_URL}; Mailpit: ${status.MAILPIT_URL}`,
  );
} catch (error) {
  let message = error instanceof Error ? error.message : 'Unknown setup failure';
  for (const value of [
    ...Object.values(environment),
    ...Object.entries(credentials)
      .filter(([key]) => key.includes('PASSWORD'))
      .map(([, value]) => value),
  ])
    if (typeof value === 'string' && value.length >= 12)
      message = message.split(value).join('[redacted]');
  console.error(`Local setup stopped: ${message}`);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.dispose();
  if (db) await db.end({ timeout: 5 });
}
