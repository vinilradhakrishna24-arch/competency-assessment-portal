import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { CertificatePdfDocument, type CertificatePdfProps } from '@/lib/certificate/pdf-document';

export async function generateCertificatePdfBuffer(props: CertificatePdfProps): Promise<Buffer> {
  const buffer = await renderToBuffer(CertificatePdfDocument(props));
  return buffer;
}
