import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import {
  DATABASE_NAME,
  commitCommand,
  loadWorkspace,
  saveAttachment,
  getAttachment,
  resetWorkspace,
  validateAttachment,
} from '@/lib/storage';
const quality = { role: 'qualite' as const, name: 'Nadia R.' };
beforeEach(async () => {
  await deleteDB(DATABASE_NAME);
});
describe('durable local repository', () => {
  it('initializes once and preserves changes after reopening', async () => {
    await loadWorkspace();
    await commitCommand({ type: 'action.toggle', id: 'a4', done: true }, quality);
    expect((await loadWorkspace()).actions.find((a) => a.id === 'a4')?.done).toBe(true);
  });
  it('serializes concurrent commands without overwriting another update', async () => {
    await loadWorkspace();
    await Promise.all([
      commitCommand({ type: 'action.toggle', id: 'a4', done: true }, quality),
      commitCommand({ type: 'action.toggle', id: 'a5', done: true }, quality),
    ]);
    const state = await loadWorkspace();
    expect(state.actions.filter((a) => ['a4', 'a5'].includes(a.id)).every((a) => a.done)).toBe(
      true,
    );
  });
  it('does not commit a rejected command', async () => {
    const before = await loadWorkspace();
    await expect(
      commitCommand(
        { type: 'mission.score', id: 'm1', scores: { dispo: 0 }, comments: {}, critical: true },
        quality,
      ),
    ).rejects.toThrow();
    expect(await loadWorkspace()).toEqual(before);
  });
  it('persists actual PDF bytes and clears files only on explicit reset', async () => {
    await loadWorkspace();
    const file = new File(['%PDF-1.7\nactual evidence'], 'audit.pdf', { type: 'application/pdf' });
    const saved = await saveAttachment(file);
    expect(await (await getAttachment(saved.fileId))?.text()).toContain('actual evidence');
    await resetWorkspace();
    expect(await getAttachment(saved.fileId)).toBeUndefined();
  });
  it('rejects executable files and spoofed image signatures', async () => {
    await expect(
      validateAttachment(
        new File(['<svg onload=alert(1)>'], 'proof.svg', { type: 'image/svg+xml' }),
      ),
    ).rejects.toThrow();
    await expect(
      validateAttachment(new File(['not an image'], 'proof.png', { type: 'image/png' })),
    ).rejects.toThrow();
  });
  it('accepts empty browser MIME for a safe EML extension and preserves its bytes', async () => {
    const file = new File(
      ['From: test@example.invalid\nSubject: Test\n\nEvidence'],
      'response.eml',
    );
    const result = await saveAttachment(file);
    expect(result.mimeType).toBe('message/rfc822');
    expect(await (await getAttachment(result.fileId))?.text()).toContain('Subject: Test');
  });
  it('validates the inferred MIME signature rather than trusting a filename', async () => {
    await expect(saveAttachment(new File(['not a PDF'], 'proof.pdf'))).rejects.toThrow();
  });
});
