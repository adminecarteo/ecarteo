export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  eml: 'message/rfc822',
};

export function attachmentType(file: File): string {
  return file.type || EXTENSIONS[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
}

/** Shared preflight only; the server repeats these checks before accepting bytes. */
export async function validateAttachment(file: File, locale?: Locale): Promise<void> {
  const message = (fr: string, en: string) =>
    locale ? (locale === 'fr' ? fr : en) : `${fr} / ${en}`;
  const expected = EXTENSIONS[file.name.split('.').pop()?.toLowerCase() ?? ''];
  const type = attachmentType(file);
  if (
    !file.name ||
    file.name.length > 255 ||
    /[\\/\u0000-\u001f]/u.test(file.name) ||
    !expected ||
    type !== expected
  )
    throw new Error(
      message(
        'Formats acceptés : PNG, JPEG, WebP, PDF, TXT, EML.',
        'Unsupported filename or file type. Choose PNG, JPEG, WebP, PDF, TXT or EML.',
      ),
    );
  if (file.size === 0 || file.size > MAX_FILE_SIZE)
    throw new Error(
      message('Fichier vide ou supérieur à 10 Mo.', 'File must be between 1 byte and 10 MB.'),
    );
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const prefix = new TextDecoder().decode(bytes);
  const valid =
    type === 'image/png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      : type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === 'image/webp'
          ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
          : type === 'application/pdf'
            ? prefix.startsWith('%PDF-')
            : true;
  if (!valid)
    throw new Error(
      message(
        'Le contenu du fichier ne correspond pas à son format.',
        'File content does not match its type.',
      ),
    );
}
import type { Locale } from './i18n';
