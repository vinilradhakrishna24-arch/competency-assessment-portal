'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseImportFile } from '@/lib/import/parse-file';
import { validateImportRows, questionDuplicateKey, type ValidatedImportRow } from '@/lib/import/validate-rows';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;

export type ParseImportResult =
  | { ok: true; rows: ValidatedImportRow[]; validCount: number; errorCount: number }
  | { ok: false; error: string };

/** Step 1: upload → parse → validate. Nothing is written to the database yet. */
export async function parseQuestionImportFile(formData: FormData): Promise<ParseImportResult> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file uploaded' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File is too large (max 5 MB)' };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    return { ok: false, error: 'Unsupported file type — upload a .csv or .xlsx file' };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'Could not read the uploaded file' };
  }

  let rawRows;
  try {
    rawRows = await parseImportFile(buffer, file.name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Could not parse file: ${err.message}` : 'Could not parse file' };
  }

  if (rawRows.length === 0) {
    return { ok: false, error: 'No data rows were found in the file. Check that row 1 contains column headers.' };
  }
  if (rawRows.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows (${rawRows.length}). Split the file into batches of ${MAX_ROWS} or fewer.` };
  }

  const supabase = await createSupabaseServerClient();
  const [competenciesRes, questionSetsRes, existingQuestionsRes] = await Promise.all([
    supabase.from('competencies').select('id, code'),
    supabase.from('question_sets').select('id, competency_id, set_name'),
    supabase.from('questions').select('competency_id, question_text'),
  ]);

  if (competenciesRes.error || questionSetsRes.error || existingQuestionsRes.error) {
    return { ok: false, error: 'Failed to load competency/question-set reference data for validation' };
  }

  const existingKeys = new Set(
    (existingQuestionsRes.data ?? []).map((q) => questionDuplicateKey(q.competency_id, q.question_text))
  );

  const rows = validateImportRows(
    rawRows,
    competenciesRes.data ?? [],
    questionSetsRes.data ?? [],
    existingKeys
  );
  const validCount = rows.filter((r) => r.insert).length;

  return { ok: true, rows, validCount, errorCount: rows.length - validCount };
}

/** Step 2: confirm — insert only the rows the client says passed validation,
 * re-sent as their `insert` payloads. The whole batch is applied atomically
 * inside a single Postgres transaction (fn_bulk_import_questions), so a
 * failure partway through never leaves an inconsistent partial import. */
export async function confirmQuestionImport(
  rows: NonNullable<ValidatedImportRow['insert']>[]
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  const user = await requireAdmin();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'No valid rows to import' };
  }
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows in a single import (max ${MAX_ROWS})` };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('fn_bulk_import_questions', {
    p_created_by: user.id,
    p_rows: rows,
  });

  if (error) {
    return { ok: false, error: `Import failed — no questions were added: ${error.message}` };
  }

  const imported = typeof data === 'number' ? data : rows.length;

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.QUESTIONS_IMPORTED,
    entityType: 'question',
    newValue: { imported },
  });

  revalidatePath('/questions');
  return { ok: true, imported };
}
