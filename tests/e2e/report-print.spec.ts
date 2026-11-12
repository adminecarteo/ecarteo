import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import ts from 'typescript';
import { test, expect } from '@playwright/test';
import { printableReportHtml } from '../../src/lib/report-print';
import type { ReportPdfData } from '../../src/lib/report-pdf';

const report: ReportPdfData = {
  title: 'مراجعة خدمة العملاء',
  client: 'Organisation de test — 客户服务',
  date: '09/11/2026',
  operator: 'Équipe',
  approvedBy: 'Qualité',
  approvedAt: '09/11/2026',
  channels: 'Email · AR',
  score: 80,
  level: 'Conforme',
  levelDescription: 'Parcours documenté',
  summary: 'تم الرد على العميل خلال يوم واحد.',
  criteriaVersion: 'ecarteo-v1',
  criteria: [
    { name: 'Disponibilité', score: '4/4', comment: 'خدمة العملاء متاحة من الاثنين إلى الجمعة.' },
  ],
  evidence: [
    {
      date: '09/11/2026',
      label: 'Réponse reçue — مرحبا بكم',
      text: '请提供详细报价。',
      file: 'preuve.txt',
    },
  ],
  actions: [{ horizon: 7, text: 'تأكيد استلام طلب العميل.', owner: 'Équipe support' }],
  addenda: [{ date: '10/11/2026', body: 'تم التأكد من صحة المعلومات.' }],
};

test('printable Arabic and Chinese reports load local fonts, preserve text, and fit paper/mobile', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url());
  });
  // Intercept an isolated fixture only in this test. No production bypass route exists.
  await page.route('**/__print_fixture__', (route) =>
    route.fulfill({ contentType: 'text/html', body: printableReportHtml(report, 'fr', origin) }),
  );
  await page.goto('/__print_fixture__');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page).toHaveTitle(`${report.title} · Écartéo`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(report.title);
  expect(
    await page
      .getByRole('heading', { level: 1 })
      .evaluate((element) => getComputedStyle(element).direction),
  ).toBe('rtl');
  await expect(page.getByText(report.summary, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.fonts.check('16px EcarteoArabic') && document.fonts.check('16px EcarteoHan'),
    ),
  ).toBe(true);
  await mkdir('/tmp/ecarteo-production-qa', { recursive: true });
  await page.screenshot({
    path: '/tmp/ecarteo-production-qa/report-arabic-desktop.png',
    fullPage: true,
  });
  await page.pdf({
    path: '/tmp/ecarteo-production-qa/report-arabic.pdf',
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '/tmp/ecarteo-production-qa/report-arabic-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('print action opens an isolated window and enables printing after bundled fonts load', async ({
  page,
}) => {
  // Compile the actual browser helpers, with fixtures intercepted only by Playwright.
  const compile = async (path: string) =>
    ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
  const browserModule = (await compile('../../src/lib/report-print.ts')).replace(
    /from ['"]\.\/report-text['"]/g,
    "from '/__report_text.js'",
  );
  const textModule = await compile('../../src/lib/report-text.ts');
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/__print_module.js' || request.url === '/__report_text.js') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(request.url === '/__print_module.js' ? browserModule : textModule);
      } else if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          `<!doctype html><html><head><meta charset="utf-8"><title>Isolated print test</title></head><body><button id="open">Open printable report</button><script type="module">import {openPrintableReport} from '/__print_module.js'; document.getElementById('open').addEventListener('click',()=>openPrintableReport(${JSON.stringify(report)},'fr'));</script></body></html>`,
        );
      } else if (
        ['/fonts/reports/Amiri-Regular.ttf', '/fonts/reports/EcarteoHan-Regular.ttf'].includes(
          request.url || '',
        )
      ) {
        response.setHeader('Content-Type', 'font/ttf');
        response.end(await readFile(new URL('../../public' + request.url, import.meta.url)));
      } else {
        response.statusCode = 404;
        response.end();
      }
    } catch {
      response.statusCode = 500;
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Open printable report' }).click();
    const popup = await opened;
    await expect(
      popup.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' }),
    ).toBeEnabled();
    expect(popup.url()).toBe('about:blank');
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(popup.getByRole('status')).toContainText('Enregistrer en PDF');
    await popup.evaluate(() => {
      window.print = () => document.body.setAttribute('data-print-requested', 'true');
    });
    await popup.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' }).click();
    await expect(popup.locator('body')).toHaveAttribute('data-print-requested', 'true');
    await popup.screenshot({ path: '/tmp/ecarteo-production-qa/print-popup.png', fullPage: true });
    await popup.close();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
