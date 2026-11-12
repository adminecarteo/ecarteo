import { openDB, type DBSchema } from 'idb';
import type { Actor, AppState, Command, CommandResult } from '@/domain/types';
import { applyCommand } from '@/domain/commands';
import { createSeedState } from '@/domain/seed';
import { workspaceSchema } from './state-schema';

interface ConsoleDatabase extends DBSchema {
  workspace: { key: string; value: AppState };
  attachments: { key: string; value: Blob };
}
export const DATABASE_NAME = 'ecarteo-console';
const database = () =>
  openDB<ConsoleDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('workspace');
      db.createObjectStore('attachments');
    },
  });
function assertState(value: unknown): asserts value is AppState {
  if (!workspaceSchema.safeParse(value).success)
    throw new Error(
      'Les données locales sont incompatibles. Les données ont été conservées. / Local data is incompatible and has been preserved.',
    );
}
export async function loadWorkspace(): Promise<AppState> {
  const db = await database();
  try {
    const tx = db.transaction('workspace', 'readwrite');
    let state = await tx.store.get('main');
    if (!state) {
      state = createSeedState();
      await tx.store.put(state, 'main');
    } else assertState(state);
    await tx.done;
    return state;
  } finally {
    db.close();
  }
}
export async function commitCommand(command: Command, actor: Actor): Promise<CommandResult> {
  const db = await database();
  const tx = db.transaction('workspace', 'readwrite');
  try {
    const state = await tx.store.get('main');
    assertState(state);
    const result = applyCommand(state, command, actor);
    await tx.store.put(result.state, 'main');
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
      await tx.done;
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
export async function resetWorkspace(): Promise<AppState> {
  const db = await database();
  try {
    const tx = db.transaction(['workspace', 'attachments'], 'readwrite');
    const state = createSeedState();
    await tx.objectStore('workspace').put(state, 'main');
    await tx.objectStore('attachments').clear();
    await tx.done;
    return state;
  } finally {
    db.close();
  }
}
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'message/rfc822',
]);
function attachmentType(file: File): string {
  const extensions: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    eml: 'message/rfc822',
  };
  return file.type || extensions[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
}
export async function validateAttachment(file: File): Promise<void> {
  const mimeType = attachmentType(file);
  if (file.size === 0 || file.size > MAX_FILE_SIZE)
    throw new Error('Fichier vide ou supérieur à 10 Mo. / File must be between 1 byte and 10 MB.');
  if (!TYPES.has(mimeType))
    throw new Error('Formats acceptés : PNG, JPEG, WebP, PDF, TXT, EML. / Unsupported file type.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const prefix = new TextDecoder().decode(bytes);
  const valid =
    mimeType === 'image/png'
      ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      : mimeType === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mimeType === 'image/webp'
          ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
          : mimeType === 'application/pdf'
            ? prefix.startsWith('%PDF-')
            : true;
  if (!valid)
    throw new Error(
      'Le contenu du fichier ne correspond pas à son format. / File content does not match its type.',
    );
}
export async function saveAttachment(file: File) {
  await validateAttachment(file);
  const fileId = crypto.randomUUID();
  const db = await database();
  try {
    await db.put('attachments', file.slice(0, file.size, attachmentType(file)), fileId);
    return { fileId, file: file.name, mimeType: attachmentType(file), size: file.size };
  } finally {
    db.close();
  }
}
export async function getAttachment(fileId: string): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await db.get('attachments', fileId);
  } finally {
    db.close();
  }
}
export async function removeAttachment(fileId: string) {
  const db = await database();
  try {
    await db.delete('attachments', fileId);
  } finally {
    db.close();
  }
}
