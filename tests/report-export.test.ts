import { describe, expect, it } from 'vitest';
import { cloneElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
  createReportPdf,
  registerHanReportFont,
  ReportDocument,
  type ReportPdfData,
} from '@/lib/report-pdf';
import { printableReportHtml } from '@/lib/report-print';
import { reportNeedsBrowserPrint, reportUsesHan } from '@/lib/report-text';

const report: ReportPdfData = {
  title: 'Qualité du service',
  client: 'Organisation de test',
  date: '09/11/2026',
  operator: 'Équipe',
  approvedBy: 'Qualité',
  approvedAt: '09/11/2026',
  channels: 'Email',
  score: 80,
  level: 'Conforme',
  levelDescription: 'Parcours documenté',
  summary: 'Réponse reçue et vérifiée.',
  criteriaVersion: 'ecarteo-v1',
  criteria: [{ name: 'Disponibilité', score: '4/4', comment: 'Accessible.' }],
  evidence: [{ date: '09/11/2026', label: 'Réponse', text: 'Texte vérifié.', file: 'preuve.txt' }],
  actions: [{ horizon: 7, text: 'Confirmer le suivi.', owner: 'Équipe' }],
  addenda: [],
};

// Inspect the actual engine's final paginated geometry, not the declared styles.
// Dynamic page numbers trigger additional layout passes and caused the regression.
interface PdfLayoutNode {
  type: string;
  value?: string;
  box: { top: number; left: number; width: number; height: number };
  props: { fixed?: boolean };
  children: PdfLayoutNode[];
  lines?: { runs: { ascent: number; descent: number }[] }[];
}

const pdfNodeText = (node: PdfLayoutNode): string =>
  node.value ?? node.children.map(pdfNodeText).join('');

describe('report export fidelity and printable document safety', () => {
  it.each(['fr', 'en'] as const)(
    'keeps the score clear of its status and every footer inside a multipage %s report',
    async (locale) => {
      const longReport: ReportPdfData = {
        ...report,
        score: 66,
        level: 'Orange',
        levelDescription:
          locale === 'fr'
            ? 'Fragile · standardiser sous 30 jours'
            : 'Fragile · standardise within 30 days',
        criteria: Array.from({ length: 12 }, (_, index) => ({
          name: `${index + 1}. ${locale === 'fr' ? 'Qualité de la réponse' : 'Response quality'}`,
          score: '3/4',
          comment:
            locale === 'fr'
              ? 'La réponse confirme les prochaines étapes. Le délai annoncé doit être documenté dans le dossier client et vérifié lors du prochain suivi.'
              : 'The response confirms the next steps. The stated deadline must be recorded in the customer file and verified during the next follow-up.',
        })),
        evidence: Array.from({ length: 8 }, (_, index) => ({
          ...report.evidence[0],
          label: `${locale === 'fr' ? 'Confirmation écrite' : 'Written confirmation'} ${index + 1}`,
          text:
            locale === 'fr'
              ? 'Le conseiller a confirmé la demande, expliqué le délai de traitement et proposé un point de contact pour suivre le dossier. La pièce originale est conservée dans le coffre de preuves.'
              : 'The advisor confirmed the request, explained the processing deadline and provided a contact for follow-up. The original attachment is retained in the evidence vault.',
        })),
      };
      let layout: PdfLayoutNode | undefined;
      await pdf(
        cloneElement(ReportDocument({ data: longReport, locale }), {
          onRender: (result: unknown) => {
            layout = (result as { _INTERNAL__LAYOUT__DATA_: PdfLayoutNode })
              ._INTERNAL__LAYOUT__DATA_;
          },
        }),
      ).toBlob();
      expect(layout).toBeDefined();
      const pages = layout!.children;
      expect(pages.length).toBeGreaterThan(1);

      const score = pages[0].children.find((node) => pdfNodeText(node) === '66/100')!;
      const status = pages[0].children.find((node) => pdfNodeText(node).startsWith('Orange ·'))!;
      const scoreInkHeight = Math.max(
        ...score.lines!.flatMap((line) => line.runs.map((run) => run.ascent - run.descent)),
      );
      expect(score.box.height).toBeGreaterThanOrEqual(scoreInkHeight - 0.01);
      expect(status.box.top).toBeGreaterThan(score.box.top + scoreInkHeight);

      for (const [index, page] of pages.entries()) {
        const footer = page.children.find((node) => node.props.fixed)!;
        expect(footer).toBeDefined();
        expect(footer.children.map(pdfNodeText)).toEqual([
          `ÉCARTÉO · ${report.criteriaVersion}`,
          `${index + 1} / ${pages.length}`,
        ]);
        expect(footer.box.top).toBeGreaterThan(0);
        expect(footer.box.top + footer.box.height).toBeLessThan(page.box.height);
        expect(footer.box.left).toBeGreaterThanOrEqual(0);
        expect(footer.box.left + footer.box.width).toBeLessThanOrEqual(page.box.width);
        for (const content of page.children.filter((node) => !node.props.fixed)) {
          expect(content.box.top + content.box.height).toBeLessThan(footer.box.top);
        }
      }
    },
  );
  it('detects Arabic in every report area, including correction addenda', async () => {
    expect(reportNeedsBrowserPrint(report)).toBe(false);
    const arabic = {
      ...report,
      addenda: [{ date: '09/11/2026', body: 'تم الرد على العميل خلال يوم واحد.' }],
    };
    expect(reportNeedsBrowserPrint(arabic)).toBe(true);
    await expect(createReportPdf(arabic, 'fr')).rejects.toThrow('version imprimable');
  });
  it('renders Latin and Chinese through the actual PDF engine with embedded Unicode mappings', async () => {
    registerHanReportFont(
      fileURLToPath(new URL('../public/fonts/reports/EcarteoHan-Regular.ttf', import.meta.url)),
    );
    const latin = Buffer.from(await (await createReportPdf(report, 'fr')).arrayBuffer());
    expect(latin.subarray(0, 4).toString()).toBe('%PDF');
    const chinese = {
      ...report,
      title: '客户服务审核',
      summary: '请提供详细报价。',
      addenda: [{ date: '09/11/2026', body: '跟进已确认。' }],
    };
    expect(reportUsesHan(chinese)).toBe(true);
    const bytes = Buffer.from(await (await createReportPdf(chinese, 'fr')).arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    const contents = bytes.toString('latin1');
    const unicodeMaps: string[] = [];
    for (const match of contents.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      try {
        const decoded = inflateSync(Buffer.from(match[1], 'latin1')).toString();
        if (decoded.includes('begincmap')) unicodeMaps.push(decoded.toLowerCase());
      } catch {
        /* Non-Flate streams are not text maps. */
      }
    }
    expect(unicodeMaps.join('\n')).toContain('5ba2'); // 客
    expect(unicodeMaps.join('\n')).toContain('8be6'); // 详
    expect(unicodeMaps.join('\n')).toContain('8ddf'); // 跟 in the dated supplement
  });
  it('escapes all report markup and permits only local font assets in the printable document', () => {
    const dangerous = {
      ...report,
      title: '<script>alert("x")</script>',
      client: '<img src=x onerror=alert(1)>',
      addenda: [{ date: 'now', body: '</p><script>bad()</script>' }],
    };
    const html = printableReportHtml(dangerous, 'fr', 'https://ecarteo.example');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('font-src https://ecarteo.example');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('Enregistrer en PDF');
    expect(() => printableReportHtml(report, 'fr', 'javascript:alert(1)')).toThrow();
  });
});
