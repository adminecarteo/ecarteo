'use client';

import { useEffect, useState } from 'react';
import { CorrectiveActions } from '@/components/corrective-actions';
import { Button, Card, EmptyState, PageHeader, ScoreBadge } from '@/components/ui';
import { canCompareMissions, levelOf, scoreOf } from '@/domain/commands';
import { CHANNELS, CRITERIA } from '@/domain/reference';
import type {
  AppState,
  CriterionId,
  Evidence,
  Locale,
  Mission,
  PublishedReport,
} from '@/domain/types';
import { useConsole } from '@/lib/console-context';
import { formatDate } from '@/lib/i18n';
import type { ReportPdfData } from '@/lib/report-pdf';
import { fetchReportAddenda, type ReportAddendum } from '@/lib/report-addenda';
import { reportNeedsBrowserPrint } from '@/lib/report-text';
import { openPrintableReport } from '@/lib/report-print';

function ReportAttachment({ evidence, locale }: { evidence: Evidence; locale: Locale }) {
  if (!evidence.fileId) return null;
  const size = evidence.size;
  let fileSize = '';
  if (size !== undefined) {
    const unit = size >= 1_000_000 ? 'megabyte' : size >= 1_000 ? 'kilobyte' : 'byte';
    const divisor = unit === 'megabyte' ? 1_000_000 : unit === 'kilobyte' ? 1_000 : 1;
    fileSize = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      maximumFractionDigits: 1,
    }).format(size / divisor);
  }
  return (
    <a
      className="report-download"
      href={`/api/attachments/${encodeURIComponent(evidence.fileId)}`}
      download={evidence.file || true}
    >
      {locale === 'fr' ? 'Télécharger la preuve' : 'Download evidence'}
      {evidence.file && ` · ${evidence.file}`}
      {fileSize && ` (${fileSize})`}
    </a>
  );
}

