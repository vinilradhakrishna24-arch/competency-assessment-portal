import { describe, it, expect } from 'vitest';
import { validateImportRows, questionDuplicateKey } from '@/lib/import/validate-rows';
import type { RawImportRow } from '@/lib/import/parse-file';

const COMPETENCIES = [
  { id: 'comp-loa', code: 'LOA' },
  { id: 'comp-sft', code: 'SFT' },
  { id: 'comp-ptw', code: 'PTW' },
];

const QUESTION_SETS = [
  { id: 'set-loa-a', competency_id: 'comp-loa', set_name: 'Set A' },
  { id: 'set-sft-a', competency_id: 'comp-sft', set_name: 'Set A' },
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

  it('flags a missing competency code', () => {
    const rows = [row(2, { questiontype: 'single', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' })];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors).toContain('Missing competency code');
  });

  it('flags an invalid/unknown competency code', () => {
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
    expect(result.errors.some((e) => e.includes('Invalid competency code'))).toBe(true);
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
    expect(result.errors.some((e) => e.includes('Invalid question set'))).toBe(true);
  });

  it('flags an invalid question type', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'essay', questiontext: 'Q', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.insert).toBeNull();
    expect(result.errors.some((e) => e.includes('Invalid question type'))).toBe(true);
  });

  it('flags a missing question text', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const [result] = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(result.errors).toContain('Missing question text');
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
    expect(result.errors).toContain('Missing correct answer');
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

  it('flags duplicate questions within the same file (same competency + normalized text)', () => {
    const rows = [
      row(2, { competencycode: 'LOA', questiontype: 'single', questiontext: 'What is the limit?', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
      row(3, { competencycode: 'LOA', questiontype: 'single', questiontext: '  what IS the limit?  ', optiona: 'A', optionb: 'B', correctanswer: 'A' }),
    ];
    const results = validateImportRows(rows, COMPETENCIES, QUESTION_SETS, new Set());
    expect(results[0]!.errors).toEqual([]);
    expect(results[1]!.errors.some((e) => e.includes('Duplicate of row 2'))).toBe(true);
  });

  it('flags a question that already exists in the question bank for that competency', () => {
    const existingKey = questionDuplicateKey('comp-loa', 'Already in the bank');
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
    expect(results[1]!.errors.some((e) => e.includes('Duplicate of row 2'))).toBe(true);
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
    expect(badResult.errors.some((e) => e.includes('Invalid marks value'))).toBe(true);
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
    expect(result.errors.some((e) => e.includes('Invalid difficulty'))).toBe(true);
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
