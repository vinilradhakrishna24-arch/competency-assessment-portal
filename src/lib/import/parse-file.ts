import 'server-only';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export interface RawImportRow {
  /** 1-based row number as it appears in the source file (header = row 1). */
  rowNumber: number;
  values: Record<string, string>;
}

/** Lowercases and strips everything but letters/digits so header variants
 * like "Question Type", "question_type", "Question-Type" all match. */
export function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const maybeRich = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(maybeRich.richText)) return maybeRich.richText.map((r) => r.text).join('');
    if (typeof maybeRich.text === 'string') return maybeRich.text;
    if ('result' in maybeRich) return String(maybeRich.result ?? '');
    return String(value);
  }
  return String(value).trim();
}

function parseCsv(content: string): RawImportRow[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  return result.data
    .map((row, idx) => {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        values[normalizeHeaderKey(key)] = typeof value === 'string' ? value.trim() : String(value ?? '');
      }
      return { rowNumber: idx + 2, values };
    })
    .filter((row) => Object.values(row.values).some((v) => v !== ''));
}

async function parseXlsx(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeaderKey(cellToString(cell.value));
  });

  const rows: RawImportRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const text = cellToString(row.getCell(colNumber).value);
      if (text) hasData = true;
      values[header] = text;
    });
    if (hasData) rows.push({ rowNumber: r, values });
  }
  return rows;
}

export async function parseImportFile(buffer: Buffer, filename: string): Promise<RawImportRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return parseCsv(buffer.toString('utf-8'));
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseXlsx(buffer);
  }
  throw new Error('Unsupported file type');
}
