import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { Locale } from '@/domain/types';
import { reportNeedsBrowserPrint, reportUsesHan } from './report-text';

export interface ReportPdfData {
  title: string;
  client: string;
  date: string;
  operator: string;
  approvedBy: string;
  approvedAt: string;
  channels: string;
  score: number;
  level: string;
  levelDescription: string;
  summary: string;
  criteriaVersion: string;
  criteria: { name: string; score: string; comment: string }[];
  evidence: { date: string; label: string; text: string; file: string }[];
  actions: { horizon: number; text: string; owner: string }[];
  addenda?: { date: string; body: string }[];
}

const createStyles = (han: boolean) =>
  StyleSheet.create({
    page: {
      padding: 38,
      paddingBottom: 48,
      fontSize: 10,
      fontFamily: han ? ['Helvetica', 'EcarteoHan'] : 'Helvetica',
      color: '#12172D',
      // Use font metrics: react-pdf resolves inherited lineHeight before font-size
      // overrides, then multiplies it again when paginating dynamic footers.
    },
    header: { backgroundColor: '#181B52', color: '#FFFFFF', padding: 22, marginBottom: 22 },
    brand: { color: '#27D4D7', fontSize: 11, letterSpacing: 3, marginBottom: 16 },
    title: {
      fontSize: 24,
      fontFamily: han ? ['Helvetica-Bold', 'EcarteoHan'] : 'Helvetica-Bold',
      marginBottom: 12,
    },
    meta: { fontSize: 9, color: '#E2E5FA', marginTop: 3 },
    score: {
      fontSize: 34,
      fontFamily: han ? ['Helvetica-Bold', 'EcarteoHan'] : 'Helvetica-Bold',
      color: '#181B52',
      marginBottom: 5,
    },
    heading: {
      fontSize: 14,
      fontFamily: han ? ['Helvetica-Bold', 'EcarteoHan'] : 'Helvetica-Bold',
      marginTop: 20,
      marginBottom: 8,
      color: '#181B52',
    },
    row: { borderBottomWidth: 0.5, borderBottomColor: '#DDE3EC', paddingVertical: 7 },
    rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    bold: { fontFamily: han ? ['Helvetica-Bold', 'EcarteoHan'] : 'Helvetica-Bold' },
    muted: { fontSize: 9, color: '#57617A', marginTop: 3 },
    horizon: {
      fontSize: 11,
      fontFamily: han ? ['Helvetica-Bold', 'EcarteoHan'] : 'Helvetica-Bold',
      marginTop: 10,
      marginBottom: 4,
    },
    footer: {
      position: 'absolute',
      left: 38,
      right: 38,
      bottom: 22,
      flexDirection: 'row',
      justifyContent: 'space-between',
      color: '#6B748A',
      fontSize: 8,
    },
  });

export function ReportDocument({ data, locale }: { data: ReportPdfData; locale: Locale }) {
  const fr = locale === 'fr';
  const styles = createStyles(reportUsesHan(data));
  return (
    <Document
      title={`${fr ? 'Rapport d’audit' : 'Audit report'} — ${data.title}`}
      author="Écartéo"
      subject={data.client}
      language={locale}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>ÉCARTÉO</Text>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.meta}>
            {data.client} · {data.date}
          </Text>
          <Text style={styles.meta}>{data.channels}</Text>
          <Text style={styles.meta}>
            {fr ? 'Opérateur' : 'Operator'}: {data.operator}
          </Text>
          <Text style={styles.meta}>
            {fr ? 'Validé par' : 'Approved by'}: {data.approvedBy} · {data.approvedAt}
          </Text>
        </View>
        <Text style={styles.score}>{data.score}/100</Text>
        <Text style={styles.bold}>
          {data.level} · {data.levelDescription}
        </Text>
        <Text style={styles.heading}>{fr ? 'Synthèse' : 'Summary'}</Text>
        <Text>{data.summary}</Text>
        <Text style={styles.heading}>{fr ? 'Résultats par critère' : 'Results by criterion'}</Text>
        {data.criteria.map((criterion) => (
          <View key={criterion.name} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.bold}>{criterion.name}</Text>
              <Text>{criterion.score}</Text>
            </View>
            {criterion.comment ? <Text style={styles.muted}>{criterion.comment}</Text> : null}
          </View>
        ))}
        <Text style={styles.heading}>{fr ? 'Preuves horodatées' : 'Timestamped evidence'}</Text>
        {data.evidence.length ? (
          data.evidence.map((evidence, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.bold}>{evidence.label}</Text>
              <Text style={styles.muted}>
                {evidence.date}
                {evidence.file ? ` · ${evidence.file}` : ''}
              </Text>
              {evidence.text ? <Text>{evidence.text}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={styles.muted}>
            {fr ? 'Aucune preuve rattachée.' : 'No evidence attached.'}
          </Text>
        )}
        <Text style={styles.heading}>
          {fr ? 'Plan d’actions 7 / 30 / 90 jours' : '7 / 30 / 90-day action plan'}
        </Text>
        {[7, 30, 90].map((horizon) => (
          <View key={horizon}>
            <Text style={styles.horizon}>
              {fr ? 'Sous' : 'Within'} {horizon} {fr ? 'jours' : 'days'}
            </Text>
            {data.actions.filter((action) => action.horizon === horizon).length ? (
              data.actions
                .filter((action) => action.horizon === horizon)
                .map((action, index) => (
                  <View style={styles.row} key={index}>
                    <Text>{action.text}</Text>
                    {action.owner ? (
                      <Text style={styles.muted}>
                        {fr ? 'Responsable' : 'Owner'}: {action.owner}
                      </Text>
                    ) : null}
                  </View>
                ))
            ) : (
              <Text style={styles.muted}>{fr ? 'Aucune action.' : 'No action.'}</Text>
            )}
          </View>
        ))}
        <Text style={styles.muted}>
          {fr
            ? 'Rapport figé à la validation. Les fichiers originaux sont conservés séparément dans le coffre de preuves.'
            : 'Report frozen at approval. Original files are stored separately in the evidence vault.'}
        </Text>
        {!!data.addenda?.length && (
          <View>
            <Text style={styles.heading}>
              {fr ? 'Compléments et corrections' : 'Supplements and corrections'}
            </Text>
            <Text style={styles.muted}>
              {fr
                ? 'Ces compléments datés accompagnent le rapport original, conservé à sa date de validation.'
                : 'These dated supplements accompany the original report, preserved as approved.'}
            </Text>
            {data.addenda.map((item, index) => (
              <View key={index} style={styles.row}>
                <Text style={styles.bold}>{item.date}</Text>
                <Text>{item.body}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.footer} fixed>
          <Text>ÉCARTÉO · {data.criteriaVersion}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

let hanRegistered = false;
export function registerHanReportFont(source = '/fonts/reports/EcarteoHan-Regular.ttf') {
  if (hanRegistered) return;
  Font.register({ family: 'EcarteoHan', src: source });
  hanRegistered = true;
}

export async function createReportPdf(data: ReportPdfData, locale: Locale): Promise<Blob> {
  if (reportNeedsBrowserPrint(data))
    throw new Error(
      locale === 'fr'
        ? 'Utilisez la version imprimable pour préserver le texte arabe.'
        : 'Use the printable report to preserve Arabic text.',
    );
  if (reportUsesHan(data)) registerHanReportFont();
  return pdf(<ReportDocument data={data} locale={locale} />).toBlob();
}
