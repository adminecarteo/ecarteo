'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CorrectiveActions } from '@/components/corrective-actions';
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
import type { ClientDashboardSummary } from '@/lib/workspace-query';
import styles from './dashboard.module.css';
export default function Dashboard() {
  const { state, actor, locale, t, tx, clientFilter, navigate, summary } = useConsole();
  const [page, setPage] = useState(1);
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
  const isClient = actor.role === 'client';
  // Older backend responses and embedded workspaces contain the visible report snapshots.
  const clientDashboard = isClient
    ? (summary?.clientDashboard ?? {
        reports: done
          .flatMap((mission) => {
            const report = mission.reportSnapshot;
            return report
              ? [
                  {
                    missionId: mission.id,
                    title: report.scenario.title,
                    publishedAt: report.validatedAt,
                    score: report.score,
                  },
                ]
              : [];
          })
          .sort(
            (a, b) =>
              a.publishedAt.localeCompare(b.publishedAt) || a.missionId.localeCompare(b.missionId),
          )
          .slice(-12),
        nextAction:
          [...open].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))[0] ??
          null,
      })
    : null;
  const header = (
    <PageHeader
      eyebrow={t(isClient ? 'dashEyebrowClient' : 'dashEyebrow')}
      title={isClient ? (clients[0]?.name ?? t('dashTitle')) : t('dashTitle')}
      description={
        isClient
          ? tx({
              fr: 'Retrouvez vos rapports publiés et les actions à suivre.',
              en: 'Find your published reports and the actions that need attention.',
            })
          : t('dashSub')
      }
      actions={<ClientFilter />}
    />
  );
  if (clientDashboard && !clientDashboard.reports.length)
    return (
      <>
        {header}
        <Card className={styles.priority}>
          <h2>{tx({ fr: 'Votre premier rapport', en: 'Your first report' })}</h2>
          <p>
            {tx({
              fr: 'Votre score et votre plan d’action apparaîtront ici après la publication du premier audit. Vous pouvez dès maintenant envoyer une demande ou suivre sa préparation.',
              en: 'Your score and action plan will appear here when your first audit is published. You can request an audit or track a request you have already sent.',
            })}
          </p>
          <div className={styles.links}>
            <Link className="btn primary" href="/app/requests">
              {tx({ fr: 'Accéder aux demandes d’audit', en: 'Go to audit requests' })}
            </Link>
            <Link className="btn" href="/offres">
              {tx({ fr: 'Découvrir les offres d’audit', en: 'Explore audit services' })}
            </Link>
          </div>
        </Card>
      </>
    );
  return (
    <>
      {header}
      {clientDashboard && <ClientPriorities dashboard={clientDashboard} />}
      {!isClient && (
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
      )}
      <div className="grid g32">
        {clientDashboard ? (
          <ClientTrend reports={clientDashboard.reports} />
        ) : (
          <Card>
            <div className="ch">
              <h2>{t('chartTitle')}</h2>
              <span className="muted chart-alt">{t('chartBands')}</span>
            </div>
            <div className="chart">
              <TrendChart points={points} />
            </div>
          </Card>
        )}
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
          <CorrectiveActions actions={actions} showClient />
        </Card>
      </div>
    </>
  );
}
function ClientPriorities({ dashboard }: { dashboard: ClientDashboardSummary }) {
  const { tx, locale, t } = useConsole();
  const { nextAction, reports } = dashboard;
  const latest = reports[reports.length - 1];
  return (
    <div className="grid g2">
      <Card className={styles.priority}>
        <h2>{tx({ fr: 'Dernier rapport publié', en: 'Latest published report' })}</h2>
        <p className={styles.subject}>{tx(latest.title)}</p>
        <p className="muted">
          {formatDate(latest.publishedAt, locale)} · <strong>{latest.score}/100</strong>
        </p>
        <Link
          className="btn primary"
          href={`/app?view=rapport&id=${encodeURIComponent(latest.missionId)}`}
        >
          {tx({ fr: 'Lire le rapport', en: 'Read report' })}
        </Link>
      </Card>
      <Card className={styles.priority}>
        <h2>{tx({ fr: 'Prochaine action à traiter', en: 'Next action due' })}</h2>
        {nextAction ? (
          <>
            <p className={styles.subject}>{tx(nextAction.text)}</p>
            <p className="muted">
              {tx({ fr: 'Échéance', en: 'Due' })}{' '}
              <time dateTime={nextAction.dueAt}>{formatDate(nextAction.dueAt, locale)}</time> ·{' '}
              {tx(nextAction.owner) || t('ownerTbd')}
            </p>
            <Link
              className="btn"
              href={`/app?view=rapport&id=${encodeURIComponent(nextAction.missionId)}#action-${encodeURIComponent(nextAction.id)}`}
            >
              {tx({ fr: 'Ouvrir l’action', en: 'Open action' })}
            </Link>
          </>
        ) : (
          <p>
            {tx({
              fr: 'Vous n’avez aucune action en attente.',
              en: 'You have no outstanding actions.',
            })}
          </p>
        )}
      </Card>
    </div>
  );
}

function ClientTrend({ reports }: { reports: ClientDashboardSummary['reports'] }) {
  const { locale, tx } = useConsole();
  const title = tx({ fr: 'Scores des audits publiés', en: 'Published audit scores' });
  const shortDate = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  });
  if (reports.length === 1)
    return (
      <Card>
        <h2>{title}</h2>
        <p>
          {tx({
            fr: `Votre premier audit obtient ${reports[0].score}/100. Le prochain rapport publié permettra de comparer les deux scores.`,
            en: `Your first audit scored ${reports[0].score}/100. When your next report is published, you can compare the two scores.`,
          })}
        </p>
      </Card>
    );
  const points = reports.map((report) => ({
    label: shortDate.format(new Date(report.publishedAt)),
    v: report.score,
    detail: `${tx(report.title)} · ${formatDate(report.publishedAt, locale)} · ${report.score}/100`,
  }));
  return (
    <Card>
      <h2>{title}</h2>
      <p className="muted">
        {tx({
          fr: `Scores de vos ${reports.length} derniers rapports, par ordre de publication.`,
          en: `Scores from your last ${reports.length} reports, in publication order.`,
        })}
      </p>
      <div className="chart">
        <TrendChart points={points} label={title} />
      </div>
    </Card>
  );
}

function TrendChart({
  points,
  label,
}: {
  points: { label: string; v: number; detail?: string }[];
  label?: string;
}) {
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
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label ?? t('chartAria')}
        aria-describedby="score-trend-values"
      >
        <desc id="score-trend-values">
          {points.map((p) => p.detail ?? `${p.label}: ${p.v}/100`).join(', ')}
        </desc>
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
          <g key={i}>
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
