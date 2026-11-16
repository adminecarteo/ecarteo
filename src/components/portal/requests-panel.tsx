'use client';
import Link from 'next/link';
import { requestBriefs, type AuditOfferId } from '@/lib/audit-offer';
import { getOffers } from '@/components/marketing/content';
import { useRef, useState, type FormEvent } from 'react';
import type { AuditRequestRecord, RequestPage } from '@/lib/accounts-requests-schema';
import { useLocale } from '@/lib/locale-context';
import { portalRequest } from '@/lib/portal-client';
import styles from './portal.module.css';

function requestLabels(copy: (fr: string, en: string) => string) {
  const statuses: Record<string, string> = {
    submitted: copy('À étudier', 'Awaiting review'),
    accepted: copy('Acceptée', 'Accepted'),
    declined: copy('Refusée', 'Declined'),
    cancelled: copy('Annulée', 'Cancelled'),
    converted: copy('Scénario préparé', 'Scenario prepared'),
    published: copy('Rapport publié', 'Report published'),
  };
  const sectors: Record<string, string> = {
    hospitality: copy('Hôtellerie et restauration', 'Hospitality'),
    health: copy('Cliniques et centres privés', 'Clinics and private centres'),
    training: copy('Organismes de formation', 'Training providers'),
    property: copy('Immobilier', 'Property'),
  };
  const channels: Record<string, string> = {
    form: copy('Formulaire', 'Form'),
    email: copy('Email', 'Email'),
    phone: copy('Téléphone', 'Phone'),
    whatsapp: copy('WhatsApp', 'WhatsApp'),
    chat: copy('Chat', 'Chat'),
    social: copy('Réseaux sociaux', 'Social media'),
  };
  return { statuses, sectors, channels };
}
export function RequestsPanel({
  initial,
  quality,
  offer,
}: {
  initial: RequestPage;
  quality: boolean;
  offer?: AuditOfferId;
}) {
  const { copy, locale } = useLocale();
  const [draftOffer, setDraftOffer] = useState(
    quality ? undefined : (offer ?? initial.suggestedOffer),
  );
  const [editedSubject, setEditedSubject] = useState<string>();
  const [editedBrief, setEditedBrief] = useState<string>();
  const selectedOffer = draftOffer && getOffers(locale).find((item) => item.id === draftOffer);
  const { statuses, sectors, channels } = requestLabels(copy);
  const [data, setData] = useState(initial);
  const [formOpen, setFormOpen] = useState(Boolean(draftOffer) || initial.total === 0);
  const formToggle = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);
  async function reload(page = data.page, filters = { search, status }) {
    setData(
      await portalRequest<RequestPage>(
        `/api/audit-requests?${new URLSearchParams({ page: String(page), ...filters })}`,
      ),
    );
  }
  async function perform(work: () => Promise<void>) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy('Réessayez.', 'Please try again.'));
    } finally {
      setPending(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    await perform(async () => {
      requestId.current ??= crypto.randomUUID();
      await portalRequest('/api/audit-requests', 'POST', {
        id: requestId.current,
        title: f.get('title'),
        sector: f.get('sector'),
        channels: f.getAll('channels'),
        siteCount: Number(f.get('siteCount')),
        preferredDate: f.get('preferredDate') || null,
        brief: f.get('brief'),
      });
      requestId.current = null;
      form.reset();
      setDraftOffer(undefined);
      setEditedSubject(undefined);
      setEditedBrief(undefined);
      if (offer) {
        const url = new URL(window.location.href);
        url.searchParams.delete('offer');
        window.history.replaceState(window.history.state, '', url);
      }
      setFormOpen(false);
      formToggle.current?.focus();
      setMessage(
        copy(
          'Votre demande a été enregistrée. Écartéo examinera le périmètre avant de planifier l’audit.',
          'Your request has been recorded. Écartéo will review the scope before scheduling the audit.',
        ),
      );
      setSearch('');
      setStatus('all');
      await reload(1, { search: '', status: 'all' });
    });
  }
  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      {!quality && (
        <div className={styles.requestControl}>
          <button
            ref={formToggle}
            className={formOpen ? 'btn' : 'btn primary'}
            aria-controls="new-audit-request"
            aria-expanded={formOpen}
            onClick={() => setFormOpen(!formOpen)}
          >
            {formOpen
              ? copy('Masquer le formulaire', 'Hide request form')
              : copy('Nouvelle demande', 'New request')}
          </button>
        </div>
      )}
      <div className={!quality && formOpen ? styles.grid : undefined}>
        {!quality && (
          <section className={styles.card} id="new-audit-request" hidden={!formOpen}>
            <h2>{copy('Demander un audit', 'Request an audit')}</h2>
            {selectedOffer && (
              <p className={styles.muted}>
                {copy(
                  `Offre choisie : ${selectedOffer.name}. Adaptez la demande à votre parcours avant de l’envoyer.`,
                  `Selected offer: ${selectedOffer.name}. Edit the request to describe your journey before sending it.`,
                )}
              </p>
            )}
            <form
              key={draftOffer ?? 'blank'}
              className={styles.form}
              onSubmit={submit}
              onChange={() => {
                requestId.current = null;
              }}
            >
              <label className={styles.field}>
                {copy('Objet de la demande', 'Request subject')}
                <input
                  name="title"
                  value={editedSubject ?? selectedOffer?.name ?? ''}
                  onChange={(event) => setEditedSubject(event.target.value)}
                  required
                  minLength={5}
                  maxLength={160}
                  placeholder={copy(
                    'Ex. Parcours de demande de devis',
                    'E.g. Quote request journey',
                  )}
                />
              </label>
              <label className={styles.field}>
                {copy('Secteur', 'Sector')}
                <select aria-label={copy('Secteur', 'Sector')} name="sector" required>
                  {Object.entries(sectors).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className={styles.fieldset}>
                <legend>{copy('Canaux à évaluer', 'Channels to assess')}</legend>
                {Object.entries(channels).map(([value, label]) => (
                  <label key={value} className={styles.check}>
                    <input
                      name="channels"
                      type="checkbox"
                      value={value}
                      defaultChecked={
                        value === 'email' || (draftOffer === 'flash' && value === 'form')
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label className={styles.field}>
                {copy('Nombre de sites', 'Number of sites')}
                <input
                  name="siteCount"
                  type="number"
                  required
                  min={1}
                  max={10000}
                  defaultValue={1}
                />
              </label>
              <label className={styles.field}>
                {copy('Date souhaitée (facultatif)', 'Preferred date (optional)')}
                <input
                  name="preferredDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label className={styles.field}>
                {copy('Votre besoin', 'Your requirements')}
                <textarea
                  name="brief"
                  value={editedBrief ?? (draftOffer ? requestBriefs[draftOffer][locale] : '')}
                  onChange={(event) => setEditedBrief(event.target.value)}
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={5}
                  placeholder={copy(
                    'Décrivez les sites, le parcours et les points à observer.',
                    'Describe the sites, journey and points to observe.',
                  )}
                />
              </label>
              <p className={styles.muted}>
                {copy(
                  'Cette demande ne déclenche ni paiement ni intervention. Le périmètre et les conditions sont confirmés avec Écartéo.',
                  'This request does not initiate a payment or an audit. Écartéo will confirm the scope and terms with you.',
                )}
              </p>
              <button className="btn primary" disabled={pending}>
                {copy('Envoyer la demande', 'Submit request')}
              </button>
            </form>
          </section>
        )}
        <section className={styles.card}>
          <h2>
            {quality
              ? copy('Demandes clients', 'Client requests')
              : copy('Vos demandes', 'Your requests')}
          </h2>
          <form
            className={styles.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              void perform(() => reload(1));
            }}
          >
            <label className={styles.field}>
              {copy('Rechercher', 'Search')}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={160}
                placeholder={copy('Objet ou organisation', 'Subject or organization')}
              />
            </label>
            <label className={styles.field}>
              {copy('Statut', 'Status')}
              <select
                aria-label={copy('Statut', 'Status')}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{copy('Tous les statuts', 'All statuses')}</option>
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" disabled={pending}>
              {copy('Filtrer', 'Filter')}
            </button>
          </form>
          {data.items.length === 0 && (
            <p className={styles.muted}>
              {copy('Aucune demande pour ce filtre.', 'No requests match this filter.')}
            </p>
          )}
          {data.items.map((item) => (
            <RequestItem
              key={`${item.id}:${item.revision}`}
              item={item}
              quality={quality}
              pending={pending}
              onReview={(action, note) =>
                perform(async () => {
                  await portalRequest('/api/audit-requests', 'PATCH', {
                    id: item.id,
                    revision: item.revision,
                    action,
                    note,
                  });
                  setMessage(copy('Demande mise à jour.', 'Request updated.'));
                  await reload();
                })
              }
            />
          ))}
          <div className={styles.pager}>
            <button
              className="btn"
              disabled={pending || data.page <= 1}
              onClick={() => void perform(() => reload(data.page - 1))}
            >
              {copy('Précédent', 'Previous')}
            </button>
            <span>
              {data.total}{' '}
              {data.total === 1
                ? copy('demande · page', 'request · page')
                : copy('demandes · page', 'requests · page')}{' '}
              {data.page}
            </span>
            <button
              className="btn"
              disabled={pending || data.page * data.pageSize >= data.total}
              onClick={() => void perform(() => reload(data.page + 1))}
            >
              {copy('Suivant', 'Next')}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
function RequestItem({
  item,
  quality,
  pending,
  onReview,
}: {
  item: AuditRequestRecord;
  quality: boolean;
  pending: boolean;
  onReview: (action: string, note: string) => Promise<void>;
}) {
  const { locale, copy } = useLocale();
  const { statuses, sectors, channels } = requestLabels(copy);
  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const [note, setNote] = useState(item.reviewNote);
  return (
    <article className={styles.item}>
      <div className={styles.meta}>
        <span>{statuses[item.status]}</span>
        <span>
          {new Date(item.createdAt).toLocaleDateString(dateLocale, { timeZone: 'Europe/Paris' })}
        </span>
      </div>
      <h3>{item.title}</h3>
      <div className={styles.meta}>
        <span>{item.clientName}</span>
        <span>{sectors[item.sector]}</span>
        <span>
          {item.siteCount} {item.siteCount === 1 ? 'site' : 'sites'}
        </span>
        <span>{item.channels.map((c) => channels[c]).join(', ')}</span>
        {item.preferredDate && (
          <span>
            {copy('Date souhaitée :', 'Preferred date:')}{' '}
            {new Date(`${item.preferredDate}T12:00:00Z`).toLocaleDateString(dateLocale, {
              timeZone: 'Europe/Paris',
            })}
          </span>
        )}
      </div>
      <p className={styles.brief}>{item.brief}</p>
      {item.reviewNote && <p className={styles.message}>{item.reviewNote}</p>}
      {Boolean(item.publishedReports?.length) && (
        <ul className={styles.reportLinks}>
          {item.publishedReports.map((report) => (
            <li key={report.missionId}>
              <Link href={`/app?view=rapport&id=${report.missionId}`}>
                {report.isRetest
                  ? copy('Ouvrir le rapport de retest', 'Open retest report')
                  : copy('Ouvrir le rapport', 'Open report')}
                {' · '}
                <time dateTime={report.publishedAt}>
                  {new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Europe/Paris',
                  }).format(new Date(report.publishedAt))}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {quality && ['submitted', 'accepted'].includes(item.status) && (
        <>
          <label className={styles.field}>
            {copy('Réponse au client', 'Response to client')}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className={styles.actions}>
            {item.status === 'submitted' && (
              <button
                className="btn"
                disabled={pending}
                onClick={() => void onReview('accept', note)}
              >
                {copy('Accepter le périmètre', 'Accept scope')}
              </button>
            )}
            <button
              className="btn primary"
              disabled={pending}
              onClick={() => void onReview('convert', note)}
            >
              {copy('Préparer un scénario', 'Prepare a scenario')}
            </button>
            <button
              className="btn"
              disabled={pending || note.trim().length < 5}
              onClick={() => void onReview('decline', note)}
            >
              {copy('Refuser avec motif', 'Decline with reason')}
            </button>
          </div>
          <p className={styles.muted}>
            {copy(
              'Le scénario sera créé en brouillon. Complétez le protocole, validez-le puis planifiez une mission dans la console.',
              'The scenario will be created as a draft. Complete and approve the protocol, then schedule a mission in the console.',
            )}
          </p>
        </>
      )}
      {!quality && item.status === 'submitted' && (
        <div>
          <button className="btn" disabled={pending} onClick={() => void onReview('cancel', '')}>
            {copy('Annuler la demande', 'Cancel request')}
          </button>
        </div>
      )}
      {quality && item.scenarioId && (
        <Link className="btn" href={`/app?view=scenarios&id=${item.scenarioId}`}>
          {copy('Ouvrir le scénario', 'Open scenario')}
        </Link>
      )}
    </article>
  );
}
