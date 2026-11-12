import { access, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const standalone = new URL('../.next/standalone/', import.meta.url);
const server = new URL('server.js', standalone);
try {
  await access(server);
} catch {
  throw new Error('Production build missing. Run npm run build first.');
}
await cp(new URL('../.next/static/', import.meta.url), new URL('.next/static/', standalone), {
  recursive: true,
});
await cp(new URL('../public/', import.meta.url), new URL('public/', standalone), {
  recursive: true,
});
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || '3000';
if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Use a valid port between 1 and 65535.');
process.env.PORT = port;
process.env.HOSTNAME = process.env.ECARTEO_HOST || '127.0.0.1';
process.chdir(fileURLToPath(standalone));
await import(server.href);
