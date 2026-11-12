'use client';

import { useState } from 'react';
import { Card, EmptyState, Field, PageHeader, ScoreBadge } from '@/components/ui';
import { canCompareMissions, scoreOf } from '@/domain/commands';
import { CRITERIA } from '@/domain/reference';
import type { Mission } from '@/domain/types';
import { useConsole } from '@/lib/console-context';
import { formatDate } from '@/lib/i18n';

export default function Retest() {
  const { state, actor, locale, t, tx, clientFilter } = useConsole();
  const [beforeId, setBeforeId] = useState('m1');
  const [afterId, setAfterId] = useState('m2');
  const done = state.missions
    .filter(
      (mission) =>
        mission.status === 'done' &&
        (clientFilter === 'all' || mission.scenarioSnapshot.clientId === clientFilter) &&
        (actor.role !== 'client' || mission.scenarioSnapshot.clientId === actor.clientId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const before =
    done.find((mission) => mission.id === beforeId) ??
    done.find((mission) => done.some((candidate) => canCompareMissions(mission, candidate))) ??
    done[done.length - 1];
  const candidates = before ? done.filter((mission) => canCompareMissions(before, mission)) : [];
  const after = candidates.find((mission) => mission.id === afterId) ?? candidates[0];
  const valid = canCompareMissions(before, after);
  const beforeScore = scoreOf(before);
  const afterScore = scoreOf(after);
  const difference = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null;
  const actions = before ? state.actions.filter((action) => action.missionId === before.id) : [];
  const date = (value: string) => formatDate(value, locale);
  const optionLabel = (mission: Mission) =>
    `${state.clients.find((client) => client.id === mission.scenarioSnapshot.clientId)?.name} · ${tx(mission.scenarioSnapshot.title)} · ${date(mission.date)} · ${scoreOf(mission)}/100`;

  if (actor.role === 'operateur')
    return (
      <EmptyState>
        {locale === 'fr'
          ? 'Les comparaisons sont réservées au responsable qualité et au client.'
          : 'Comparisons are available to the quality lead and client.'}
      </EmptyState>
    );

  return (
    <>
      <PageHeader eyebrow={t('rtEyebrow')} title={t('rtTitle')} description={t('rtSub')} />
      {done.length < 2 ? (
        <EmptyState>{t('rtNeed2')}</EmptyState>
      ) : (
        <>
          <Card>
            <div className="row2">
              <Field label={t('before')}>
                <select
                  value={before?.id ?? ''}
                  onChange={(event) => {
                    setBeforeId(event.target.value);
                    setAfterId('');
                  }}
                >
                  {done.map((mission) => (
                    <option key={mission.id} value={mission.id}>
                      {optionLabel(mission)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('after')}>
                <select
                  value={after?.id ?? ''}
                  disabled={!candidates.length}
                  onChange={(event) => setAfterId(event.target.value)}
                >
                  {!candidates.length && (
                    <option value="">
                      {locale === 'fr' ? 'Aucun retest comparable' : 'No comparable retest'}
                    </option>
                  )}
                  {candidates.map((mission) => (
                    <option key={mission.id} value={mission.id}>
                      {optionLabel(mission)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
          {!valid || !before || !after || difference === null ? (
            <EmptyState>
              {locale === 'fr'
                ? 'Aucun audit ultérieur ne correspond à ce parcours. Une comparaison exige le même client, le même scénario et la même version de grille.'
                : 'No later audit matches this journey. Comparisons require the same client, scenario and scoring-grid version.'}
            </EmptyState>
          ) : (
            <>
              <div className="grid g4">
                <Card className="kpi">
                  <span className="l">{t('beforeK', date(before.date))}</span>
                  <span className="v" style={{ color: 'var(--muted)' }}>
                    {beforeScore}
                  </span>
                  <span className="s">
                    <ScoreBadge score={beforeScore} critical={before.critical} />
                  </span>
                </Card>
                <Card className="kpi">
                  <span className="l">{t('afterK', date(after.date))}</span>
                  <span className="v">{afterScore}</span>
                  <span className="s">
                    <ScoreBadge score={afterScore} critical={after.critical} />
                  </span>
                </Card>
                <Card className="kpi">
                  <span className="l">{t('evolution')}</span>
                  <span
                    className="v"
                    style={{
                      color:
                        difference > 0
                          ? 'var(--ok)'
                          : difference < 0
                            ? 'var(--bad)'
                            : 'var(--muted)',
                    }}
                  >
                    {difference > 0 ? '+' : ''}
                    {difference} {t('pts')}
                  </span>
                  <span className="s">
                    {t(difference > 0 ? 'improved' : difference < 0 ? 'worse' : 'stable')}
                  </span>
                </Card>
                <Card className="kpi">
                  <span className="l">{t('actsDone')}</span>
                  <span className="v">
                    {actions.filter((action) => action.done).length}/{actions.length}
                  </span>
                  <span className="s">{t('fromBaseline')}</span>
                </Card>
              </div>
              <Card>
                <div className="ch">
                  <h2>{t('cmpTitle')}</h2>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    <span className="chip" style={{ border: 0, background: 'var(--surface-2)' }}>
                      {t('greyBefore')}
                    </span>{' '}
                    <span
                      className="chip"
                      style={{
                        border: 0,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      {t('cyanAfter')}
                    </span>
                  </span>
                </div>
                <div>
                  {CRITERIA.map((criterion) => {
                    const a = (before.reportSnapshot?.scores ?? before.scores)[criterion.id];
                    const b = (after.reportSnapshot?.scores ?? after.scores)[criterion.id];
                    const delta = a == null || b == null ? null : b - a;
                    return (
                      <div className="cmp" key={criterion.id}>
                        <span>{tx(criterion.name)}</span>
                        {a == null && b == null ? (
                          <span className="muted">{t('na')}</span>
                        ) : (
                          <div
                            className="pair"
                            role="img"
                            aria-label={`${t('before')}: ${a == null ? t('na') : `${a}/4`}; ${t('after')}: ${b == null ? t('na') : `${b}/4`}`}
                          >
                            <span className="tr">
                              <i className="f-mute" style={{ width: `${((a ?? 0) / 4) * 100}%` }} />
                            </span>
                            <span className="tr">
                              <i className="f-acc" style={{ width: `${((b ?? 0) / 4) * 100}%` }} />
                            </span>
                          </div>
                        )}
                        <span
                          className={`delta ${delta === null || delta === 0 ? 'eq' : delta > 0 ? 'up' : 'down'}`}
                        >
                          {delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
