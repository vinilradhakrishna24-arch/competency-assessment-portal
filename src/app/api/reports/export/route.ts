import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth/session';
import { getReportRows, type ReportFilters } from '@/lib/actions/reports';
import { formatDateTime } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';

export const runtime = 'nodejs';

function parseFilters(searchParams: URLSearchParams): ReportFilters {
  return {
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
    competencyId: searchParams.get('competencyId') || undefined,
    projectContract: searchParams.get('projectContract') || undefined,
    department: searchParams.get('department') || undefined,
    candidateId: searchParams.get('candidateId') || undefined,
    designation: searchParams.get('designation') || undefined,
    result: (searchParams.get('result') as ReportFilters['result']) || undefined,
    examinerId: searchParams.get('examinerId') || undefined,
  };
}

export async function GET(request: NextRequest) {
  // Any signed-in internal user (admin or viewer/management) may export
  // reports — this mirrors the read access reports already have via RLS.
  await requireUser();

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
  const filters = parseFilters(searchParams);

  const rows = await getReportRows(filters);

  const records = rows.map((r) => ({
    'Assessment Code': r.assessment_code,
    'Employee ID': r.candidates?.employee_id ?? '',
    'Candidate Name': r.candidates?.full_name ?? '',
    Designation: r.candidates?.designation ?? '',
    'Project/Contract': r.candidates?.project_contract ?? '',
    Department: r.candidates?.department ?? '',
    Competency: r.competencies?.code ?? '',
    Status: STATUS_LABELS[r.status] ?? r.status,
    'Score %': r.score_percentage ?? '',
    'Pass Mark': r.pass_mark,
    Attempt: r.attempt_number,
    'Created At': formatDateTime(r.created_at),
    'Submitted At': formatDateTime(r.submitted_at),
    Examiner: r.profiles?.full_name ?? '',
  }));

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(',')];
    for (const record of records) {
      lines.push(headers.map((h) => escape((record as Record<string, unknown>)[h])).join(','));
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="assessment_report_${timestamp}.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  if (records.length > 0) {
    sheet.columns = Object.keys(records[0]).map((key) => ({ header: key, key, width: 20 }));
    sheet.addRows(records);
    sheet.getRow(1).font = { bold: true };
  }
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="assessment_report_${timestamp}.xlsx"`,
    },
  });
}
