import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { formatDate, formatScore } from '@/lib/utils';

Font.registerHyphenationCallback((word) => [word]);

const COMPETENCY_ACCENTS: Record<string, string> = {
  LOA: '#0F5C4A',
  SFT: '#8A5A00',
  PTW: '#1E3A8A',
};

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  border: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderWidth: 2,
    borderStyle: 'solid',
  },
  innerBorder: {
    position: 'absolute',
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    borderWidth: 0.75,
    borderStyle: 'solid',
    borderColor: '#CBD5E1',
  },
  content: {
    padding: 48,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  // The Shaher United logo is a wide horizontal lockup (icon + Arabic +
  // English wordmark), not a square mark — sizing it as a square crushes
  // the wordmark unreadably small. Fix the width and let height follow the
  // source aspect ratio via objectFit so the full lockup stays legible.
  logo: { width: 220, height: 30, marginBottom: 10, objectFit: 'contain' },
  companyName: { fontSize: 11, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 20, color: '#0F172A', fontFamily: 'Helvetica-Bold', marginTop: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  body: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexGrow: 1, justifyContent: 'center' },
  presentedTo: { fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: 2 },
  candidateName: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#0F172A', marginTop: 4 },
  statement: { fontSize: 13, color: '#334155', marginTop: 14, textAlign: 'center' },
  statusLabel: { fontSize: 9, color: '#64748B', textTransform: 'uppercase', letterSpacing: 2, marginTop: 16 },
  competencyLine: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginTop: 4, textAlign: 'center', textTransform: 'uppercase' },
  competencyCode: { fontSize: 9, color: '#94A3B8', marginTop: 2 },
  metaGrid: {
    marginTop: 24,
    display: 'flex',
    flexDirection: 'row',
    gap: 28,
    justifyContent: 'center',
  },
  metaItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90 },
  metaLabel: { fontSize: 8, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  metaValue: { fontSize: 11, color: '#1E293B', marginTop: 3, fontFamily: 'Helvetica-Bold' },
  footer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  footerText: { fontSize: 8, color: '#94A3B8', maxWidth: 420, textAlign: 'center' },
  certNumber: { fontSize: 9, color: '#475569', fontFamily: 'Helvetica-Bold' },
});

export interface CertificatePdfProps {
  companyName: string;
  logoDataUrl: string | null;
  candidateName: string;
  employeeId: string;
  designation: string | null;
  projectContract: string | null;
  competencyName: string;
  competencyCode: string;
  scorePercentage: number;
  assessmentDate: string;
  certificateNumber: string;
  footerText: string;
}

export function CertificatePdfDocument(props: CertificatePdfProps) {
  const accent = COMPETENCY_ACCENTS[props.competencyCode] ?? '#0F172A';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={[styles.border, { borderColor: accent }]} />
        <View style={styles.innerBorder} />
        <View style={styles.content}>
          <View style={styles.header}>
            {props.logoDataUrl ? (
              // The logo is a full wordmark lockup (icon + company name) —
              // showing it makes a separate text repeat of the company
              // name directly beneath it redundant.
              <Image src={props.logoDataUrl} style={styles.logo} />
            ) : (
              <Text style={styles.companyName}>{props.companyName}</Text>
            )}
            <Text style={styles.title}>Internal Competency Assessment Certificate</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.presentedTo}>This certifies that</Text>
            <Text style={styles.candidateName}>{props.candidateName}</Text>
            <Text style={styles.statement}>
              (Employee ID: {props.employeeId}
              {props.designation ? ` · ${props.designation}` : ''})
            </Text>
            <Text style={styles.statusLabel}>Competency Status</Text>
            <Text style={[styles.competencyLine, { color: accent }]}>
              Competent for {props.competencyName} Assessment
            </Text>
            <Text style={styles.competencyCode}>({props.competencyCode})</Text>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Project / Contract</Text>
                <Text style={styles.metaValue}>{props.projectContract ?? '—'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Score Achieved</Text>
                <Text style={styles.metaValue}>{formatScore(props.scorePercentage)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Assessment Date</Text>
                <Text style={styles.metaValue}>{formatDate(props.assessmentDate)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.certNumber}>Certificate No: {props.certificateNumber}</Text>
            <Text style={styles.footerText}>{props.footerText}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
