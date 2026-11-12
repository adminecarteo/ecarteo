'use client';
import { Textarea } from '@/components/ui';

import { useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  ScoreBadge,
  StatusBadge,
} from '@/components/ui';
import { CRITERIA } from '@/domain/reference';
import { levelOf, scoreOf, scoringFingerprint as fingerprint } from '@/domain/commands';
import type { ActionDraft, Comments, CriterionId, Mission, Scores } from '@/domain/types';
import { useConsole } from '@/lib/console-context';
import { formatDate } from '@/lib/i18n';

interface Suggestion extends ActionDraft {
  include: boolean;
}
interface ScoreDraft {
  scores: Scores;
  comments: Comments;
  critical: boolean;
  suggestions: Partial<Record<CriterionId, Suggestion>>;
  sourceFingerprint: string;
}

function readDraft(key: string, mission: Mission): ScoreDraft {
  const initial = {
    scores: mission.scores,
    comments: mission.comments,
    critical: mission.critical,
    suggestions: {},
    sourceFingerprint: fingerprint(mission),
  };
  if (mission.status === 'done' || typeof window === 'undefined') return initial;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return initial;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initial;
    const value = parsed as ScoreDraft;
    if (
      !value.scores ||
      !value.comments ||
      !value.suggestions ||
      typeof value.critical !== 'boolean' ||
      typeof value.sourceFingerprint !== 'string'
    )
      return initial;
    return value;
  } catch {
    return initial;
  }
}

