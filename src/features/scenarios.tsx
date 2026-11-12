'use client';
import { Textarea } from '@/components/ui';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, EmptyState, Field, PageHeader, Pagination } from '@/components/ui';
import { CHANNELS, EVIDENCE_EXPECTED, FAMILIES, LANGS } from '@/domain/reference';
import type { Channel, FamilyId, ProspectLanguage, Scenario, ScenarioDraft } from '@/domain/types';
import { useConsole } from '@/lib/console-context';
import { scenarioFingerprint } from '@/domain/commands';

const DRAFT_KEY = 'ecarteo:scenario-draft:v1';
const PAGE_SIZE = 12;

function blankDraft(clientId: string): ScenarioDraft {
  return {
    clientId,
    title: '',
    family: 'info',
    objective: '',
    channels: [],
    lang: 'FR',
    persona: '',
    steps: [{ label: '', seuil: '' }],
    evidence: [],
    limits: '',
  };
}

function isRestorableDraft(value: unknown): value is ScenarioDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return (
    ['clientId', 'title', 'objective', 'persona', 'limits'].every(
      (key) => typeof draft[key] === 'string',
    ) &&
    FAMILIES.some((family) => family.id === draft.family) &&
    typeof draft.lang === 'string' &&
    Object.hasOwn(LANGS, draft.lang) &&
    Array.isArray(draft.channels) &&
    draft.channels.every(
      (channel) => typeof channel === 'string' && Object.hasOwn(CHANNELS, channel),
    ) &&
    Array.isArray(draft.evidence) &&
    draft.evidence.every(
      (item) => typeof item === 'string' && Object.hasOwn(EVIDENCE_EXPECTED, item),
    ) &&
    Array.isArray(draft.steps) &&
    draft.steps.length > 0 &&
    draft.steps.length <= 100 &&
    draft.steps.every(
      (step) =>
        step &&
        typeof step === 'object' &&
        typeof step.label === 'string' &&
        typeof step.seuil === 'string',
    )
  );
}

