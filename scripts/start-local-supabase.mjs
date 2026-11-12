#!/usr/bin/env node
// Supabase CLI 3 leaves HostIp empty. Docker Desktop can ignore a network's default
// bind address, so constrain this project's container-create requests explicitly.
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'ecarteo-local';
const network = `${project}-loopback`;
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
if (!/^project_id\s*=\s*"ecarteo-local"\s*$/m.test(config))
  throw new Error('This helper only supports the ecarteo-local project.');
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const endpoint =
  process.env.DOCKER_HOST ||
  run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
if (!endpoint.startsWith('unix:///'))
  throw new Error('A local Unix-socket Docker engine is required. Remote Docker is refused.');
let networkOptions;
try {
  networkOptions = JSON.parse(
    run('docker', ['network', 'inspect', network, '--format', '{{json .Options}}']),
  );
} catch {
  run('docker', [
    'network',
    'create',
    '-o',
    'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    network,
  ]);
  networkOptions = { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' };
}
if (networkOptions['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1')
  throw new Error('Existing local network has unexpected settings; no configuration was changed.');

const temporary = mkdtempSync(join(tmpdir(), 'ecarteo-local-start-'));
chmodSync(temporary, 0o700);
const proxySocket = join(temporary, 'docker.sock');
const logPath = join(temporary, 'start.log');
const owned = (name) =>
  name?.replace(/^\//, '').startsWith('supabase_') && name.endsWith(`_${project}`);
const inspectContainer = (id) => {
  const container = JSON.parse(run('docker', ['container', 'inspect', id]))[0];
  if (!owned(container.Name)) throw new Error('Unrelated container mutation refused.');
  return container;
};
function assertSavedLoopback(container) {
  for (const mappings of Object.values(container.HostConfig.PortBindings || {}))
    for (const mapping of mappings || [])
      if (mapping.HostIp !== '127.0.0.1')
        throw new Error(
          'An existing local container has non-loopback port settings. Run npx --yes supabase@3.0.0 stop (without --no-backup), then rerun this helper. Existing containers and data were preserved.',
        );
}
for (const name of run('docker', [
  'ps',
  '-a',
  '--filter',
  `name=_${project}`,
  '--format',
  '{{.Names}}',
])
  .trim()
  .split('\n')
  .filter(owned))
  assertSavedLoopback(inspectContainer(name));
const dockerJson = (path) =>
  new Promise((accept, reject) => {
    const query = http.get({ socketPath: endpoint.slice('unix://'.length), path }, (result) => {
      const parts = [];
      result.on('data', (part) => parts.push(part));
      result.on('end', () => {
        try {
          accept(JSON.parse(Buffer.concat(parts).toString('utf8')));
        } catch {
          reject(new Error('Docker inspection failed.'));
        }
      });
    });
    query.on('error', reject);
  });
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://docker.local');
    let body;
    let payload;
    if (!['GET', 'HEAD'].includes(request.method)) {
      const parts = [];
      let size = 0;
      for await (const part of request) {
        size += part.length;
        if (size > 8 * 1024 * 1024) throw new Error('Docker request exceeded limit.');
        parts.push(part);
      }
      body = Buffer.concat(parts);
      payload =
        body.length && request.headers['content-type']?.includes('application/json')
          ? JSON.parse(body.toString('utf8'))
          : {};
      const container = url.pathname.match(/\/containers\/([^/]+)(?:\/[^/]+)?$/);
      const execution = url.pathname.match(/\/exec\/([^/]+)\/start$/);
      const net = url.pathname.match(/\/networks\/([^/]+)\/(?:connect|disconnect)$/);
      if (/\/(?:containers|networks)\/prune$/.test(url.pathname) && request.method === 'POST') {
        const filters = JSON.parse(url.searchParams.get('filters') || '{}');
        if (filters.label?.[`com.supabase.cli.project=${project}`] !== true)
          throw new Error('Unscoped container cleanup refused.');
      } else if (container && container[1] !== 'create') {
        const existing = inspectContainer(decodeURIComponent(container[1]));
        if (url.pathname.endsWith('/start')) assertSavedLoopback(existing);
      } else if (execution) {
        const info = await dockerJson(url.pathname.replace(/\/start$/, '/json'));
        inspectContainer(info.ContainerID);
      } else if (net) {
        const info = JSON.parse(
          run('docker', ['network', 'inspect', decodeURIComponent(net[1])]),
        )[0];
        if (info.Name !== network) throw new Error('Unrelated network mutation refused.');
        inspectContainer(payload.Container);
      } else if (/\/volumes\/create$/.test(url.pathname) && request.method === 'POST') {
        if (!owned(payload.Name)) throw new Error('Unrelated volume mutation refused.');
      } else if (/\/images\/create$/.test(url.pathname) && request.method === 'POST') {
        if (
          !/^(?:public\.ecr\.aws\/supabase\/|supabase\/)/.test(
            url.searchParams.get('fromImage') || '',
          )
        )
          throw new Error('Unrelated image pull refused.');
      } else if (!(request.method === 'POST' && /\/containers\/create$/.test(url.pathname))) {
        throw new Error('Unsupported Docker mutation refused.');
      }
    }
    if (request.method === 'POST' && /\/containers\/create$/.test(url.pathname)) {
      const name = url.searchParams.get('name');
      if (!owned(name)) throw new Error('Container creation outside the local project is refused.');
      for (const entries of Object.values(payload.HostConfig?.PortBindings || {}))
        for (const entry of entries || []) entry.HostIp = '127.0.0.1';
      body = Buffer.from(JSON.stringify(payload));
    }
    const headers = { ...request.headers };
    if (body) {
      delete headers['transfer-encoding'];
      headers['content-length'] = String(body.length);
    }
    const upstream = http.request(
      {
        socketPath: endpoint.slice('unix://'.length),
        method: request.method,
        path: request.url,
        headers,
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end('Local Docker request failed.');
    });
    if (body) upstream.end(body);
    else request.pipe(upstream);
  } catch {
    response.writeHead(400);
    response.end('Refused unsupported local Docker request.');
  }
});
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(proxySocket, accept);
});
chmodSync(proxySocket, 0o600);
const output = [];
try {
  const child = spawn(
    'npx',
    [
      '--yes',
      'supabase@3.0.0',
      'start',
      '--network-id',
      network,
      '--exclude',
      'realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor',
    ],
    {
      cwd: root,
      env: { ...process.env, DOCKER_HOST: `unix://${proxySocket}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (part) => output.push(part));
  const code = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('exit', accept);
  });
  writeFileSync(logPath, Buffer.concat(output), { mode: 0o600 });
  if (code !== 0) throw new Error(`Local Supabase did not start. Private log: ${logPath}`);
  const names = run('docker', ['ps', '--filter', `name=_${project}`, '--format', '{{.Names}}'])
    .trim()
    .split('\n')
    .filter(Boolean);
  if (!names.length) throw new Error('No local Supabase containers were found.');
  for (const name of names) {
    if (!name.endsWith(`_${project}`)) continue;
    const container = JSON.parse(run('docker', ['inspect', name]))[0];
    for (const bindings of Object.values(container.NetworkSettings.Ports || {}))
      for (const binding of bindings || [])
        if (binding.HostIp !== '127.0.0.1')
          throw new Error(
            'An existing container still publishes beyond loopback. Run supabase stop (without --no-backup), then rerun this helper.',
          );
  }
  console.log('Écartéo local Supabase is ready; published ports are bound to 127.0.0.1 only.');
} catch (error) {
  writeFileSync(logPath, Buffer.concat(output), { mode: 0o600 });
  console.error(
    error instanceof Error ? error.message : `Local start failed. Private log: ${logPath}`,
  );
  process.exitCode = 1;
} finally {
  await new Promise((done) => server.close(done));
  rmSync(proxySocket, { force: true });
}
