import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const QUESTION_TYPES = ['Single Choice', 'Multiple Choice', 'True/False', 'Scenario'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const ACTIVE_VALUES = ['TRUE', 'FALSE'];
const COMPETENCY_TYPES = ['Knowledge', 'Skill'];

const QUESTIONS_HEADERS = [
  'Competency',
  'Competency Type',
  'Element',
  'Question Set',
  'Question Type',
  'Question',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Option E',
  'Correct Answer',
  'Explanation',
  'Difficulty',
  'Marks',
  'Active',
];

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2761' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 24;
}

/** Generates the "Download HSE Question Bank Template" workbook. Reads the
 * live Competency + Element -> Competency Type mapping straight from
 * competency_areas (via getCompetencyAreas' underlying table) rather than
 * hard-coding it here a second time, so the template always reflects
 * whatever Settings > Competency Areas currently has configured — the same
 * single source of truth every other part of the app uses. */
export async function GET() {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const [competenciesRes, areasRes] = await Promise.all([
    supabase.from('competencies').select('id, code, competency_name, stream').eq('stream', 'hse').order('code'),
    supabase.from('competency_areas').select('competency_id, code, area_name, competency_type, sort_order').eq('active', true),
  ]);

  if (competenciesRes.error || areasRes.error) {
    return NextResponse.json({ error: 'Failed to load HSE taxonomy for the template' }, { status: 500 });
  }

  const competencies = competenciesRes.data ?? [];
  const areas = areasRes.data ?? [];
  const advisor = competencies.find((c) => c.code === 'HSE_ADV');
  const manager = competencies.find((c) => c.code === 'HSE_MGR');
  const advisorAreas = areas
    .filter((a) => a.competency_id === advisor?.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  const managerAreas = areas
    .filter((a) => a.competency_id === manager?.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  // The 22 element names are shared between the two competencies (only their
  // Competency Type differs) -- take the Advisor list as the canonical name
  // set for the single "valid element name" dropdown.
  const elementNames = advisorAreas.map((a) => a.area_name);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Competency Assessment Portal';
  workbook.created = new Date();

  // -------------------------------------------------------------------
  // Sheet 5 first (Reference Data) so its named ranges exist before the
  // Questions sheet's data validations reference them.
  // -------------------------------------------------------------------
  const refSheet = workbook.addWorksheet('Reference Data');
  refSheet.columns = [
    { header: 'Competencies', key: 'competencies', width: 22 },
    { header: 'Competency Types', key: 'types', width: 20 },
    { header: 'Question Types', key: 'qtypes', width: 20 },
    { header: 'Difficulty', key: 'difficulty', width: 16 },
    { header: 'Active', key: 'active', width: 12 },
    { header: 'Elements (22 approved)', key: 'elements', width: 55 },
  ];
  styleHeaderRow(refSheet.getRow(1));
  const competencyNames = competencies.map((c) => c.competency_name);
  const maxRefRows = Math.max(competencyNames.length, COMPETENCY_TYPES.length, QUESTION_TYPES.length, DIFFICULTIES.length, ACTIVE_VALUES.length, elementNames.length);
  for (let i = 0; i < maxRefRows; i++) {
    refSheet.addRow({
      competencies: competencyNames[i] ?? '',
      types: COMPETENCY_TYPES[i] ?? '',
      qtypes: QUESTION_TYPES[i] ?? '',
      difficulty: DIFFICULTIES[i] ?? '',
      active: ACTIVE_VALUES[i] ?? '',
      elements: elementNames[i] ?? '',
    });
  }

  // Named ranges used by the Questions sheet's dropdown data validations.
  const lastRow = maxRefRows + 1;
  workbook.definedNames.add(`'Reference Data'!$A$2:$A$${competencyNames.length + 1}`, 'CompetencyList');
  workbook.definedNames.add(`'Reference Data'!$B$2:$B$${COMPETENCY_TYPES.length + 1}`, 'CompetencyTypeList');
  workbook.definedNames.add(`'Reference Data'!$C$2:$C$${QUESTION_TYPES.length + 1}`, 'QuestionTypeList');
  workbook.definedNames.add(`'Reference Data'!$D$2:$D$${DIFFICULTIES.length + 1}`, 'DifficultyList');
  workbook.definedNames.add(`'Reference Data'!$E$2:$E$${ACTIVE_VALUES.length + 1}`, 'ActiveList');
  workbook.definedNames.add(`'Reference Data'!$F$2:$F$${elementNames.length + 1}`, 'ElementList');
  void lastRow;

  // -------------------------------------------------------------------
  // Sheet 1: Questions -- the actual upload sheet.
  // -------------------------------------------------------------------
  const qSheet = workbook.addWorksheet('Questions', { views: [{ state: 'frozen', ySplit: 1 }] });
  qSheet.columns = QUESTIONS_HEADERS.map((h) => ({ header: h, key: h, width: h === 'Question' || h === 'Explanation' ? 40 : 22 }));
  styleHeaderRow(qSheet.getRow(1));

  const sampleRows: (string | number)[][] = [
    [
      'HSE Advisor',
      '',
      'HSE Management System',
      '',
      'Single Choice',
      'What is the primary purpose of an HSE Management System?',
      'To provide a structured framework for managing HSE risks',
      'To replace the need for site inspections',
      'To satisfy insurance requirements only',
      'To reduce staffing levels',
      '',
      'A',
      'Leave blank to auto-derive Competency Type from Competency + Element',
      'Medium',
      1,
      'TRUE',
    ],
    [
      'HSE Advisor',
      '',
      'Audit & Inspection',
      '',
      'Multiple Choice',
      'Which of the following are typically reviewed during an HSE audit? (select all that apply)',
      'Permit-to-work records',
      'Incident investigation reports',
      'Marketing brochures',
      'Toolbox talk attendance',
      '',
      'A,B,D',
      '',
      'Medium',
      2,
      'TRUE',
    ],
    [
      'HSE Manager',
      '',
      'Leadership and Commitment',
      '',
      'Scenario',
      'Site visits by the HSE Manager have declined over the past quarter while unsafe-condition reports have risen. What should the HSE Manager do first?',
      'Increase visible leadership presence and re-engage with site teams',
      'Wait for the next scheduled audit',
      'Delegate all site visits permanently to supervisors',
      'Reduce reporting requirements to lower the reported numbers',
      '',
      'A',
      'HSE Manager + Leadership and Commitment = Skill (management-level judgement, not recall)',
      'Hard',
      2,
      'TRUE',
    ],
    [
      'HSE Manager',
      '',
      'Environmental Management',
      '',
      'True/False',
      'Environmental Management is classified as a Knowledge area for HSE Manager.',
      '',
      '',
      '',
      '',
      '',
      'True',
      '',
      'Easy',
      1,
      'TRUE',
    ],
  ];
  for (const r of sampleRows) qSheet.addRow(r);

  const MAX_DATA_ROW = 500;
  for (let r = 2; r <= MAX_DATA_ROW; r++) {
    qSheet.getCell(`A${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['=CompetencyList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Competency',
      error: 'Select "HSE Advisor" or "HSE Manager" from the list — free text is not accepted.',
    };
    qSheet.getCell(`B${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['=CompetencyTypeList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Competency Type',
      error: 'Leave blank to auto-derive from Competency + Element, or select Knowledge/Skill exactly.',
    };
    qSheet.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['=ElementList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Element',
      error: 'Select one of the 22 approved elements from the list.',
    };
    qSheet.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['=QuestionTypeList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Question Type',
      error: 'Select Single Choice, Multiple Choice, True/False, or Scenario.',
    };
    qSheet.getCell(`N${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['=DifficultyList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Difficulty',
      error: 'Select Easy, Medium, or Hard.',
    };
    qSheet.getCell(`P${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['=ActiveList'],
      showErrorMessage: true,
      errorTitle: 'Invalid Active value',
      error: 'Select TRUE or FALSE.',
    };
  }

  // -------------------------------------------------------------------
  // Sheet 2: Instructions
  // -------------------------------------------------------------------
  const instr = workbook.addWorksheet('Instructions');
  instr.columns = [{ width: 100 }];
  const lines = [
    'HSE Question Bank — Bulk Upload Template',
    '',
    'How to use this workbook:',
    '1. Fill in the "Questions" sheet — one row per question. Do not change the column headers.',
    '2. Competency must be an EXACT match: "HSE Advisor" or "HSE Manager" (pick from the dropdown). Variants like "Advisor", "Adviser", "Manager", "Safety Manager" are rejected.',
    '3. Element must be one of the 22 approved elements (pick from the dropdown). Minor spelling/formatting differences are tolerated on upload, but the dropdown avoids the issue entirely.',
    '4. Competency Type is optional — leave it blank and the system will automatically classify the question as Knowledge or Skill based on the Competency + Element combination (see the mapping sheets). If you do fill it in, it must match the master mapping exactly, or the row will be rejected with the expected value shown.',
    '5. IMPORTANT: the same Element can be Knowledge under one Competency and Skill under the other (e.g. "Leadership and Commitment" is Knowledge for HSE Advisor but Skill for HSE Manager). Never assume an Element\'s type without checking the Competency it belongs to — see the "HSE Advisor Mapping" and "HSE Manager Mapping" sheets.',
    '6. Question Type: Single Choice (one correct answer), Multiple Choice (multiple correct answers, e.g. "A,B,C" in Correct Answer), True/False (only Correct Answer = True or False is needed — options are generated automatically), or Scenario (a scenario-based question — fill in a realistic scenario as part of the Question text).',
    '7. Correct Answer: for Single/Multiple Choice, use the option letter(s) matching your filled Option columns (e.g. "B" or "A,C"). For True/False, use "True" or "False".',
    '8. Marks defaults to 1 if left blank. Difficulty and Active are optional (Active defaults to TRUE).',
    '9. Nothing is imported until you upload the file and confirm the preview — every row is validated first, and you will see exactly which rows are valid, which have errors, and which are duplicates before anything is saved.',
    '10. Duplicate detection compares Competency + Element + question text — the same wording used for a different Element, or under the other Competency, is not treated as a duplicate.',
    '',
    'See the "HSE Advisor Mapping" and "HSE Manager Mapping" sheets for the full Element -> Competency Type reference, and "Reference Data" for the exact accepted values.',
  ];
  lines.forEach((line, i) => {
    const row = instr.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
    else if (line.endsWith(':') || /^\d+\./.test(line)) row.font = { bold: /^[A-Z]/.test(line) && line.endsWith(':') };
    row.alignment = { wrapText: true, vertical: 'top' };
  });

  // -------------------------------------------------------------------
  // Sheets 3 & 4: per-competency Element -> Competency Type mapping.
  // -------------------------------------------------------------------
  function addMappingSheet(name: string, rows: { code: string; area_name: string; competency_type: string }[]) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: 'Code', key: 'code', width: 10 },
      { header: 'Element', key: 'element', width: 55 },
      { header: 'Competency Type', key: 'type', width: 20 },
    ];
    styleHeaderRow(sheet.getRow(1));
    for (const r of rows) {
      sheet.addRow({
        code: r.code,
        element: r.area_name,
        type: r.competency_type === 'skill' ? 'Skill' : 'Knowledge',
      });
    }
  }
  addMappingSheet('HSE Advisor Mapping', advisorAreas);
  addMappingSheet('HSE Manager Mapping', managerAreas);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hse_question_bank_template.xlsx"',
    },
  });
}