export function Scenarios() {
  const { state, t, tx, selectedId, navigate, clientFilter, locale } = useConsole();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filtered = state.scenarios.filter(
    (scenario) =>
      (clientFilter === 'all' || scenario.clientId === clientFilter) &&
      `${tx(scenario.title)} ${state.clients.find((client) => client.id === scenario.clientId)?.name ?? ''}`
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const selected = filtered.find((scenario) => scenario.id === selectedId) ?? filtered[0];

  return (
    <>
      <PageHeader
        eyebrow={t('scEyebrow')}
        title={t('scTitle')}
        description={t('scSub')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('newSc')}
          </Button>
        }
      />
      <div className="grid g23">
        <div className="list">
          <Field label={tx({ fr: 'Rechercher un scénario', en: 'Search scenarios' })}>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          {filtered
            .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
            .map((scenario) => (
              <button
                key={scenario.id}
                className="item"
                aria-current={!creating && selected?.id === scenario.id ? 'true' : undefined}
                onClick={() => {
                  setCreating(false);
                  navigate('scenarios', scenario.id);
                }}
              >
                <div className="r">
                  <b>{tx(scenario.title)}</b>
                  <span
                    className={`pill ${scenario.status === 'validated' ? 'lv-ok' : 'lv-neutral'}`}
                  >
                    {t(scenario.status === 'validated' ? 'validated' : 'draft')}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {state.clients.find((client) => client.id === scenario.clientId)?.name} ·{' '}
                  {tx(
                    FAMILIES.find((family) => family.id === scenario.family)?.name ??
                      scenario.family,
                  )}{' '}
                  · {tx(LANGS[scenario.lang])}
                </span>
                <div className="chips">
                  {scenario.channels.map((channel) => (
                    <span className="chip" key={channel}>
                      {tx(CHANNELS[channel])}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          {!filtered.length && (
            <EmptyState>
              {tx({
                fr: 'Aucun scénario ne correspond à votre recherche.',
                en: 'No scenarios match your search.',
              })}
            </EmptyState>
          )}
          <Pagination
            page={currentPage}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
        <div>
          {creating ? (
            <ScenarioForm onClose={() => setCreating(false)} />
          ) : selected ? (
            <ScenarioDetail key={selected.id} scenario={selected} />
          ) : (
            <EmptyState>{t('selectSc')}</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

function ScenarioDetail({ scenario }: { scenario: Scenario }) {
  const { state, t, tx, locale, execute, busy, notify, navigate, operators } = useConsole();
  const [operator, setOperator] = useState(operators[0]?.id ?? '');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const parent = state.scenarios.find((item) => item.id === scenario.parentId);
  const missions = state.missions.filter((mission) => mission.scenarioId === scenario.id);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium' }).format(
      new Date(value),
    );

  async function approve() {
    try {
      await execute({ type: 'scenario.approve', id: scenario.id });
      setError('');
      notify(t('scApproved'));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx({ fr: 'Impossible de valider le scénario.', en: 'Could not approve the scenario.' }),
      );
    }
  }

  async function schedule(event: FormEvent) {
    event.preventDefault();
    const assignee = operators.find((item) => item.id === operator);
    if (!assignee) {
      setError(
        tx({
          fr: 'Choisissez un opérateur actif avant de planifier la mission.',
          en: 'Choose an active auditor before scheduling the mission.',
        }),
      );
      return;
    }
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T09:00:00`))
    ) {
      setError(
        tx({ fr: 'Choisissez une date d’exécution valide.', en: 'Choose a valid execution date.' }),
      );
      dateRef.current?.focus();
      return;
    }
    try {
      await execute({ type: 'mission.create', scenarioId: scenario.id, operator, date });
      setError('');
      notify(t('missionCreated', assignee.name));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx({ fr: 'Impossible de créer la mission.', en: 'Could not create the mission.' }),
      );
    }
  }

  async function duplicate() {
    try {
      const result = await execute({ type: 'scenario.duplicate', id: scenario.id });
      notify(t('dupDone'));
      navigate('scenarios', result.entityId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx({
              fr: 'Impossible de dupliquer le scénario.',
              en: 'Could not duplicate the scenario.',
            }),
      );
    }
  }

  if (editing) return <ScenarioForm initial={scenario} onClose={() => setEditing(false)} />;
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ch">
        <div>
          <span className="eyebrow">
            {state.clients.find((client) => client.id === scenario.clientId)?.name}
          </span>
          <h2 style={{ marginTop: 4 }}>{tx(scenario.title)}</h2>
        </div>
        {scenario.status === 'validated' ? (
          <span className="pill lv-ok">{t('approvedByQ')}</span>
        ) : (
          <div className="button-row">
            <Button size="sm" disabled={busy} onClick={() => setEditing(true)}>
              {tx({ fr: 'Modifier le brouillon', en: 'Edit draft' })}
            </Button>
            <Button size="sm" className="dark" disabled={busy} onClick={approve}>
              {t('approveSc')}
            </Button>
          </div>
        )}
      </div>
      {parent && <div className="callout">{t('retestOf', tx(parent.title))}</div>}
      <div className="row2">
        <div className="field">
          <span>{t('objective')}</span>
          <p>{tx(scenario.objective) || '—'}</p>
        </div>
        <div className="field">
          <span>{t('persona')}</span>
          <p>{tx(scenario.persona) || '—'}</p>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <span>{t('channels')}</span>
          <div className="chips">
            {scenario.channels.map((channel) => (
              <span className="chip" key={channel}>
                {tx(CHANNELS[channel])}
              </span>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('famLang')}</span>
          <p>
            {tx(FAMILIES.find((family) => family.id === scenario.family)?.name ?? scenario.family)}{' '}
            · {tx(LANGS[scenario.lang])}
          </p>
        </div>
      </div>
      <div className="field">
        <span>{t('stepsThr')}</span>
        <ol className="steps">
          {scenario.steps.map((step, index) => (
            <li className="step" key={index}>
              <span className="n">{index + 1}</span>
              <div>
                <div>{tx(step.label)}</div>
                <div className="seuil">
                  {t('thrColon')} {tx(step.seuil) || '—'}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="field">
        <span>{t('expEv')}</span>
        <div className="chips">
          {scenario.evidence.length
            ? scenario.evidence.map((item) => (
                <span className="chip" key={item}>
                  {tx(EVIDENCE_EXPECTED[item] ?? item)}
                </span>
              ))
            : '—'}
        </div>
      </div>
      <div className="callout warn">
        <b>{t('limitsB')}</b> {tx(scenario.limits) || '—'}
      </div>
      {scenario.status === 'validated' && (
        <form
          noValidate
          onSubmit={schedule}
          className="form"
          style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}
        >
          <h3>{t('planMission')}</h3>
          <div className="row2">
            <Field label={t('operator')}>
              <select value={operator} onChange={(event) => setOperator(event.target.value)}>
                <option value="">
                  {tx({ fr: 'Choisir un opérateur', en: 'Choose an auditor' })}
                </option>
                {operators.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('execDate')} error={error || undefined}>
              <input
                ref={dateRef}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError('');
                }}
                required
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="submit" variant="primary" disabled={busy || !operators.length}>
              {t('createMission')}
            </Button>
            <Button type="button" disabled={busy} onClick={duplicate}>
              {t('dupRetest')}
            </Button>
          </div>
          {!operators.length && (
            <p className="muted">
              {tx({
                fr: 'Aucun opérateur actif. Ajoutez un membre opérateur à votre équipe avant de planifier une mission.',
                en: 'No active auditors. Add an auditor to your team before scheduling a mission.',
              })}
            </p>
          )}
        </form>
      )}
      {error && scenario.status !== 'validated' && (
        <p className="err" id="scenario-detail-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <span>
          {t('linkedMissions')} · {locale === 'fr' ? 'les 3 plus récentes' : 'latest 3'}
        </span>
        {missions.length ? (
          <div className="chips">
            {missions.map((mission) => (
              <button
                className="chip"
                style={{ cursor: 'pointer' }}
                key={mission.id}
                onClick={() => navigate('missions', mission.id)}
              >
                {formatDate(mission.date)} · {t(`st_${mission.status}`)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{t('noMission')}</p>
        )}
      </div>
    </Card>
  );
}

function ScenarioForm({ onClose, initial }: { onClose: () => void; initial?: Scenario }) {
  const { state, t, tx, execute, busy, notify, navigate } = useConsole();
  const toDraft = (scenario: Scenario): ScenarioDraft => ({
    clientId: scenario.clientId,
    title: scenario.title,
    family: scenario.family,
    objective: scenario.objective,
    channels: [...scenario.channels],
    lang: scenario.lang,
    persona: scenario.persona,
    steps: structuredClone(scenario.steps),
    evidence: [...scenario.evidence],
    limits: scenario.limits,
  });
  const [draft, setDraft] = useState<ScenarioDraft>(() =>
    initial ? toDraft(initial) : blankDraft(state.clients[0]?.id ?? ''),
  );
  const [expectedFingerprint] = useState(() => (initial ? scenarioFingerprint(initial) : ''));
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (initial) {
      setLoaded(true);
      return;
    }
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (isRestorableDraft(value)) setDraft(value);
      }
    } catch {
      /* An unavailable session store must not block editing. */
    }
    setLoaded(true);
  }, [initial]);
  useEffect(() => {
    if (loaded && !initial) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* Draft remains in memory. */
      }
    }
  }, [draft, loaded, initial]);
  useEffect(() => {
    if (!tx(draft.title).trim()) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [draft.title, tx]);

  function update<K extends keyof ScenarioDraft>(key: K, value: ScenarioDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '', general: '' }));
  }
  function updateStep(index: number, key: 'label' | 'seuil', value: string) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [key]: value } : step,
      ),
    }));
    setErrors((current) => ({ ...current, [`step-${index}`]: '', steps: '', general: '' }));
  }
  const required = tx({ fr: 'Ce champ est obligatoire.', en: 'This field is required.' });

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!state.clients.some((client) => client.id === draft.clientId))
      nextErrors.clientId = required;
    if (!tx(draft.title).trim()) nextErrors.title = t('errTitle');
    if (!draft.channels.length) nextErrors.channels = t('errChannel');
    if (!draft.steps.some((step) => tx(step.label).trim())) nextErrors['step-0'] = t('errStep');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    try {
      const result = await execute(
        initial
          ? { type: 'scenario.update', id: initial.id, draft, expectedFingerprint }
          : { type: 'scenario.create', draft },
      );
      try {
        if (!initial) sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* No stored draft to remove. */
      }
      notify(t('scSaved'));
      onClose();
      navigate('scenarios', result.entityId);
    } catch (cause) {
      setErrors({
        general:
          cause instanceof Error
            ? cause.message
            : tx({
                fr: 'Impossible d’enregistrer le scénario.',
                en: 'Could not save the scenario.',
              }),
      });
    }
  }

  return (
    <form ref={formRef} className="card form" noValidate onSubmit={save} aria-busy={busy}>
      <div className="ch">
        <h2>{initial ? tx({ fr: 'Modifier le brouillon', en: 'Edit draft' }) : t('newSc')}</h2>
        <Button type="button" size="sm" disabled={busy} onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
      <div className="row2">
        <Field label={t('client')} error={errors.clientId}>
          <select
            value={draft.clientId}
            disabled={Boolean(initial)}
            onChange={(event) => update('clientId', event.target.value)}
            required
          >
            {state.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('family')}>
          <select
            value={draft.family}
            onChange={(event) => update('family', event.target.value as FamilyId)}
          >
            {FAMILIES.map((family) => (
              <option key={family.id} value={family.id}>
                {tx(family.name)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('title')} error={errors.title}>
        <input
          type="text"
          value={tx(draft.title)}
          onChange={(event) => update('title', event.target.value)}
          placeholder={t('titlePh')}
          maxLength={180}
          required
        />
      </Field>
      <Field label={t('objective')} error={errors.objective}>
        <Textarea
          className="resize-none"
          value={tx(draft.objective)}
          onChange={(event) => update('objective', event.target.value)}
          placeholder={t('objPh')}
          maxLength={5000}
        />
      </Field>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t('channelsTested')}</legend>
        <div className="checks">
          {(Object.keys(CHANNELS) as Channel[]).map((channel, index) => (
            <label key={channel}>
              <input
                type="checkbox"
                checked={draft.channels.includes(channel)}
                onChange={(event) =>
                  update(
                    'channels',
                    event.target.checked
                      ? [...draft.channels, channel]
                      : draft.channels.filter((item) => item !== channel),
                  )
                }
                aria-invalid={index === 0 && !!errors.channels}
                aria-describedby={errors.channels ? 'scenario-channels-error' : undefined}
              />
              {tx(CHANNELS[channel])}
            </label>
          ))}
        </div>
        {errors.channels && (
          <p className="err" id="scenario-channels-error">
            {errors.channels}
          </p>
        )}
      </fieldset>
      <div className="row2">
        <Field label={t('prospectLang')}>
          <select
            value={draft.lang}
            onChange={(event) => update('lang', event.target.value as ProspectLanguage)}
          >
            {(Object.keys(LANGS) as ProspectLanguage[]).map((language) => (
              <option key={language} value={language}>
                {tx(LANGS[language])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('persona')} error={errors.persona}>
          <input
            type="text"
            value={tx(draft.persona)}
            onChange={(event) => update('persona', event.target.value)}
            placeholder={t('personaPh')}
            maxLength={2000}
          />
        </Field>
      </div>
      <div className="field">
        <span>{t('stepsThr')}</span>
        <div className="list">
          {draft.steps.map((step, index) => (
            <div key={index}>
              <div className="form-step-row">
                <span
                  className="muted num step-index"
                  style={{ textAlign: 'center', fontWeight: 650 }}
                >
                  {index + 1}
                </span>
                <input
                  type="text"
                  aria-label={`${t('stepPh')} ${index + 1}`}
                  aria-invalid={!!errors[`step-${index}`]}
                  aria-describedby={
                    errors[`step-${index}`] ? `scenario-step-error-${index}` : undefined
                  }
                  value={tx(step.label)}
                  onChange={(event) => updateStep(index, 'label', event.target.value)}
                  placeholder={t('stepPh')}
                  maxLength={1000}
                />
                <input
                  type="text"
                  className="threshold-field"
                  aria-label={`${t('thrPh')} ${index + 1}`}
                  aria-invalid={!!errors[`step-${index}`]}
                  aria-describedby={
                    errors[`step-${index}`] ? `scenario-step-error-${index}` : undefined
                  }
                  value={tx(step.seuil)}
                  onChange={(event) => updateStep(index, 'seuil', event.target.value)}
                  placeholder={t('thrPh')}
                  maxLength={1000}
                />
                <Button
                  type="button"
                  size="sm"
                  aria-label={t('removeStep', index + 1)}
                  disabled={draft.steps.length < 2}
                  onClick={() =>
                    update(
                      'steps',
                      draft.steps.filter((_, stepIndex) => stepIndex !== index),
                    )
                  }
                >
                  {t('remove')}
                </Button>
              </div>
              {errors[`step-${index}`] && (
                <p id={`scenario-step-error-${index}`} className="err">
                  {errors[`step-${index}`]}
                </p>
              )}
            </div>
          ))}
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            disabled={draft.steps.length >= 30}
            onClick={() => update('steps', [...draft.steps, { label: '', seuil: '' }])}
          >
            {t('addStep')}
          </Button>
        </div>
        {errors.steps && <p className="err">{errors.steps}</p>}
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t('expEv')}</legend>
        <div className="checks">
          {Object.keys(EVIDENCE_EXPECTED).map((item) => (
            <label key={item}>
              <input
                type="checkbox"
                checked={draft.evidence.includes(item)}
                onChange={(event) =>
                  update(
                    'evidence',
                    event.target.checked
                      ? [...draft.evidence, item]
                      : draft.evidence.filter((value) => value !== item),
                  )
                }
              />
              {tx(EVIDENCE_EXPECTED[item])}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t('limitsEx')} error={errors.limits}>
        <Textarea
          className="resize-none"
          value={tx(draft.limits)}
          onChange={(event) => update('limits', event.target.value)}
          placeholder={t('limitsPh')}
          maxLength={5000}
        />
      </Field>
      <div className="callout">{t('ethics')}</div>
      {errors.general && (
        <p className="err" role="alert">
          {errors.general}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={busy || !loaded}>
          {initial
            ? tx({ fr: 'Enregistrer les modifications', en: 'Save changes' })
            : t('saveDraft')}
        </Button>
      </div>
    </form>
  );
}

export default Scenarios;