function ReportSupplements({ missionId, locale }: { missionId: string; locale: Locale }) {
  const [result, setResult] = useState<{ id: string; items?: ReportAddendum[]; error?: string }>();
  useEffect(() => {
    let active = true;
    void fetchReportAddenda(missionId, locale).then(
      (items) => {
        if (active) setResult({ id: missionId, items });
      },
      (reason: unknown) => {
        if (active)
          setResult({
            id: missionId,
            error:
              reason instanceof Error
                ? reason.message
                : locale === 'fr'
                  ? 'Service indisponible.'
                  : 'Service unavailable.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [missionId, locale]);
  const current = result?.id === missionId ? result : undefined;
  if (current?.items?.length === 0) return null;
  return (
    <Card>
      <h2>{locale === 'fr' ? 'Compléments et corrections' : 'Supplements and corrections'}</h2>
      {!current && (
        <p role="status">
          {locale === 'fr' ? 'Vérification des compléments…' : 'Checking report supplements…'}
        </p>
      )}
      {current?.error && (
        <p className="err" role="alert">
          {current.error}
        </p>
      )}
      {current?.items?.map((item) => (
        <article key={item.id}>
          <p className="muted">
            <time dateTime={item.created_at}>{formatDate(item.created_at, locale, true)}</time>
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
        </article>
      ))}
    </Card>
  );
}

function publishedReport(state: AppState, mission: Mission): PublishedReport | null {
  if (mission.reportSnapshot) return mission.reportSnapshot;
  const score = scoreOf(mission);
  const level = levelOf(score, mission.critical);
  if (
    mission.status !== 'done' ||
    score === null ||
    !level ||
    !mission.validatedAt ||
    !mission.validatedBy
  )
    return null;
  return {
    missionId: mission.id,
    date: mission.date,
    operator: mission.operator,
    scenario: mission.scenarioSnapshot,
    criteriaVersion: mission.criteriaVersion,
    scores: mission.scores,
    comments: mission.comments,
    critical: mission.critical,
    score,
    level,
    evidence: state.evidence.filter((item) => item.missionId === mission.id),
    actions: state.actions.filter((item) => item.missionId === mission.id),
    validatedBy: mission.validatedBy,
    validatedAt: mission.validatedAt,
  };
}

function summary(
  data: {
    title: string;
    score: number;
    low: string[];
    best: string | null;
    bestValue: number | null;
    evidence: number;
  },
  locale: Locale,
) {
  if (locale === 'fr') {
    const evidence =
      data.evidence === 0
        ? 'Aucune preuve n’est jointe au rapport.'
        : `${data.evidence} preuve${data.evidence > 1 ? 's' : ''} horodatée${data.evidence > 1 ? 's' : ''} ${data.evidence > 1 ? 'sont jointes' : 'est jointe'} au rapport.`;
    return `Le parcours « ${data.title} » obtient ${data.score}/100. ${data.low.length ? `${data.low.length} critère${data.low.length > 1 ? 's' : ''} sous le seuil de conformité : ${data.low.join(', ')}. ` : 'Aucun critère n’est sous le seuil de conformité. '}${data.best ? `Le point le plus solide est ${data.best} (${data.bestValue}/4). ` : ''}${evidence} L’évaluation porte sur le parcours, pas sur une personne.`;
  }
  return `The “${data.title}” journey scores ${data.score}/100. ${data.low.length ? `${data.low.length} ${data.low.length > 1 ? 'criteria are' : 'criterion is'} below the compliance threshold: ${data.low.join(', ')}. ` : 'No criterion is below the compliance threshold. '}${data.best ? `The strongest point is ${data.best} (${data.bestValue}/4). ` : ''}${data.evidence} timestamped evidence ${data.evidence === 1 ? 'item is' : 'items are'} attached to the report. The assessment covers the journey, not an individual.`;
}

export default function Reports() {
  const { state, actor, locale, t, tx, execute, busy, notify, navigate, selectedId, clientFilter } =
    useConsole();
  const [downloading, setDownloading] = useState(false);
  const [printable, setPrintable] = useState<{ missionId: string; data: ReportPdfData }>();
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState('');
  const done = state.missions
    .filter(
      (mission) =>
        mission.status === 'done' &&
        (clientFilter === 'all' || mission.scenarioSnapshot.clientId === clientFilter) &&
        (actor.role !== 'client' || mission.scenarioSnapshot.clientId === actor.clientId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const mission = selectedId ? done.find((item) => item.id === selectedId) : done[0];
  const report = mission ? publishedReport(state, mission) : null;
  const reportId = report?.missionId;
  useEffect(() => {
    if (!reportId || !location.hash.startsWith('#action-')) return;
    // The split frontend mounts the report after the browser's native fragment scroll.
    const target = document.getElementById(location.hash.slice(1));
    if (target instanceof HTMLInputElement && target.type === 'checkbox') target.focus();
  }, [reportId]);
  const trackingLabel =
    locale === 'fr' ? 'Suivre les actions de cet audit' : 'Track this audit’s actions';
  const date = (value: string) => formatDate(value, locale);
  const dateTime = (value: string) => formatDate(value, locale, true);
  const scenario = report?.scenario;
  const client = scenario
    ? (state.clients.find((item) => item.id === scenario.clientId)?.name ?? '—')
    : '';
  const low = report
    ? CRITERIA.filter(
        (criterion) => report.scores[criterion.id] != null && report.scores[criterion.id]! <= 2,
      )
    : [];
  const best = report
    ? CRITERIA.filter((criterion) => report.scores[criterion.id] != null).sort(
        (a, b) => report.scores[b.id]! - report.scores[a.id]!,
      )[0]
    : null;
  const previous = mission
    ? done
        .filter((item) => canCompareMissions(item, mission))
        .sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const text =
    report && scenario
      ? summary(
          {
            title: tx(scenario.title),
            score: report.score,
            low: low.map((criterion) => tx(criterion.name).toLowerCase()),
            best: best ? tx(best.name).toLowerCase() : null,
            bestValue: best ? (report.scores[best.id] ?? null) : null,
            evidence: report.evidence.length,
          },
          locale,
        )
      : '';

  function criterionComment(published: PublishedReport, id: CriterionId) {
    const comment = tx(published.comments[id]);
    if (comment.trim()) return comment;
    const score = published.scores[id];
    return score != null && score <= 2 ? t('complianceThreshold') : '';
  }

  function exportData(): ReportPdfData | null {
    if (!report || !scenario) return null;
    return {
      title: tx(scenario.title),
      client,
      date: date(report.date),
      operator: report.operator,
      approvedBy: report.validatedBy,
      approvedAt: date(report.validatedAt),
      channels: `${scenario.channels.map((channel) => tx(CHANNELS[channel])).join(', ')} · ${scenario.lang}`,
      score: report.score,
      level: t(`lv_${report.level}`),
      levelDescription: t(`lvd_${report.level}`),
      summary: text,
      criteriaVersion: report.criteriaVersion,
      criteria: CRITERIA.map((criterion) => ({
        name: tx(criterion.name),
        score: report.scores[criterion.id] == null ? 'n/a' : `${report.scores[criterion.id]}/4`,
        comment: criterionComment(report, criterion.id),
      })),
      evidence: report.evidence.map((item) => ({
        date: dateTime(item.at),
        label: tx(item.label),
        text: tx(item.text),
        file: item.file ?? '',
      })),
      actions: report.actions.map((action) => ({
        horizon: action.horizon,
        text: tx(action.text),
        owner: tx(action.owner),
      })),
    };
  }

  async function copyReport() {
    let data: ReportPdfData | null;
    try {
      data = exportData();
      if (data && mission)
        data.addenda = (await fetchReportAddenda(mission.id, locale)).map((item) => ({
          date: dateTime(item.created_at),
          body: item.body,
        }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Service indisponible.');
      return;
    }
    if (!data) return;
    setError('');
    const plain = [
      t('txtHead'),
      `${data.client} · ${data.title}`,
      t('txtMeta', data.date, data.operator, data.approvedBy),
      '',
      t('txtScore', data.score, data.level, data.levelDescription),
      '',
      t('summary'),
      data.summary,
      '',
      t('txtByCrit'),
      ...data.criteria.map(
        (criterion) =>
          `- ${criterion.name}: ${criterion.score}${criterion.comment ? ` · ${criterion.comment}` : ''}`,
      ),
      '',
      t('evTitle'),
      ...data.evidence.map(
        (item) => `- ${item.date} · ${item.label}${item.text ? ` · ${item.text}` : ''}`,
      ),
      '',
      t('txtPlan'),
      ...data.actions.map(
        (action) =>
          `- [${action.horizon} ${t('d')}] ${action.text}${action.owner ? ` (${action.owner})` : ''}`,
      ),
      ...(data.addenda?.length
        ? [
            '',
            locale === 'fr' ? 'Compléments et corrections' : 'Supplements and corrections',
            ...data.addenda.map((item) => `${item.date}\n${item.body}`),
          ]
        : []),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(plain);
      notify(t('copied'));
    } catch {
      setError(t('copyFail'));
    }
  }

  async function downloadPdf() {
    const data = exportData();
    if (!data || !mission) return;
    setDownloading(true);
    setPrintable(undefined);
    setError('');
    try {
      data.addenda = (await fetchReportAddenda(mission.id, locale)).map((item) => ({
        date: dateTime(item.created_at),
        body: item.body,
      }));
      if (reportNeedsBrowserPrint(data)) {
        setPrintable({ missionId: mission.id, data });
        return;
      }
      const { createReportPdf } = await import('@/lib/report-pdf');
      const blob = await createReportPdf(data, locale);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Ecarteo-${mission.id}-${mission.date.slice(0, 10)}-${locale}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      notify(locale === 'fr' ? 'Rapport PDF téléchargé' : 'PDF report downloaded');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : locale === 'fr'
            ? 'Le PDF n’a pas pu être généré. Réessayez ou copiez le texte du rapport.'
            : 'The PDF could not be generated. Try again or copy the report text.',
      );
    } finally {
      setDownloading(false);
    }
  }

  async function scheduleRetest() {
    if (!mission) return;
    setScheduling(true);
    setError('');
    try {
      const result = await execute({ type: 'mission.retest', id: mission.id });
      notify(locale === 'fr' ? 'Retest programmé à 30 jours' : 'Retest scheduled in 30 days');
      navigate('missions', result.entityId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : locale === 'fr'
            ? 'Le retest n’a pas pu être programmé.'
            : 'The retest could not be scheduled.',
      );
    } finally {
      setScheduling(false);
    }
  }

  if (actor.role === 'operateur')
    return (
      <EmptyState>
        {locale === 'fr'
          ? 'Les rapports sont réservés au responsable qualité et au client.'
          : 'Reports are available to the quality lead and client.'}
      </EmptyState>
    );

  return (
    <>
      <PageHeader
        eyebrow={t('rEyebrow')}
        title={t('rTitle')}
        description={t('rSub')}
        actions={
          done.length ? (
            <>
              <select
                aria-label={locale === 'fr' ? 'Choisir un rapport' : 'Choose a report'}
                value={mission?.id ?? ''}
                style={{ width: 'auto', maxWidth: '100%' }}
                onChange={(event) => {
                  setError('');
                  navigate('rapport', event.target.value);
                }}
              >
                {!mission && (
                  <option value="" disabled>
                    {locale === 'fr' ? 'Choisir un rapport' : 'Choose a report'}
                  </option>
                )}
                {done.map((item) => (
                  <option key={item.id} value={item.id}>
                    {
                      state.clients.find((entry) => entry.id === item.scenarioSnapshot.clientId)
                        ?.name
                    }{' '}
                    · {tx(item.scenarioSnapshot.title)} · {date(item.date)}
                  </option>
                ))}
              </select>
              <Button disabled={!report} onClick={() => void copyReport()}>
                {t('copyText')}
              </Button>
              <Button
                variant="primary"
                disabled={downloading || !report}
                onClick={() => void downloadPdf()}
              >
                {downloading
                  ? locale === 'fr'
                    ? 'Génération…'
                    : 'Generating…'
                  : locale === 'fr'
                    ? 'Télécharger le PDF'
                    : 'Download PDF'}
              </Button>
            </>
          ) : undefined
        }
      />
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {printable && printable.missionId === mission?.id && (
        <Card>
          <p role="status">
            {locale === 'fr'
              ? 'Ce rapport contient du texte arabe. Ouvrez la version imprimable, puis choisissez « Enregistrer en PDF » pour conserver les caractères et leur ordre.'
              : 'This report contains Arabic text. Open the printable version, then choose “Save as PDF” to preserve its characters and reading order.'}
          </p>
          <Button
            onClick={() => {
              try {
                openPrintableReport(printable.data, locale);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Print window unavailable.');
              }
            }}
          >
            {locale === 'fr' ? 'Ouvrir la version imprimable' : 'Open printable report'}
          </Button>
        </Card>
      )}
      {!report || !scenario || !mission ? (
        <EmptyState>
          {selectedId
            ? locale === 'fr'
              ? 'Ce rapport est indisponible.'
              : 'This report is unavailable.'
            : t('noReport')}
        </EmptyState>
      ) : (
        <div className="report">
          <div className="rep-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="brand">
                <div className="tile" style={{ width: 36, height: 36 }}>
                  <svg width="24" height="24" viewBox="0 0 40 40" aria-hidden="true">
                    <rect x="17" y="3" width="19" height="5.6" fill="#181B52" />
                    <rect x="5" y="8.6" width="20" height="5.6" fill="#181B52" />
                    <rect x="17" y="14.2" width="15" height="5.6" fill="#27D4D7" />
                    <rect x="9" y="19.8" width="13" height="5.6" fill="#27D4D7" />
                    <rect x="17" y="25.4" width="19" height="5.6" fill="#181B52" />
                    <rect x="5" y="31" width="20" height="5.6" fill="#181B52" />
                  </svg>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: '#A8AEE6',
                  fontWeight: 650,
                }}
              >
                {t('repKicker')}
              </span>
            </div>
            <h1>{tx(scenario.title)}</h1>
            <div className="meta">
              <div>
                <span>{t('client')}</span>
                {client}
              </div>
              <div>
                <span>{t('testDate')}</span>
                {date(report.date)}
              </div>
              <div>
                <span>{t('chLang')}</span>
                {scenario.channels.map((channel) => tx(CHANNELS[channel])).join(', ')} ·{' '}
                {scenario.lang}
              </div>
              <div>
                <span>{t('validatedBy')}</span>
                {report.validatedBy} {t('qualitySuffix')}
              </div>
            </div>
          </div>
          <nav
            className="report-links"
            aria-label={locale === 'fr' ? 'Sections du rapport' : 'Report sections'}
          >
            <a href="#report-evidence">{t('evTitle')}</a>
            <a href="#report-actions">{trackingLabel}</a>
          </nav>
          <ReportSupplements missionId={mission.id} locale={locale} />
          <Card>
            <div className="gauge">
              <span className="big">
                {report.score}
                <small> /100</small>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ScoreBadge score={report.score} critical={report.critical} />
                <span className="muted" style={{ fontSize: 13 }}>
                  {t(`lvd_${report.level}`)}
                </span>
                {previous && (
                  <span style={{ fontSize: 13 }}>
                    {t('prevAudit', scoreOf(previous), date(previous.date))} ·{' '}
                    <b
                      className="num"
                      style={{
                        color:
                          report.score >= (scoreOf(previous) ?? 0) ? 'var(--ok)' : 'var(--bad)',
                      }}
                    >
                      {report.score >= (scoreOf(previous) ?? 0) ? '+' : ''}
                      {report.score - (scoreOf(previous) ?? 0)} {t('pts')}
                    </b>
                  </span>
                )}
              </div>
            </div>
            <h2 style={{ marginTop: 18 }}>{t('summary')}</h2>
            <p style={{ marginTop: 8, maxWidth: '68ch' }}>{text}</p>
          </Card>
          <Card>
            <h2>{t('byCrit')}</h2>
            <div className="bars">
              {CRITERIA.map((criterion) => {
                const value = report.scores[criterion.id];
                return (
                  <div className="bar" key={criterion.id}>
                    <span>{tx(criterion.name)}</span>
                    <span className="tr" aria-hidden="true">
                      {value != null && (
                        <i
                          className={`f-${levelOf((value / 4) * 100, false)}`}
                          style={{ width: `${(value / 4) * 100}%` }}
                        />
                      )}
                    </span>
                    <span className={`val${value == null ? ' muted' : ''}`}>
                      {value == null ? 'n/a' : `${value}/4`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
          {!!low.length && (
            <Card>
              <h2>{t('frictions')}</h2>
              <div className="list">
                {low.map((criterion) => (
                  <div
                    key={criterion.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0,1fr)',
                      gap: 10,
                      alignItems: 'start',
                    }}
                  >
                    <span
                      className={`pill lv-${report.scores[criterion.id]! <= 1 ? 'bad' : 'warn'}`}
                    >
                      {report.scores[criterion.id]}/4
                    </span>
                    <div>
                      <b>{tx(criterion.name)}</b>
                      <p className="muted" style={{ fontSize: 13 }}>
                        {criterionComment(report, criterion.id)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <h2 id="report-evidence" tabIndex={-1}>
              {t('evTitle')}
            </h2>
            {report.evidence.length ? (
              <ul className="log" style={{ maxHeight: 'none' }}>
                {report.evidence.map((item) => (
                  <li key={item.id}>
                    <time className="mono" dateTime={item.at}>
                      {dateTime(item.at)}
                    </time>
                    <span>
                      <b style={{ fontWeight: 600 }}>{tx(item.label)}</b>
                      {tx(item.text) && (
                        <>
                          {' '}
                          · <span className="muted">{tx(item.text)}</span>
                        </>
                      )}
                      <ReportAttachment evidence={item} locale={locale} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('noEvAttached')}</p>
            )}
          </Card>
          <Card>
            <h2>{t('planTitle')}</h2>
            <div className="plan">
              {([7, 30, 90] as const).map((horizon, index) => {
                const actions = report.actions.filter((action) => action.horizon === horizon);
                return (
                  <div className="col" key={horizon}>
                    <h3>
                      <span>{t(['colFix', 'colStd', 'colTrain'][index])}</span>
                      <span className={`hz hz${horizon}`}>
                        {horizon} {t('d')}
                      </span>
                    </h3>
                    {actions.length ? (
                      <ul>
                        {actions.map((action) => (
                          <li key={action.id}>
                            {tx(action.text)}
                            {tx(action.owner) && (
                              <span className="muted"> ({tx(action.owner)})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted" style={{ fontSize: 13 }}>
                        {t('noAction')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <h2 id="report-actions" tabIndex={-1}>
              {t('actionsTitle')}
            </h2>
            <p className="muted">{t('actionsHint')}</p>
            <CorrectiveActions
              key={mission.id}
              actions={state.actions.filter((action) => action.missionId === mission.id)}
            />
          </Card>
          <div
            className="callout"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span>
              {actor.role === 'client'
                ? locale === 'fr'
                  ? 'L’équipe qualité organise le retest pour vérifier les corrections.'
                  : 'The quality team schedules the retest to check the fixes.'
                : t('nextStep')}
            </span>
            {actor.role === 'qualite' && (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || scheduling}
                onClick={() => void scheduleRetest()}
              >
                {t('schedRetest')}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
