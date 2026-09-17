import { describe, it, expect } from 'vitest';
import { validateImportRows, questionDuplicateKey, type ImportCompetency, type ImportCompetencyArea } from '@/lib/import/validate-rows';
import type { RawImportRow } from '@/lib/import/parse-file';

const COMPETENCIES: ImportCompetency[] = [
  { id: 'comp-loa', code: 'LOA', competency_name: 'Limitation of Access', stream: 'technical' },
  { id: 'comp-sft', code: 'SFT', competency_name: 'Sanction for Test', stream: 'technical' },
  { id: 'comp-ptw', code: 'PTW', competency_name: 'Permit to Work', stream: 'technical' },
  { id: 'comp-hse-adv', code: 'HSE_ADV', competency_name: 'HSE Advisor', stream: 'hse' },
  { id: 'comp-hse-mgr', code: 'HSE_MGR', competency_name: 'HSE Manager', stream: 'hse' },
];

const QUESTION_SETS = [
  { id: 'set-loa-a', competency_id: 'comp-loa', set_name: 'Set A' },
  { id: 'set-sft-a', competency_id: 'comp-sft', set_name: 'Set A' },
];

// A trimmed-down slice of the real 22-element master mapping (migration
// 0018), enough to exercise the Competency+Element -> Competency Type rules
// without repeating all 22 in every test.
const HSE_AREAS: ImportCompetencyArea[] = [
  { id: 'adv-a02', competency_id: 'comp-hse-adv', code: 'A02', area_name: 'HSE Management System', competency_type: 'knowledge' },
  { id: 'adv-a03', competency_id: 'comp-hse-adv', code: 'A03', area_name: 'Leadership and Commitment', competency_type: 'knowledge' },
  { id: 'adv-a05', competency_id: 'comp-hse-adv', code: 'A05', area_name: 'Organisational Roles, Responsibilities, Competence & Authorities', competency_type: 'knowledge' },
  { id: 'adv-a16', competency_id: 'comp-hse-adv', code: 'A16', area_name: 'Audit & Inspection', competency_type: 'skill' },
  { id: 'adv-a17', competency_id: 'comp-hse-adv', code: 'A17', area_name: 'Environmental Management', competency_type: 'knowledge' },
  { id: 'mgr-a02', competency_id: 'comp-hse-mgr', code: 'A02', area_name: 'HSE Management System', competency_type: 'skill' },
  { id: 'mgr-a03', competency_id: 'comp-hse-mgr', code: 'A03', area_name: 'Leadership and Commitment', competency_type: 'skill' },
  { id: 'mgr-a17', competency_id: 'comp-hse-mgr', code: 'A17', area_name: 'Environmental Management', competency_type: 'knowledge' },
];

function row(rowNumber: number, values: Record<string, string>): RawImportRow {
  return { rowNumber, values };
}