function ScoringEditor({ mission }: { mission: Mission }) {
  const { state, actor, locale, t, tx, execute, busy, notify, navigate } = useConsole();
  const draftKey = `ecarteo:score-draft:${actor.role}:${actor.name}:${mission.id}`;
  const [draft, setDraft] = useState<ScoreDraft>(() => readDraft(draftKey, mission));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftChanged, setDraftChanged] = useState(false);
  const readonly = mission.status === 'done' || actor.role !== 'qualite';
  const conflict = !readonly && fingerprint(mission) !== draft.sourceFingerprint;
  const conflictMessage =
    locale === 'fr'
      ? 'La notation enregistrée a changé dans un autre onglet. Rechargez les notes enregistrées avant de continuer.'
      : 'Saved scoring changed in another tab. Reload the saved ratings before continuing.';
  const effective = readonly ? mission : { ...mission, ...draft };
  const score = scoreOf(effective);
  const level = levelOf(score, effective.critical);
  const scenario = mission.scenarioSnapshot;
  const evidenceCount = state.evidence.filter((item) => item.missionId === mission.id).length;
  const date = (value: string) => formatDate(value, locale);
  const suggestions: Suggestion[] = CRITERIA.flatMap((criterion) => {
    const value = draft.scores[criterion.id];
    if (value == null || value > 2) return [];
    return [
      draft.suggestions[criterion.id] ?? {
        critId: criterion.id,
        text: criterion.fix,
        horizon: value <= 1 ? 7 : 30,
        owner: '',
        include: true,
      },
    ];
  });

  function updateDraft(change: Partial<ScoreDraft>) {
    const next = { ...draft, ...change };
    setDraft(next);
    setDraftChanged(true);
    setError('');
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      setError(
        locale === 'fr'
          ? 'Le brouillon n’a pas pu être conservé dans cet onglet. Enregistrez-le avant de quitter.'
          : 'This tab could not retain the draft. Save it before leaving.',
      );
    }
  }

  function updateSuggestion(action: Suggestion, change: Partial<Suggestion>) {
    updateDraft({
      suggestions: { ...draft.suggestions, [action.critId]: { ...action, ...change } },
    });
  }

  async function save(publish = false) {
    if (conflict) {
      setError(conflictMessage);
      setConfirm(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (publish) {
        await execute({
          type: 'mission.approve',
          id: mission.id,
          scores: draft.scores,
          comments: draft.comments,
          critical: draft.critical,
          expectedScoringFingerprint: draft.sourceFingerprint,
          actions: suggestions
            .filter((action) => action.include)
            .map(({ critId, horizon, text, owner }) => ({ critId, horizon, text, owner })),
        });
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          /* Approved missions ignore cached drafts. */
        }
        notify(t('toastValidated'));
      } else {
        await execute({
          type: 'mission.score',
          id: mission.id,
          scores: draft.scores,
          comments: draft.comments,
          critical: draft.critical,
          expectedScoringFingerprint: draft.sourceFingerprint,
        });
        const savedDraft = { ...draft, sourceFingerprint: fingerprint(draft) };
        setDraft(savedDraft);
        try {
          sessionStorage.setItem(draftKey, JSON.stringify(savedDraft));
        } catch {
          /* Saved scores remain in the workspace. */
        }
        notify(locale === 'fr' ? 'Brouillon de notation enregistré' : 'Scoring draft saved');
      }
      setDraftChanged(false);
      setConfirm(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : locale === 'fr'
            ? 'L’enregistrement a échoué. Votre brouillon est conservé.'
            : 'Saving failed. Your draft is retained.',
      );
      setConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  function validate() {
    if (conflict) {
      setError(conflictMessage);
      return;
    }
    const missing = CRITERIA.filter((criterion) => draft.scores[criterion.id] === undefined);
    if (missing.length) {
      setError(t('errMissing', missing.map((criterion) => tx(criterion.name)).join(', ')));
      return;
    }
    if (score === null) {
      setError(
        locale === 'fr'
          ? 'Au moins un critère doit recevoir une note chiffrée.'
          : 'At least one criterion needs a numeric rating.',
      );
      return;
    }
    if (
      suggestions.some(
        (action) => action.include && (!tx(action.text).trim() || !tx(action.owner).trim()),
      )
    ) {
      setError(
        locale === 'fr'
          ? 'Chaque action incluse doit avoir un texte et un responsable.'
          : 'Each included action needs its text and an owner.',
      );
      return;
    }
    setError('');
    setConfirm(true);
  }

  function reloadScores() {
    const next: ScoreDraft = {
      scores: mission.scores,
      comments: mission.comments,
      critical: mission.critical,
      suggestions: draft.suggestions,
      sourceFingerprint: fingerprint(mission),
    };
    setDraft(next);
    setError('');
    setDraftChanged(false);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* The current copy stays usable. */
    }
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ch">
        <div>
          <span className="eyebrow">
            {state.clients.find((client) => client.id === scenario.clientId)?.name}
          </span>
          <h2 style={{ marginTop: 4 }}>{tx(scenario.title)}</h2>
        </div>
        <Button size="sm" onClick={() => navigate('missions', mission.id)}>
          {t('seeMissionEv', evidenceCount)}
        </Button>
      </div>
      <div className="gauge">
        <span className="big">
          {score ?? '–'}
          <small> /100</small>
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ScoreBadge score={score} critical={effective.critical} />
          <span className="muted" style={{ fontSize: 13 }}>
            {level ? t(`lvd_${level}`) : t('scoreFromFirst')}
          </span>
        </div>
      </div>
      {conflict && (
        <div className="callout warn" role="alert">
          <p>{conflictMessage}</p>
          <Button size="sm" disabled={busy || saving} onClick={() => setReloadConfirm(true)}>
            {locale === 'fr' ? 'Recharger les notes' : 'Reload saved ratings'}
          </Button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5 }}>
        {t('scale')}
      </p>
      <div>
        {CRITERIA.map((criterion) => {
          const value = effective.scores[criterion.id];
          const comment = effective.comments[criterion.id];
          return (
            <div className="crit" key={criterion.id}>
              <div>
                <b>{tx(criterion.name)}</b>{' '}
                <span className="w">
                  · {t('weight')} {criterion.w}
                </span>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {tx(criterion.q)}
                </div>
              </div>
              <div className="seg" role="group" aria-label={t('rateAria', tx(criterion.name))}>
                {([0, 1, 2, 3, 4, null] as const).map((rating) => (
                  <button
                    key={rating ?? 'na'}
                    type="button"
                    disabled={readonly || saving}
                    aria-pressed={value === rating}
                    onClick={() =>
                      updateDraft({ scores: { ...draft.scores, [criterion.id]: rating } })
                    }
                  >
                    {rating ?? 'n/a'}
                  </button>
                ))}
              </div>
              {readonly ? (
                comment ? (
                  <p className="muted" style={{ gridColumn: '1/-1', fontSize: 13 }}>
                    {tx(comment)}
                  </p>
                ) : null
              ) : (
                <Textarea
                  className="resize-none"
                  aria-label={`${t('commentPh')} · ${tx(criterion.name)}`}
                  placeholder={t('commentPh')}
                  value={comment ? tx(comment) : ''}
                  maxLength={5000}
                  disabled={saving}
                  onChange={(event) =>
                    updateDraft({
                      comments: { ...draft.comments, [criterion.id]: event.target.value },
                    })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={effective.critical}
          disabled={readonly || saving}
          onChange={(event) => updateDraft({ critical: event.target.checked })}
          style={{ width: 16, height: 16, accentColor: 'var(--crit)' }}
        />
        <span>{t('critFlag')}</span>
      </label>
      {readonly ? (
        <div className="callout">
          {mission.validatedAt
            ? t('validatedOn', mission.validatedBy ?? '—', date(mission.validatedAt))
            : ''}{' '}
          <Button size="sm" onClick={() => navigate('rapport', mission.id)}>
            {t('openReport')}
          </Button>
        </div>
      ) : (
        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <h3>{t('planProposed')}</h3>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {t('planHint')}
          </p>
          {!suggestions.length && <EmptyState>{t('noBelow')}</EmptyState>}
          {suggestions.map((action) => {
            const criterion = CRITERIA.find((item) => item.id === action.critId)!;
            return (
              <div
                key={action.critId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0,1fr)',
                  gap: 10,
                  alignItems: 'start',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={action.include}
                  disabled={saving}
                  onChange={(event) => updateSuggestion(action, { include: event.target.checked })}
                  aria-label={`${t('include')} · ${tx(criterion.name)}`}
                  style={{ width: 16, height: 16, marginTop: 8, accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="eyebrow">{tx(criterion.name)}</span>
                  <input
                    type="text"
                    aria-label={`${t('planProposed')} · ${tx(criterion.name)}`}
                    value={tx(action.text)}
                    maxLength={2000}
                    disabled={saving || !action.include}
                    onChange={(event) => updateSuggestion(action, { text: event.target.value })}
                  />
                  <div className="row2">
                    <select
                      aria-label={`${locale === 'fr' ? 'Échéance' : 'Deadline'} · ${tx(criterion.name)}`}
                      value={action.horizon}
                      disabled={saving || !action.include}
                      onChange={(event) =>
                        updateSuggestion(action, {
                          horizon: Number(event.target.value) as 7 | 30 | 90,
                        })
                      }
                    >
                      {[7, 30, 90].map((horizon) => (
                        <option value={horizon} key={horizon}>
                          {t(`within${horizon}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label={`${t('ownerPh')} · ${tx(criterion.name)}`}
                      placeholder={t('ownerPh')}
                      value={tx(action.owner)}
                      maxLength={200}
                      disabled={saving || !action.include}
                      onChange={(event) => updateSuggestion(action, { owner: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" disabled={busy || saving} onClick={validate}>
              {t('validateN')}
            </Button>
            <Button disabled={busy || saving} onClick={() => void save()}>
              {locale === 'fr' ? 'Enregistrer le brouillon' : 'Save draft'}
            </Button>
          </div>
          {draftChanged && (
            <p className="muted" style={{ fontSize: 12 }}>
              {locale === 'fr'
                ? 'Brouillon conservé dans cet onglet. Enregistrez la notation avant de le fermer.'
                : 'Draft retained in this tab. Save scores before closing it.'}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('validateN')}
        description={
          locale === 'fr'
            ? 'La validation publie le rapport et fige la notation, les preuves et le plan d’actions. Vérifiez les constats avant de confirmer.'
            : 'Approval publishes the report and locks its scores, evidence and action plan. Review the findings before confirming.'
        }
        confirmLabel={locale === 'fr' ? 'Valider le rapport' : 'Approve report'}
        onConfirm={() => save(true)}
      />
      <ConfirmDialog
        open={reloadConfirm}
        onOpenChange={setReloadConfirm}
        title={locale === 'fr' ? 'Recharger les notes enregistrées ?' : 'Reload saved ratings?'}
        description={
          locale === 'fr'
            ? 'Les notes, commentaires et le signalement critique de ce brouillon seront remplacés par la version enregistrée. Vos propositions d’actions seront conservées.'
            : 'This draft’s ratings, comments and critical flag will be replaced by the saved version. Your proposed actions will be kept.'
        }
        confirmLabel={locale === 'fr' ? 'Recharger' : 'Reload'}
        onConfirm={reloadScores}
      />
    </Card>
  );
}

export default function Scoring() {
  const { state, actor, locale, t, tx, selectedId, navigate, clientFilter } = useConsole();
  const list = state.missions
    .filter(
      (mission) =>
        (mission.status === 'review' || mission.status === 'done') &&
        (clientFilter === 'all' || mission.scenarioSnapshot.clientId === clientFilter),
    )
    .sort(
      (a, b) =>
        (a.status === 'review' ? 0 : 1) - (b.status === 'review' ? 0 : 1) ||
        b.date.localeCompare(a.date),
    );
  const mission = list.find((item) => item.id === selectedId) ?? list[0];
  if (actor.role !== 'qualite')
    return (
      <EmptyState>
        {locale === 'fr'
          ? 'La notation est réservée au responsable qualité.'
          : 'Scoring is reserved for the quality lead.'}
      </EmptyState>
    );
  return (
    <>
      <PageHeader eyebrow={t('nEyebrow')} title={t('nTitle')} description={t('nSub')} />
      {!mission ? (
        <EmptyState>{t('noToScore')}</EmptyState>
      ) : (
        <div className="grid g23">
          <div className="list">
            {list.map((item) => (
              <button
                type="button"
                className="item"
                key={item.id}
                aria-current={item.id === mission.id ? 'true' : undefined}
                onClick={() => navigate('notation', item.id)}
              >
                <span className="r">
                  <b>{tx(item.scenarioSnapshot.title)}</b>
                  <StatusBadge status={item.status} />
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {
                    state.clients.find((client) => client.id === item.scenarioSnapshot.clientId)
                      ?.name
                  }{' '}
                  · {formatDate(item.date, locale)} · {item.operator}
                  {item.status === 'done' ? ` · ${scoreOf(item)}/100` : ''}
                </span>
              </button>
            ))}
          </div>
          <ScoringEditor key={`${mission.id}:${mission.status}`} mission={mission} />
        </div>
      )}
    </>
  );
}
