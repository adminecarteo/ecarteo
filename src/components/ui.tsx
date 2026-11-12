'use client';
/* eslint-disable @next/next/no-img-element -- Validated local Blob previews cannot use the image optimizer. */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Evidence, MissionStatus } from '@/domain/types';
import { levelOf } from '@/domain/commands';
import { EVTYPES } from '@/domain/reference';
import { useConsole } from '@/lib/console-context';
import { getAttachment } from '@/lib/workspace-client';
import { formatDate } from '@/lib/i18n';
export function Button({
  variant = 'secondary',
  size,
  className = '',
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...props}
      className={`btn ${variant === 'secondary' ? '' : variant} ${size === 'sm' ? 'sm' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...props} />;
}
export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  const id = useId();
  const child = isValidElement<{
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }>(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? `${id}-error` : undefined,
      })
    : children;
  const target = isValidElement<{ id?: string }>(children) ? (children.props.id ?? id) : id;
  return (
    <div className="field">
      <label htmlFor={target}>{label}</label>
      {child}
      {error && (
        <span className="err" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="head">
      <div className="t">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="acts">{actions}</div>
    </header>
  );
}
export function ScoreBadge({
  score,
  critical = false,
}: {
  score: number | null;
  critical?: boolean;
}) {
  const { t } = useConsole();
  const level = levelOf(score, critical);
  return (
    <span className={`pill lv-${level ?? 'neutral'}`}>
      {level ? t(`lv_${level}`) : t('notScored')}
    </span>
  );
}
export function StatusBadge({ status }: { status: MissionStatus }) {
  const { t } = useConsole();
  const tone = { todo: 'neutral', doing: 'accent', review: 'warn', done: 'ok' }[status];
  return <span className={`pill lv-${tone}`}>{t(`st_${status}`)}</span>;
}
export function ClientFilter() {
  const { state, actor, clientFilter, setClientFilter, t } = useConsole();
  if (actor.role === 'client') return null;
  return (
    <select
      className="filter-select"
      value={clientFilter}
      aria-label={t('client')}
      onChange={(e) => setClientFilter(e.target.value)}
    >
      <option value="all">{t('allClients')}</option>
      {state.clients.map((c) => (
        <option value={c.id} key={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  children?: ReactNode;
}) {
  const { t } = useConsole();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setError('');
          onOpenChange(value);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            (event.target as HTMLElement)
              .querySelector<HTMLButtonElement>('[data-dialog-cancel]')
              ?.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (returnFocus.current?.isConnected) {
              e.preventDefault();
              returnFocus.current.focus();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">{description}</Dialog.Description>
          {children}
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <Button disabled={pending} data-dialog-cancel>
                {t('cancel')}
              </Button>
            </Dialog.Close>
            <Button
              variant="primary"
              disabled={pending}
              aria-busy={pending}
              onClick={async () => {
                setPending(true);
                setError('');
                try {
                  await onConfirm();
                  onOpenChange(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Error');
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending && <span className="loader small" />}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { locale } = useConsole();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span className="muted">
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}`
          : '0'}
      </span>
      <div className="button-row">
        <Button
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={locale === 'fr' ? 'Page précédente' : 'Previous page'}
        >
          ←
        </Button>
        <span className="mono" aria-live="polite">
          {page} / {pages}
        </span>
        <Button
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={locale === 'fr' ? 'Page suivante' : 'Next page'}
        >
          →
        </Button>
      </div>
    </div>
  );
}
export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const { locale, t, tx } = useConsole();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setError('');
    if (evidence.fileId && evidence.mimeType?.startsWith('image/'))
      void getAttachment(evidence.fileId)
        .then((blob) => {
          if (blob && !disposed) {
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          }
        })
        .catch(() => {
          if (!disposed) setError(locale === 'fr' ? 'Aperçu indisponible' : 'Preview unavailable');
        });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence.fileId, evidence.mimeType, locale]);
  async function download() {
    if (!evidence.fileId) return;
    setPending(true);
    setError('');
    try {
      const blob = await getAttachment(evidence.fileId);
      if (!blob)
        throw new Error(
          locale === 'fr'
            ? 'Le fichier n’est plus disponible.'
            : 'This file is no longer available.',
        );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = evidence.file ?? 'preuve';
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="evidence-card">
      <div className="evtop">
        <span className="chip">{tx(EVTYPES[evidence.type])}</span>
        <time className="mono muted" dateTime={evidence.at}>
          {formatDate(evidence.at, locale, true)}
        </time>
      </div>
      <h3>{tx(evidence.label)}</h3>
      <p className="preserve-lines">{tx(evidence.text)}</p>
      {url && (
        <img className="evidence-preview" src={url} alt={tx(evidence.label)} loading="lazy" />
      )}
      {evidence.file && (
        <div className="attachment">
          <span className="muted">{t('fileL', evidence.file)}</span>
          {evidence.fileId && (
            <Button size="sm" disabled={pending} onClick={() => void download()}>
              {locale === 'fr' ? 'Télécharger' : 'Download'}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="resize-none" {...props} style={{ resize: 'none', ...props.style }} />;
}
