import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createReportPdf, registerHanReportFont, type ReportPdfData } from '@/lib/report-pdf';
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
describe('report export fidelity and printable document safety', () => {
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
