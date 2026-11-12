import type { Locale } from '@/domain/types';
import type { ReportPdfData } from './report-pdf';
import { reportUsesHan } from './report-text';

const escape = (text: string | number) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
const paragraph = (text: string, className = '') =>
  `<p dir="auto"${className ? ` class="${className}"` : ''}>${escape(text)}</p>`;

/** All report content is escaped text. No customer HTML, external URLs or scripts are accepted. */
export function printableReportHtml(data: ReportPdfData, locale: Locale, origin: string): string {
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
    throw new Error('Invalid report origin');
  const fr = locale === 'fr';
  const label = (frText: string, enText: string) => (fr ? frText : enText);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src ${escape(origin)}; base-uri 'none'; form-action 'none'">
<title>${escape(data.title)} · Écartéo</title>
<style>
@font-face{font-family:EcarteoArabic;src:url('${escape(origin)}/fonts/reports/Amiri-Regular.ttf') format('truetype');font-weight:100 900;font-display:block;unicode-range:U+0600-08FF,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:EcarteoHan;src:url('${escape(origin)}/fonts/reports/EcarteoHan-Regular.ttf') format('truetype');font-weight:100 900;font-display:block;unicode-range:U+3000-30FF,U+3400-9FFF,U+F900-FAFF,U+FF00-FFEF}
*{box-sizing:border-box}body{margin:0;background:#f5f8fb;color:#12172d;font:14px/1.65 EcarteoArabic,EcarteoHan,Arial,sans-serif}
main{max-width:850px;margin:24px auto;background:white;padding:40px}header{background:#181b52;color:white;padding:24px;margin-bottom:24px}
.brand{letter-spacing:3px;color:#27d4d7;font-size:12px}h1{font-size:27px;line-height:1.3}h2{font-size:18px;color:#181b52;margin-top:28px}h3{font-size:15px}
p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}h1,h2,h3{overflow-wrap:anywhere}.muted{color:#57617a;font-size:12px}header .muted{color:#e2e5fa}
.score{font-size:36px;font-weight:700;color:#181b52}.entry{padding:12px 0;border-bottom:1px solid #dde3ec;break-inside:avoid}.entry h3{margin:0}
.toolbar{position:sticky;top:0;background:#e2f6f7;padding:16px 24px;border-bottom:1px solid #bbdfe1}.toolbar button{background:#181b52;color:white;padding:10px 18px;border:0;border-radius:5px;font:inherit;cursor:pointer}.toolbar button:disabled{opacity:.6;cursor:wait}
footer{margin-top:32px;border-top:1px solid #dde3ec;padding-top:12px;font-size:11px;color:#57617a}
@page{size:A4;margin:16mm}@media print{body{background:white;font-size:10pt}.toolbar{display:none}main{padding:0;margin:0;max-width:none}header{print-color-adjust:exact;-webkit-print-color-adjust:exact}h2,h3{break-after:avoid}p{orphans:3;widows:3}}
@media(max-width:600px){main{margin:0;padding:20px}.toolbar{position:static;padding:16px}}
</style></head><body>
<div class="toolbar"><button id="print-report" disabled>${label('Imprimer / Enregistrer en PDF', 'Print / Save as PDF')}</button><p id="print-status" role="status">${label('Préparation des polices…', 'Preparing fonts…')}</p></div>
<main><header><p class="brand">ÉCARTÉO</p><h1 dir="auto">${escape(data.title)}</h1>
${paragraph(`${data.client} · ${data.date}`)}${paragraph(data.channels)}
${paragraph(`${label('Opérateur', 'Operator')}: ${data.operator}`, 'muted')}
${paragraph(`${label('Validé par', 'Approved by')}: ${data.approvedBy} · ${data.approvedAt}`, 'muted')}</header>
<p class="score">${escape(data.score)}/100</p>${paragraph(`${data.level} · ${data.levelDescription}`)}
<h2>${label('Synthèse', 'Summary')}</h2>${paragraph(data.summary)}
<h2>${label('Résultats par critère', 'Results by criterion')}</h2>
${data.criteria.map((item) => `<section class="entry"><h3 dir="auto">${escape(item.name)} · ${escape(item.score)}</h3>${paragraph(item.comment)}</section>`).join('')}
<h2>${label('Preuves horodatées', 'Timestamped evidence')}</h2>
${data.evidence.length ? data.evidence.map((item) => `<section class="entry"><h3 dir="auto">${escape(item.label)}</h3>${paragraph(`${item.date}${item.file ? ` · ${item.file}` : ''}`, 'muted')}${paragraph(item.text)}</section>`).join('') : paragraph(label('Aucune preuve rattachée.', 'No evidence attached.'), 'muted')}
<h2>${label('Plan d’actions 7 / 30 / 90 jours', '7 / 30 / 90-day action plan')}</h2>
${[7, 30, 90]
  .map(
    (horizon) =>
      `<section><h3>${label('Sous', 'Within')} ${horizon} ${label('jours', 'days')}</h3>${
        data.actions
          .filter((action) => action.horizon === horizon)
          .map(
            (item) =>
              `<div class="entry">${paragraph(item.text)}${paragraph(`${label('Responsable', 'Owner')}: ${item.owner}`, 'muted')}</div>`,
          )
          .join('') || paragraph(label('Aucune action.', 'No action.'), 'muted')
      }</section>`,
  )
  .join('')}
${data.addenda?.length ? `<h2>${label('Compléments et corrections', 'Supplements and corrections')}</h2>${data.addenda.map((item) => `<section class="entry">${paragraph(item.date, 'muted')}${paragraph(item.body)}</section>`).join('')}` : ''}
<footer>${paragraph(label('Rapport figé à la validation. Les compléments datés accompagnent l’original. Les fichiers originaux sont conservés séparément dans le coffre de preuves.', 'Report frozen at approval. Dated supplements accompany the original. Original files are stored separately in the evidence vault.'))}${paragraph(`ÉCARTÉO · ${data.criteriaVersion}`)}</footer>
</main></body></html>`;
}

/** Called directly from a click so popup blockers do not discard the report. */
export function openPrintableReport(data: ReportPdfData, locale: Locale): void {
  const page = window.open('', '_blank', 'popup');
  if (!page)
    throw new Error(
      locale === 'fr'
        ? 'Autorisez l’ouverture de la fenêtre imprimable pour ce site, puis réessayez.'
        : 'Allow this site to open the printable window, then try again.',
    );
  page.document.open();
  page.document.write(printableReportHtml(data, locale, window.location.origin));
  page.document.close();
  page.opener = null;
  const button = page.document.getElementById('print-report') as HTMLButtonElement;
  const status = page.document.getElementById('print-status')!;
  button.addEventListener('click', () => page.print());
  void Promise.all([
    page.document.fonts.load('16px EcarteoArabic', 'مرحبا'),
    ...(reportUsesHan(data) ? [page.document.fonts.load('16px EcarteoHan', '客户')] : []),
  ])
    .then(() => {
      if (page.closed) return;
      button.disabled = false;
      status.textContent =
        locale === 'fr'
          ? 'Choisissez « Enregistrer en PDF » dans la fenêtre d’impression pour conserver le texte arabe.'
          : 'Choose “Save as PDF” in the print dialog to preserve Arabic text.';
      button.focus();
    })
    .catch(() => {
      if (!page.closed)
        status.textContent =
          locale === 'fr'
            ? 'Les polices n’ont pas pu être chargées. Fermez cette fenêtre, vérifiez votre connexion et réessayez.'
            : 'The fonts could not load. Close this window, check your connection and try again.';
    });
}
