'use client';
import { Textarea } from '@/components/ui';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  EvidenceCard,
  Field,
  PageHeader,
  Pagination,
  StatusBadge,
} from '@/components/ui';
import { EVTYPES, FAMILIES, LANGS } from '@/domain/reference';
import type { EvidenceType, Mission } from '@/domain/types';
import { missionElapsed } from '@/domain/commands';
import { useConsole } from '@/lib/console-context';
import { duration, formatDate } from '@/lib/i18n';
import {
  removeAttachment,
  saveAttachment,
  uncertainOutcome,
  type AttachmentMetadata,
} from '@/lib/workspace-client';
import styles from './missions.module.css';

const PAGE_SIZE = 12;
type MissionTab = 'active' | 'review' | 'done';

export function Missions() {
  const { state, actor, t, tx, locale, navigate, selectedId, clientFilter } = useConsole();
  const [tab, setTab] = useState<MissionTab>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const mission = state.missions.find((item) => item.id === selectedId);
  const filtered = state.missions
    .filter((item) => {
      const scenario = item.scenarioSnapshot;
      return (
        (clientFilter === 'all' || scenario.clientId === clientFilter) &&
        (tab === 'active'
          ? item.status === 'todo' || item.status === 'doing'
          : item.status === tab) &&
        `${tx(scenario.title)} ${item.operator} ${state.clients.find((client) => client.id === scenario.clientId)?.name ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale))
      );
    })
    .sort((left, right) =>
      tab === 'done' ? right.date.localeCompare(left.date) : left.date.localeCompare(right.date),
    );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  if (mission) return <MissionDetail key={mission.id} mission={mission} />;
  return (
    <>
      <PageHeader
        eyebrow={t('mEyebrow')}
        title={t('mTitle')}
        description={t(actor.role === 'operateur' ? 'mSubOp' : 'mSub')}
      />
      <div className="ch mission-filters">
        <div className="tabs" role="group" aria-label={t('thStatus')}>
          {(
            [
              ['active', 'tabRun'],
              ['review', 'tabReview'],
              ['done', 'tabDone'],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => {
                setTab(value);
                setPage(1);
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <Field label={tx({ fr: 'Rechercher une mission', en: 'Search missions' })}>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <Card className="mission-roster">
        {filtered.length ? (
          <div className="tblwrap">
            <table className="mission-table" role="table">
              <thead>
                <tr>
                  <th>{t('thDate')}</th>
                  <th>{t('thJourney')}</th>
                  <th>{t('thClient')}</th>
                  <th>{t('thOperator')}</th>
                  <th>{t('thProgress')}</th>
                  <th>{t('thStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((item) => (
                    <tr key={item.id} role="row">
                      <td className="num" data-label={t('thDate')} role="cell">
                        {formatDate(item.date, locale)}
                      </td>
                      <td className="mission-title" role="cell">
                        <button
                          className="table-link"
                          onClick={() => navigate('missions', item.id)}
                        >
                          {tx(item.scenarioSnapshot.title)}
                        </button>
                      </td>
                      <td data-label={t('thClient')} role="cell">
                        {
                          state.clients.find(
                            (client) => client.id === item.scenarioSnapshot.clientId,
                          )?.name
                        }
                      </td>
                      <td data-label={t('thOperator')} role="cell">
                        {item.operator}
                      </td>
                      <td className="num" data-label={t('thProgress')} role="cell">
                        {t(
                          'progress',
                          item.steps.filter((step) => step.done).length,
                          item.steps.length,
                          duration(missionElapsed(item)),
                        )}
                      </td>
                      <td className="mission-status" role="cell">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {search
              ? tx({
                  fr: 'Aucune mission ne correspond à votre recherche.',
                  en: 'No missions match your search.',
                })
              : t('noMissionTab')}
          </EmptyState>
        )}
        <Pagination
          page={currentPage}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}

interface NoteEdit {
  base: string;
  value: string;
}
type NoteEdits = Partial<Record<number, NoteEdit>>;

function readNoteEdits(mission: Mission): NoteEdits {
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`ecarteo:mission-notes:${mission.id}`);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (
        stored &&
        typeof stored === 'object' &&
        'version' in stored &&
        stored.version === 2 &&
        'edits' in stored &&
        stored.edits &&
        typeof stored.edits === 'object'
      ) {
        const edits: NoteEdits = {};
        for (const [key, edit] of Object.entries(stored.edits)) {
          const index = Number(key);
          if (
            Number.isInteger(index) &&
            index >= 0 &&
            index < mission.steps.length &&
            edit &&
            typeof edit === 'object' &&
            'base' in edit &&
            typeof edit.base === 'string' &&
            'value' in edit &&
            typeof edit.value === 'string' &&
            edit.value !== mission.steps[index].note
          ) {
            edits[index] = { base: edit.base, value: edit.value };
          }
        }
        return edits;
      }
    } catch {
      /* Use persisted mission notes if session storage is unavailable. */
    }
  }
  return {};
}

function MissionDetail({ mission }: { mission: Mission }) {
  const { state, actor, t, tx, locale, execute, busy, notify, navigate } = useConsole();
  const [now, setNow] = useState(() => Date.now());
  const [noteEdits, setNoteEdits] = useState(() => readNoteEdits(mission));
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [evidencePage, setEvidencePage] = useState(1);
  const scenario = mission.scenarioSnapshot;
  const editable =
    (mission.status === 'todo' || mission.status === 'doing') &&
    (actor.role === 'qualite' ||
      (actor.role === 'operateur' &&
        (actor.id ? actor.id === mission.operatorId : actor.name === mission.operator)));
  const evidence = state.evidence
    .filter((item) => item.missionId === mission.id)
    .sort((left, right) => right.at.localeCompare(left.at));
  const doneCount = mission.steps.filter((step) => step.done).length;
  const elapsed = missionElapsed(mission, now);
  const dirty =
    editable &&
    Object.entries(noteEdits).some(
      ([key, edit]) => edit && edit.value !== mission.steps[Number(key)]?.note,
    );
  const pending = busy || working;
  useEffect(() => {
    if (!mission.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [mission.runningSince]);
  useEffect(() => {
    try {
      if (editable)
        sessionStorage.setItem(
          `ecarteo:mission-notes:${mission.id}`,
          JSON.stringify({ version: 2, edits: noteEdits }),
        );
      else sessionStorage.removeItem(`ecarteo:mission-notes:${mission.id}`);
    } catch {
      /* Current edits remain usable in memory. */
    }
  }, [editable, mission.id, noteEdits]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function updateNote(index: number, value: string) {
    setNoteEdits((current) => {
      const next = { ...current };
      if (value === mission.steps[index].note) delete next[index];
      else next[index] = { base: current[index]?.base ?? mission.steps[index].note, value };
      return next;
    });
  }

  function clearNote(index: number, saved?: NoteEdit) {
    setNoteEdits((current) => {
      if (saved && (current[index]?.value !== saved.value || current[index]?.base !== saved.base))
        return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  function assertNoConflict(index: number, edit: NoteEdit) {
    if (edit.base !== mission.steps[index].note)
      throw new Error(
        tx({
          fr: `L’observation de l’étape ${index + 1} a changé dans un autre onglet. Choisissez la version à conserver avant d’enregistrer.`,
          en: `The observation for step ${index + 1} changed in another tab. Choose which version to keep before saving.`,
        }),
      );
  }

  async function changeStep(index: number, done?: boolean) {
    setWorking(true);
    setError('');
    try {
      const cachedEdit = noteEdits[index];
      const edit = cachedEdit?.value === mission.steps[index].note ? undefined : cachedEdit;
      if (edit) assertNoConflict(index, edit);
      await execute({
        type: 'mission.step',
        id: mission.id,
        index,
        ...(edit ? { note: edit.value, expectedNote: edit.base } : {}),
        ...(done === undefined ? {} : { done }),
      });
      if (cachedEdit) clearNote(index, cachedEdit);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx({ fr: 'Impossible d’enregistrer cette étape.', en: 'Could not save this step.' }),
      );
    } finally {
      setWorking(false);
    }
  }

  async function timer() {
    setError('');
    try {
      await execute({ type: 'mission.timer', id: mission.id, running: !mission.runningSince });
      setNow(Date.now());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx({
              fr: 'Impossible de mettre à jour le chronomètre.',
              en: 'Could not update the timer.',
            }),
      );
    }
  }

  async function submit(allowIncomplete = false) {
    if (!allowIncomplete && doneCount < mission.steps.length) {
      setConfirmSubmit(true);
      return;
    }
    setWorking(true);
    setError('');
    try {
      for (const [key, edit] of Object.entries(noteEdits)) {
        if (!edit) continue;
        const index = Number(key);
        if (edit.value === mission.steps[index].note) {
          clearNote(index, edit);
          continue;
        }
        assertNoConflict(index, edit);
        await execute({
          type: 'mission.step',
          id: mission.id,
          index,
          note: edit.value,
          expectedNote: edit.base,
        });
        clearNote(index, edit);
      }
      await execute({ type: 'mission.submit', id: mission.id, allowIncomplete });
      setConfirmSubmit(false);
      notify(t('missionSubmitted'));
    } catch (cause) {
      setConfirmSubmit(false);
      setError(
        cause instanceof Error
          ? cause.message
          : tx({
              fr: 'Impossible de soumettre cette mission.',
              en: 'Could not submit this mission.',
            }),
      );
    } finally {
      setWorking(false);
    }
  }

  const fieldView = actor.role === 'operateur';
  const timerControl = editable && (
    <Button
      variant={mission.runningSince ? 'secondary' : 'primary'}
      onClick={timer}
      disabled={pending}
    >
      {t(mission.runningSince ? 'pause' : mission.status === 'todo' ? 'startM' : 'resume')}
    </Button>
  );
  return (
    <>
      <div>
        <Button size="sm" onClick={() => navigate('missions')}>
          {t('back')}
        </Button>
      </div>
      <PageHeader
        eyebrow={`${state.clients.find((client) => client.id === scenario.clientId)?.name ?? ''} · ${formatDate(mission.date, locale)}`}
        title={tx(scenario.title)}
        description={`${t('operatorLine', mission.operator)} · ${tx(FAMILIES.find((family) => family.id === scenario.family)?.name ?? scenario.family)} · ${tx(LANGS[scenario.lang])}`}
        actions={<StatusBadge status={mission.status} />}
      />
      {error && (
        <div className="callout warn" role="alert">
          {error}
        </div>
      )}
      {fieldView && (
        <>
          <section
            aria-label={tx({ fr: 'Chronomètre de mission', en: 'Mission timer' })}
            className={`${styles.fieldTimer} ${editable && mission.status === 'doing' ? styles.activeTimer : ''}`}
          >
            <div>
              <span className={styles.timerLabel} role="status">
                {mission.runningSince
                  ? tx({ fr: 'Chronomètre en marche', en: 'Timer running' })
                  : mission.status === 'doing'
                    ? tx({ fr: 'Chronomètre en pause', en: 'Timer paused' })
                    : t('prodTime')}
              </span>
              <span className={styles.elapsed} role="timer" aria-label={t('prodTime')}>
                {duration(elapsed)}
              </span>
            </div>
            {timerControl}
          </section>
          <Card aria-labelledby="mission-brief-heading">
            <h2 id="mission-brief-heading">
              {tx({ fr: 'Consignes de mission', en: 'Mission brief' })}
            </h2>
            <dl className={styles.briefFacts}>
              <div>
                <dt>{t('objective')}</dt>
                <dd>{tx(scenario.objective) || '—'}</dd>
              </div>
              <div>
                <dt>{t('persona')}</dt>
                <dd>{tx(scenario.persona) || '—'}</dd>
              </div>
            </dl>
            <div className={`callout warn ${styles.limits}`}>
              <strong>{t('limitsEx')}</strong>
              <p>{tx(scenario.limits) || '—'}</p>
            </div>
            <p className={styles.target}>{t('target5h')}</p>
          </Card>
        </>
      )}
      <div className={`grid g32${fieldView ? ` ${styles.fieldWork}` : ''}`}>
        <div className="stack">
          <Card>
            <div className="ch">
              <h2>{t('journey')}</h2>
              <span className="muted num">{t('stepsCount', doneCount, mission.steps.length)}</span>
            </div>
            <div className="list">
              {scenario.steps.map((step, index) => {
                const progress = mission.steps[index];
                const edit =
                  noteEdits[index]?.value === progress.note ? undefined : noteEdits[index];
                const conflict = Boolean(edit && edit.base !== progress.note);
                return (
                  <div key={index} className={`opstep${progress.done ? ' done' : ''}`}>
                    <button
                      className="tick"
                      aria-pressed={progress.done}
                      aria-label={t('stepDoneAria', index + 1)}
                      disabled={!editable || pending}
                      onClick={() => changeStep(index, !progress.done)}
                    >
                      {progress.done ? '✓' : ''}
                    </button>
                    <div>
                      <div>
                        <b>{index + 1}.</b> {tx(step.label)}
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {t('thrColon')} {tx(step.seuil) || '—'}
                        {progress.at && (
                          <>
                            {' '}
                            ·{' '}
                            <span className="mono">
                              {t('doneAt', formatDate(progress.at, locale, true))}
                            </span>
                          </>
                        )}
                      </div>
                      {editable ? (
                        <>
                          <input
                            type="text"
                            aria-label={`${t('notePh')} — ${index + 1}`}
                            value={edit?.value ?? progress.note}
                            onChange={(event) => updateNote(index, event.target.value)}
                            aria-invalid={conflict}
                            aria-describedby={conflict ? `note-conflict-${index}` : undefined}
                            placeholder={t('notePh')}
                            maxLength={5000}
                            disabled={pending}
                          />
                          {conflict && (
                            <div
                              className="callout warn"
                              id={`note-conflict-${index}`}
                              role="status"
                              style={{ marginTop: 8 }}
                            >
                              <p>
                                {tx({
                                  fr: 'Cette observation a changé dans un autre onglet.',
                                  en: 'This observation changed in another tab.',
                                })}
                              </p>
                              <p className="preserve-lines" style={{ marginTop: 6 }}>
                                {tx({ fr: 'Version enregistrée :', en: 'Saved version:' })}{' '}
                                {progress.note || '—'}
                              </p>
                              <div className="button-row" style={{ marginTop: 8 }}>
                                <Button
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => {
                                    clearNote(index);
                                    setError('');
                                  }}
                                >
                                  {tx({
                                    fr: 'Utiliser la version enregistrée',
                                    en: 'Use saved version',
                                  })}
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => {
                                    setNoteEdits((current) => ({
                                      ...current,
                                      [index]: {
                                        base: progress.note,
                                        value: current[index]?.value ?? progress.note,
                                      },
                                    }));
                                    setError('');
                                  }}
                                >
                                  {tx({ fr: 'Garder ma saisie', en: 'Keep my entry' })}
                                </Button>
                              </div>
                            </div>
                          )}
                          {edit && (
                            <Button
                              size="sm"
                              style={{ marginTop: 6 }}
                              disabled={pending || conflict}
                              onClick={() => changeStep(index)}
                            >
                              {tx({ fr: 'Enregistrer l’observation', en: 'Save observation' })}
                            </Button>
                          )}
                        </>
                      ) : progress.note ? (
                        <p style={{ marginTop: 6, fontSize: 13 }}>{progress.note}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="ch">
              <h2>{t('evTitle')}</h2>
              <span className="muted num">{t('evN', evidence.length)}</span>
            </div>
            {editable && <EvidenceForm missionId={mission.id} onSaved={() => setEvidencePage(1)} />}
            {evidence.length ? (
              <>
                <div className="ev" style={{ marginTop: 14 }}>
                  {evidence
                    .slice((evidencePage - 1) * PAGE_SIZE, evidencePage * PAGE_SIZE)
                    .map((item) => (
                      <EvidenceCard key={item.id} evidence={item} />
                    ))}
                </div>
                <Pagination
                  page={evidencePage}
                  total={evidence.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setEvidencePage}
                />
              </>
            ) : (
              <div style={{ marginTop: 12 }}>
                <EmptyState>{t('noEv')}</EmptyState>
              </div>
            )}
          </Card>
          {fieldView && editable && mission.status === 'doing' && (
            <Card className={styles.handoff}>
              <div>
                <h2>{tx({ fr: 'Validation qualité', en: 'Quality review' })}</h2>
                <p className="muted">
                  {t('stepsCount', doneCount, mission.steps.length)} · {t('evN', evidence.length)}
                </p>
              </div>
              <Button variant="primary" disabled={pending} onClick={() => submit()}>
                {t('submitR')}
              </Button>
            </Card>
          )}
        </div>
        <div className="stack">
          {!fieldView && (
            <>
              <div className="timerbox">
                <span className="sub">{t('prodTime')}</span>
                <span className="timer" role="timer" aria-label={t('prodTime')}>
                  {duration(elapsed)}
                </span>
                <div className="track">
                  <i style={{ width: `${Math.min(100, (elapsed / (5 * 3_600_000)) * 100)}%` }} />
                </div>
                <span className="sub">{t('target5h')}</span>
                {editable ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {timerControl}
                    <Button
                      disabled={mission.status === 'todo' || pending}
                      onClick={() => submit()}
                    >
                      {t('submitR')}
                    </Button>
                  </div>
                ) : mission.status === 'review' && actor.role === 'qualite' ? (
                  <Button variant="primary" onClick={() => navigate('notation', mission.id)}>
                    {t('scoreThis')}
                  </Button>
                ) : mission.status === 'done' ? (
                  <Button variant="primary" onClick={() => navigate('rapport', mission.id)}>
                    {t('seeReport')}
                  </Button>
                ) : null}
              </div>
              <Card>
                <h3>{t('personaH')}</h3>
                <p style={{ marginTop: 6 }}>{tx(scenario.persona) || '—'}</p>
              </Card>
              <div className="callout warn">
                <b>{t('limitsB')}</b> {tx(scenario.limits) || '—'}
              </div>
            </>
          )}
          <Card>
            <h3>{t('journal')}</h3>
            <ul className="log" style={{ marginTop: 10 }}>
              {mission.log.length ? (
                mission.log
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <span className="mono">{formatDate(event.at, locale, true)}</span>
                      <span>{tx(event.text)}</span>
                    </li>
                  ))
              ) : (
                <li>
                  <span className="muted">{t('noEvent')}</span>
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={t('submitR')}
        description={t('uncheckedWarn', mission.steps.length - doneCount)}
        confirmLabel={t('submitAnyway')}
        onConfirm={() => submit(true)}
      />
    </>
  );
}

interface EvidenceDraft {
  type: EvidenceType;
  label: string;
  text: string;
}
function readEvidenceDraft(missionId: string): EvidenceDraft {
  const blank: EvidenceDraft = { type: 'capture', label: '', text: '' };
  if (typeof window === 'undefined') return blank;
  try {
    const raw = sessionStorage.getItem(`ecarteo:evidence-draft:${missionId}`);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (
      stored &&
      typeof stored === 'object' &&
      'type' in stored &&
      typeof stored.type === 'string' &&
      Object.hasOwn(EVTYPES, stored.type) &&
      'label' in stored &&
      typeof stored.label === 'string' &&
      'text' in stored &&
      typeof stored.text === 'string'
    )
      return stored as EvidenceDraft;
  } catch {
    /* Start with an empty form when the browser session data is invalid. */
  }
  return blank;
}

function EvidenceForm({ missionId, onSaved }: { missionId: string; onSaved: () => void }) {
  const { t, tx, execute, busy, notify } = useConsole();
  const [draft, setDraft] = useState(() => readEvidenceDraft(missionId));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const staged = useRef<{ source: File; metadata: AttachmentMetadata } | null>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(`ecarteo:evidence-draft:${missionId}`, JSON.stringify(draft));
    } catch {
      /* Text remains available in this form. */
    }
  }, [draft, missionId]);

  function chooseFile(next: File | null) {
    staged.current = null;
    setError('');
    setFileError('');
    if (
      next &&
      (!/\.(png|jpe?g|webp|pdf|txt|eml)$/i.test(next.name) ||
        (next.type &&
          ![
            'image/png',
            'image/jpeg',
            'image/webp',
            'application/pdf',
            'text/plain',
            'message/rfc822',
          ].includes(next.type)))
    ) {
      setFile(null);
      setFileError(
        tx({
          fr: 'Utilisez un fichier PNG, JPEG, WebP, PDF, TXT ou EML.',
          en: 'Use a PNG, JPEG, WebP, PDF, TXT or EML file.',
        }),
      );
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    if (next && next.size > 10 * 1024 * 1024) {
      setFile(null);
      setFileError(
        tx({ fr: 'La taille maximale est de 10 Mo.', en: 'The maximum file size is 10 MB.' }),
      );
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setFile(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!draft.label.trim() && !file) {
      setError(t('evNeed'));
      labelInput.current?.focus();
      return;
    }
    if (fileError) {
      fileInput.current?.focus();
      return;
    }
    setSaving(true);
    let attachment: Awaited<ReturnType<typeof saveAttachment>> | undefined;
    let committed = false;
    try {
      if (file) {
        attachment =
          staged.current?.source === file
            ? staged.current.metadata
            : await saveAttachment(file, missionId);
        staged.current = { source: file, metadata: attachment };
      }
      await execute({
        type: 'evidence.add',
        missionId,
        evidence: {
          type: draft.type,
          label: draft.label.trim() || file?.name || t('evDefault'),
          text: draft.text.trim(),
          ...attachment,
        },
      });
      committed = true;
      staged.current = null;
      setDraft({ type: draft.type, label: '', text: '' });
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      notify(t('evAdded'));
      onSaved();
      labelInput.current?.focus();
    } catch (cause) {
      let cleanupFailed = false;
      if (attachment && !committed && !uncertainOutcome(cause)) {
        try {
          await removeAttachment(attachment.fileId);
          staged.current = null;
        } catch {
          cleanupFailed = true;
        }
      }
      setError(
        (cause instanceof Error
          ? cause.message
          : tx({
              fr: 'Impossible d’ajouter la preuve. Vos saisies sont conservées.',
              en: 'Could not add the evidence. Your entries have been kept.',
            })) +
          (cleanupFailed
            ? tx({
                fr: ' Le fichier non lié n’a pas pu être supprimé.',
                en: ' The unattached file could not be removed.',
              })
            : ''),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={save}
      aria-busy={saving || busy}
      style={{ marginTop: 12, background: 'var(--surface-2)', padding: 12, borderRadius: 11 }}
    >
      <div className="row2">
        <Field label={t('type')}>
          <select
            value={draft.type}
            disabled={saving}
            onChange={(event) =>
              setDraft((current) => ({ ...current, type: event.target.value as EvidenceType }))
            }
          >
            {(Object.keys(EVTYPES) as EvidenceType[]).map((type) => (
              <option key={type} value={type}>
                {tx(EVTYPES[type])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('label')} error={error}>
          <input
            ref={labelInput}
            type="text"
            value={draft.label}
            disabled={saving}
            onChange={(event) => {
              setDraft((current) => ({ ...current, label: event.target.value }));
              setError('');
            }}
            placeholder={t('labelPh')}
            maxLength={250}
          />
        </Field>
      </div>
      <Field label={t('content')}>
        <Textarea
          className="resize-none"
          value={draft.text}
          disabled={saving}
          onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
          placeholder={t('contentPh')}
          maxLength={10000}
        />
      </Field>
      <Field label={t('fileOpt')} error={fileError}>
        <input
          ref={fileInput}
          type="file"
          disabled={saving}
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,message/rfc822,.eml"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      {(file || fileError) && (
        <div>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => {
              chooseFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            {tx({ fr: 'Retirer le fichier', en: 'Remove file' })}
          </Button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        {tx({
          fr: 'PNG, JPEG, WebP, PDF, TXT ou EML · 10 Mo maximum. La preuve sera rattachée à cette mission.',
          en: 'PNG, JPEG, WebP, PDF, TXT or EML · 10 MB maximum. Evidence will be attached to this mission.',
        })}
      </p>
      <div>
        <Button type="submit" variant="primary" disabled={busy || saving}>
          {saving ? tx({ fr: 'Enregistrement…', en: 'Saving…' }) : t('addEv')}
        </Button>
      </div>
    </form>
  );
}

export default Missions;
