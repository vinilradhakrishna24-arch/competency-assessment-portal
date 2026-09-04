'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { parseQuestionImportFile, confirmQuestionImport } from '@/lib/actions/import';
import type { ValidatedImportRow } from '@/lib/import/validate-rows';

type Step = 'upload' | 'preview' | 'done';

const TEMPLATE_CSV = [
  'Competency Code,Question Set,Question Type,Question Text,Scenario Text,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty,Explanation (Admin Only),Active',
  'LOA,Set A,single,"What is the minimum safe approach distance for a LOA activity?",,"1 metre","3 metres","5 metres","10 metres",B,1,medium,"Per site safety code section 4.2",TRUE',
  'SFT,Set A,multiple,"Which of the following are required before starting scaffold work? (select all that apply)",,"Valid permit","Inspection tag","Verbal approval only","Toolbox talk completed",A;B;D,2,medium,,TRUE',
  'PTW,Set B,true_false,"A hot work permit is valid for more than one shift unless explicitly extended.",,,,,,False,1,easy,,TRUE',
].join('\n');

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'question_import_template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImportWizard() {
  const [step, setStep] = React.useState<Step>('upload');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [rows, setRows] = React.useState<ValidatedImportRow[]>([]);
  const [importedCount, setImportedCount] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.insert);
  const errorRows = rows.filter((r) => !r.insert);

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setParsing(true);
    const formData = new FormData();
    formData.append('file', file);
    const result = await parseQuestionImportFile(formData);
    setParsing(false);

    if (!result.ok) {
      toast.error(result.error);
      setFileName(null);
      return;
    }

    setRows(result.rows);
    setStep('preview');
  }

  async function handleConfirmImport() {
    setImporting(true);
    const payload = validRows.map((r) => r.insert!);
    const result = await confirmQuestionImport(payload);
    setImporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setImportedCount(result.imported);
    setStep('done');
  }

  function reset() {
    setStep('upload');
    setFileName(null);
    setRows([]);
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (step === 'upload') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
            <UploadCloud className="h-7 w-7 text-emerald-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {parsing ? `Validating ${fileName}…` : 'Upload an Excel (.xlsx) or CSV file'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Every row is validated before anything is saved — you&apos;ll get a full preview and a
              chance to review errors first.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            <FileSpreadsheet className="h-4 w-4" />
            {parsing ? 'Validating…' : 'Choose File'}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-sm text-slate-600">
            Not sure of the format? Download a starter template with sample rows for each question type.
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Download Template
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> {validRows.length} ready to import
            </Badge>
            {errorRows.length > 0 && (
              <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                <XCircle className="h-3.5 w-3.5" /> {errorRows.length} with errors (skipped)
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} disabled={importing}>
              <ArrowLeft className="h-4 w-4" /> Choose Different File
            </Button>
            <Button onClick={handleConfirmImport} disabled={importing || validRows.length === 0}>
              {importing ? 'Importing…' : `Import ${validRows.length} Question${validRows.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>

        <Table>
          <Thead>
            <Tr>
              <Th>Row</Th>
              <Th>Competency</Th>
              <Th>Set</Th>
              <Th>Type</Th>
              <Th>Question</Th>
              <Th>Correct</Th>
              <Th>Marks</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.rowNumber}>
                <Td className="text-slate-400">{row.rowNumber}</Td>
                <Td>{row.preview.competency_code}</Td>
                <Td className="text-slate-500">{row.preview.question_set_name}</Td>
                <Td className="text-slate-500">{row.preview.question_type}</Td>
                <Td className="max-w-xs truncate" title={row.preview.question_text}>
                  {row.preview.question_text}
                </Td>
                <Td className="text-slate-500">{row.preview.correct_preview}</Td>
                <Td>{row.preview.marks}</Td>
                <Td>
                  {row.insert ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Ready</Badge>
                  ) : (
                    <div className="max-w-xs">
                      {row.errors.map((err, i) => (
                        <p key={i} className="text-xs font-medium text-rose-600">
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    );
  }

  return (
    <EmptyState
      icon={CheckCircle2}
      title={`${importedCount} question${importedCount === 1 ? '' : 's'} imported`}
      description="They're now live in the question bank and available for new assessments. Existing exams are unaffected."
      action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            Import Another File
          </Button>
          <Button asChild>
            <Link href="/questions">Back to Question Bank</Link>
          </Button>
        </div>
      }
    />
  );
}
