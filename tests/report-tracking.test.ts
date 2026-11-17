import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSeedState } from '@/domain/seed';
import Reports from '@/features/reports';
import { localize, translate } from '@/lib/i18n';

const context = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/lib/console-context', () => ({ useConsole: () => context.current }));

function clientWorkspace() {
  const state = createSeedState();
  const mission = state.missions.find((row) => row.reportSnapshot?.actions.length)!;
  const report = mission.reportSnapshot!;
  const action = state.actions.find((row) => row.missionId === mission.id)!;
  const other = state.actions.find((row) => row.missionId !== mission.id)!;
  action.done = true;
  report.actions.find((row) => row.id === action.id)!.done = false;
  report.evidence = [
    {
      id: 'proof',
      missionId: mission.id,
      type: 'fichier',
      at: report.date,
      label: 'Receipt',
      text: '',
      img: null,
      file: 'receipt.txt',
      fileId: 'published-file',
      size: 32,
    },
    {
      id: 'note',
      missionId: mission.id,
      type: 'note',
      at: report.date,
      label: 'Observation',
      text: 'No attached file',
      img: null,
      file: null,
    },
  ];
  context.current = {
    state,
    actor: { role: 'client', clientId: mission.scenarioSnapshot.clientId },
    clientFilter: 'all',
    selectedId: mission.id,
    locale: 'en',
    t: translate.bind(null, 'en'),
    tx: localize.bind(null, 'en'),
  };
  return { action, other, report };
}

describe('client report follow-up', () => {
  it.each([
    ['fr', 'Le seuil de conformité est de 3/4.', 'Réponse après 17 minutes.'],
    ['en', 'The compliance threshold is 3/4.', 'Response after 17 minutes.'],
  ] as const)(
    'shows the threshold for a low score without a comment and preserves recorded findings in %s',
    (locale, threshold, finding) => {
      const { report } = clientWorkspace();
      Object.assign(context.current, {
        locale,
        t: translate.bind(null, locale),
        tx: localize.bind(null, locale),
      });
      report.scores = { dispo: 2, vitesse: 1, suivi: 3 };
      report.comments = {
        dispo: '  ',
        vitesse: { fr: 'Réponse après 17 minutes.', en: 'Response after 17 minutes.' },
      };
      const html = renderToStaticMarkup(createElement(Reports));
      expect(html.split(threshold)).toHaveLength(2);
      expect(html).toContain(finding);
      expect(html).not.toMatch(/Constat à compléter|Finding to be completed/);
    },
  );

  it('uses the live action status for this report and renders downloads only for attached files', () => {
    const { action, other } = clientWorkspace();
    const html = renderToStaticMarkup(createElement(Reports));
    expect(html).toContain('href="#report-actions"');
    expect(html).toMatch(new RegExp('<input[^>]*id="action-' + action.id + '"[^>]*checked'));
    expect(html).not.toContain('id="action-' + other.id + '"');
    expect(html).toContain('href="/api/attachments/published-file"');
    expect(html).toContain('download="receipt.txt"');
    expect(html.match(/href="\/api\/attachments\//g)).toHaveLength(1);
  });

  it('does not substitute another report when a requested report is unavailable', () => {
    clientWorkspace();
    context.current.selectedId = 'unavailable';
    const html = renderToStaticMarkup(createElement(Reports));
    expect(html).toContain('This report is unavailable.');
    expect(html).not.toContain('href="#report-actions"');
  });
});