describe('validateImportRows', () => {
  it('accepts a valid single-answer question and produces an insert payload', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questionset: 'Set A',
        questiontype: 'single',
        questiontext: 'What is the minimum safe distance?',
        optiona: '1 metre',
        optionb: '3 metres',
        optionc: '5 metres',
        correctanswer: 'B',
        marks: '1',
        difficulty: 'medium',
      }),
    ];

    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());

    expect(result.errors).toEqual([]);
    expect(result.insert).not.toBeNull();
    expect(result.insert?.competency_id).toBe('comp-loa');
    expect(result.insert?.question_set_id).toBe('set-loa-a');
    expect(result.insert?.question_type).toBe('single');
    expect(result.insert?.options).toHaveLength(3);
    expect(result.insert?.options.filter((o) => o.is_correct)).toEqual([
      { option_key: 'B', option_text: '3 metres', is_correct: true },
    ]);
  });

  it('accepts a multiple-answer question with several correct options', () => {
    const rows = [
      row(2, {
        competencycode: 'SFT',
        questiontype: 'multiple',
        questiontext: 'Which are required before scaffold work?',
        optiona: 'Valid permit',
        optionb: 'Inspection tag',
        optionc: 'Verbal approval only',
        optiond: 'Toolbox talk',
        correctanswer: 'A;B;D',
        marks: '2',
      }),
    ];

    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());

    expect(result.errors).toEqual([]);
    expect(result.insert?.question_type).toBe('multiple');
    expect(result.insert?.options.filter((o) => o.is_correct).map((o) => o.option_key).sort()).toEqual([
      'A',
      'B',
      'D',
    ]);
  });

  it('accepts a true/false question and auto-generates True/False options regardless of Option A/B columns', () => {
    const rows = [
      row(2, {
        competencycode: 'PTW',
        questiontype: 'true_false',
        questiontext: 'A hot work permit is valid for more than one shift.',
        correctanswer: 'False',
        marks: '1',
      }),
    ];

    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());

    expect(result.errors).toEqual([]);
    expect(result.insert?.options).toEqual([
      { option_key: 'A', option_text: 'True', is_correct: false },
      { option_key: 'B', option_text: 'False', is_correct: true },
    ]);
  });

  it('flags a missing competency', () => {
    const rows = [row(2, { questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' })];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors).toContain('Missing Competency');
  });

  it('flags an invalid/unknown competency', () => {
    const rows = [
      row(2, {
        competencycode: 'XYZ',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('Invalid Competency'))).toBe(true);
  });

  it('rejects close-but-wrong Competency variants ("Advisor", "Safety Manager", "HSE-Manager", etc.)', () => {
    for (const variant of ['Advisor', 'Adviser', 'Safety Advisor', 'HSE Adviser', 'Manager', 'Safety Manager', 'HSE-Manager']) {
      const rows = [
        row(2, { competency: variant, element: 'HSE Management System', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      ];
      const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
      expect(result.insert, `"${variant}" should not resolve to a competency`).toBeNull();
      expect(result.errors.some((e) => e.includes('Invalid Competency'))).toBe(true);
    }
  });

  it('accepts "HSE Advisor" / "HSE Manager" by exact name and normalizes whitespace/case only', () => {
    const rows = [
      row(2, { competency: '  hse advisor  ', element: 'HSE Management System', questiontype: 'single', questiontext: 'Q1', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competency: 'HSE Manager', element: 'HSE Management System', questiontype: 'single', questiontext: 'Q2', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(results[0]!.insert?.competency_id).toBe('comp-hse-adv');
    expect(results[1]!.insert?.competency_id).toBe('comp-hse-mgr');
  });

  it('requires an Element for HSE competencies but not for technical ones', () => {
    const missingElement = validateImportRows(
      [row(2, { competency: 'HSE Advisor', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' })],
      COMPETENCIES,
      QUESTION_SETS,
      new Set(),
      HSE_AREAS
    )[0]!;
    expect(missingElement.insert).toBeNull();
    expect(missingElement.errors.some((e) => e.includes('Missing Element'))).toBe(true);

    const technicalNoElement = validateImportRows(
      [row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' })],
      COMPETENCIES,
      QUESTION_SETS,
      new Set()
    )[0]!;
    expect(technicalNoElement.errors).toEqual([]);
  });

  it('tolerates minor Element spelling/formatting differences (British/American spelling, "&" vs "and", punctuation)', () => {
    const rows = [
      row(2, {
        competency: 'HSE Advisor',
        element: 'Organizational Roles, Responsibilities, Competence and Authorities', // American spelling + "and"
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
      row(3, {
        competency: 'HSE Advisor',
        element: 'audit and inspection',
        questiontype: 'single',
        questiontext: 'Q2',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(results[0]!.errors).toEqual([]);
    expect(results[0]!.insert?.competency_area_id).toBe('adv-a05');
    expect(results[1]!.errors).toEqual([]);
    expect(results[1]!.insert?.competency_area_id).toBe('adv-a16');
  });

  it('rejects an Element that does not resolve to any of the approved elements', () => {
    const rows = [
      row(2, { competency: 'HSE Advisor', element: 'Completely Unrelated Topic', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('Invalid Element'))).toBe(true);
  });

  it('auto-derives Competency Type from Competency + Element when no Competency Type column is supplied', () => {
    const rows = [
      row(2, { competency: 'HSE Advisor', element: 'Leadership and Commitment', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competency: 'HSE Manager', element: 'Leadership and Commitment', questiontype: 'single', questiontext: 'Q2', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(results[0]!.preview.competency_type).toBe('knowledge'); // Advisor
    expect(results[1]!.preview.competency_type).toBe('skill'); // Manager -- same element name, different type
  });

  it('accepts a Competency Type column that matches the master mapping', () => {
    const rows = [
      row(2, {
        competency: 'HSE Manager',
        element: 'Leadership and Commitment',
        competencytype: 'Skill',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(result.errors).toEqual([]);
  });

  it('rejects a Competency Type column that contradicts the master mapping, with the required message format', () => {
    // HSE Advisor + Leadership and Commitment = Knowledge; sheet says Skill.
    const rows = [
      row(12, {
        competency: 'HSE Advisor',
        element: 'Leadership and Commitment',
        competencytype: 'Skill',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(result.insert).toBeNull();
    expect(result.errors).toContain(
      "Invalid Competency Type. 'Leadership and Commitment' is classified as 'Knowledge' for HSE Advisor."
    );
  });

  it('rejects HSE Manager + Environmental Management tagged as Skill (master mapping says Knowledge)', () => {
    const rows = [
      row(2, {
        competency: 'HSE Manager',
        element: 'Environmental Management',
        competencytype: 'Skill',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes("is classified as 'Knowledge' for HSE Manager"))).toBe(true);
  });

  it('flags an invalid question set for the given competency', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questionset: 'Nonexistent Set',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('Invalid Question Set'))).toBe(true);
  });

  it('flags an invalid question type', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'essay', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('Invalid Question Type'))).toBe(true);
  });

  it('treats "Scenario" question type as single-choice and requires Scenario Text', () => {
    const missingScenarioText = validateImportRows(
      [row(2, { competencycode: 'LOA', questiontype: 'scenario', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' })],
      COMPETENCIES,
      QUESTION_SETS,
      new Set()
    )[0]!;
    expect(missingScenarioText.insert).toBeNull();
    expect(missingScenarioText.errors.some((e) => e.includes('Scenario Text'))).toBe(true);

    const ok = validateImportRows(
      [
        row(2, {
          competencycode: 'LOA',
          questiontype: 'scenario',
          scenariotext: 'You arrive on site and notice...',
          questiontext: 'What should you do first?',
          optiona: 'A',
          optionb: 'B',
          correctanswer: 'A',
        }),
      ],
      COMPETENCIES,
      QUESTION_SETS,
      new Set()
    )[0]!;
    expect(ok.errors).toEqual([]);
    expect(ok.insert?.question_type).toBe('single');
  });

  it('flags a missing question text', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors).toContain('Missing Question text');
  });

  it('flags fewer than two answer options for a single/multiple question', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q', optiona: 'Only one', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors.some((e) => e.includes('At least two answer options'))).toBe(true);
  });

  it('flags a missing correct answer', () => {
    const rows = [row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B' })];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors).toContain('Missing Correct Answer');
  });

  it('flags a correct answer that references a nonexistent option', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A text',
        optionb: 'B text',
        correctanswer: 'Z',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('nonexistent option'))).toBe(true);
  });

  it('flags a single-answer question with more than one correct answer marked', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A text',
        optionb: 'B text',
        correctanswer: 'A,B',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors.some((e) => e.includes('exactly one correct answer'))).toBe(true);
  });

  it('flags a multiple-answer question with fewer than two correct answers', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questiontype: 'multiple',
        questiontext: 'Q',
        optiona: 'A text',
        optionb: 'B text',
        correctanswer: 'A',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors.some((e) => e.includes('at least two correct answers'))).toBe(true);
  });

  it('flags duplicate questions within the same file (same competency + element + normalized text)', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'What is the limit?', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competencycode: 'LOA', questiontype: 'single', questiontext: '  what IS the limit?  ', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(results[0]!.errors).toEqual([]);
    expect(results[0]!.isDuplicate).toBe(false);
    expect(results[1]!.errors.some((e) => e.includes('Duplicate of row 2'))).toBe(true);
    expect(results[1]!.isDuplicate).toBe(true);
  });

  it('does not flag the same question text as a duplicate under a different Element of the same competency', () => {
    const rows = [
      row(2, { competency: 'HSE Advisor', element: 'Leadership and Commitment', questiontype: 'single', questiontext: 'Shared wording', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competency: 'HSE Advisor', element: 'HSE Management System', questiontype: 'single', questiontext: 'Shared wording', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set(), HSE_AREAS);
    expect(results[0]!.errors).toEqual([]);
    expect(results[1]!.errors).toEqual([]);
  });

  it('flags a question that already exists in the question bank for that competency/element', () => {
    const existingKey = questionDuplicateKey('comp-loa', null, 'Already in the bank');
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Already in the bank', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set([existingKey]));
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('already exists'))).toBe(true);
  });

  it('does not flag the same question text as a duplicate across different competencies', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Shared wording', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competencycode: 'SFT', questiontype: 'single', questiontext: 'Shared wording', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(results[0]!.errors).toEqual([]);
    expect(results[1]!.errors.some((e) => e.includes('Duplicate of row 2'))).toBe(false);
  });

  it('defaults marks to 1 when omitted, but rejects a non-positive marks value', () => {
    const validRows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [okResult] = validateImportRows(validRows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(okResult.insert?.marks).toBe(1);

    const badRows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A', marks: '0' }),
    ];
    const [badResult] = validateImportRows(badRows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(badResult.errors.some((e) => e.includes('Invalid Marks value'))).toBe(true);
  });

  it('rejects an invalid difficulty value while accepting valid ones', () => {
    const rows = [
      row(2, {
        competencycode: 'LOA',
        questiontype: 'single',
        questiontext: 'Q',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
        difficulty: 'extreme',
      }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors.some((e) => e.includes('Invalid Difficulty'))).toBe(true);
  });

  it('defaults active to true, and honors an explicit FALSE', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'Q1', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, {
        competencycode: 'LOA',
        questiontype: 'single',
        questiontext: 'Q2',
        optiona: 'A',
        optionb: 'B',
        correctanswer: 'A',
        active: 'FALSE',
      }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(results[0]!.insert?.active).toBe(true);
    expect(results[1]!.insert?.active).toBe(false);
  });
});
