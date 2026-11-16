'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useConsole } from '@/lib/console-context';
import {
  Card,
  PageHeader,
  ClientFilter,
  ScoreBadge,
  EmptyState,
  Pagination,
} from '@/components/ui';
import { CRITERIA } from '@/domain/reference';
import { scoreOf, levelOf } from '@/domain/commands';
import { formatDate } from '@/lib/i18n';
export default function Dashboard() {
  const { state, actor, locale, t, tx, clientFilter, navigate, execute, busy, notify, summary } =
    useConsole();
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const scoped = state.missions.filter(
    (m) => clientFilter === 'all' || m.scenarioSnapshot.clientId === clientFilter,
  );
  const done = scoped
    .filter((m) => m.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date));
  const clients = state.clients.filter((c) => clientFilter === 'all' || c.id === clientFilter);
  const latest = clients
    .map((c) => done.find((m) => m.scenarioSnapshot.clientId === c.id))
    .filter((m) => m !== undefined);
  const scores = latest.map(scoreOf).filter((s) => s !== null);
  const average = summary
    ? summary.averageScore
    : scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const actions = state.actions.filter((a) => done.some((m) => m.id === a.missionId));
  const open = actions.filter((a) => !a.done);
  const hours = summary
    ? summary.averageHours
    : done.length
      ? done.reduce((sum, m) => sum + m.elapsed, 0) / done.length / 3600000
      : 0;
  const inProgress =
    summary?.inProgress ??
    scoped.filter((m) => m.status === 'doing' || m.status === 'review').length;
  const months: Record<string, number[]> = {};
  done.forEach((m) => {
    const score = scoreOf(m);
    if (score !== null) (months[m.date.slice(0, 7)] ??= []).push(score);
  });
  const points = (
    summary
      ? summary.months.map(({ month, score }) => ({ month, score }))
      : Object.keys(months)
          .sort()
          .map((month) => ({
            month,
            score: Math.round(months[month].reduce((a, b) => a + b, 0) / months[month].length),
          }))
  ).map(({ month, score }) => ({
    label: new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T12:00:00Z`)),
    v: score,
  }));
  const activePage = Math.min(page, Math.max(1, Math.ceil(done.length / 6)));
  return (
    <>
      <PageHeader
        eyebrow={t(actor.role === 'client' ? 'dashEyebrowClient' : 'dashEyebrow')}
        title={
          actor.role === 'client' ? (state.clients[0]?.name ?? t('dashTitle')) : t('dashTitle')
        }
        description={
          actor.role === 'client'
            ? tx({
                fr: `Scores, tendances et actions de vos ${clients.reduce((total, client) => total + client.sites, 0)} établissement(s).`,
                en: `Scores, trends and actions across your ${clients.reduce((total, client) => total + client.sites, 0)} location(s).`,
              })
            : t('dashSub')
        }
        actions={<ClientFilter />}
      />
      {actor.role === 'client' && !(summary?.completed ?? done.length) && (
        <Card className="stack">
          <h2>
            {tx({
              fr: 'Bienvenue dans votre espace Écartéo',
              en: 'Welcome to your Écartéo workspace',
            })}
          </h2>
          <p>
            {tx({
              fr: 'L’équipe Écartéo prépare et réalise vos audits. Dès la validation qualité, vous retrouverez ici vos rapports, vos preuves et votre plan d’amélioration.',
              en: 'The Écartéo team plans and carries out your audits. Once quality review is complete, your reports, evidence and improvement plan will appear here.',
            })}
          </p>
          <div>
            <Link className="btn primary" href="/app/requests">
              {locale === 'fr' ? 'Demander un audit' : 'Request an audit'}
            </Link>{' '}
            <Link className="btn primary" href="/offres">
              {tx({ fr: 'Découvrir les offres d’audit', en: 'Explore audit services' })}
            </Link>
          </div>
        </Card>
      )}
      <div className="grid g4">
        <Card className="kpi">
          <span className="l">{t('kpiAvg')}</span>
          <span className="v">
            {average ?? '—'} <small className="stat-suffix">/100</small>
          </span>
          <span className="s">
            <ScoreBadge score={average} />
          </span>
        </Card>
        <Card className="kpi">
          <span className="l">{t('kpiDone')}</span>
          <span className="v">{summary?.completed ?? done.length}</span>
          <span className="s">{t('kpiInProg', inProgress)}</span>
        </Card>
        <Card className="kpi">
          <span className="l">{t('kpiOpen')}</span>
          <span className="v">{summary?.openActions ?? open.length}</span>
          <span className="s">
            {t(
              'kpiOpenSub',
              summary?.urgentActions ?? open.filter((a) => a.horizon === 7).length,
              summary?.completedActions ?? actions.length - open.length,
            )}
          </span>
        </Card>
        <Card className="kpi">
          <span className="l">{t('kpiProd')}</span>
          <span className="v">
            {hours.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{' '}
            h
          </span>
          <span className="s">{t('target5h')}</span>
        </Card>
      </div>
      <div className="grid g32">
        <Card>
          <div className="ch">
            <h2>{t('chartTitle')}</h2>
            <span className="muted chart-alt">{t('chartBands')}</span>
          </div>
          <div className="chart">
            <TrendChart points={points} />
          </div>
        </Card>
        <Card>
          <h2>{t('byCrit')}</h2>
          <div className="bars">
            {CRITERIA.map((c) => {
              const ratings = done
                .map((m) => m.scores[c.id])
                .filter((v): v is 0 | 1 | 2 | 3 | 4 => typeof v === 'number');
              const value = summary
                ? (summary.criteria[c.id] ?? null)
                : ratings.length
                  ? Math.round(
                      (ratings.reduce<number>((a, b) => a + b, 0) / ratings.length / 4) * 100,
                    )
                  : null;
              return (
                <div className="bar" key={c.id}>
                  <span>{tx(c.name)}</span>
                  <span className="tr" aria-hidden="true">
                    <i
                      className={`f-${levelOf(value, false) ?? 'mute'}`}
                      style={{ width: `${value ?? 0}%` }}
                    />
                  </span>
                  <span className="val">{value ?? 'n/a'}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <div className="grid g32">
        <Card>
          <h2>{t('latestAudits')}</h2>
          {done.length ? (
            <>
              <div className="tblwrap table-frame">
                <table>
                  <thead>
                    <tr>
                      {['thClient', 'thJourney', 'thDate', 'thScore', 'thStatus'].map((k) => (
                        <th key={k} scope="col">
                          {t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {done.slice((activePage - 1) * 6, activePage * 6).map((m) => (
                      <tr key={m.id}>
                        <td>
                          {state.clients.find((c) => c.id === m.scenarioSnapshot.clientId)?.name}
                        </td>
                        <td>
                          <button className="table-link" onClick={() => navigate('rapport', m.id)}>
                            {tx(m.scenarioSnapshot.title)}
                          </button>
                        </td>
                        <td className="num">{formatDate(m.date, locale)}</td>
                        <td className="num">
                          <strong>{scoreOf(m)}</strong>
                        </td>
                        <td>
                          <ScoreBadge score={scoreOf(m)} critical={m.critical} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={activePage}
                total={done.length}
                pageSize={6}
                onPageChange={setPage}
              />
            </>
          ) : (
            <EmptyState>{t('noAuditScope')}</EmptyState>
          )}
        </Card>
        <Card>
          <div className="ch">
            <h2>{t('actionsTitle')}</h2>
            <span className="muted chart-alt">{t('actionsHint')}</span>
          </div>
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <div className="acts-list actions-scroll">
            {[...actions]
              .sort((a, b) => Number(a.done) - Number(b.done) || a.horizon - b.horizon)
              .map((action) => {
                const mission = done.find((m) => m.id === action.missionId);
                return (
                  <div className={`act ${action.done ? 'done' : ''}`} key={action.id}>
                    <input
                      type="checkbox"
                      id={`action-${action.id}`}
                      checked={action.done}
                      disabled={busy}
                      onChange={async (e) => {
                        setError('');
                        try {
                          await execute({
                            type: 'action.toggle',
                            id: action.id,
                            done: e.target.checked,
                          });
                          notify(t(action.done ? 'actOpen' : 'actDone'));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Error');
                        }
                      }}
                    />
                    <label htmlFor={`action-${action.id}`}>
                      <span className="tx">{tx(action.text)}</span>
                      <br />
                      <span className="muted chart-alt">
                        {tx(action.owner) || t('ownerTbd')} ·{' '}
                        {
                          state.clients.find((c) => c.id === mission?.scenarioSnapshot.clientId)
                            ?.name
                        }
                      </span>
                      <br />
                      <span className="muted chart-alt">
                        {locale === 'fr' ? 'Échéance' : 'Due'} : {formatDate(action.dueAt, locale)}
                      </span>
                    </label>
                    <span className={`hz hz${action.horizon}`}>
                      {action.horizon} {t('d')}
                    </span>
                  </div>
                );
              })}
            {!actions.length && <EmptyState>{t('noActions')}</EmptyState>}
          </div>
        </Card>
      </div>
    </>
  );
}
function TrendChart({ points }: { points: { label: string; v: number }[] }) {
  const { t } = useConsole();
  const svg = useRef<SVGSVGElement>(null);
  const [W, setWidth] = useState(640);
  const hasTrend = points.length >= 2;
  useEffect(() => {
    if (!hasTrend || !svg.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) setWidth(width);
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [hasTrend]);
  if (!hasTrend) return <EmptyState>{t('chartEmpty')}</EmptyState>;
  const H = W < 450 ? 185 : 230,
    L = 36,
    R = 28,
    T = 18,
    B = 30,
    x = (i: number) => L + ((W - L - R) * i) / (points.length - 1),
    y = (v: number) => T + (H - T - B) * (1 - v / 100);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.v)}`).join(' ');
  const tickCount = Math.min(points.length, Math.max(2, Math.floor((W - L - R) / 52) + 1));
  const ticks = new Set(
    Array.from({ length: tickCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / (tickCount - 1)),
    ),
  );
  return (
    <>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chartAria')}>
        <title>{points.map((p) => `${p.label}: ${p.v}/100`).join(', ')}</title>
        {[
          { top: 100, bottom: 80, level: 'ok' },
          { top: 80, bottom: 60, level: 'warn' },
          { top: 60, bottom: 40, level: 'bad' },
        ].map((b) => (
          <rect
            key={b.level}
            className={`band-${b.level}`}
            x={L}
            y={y(b.top)}
            width={W - L - R}
            height={y(b.bottom) - y(b.top)}
          />
        ))}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="ax" x={L - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path className="area" d={`${path} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} />
        <path className="ln" d={path} />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle
              className={`pt ${i === points.length - 1 ? 'end' : ''}`}
              cx={x(i)}
              cy={y(p.v)}
              r={i === points.length - 1 ? 5.5 : 4}
            />
            {ticks.has(i) && (
              <>
                <text className="lbl" x={x(i)} y={y(p.v) - 11} textAnchor="middle">
                  {p.v}
                </text>
                <text className="ax" x={x(i)} y={H - 8} textAnchor="middle">
                  {p.label}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </>
  );
}
