import type { ReportPdfData } from './report-pdf';

export function reportStrings(data: ReportPdfData): string[] {
  return [
    data.title,
    data.client,
    data.date,
    data.operator,
    data.approvedBy,
    data.approvedAt,
    data.channels,
    data.level,
    data.levelDescription,
    data.summary,
    data.criteriaVersion,
    ...data.criteria.flatMap((item) => [item.name, item.score, item.comment]),
    ...data.evidence.flatMap((item) => [item.date, item.label, item.text, item.file]),
    ...data.actions.flatMap((item) => [item.text, item.owner]),
    ...(data.addenda || []).flatMap((item) => [item.date, item.body]),
  ];
}
export function reportNeedsBrowserPrint(data: ReportPdfData): boolean {
  // The installed PDF engine corrupts Arabic Unicode extraction. Use Chromium's
  // native text shaping through the browser print path instead of exporting it.
  return reportStrings(data).some((value) =>
    /[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(value),
  );
}
export function reportUsesHan(data: ReportPdfData): boolean {
  return reportStrings(data).some((value) =>
    /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(value),
  );
}
