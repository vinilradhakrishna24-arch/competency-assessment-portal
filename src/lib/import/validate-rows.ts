import type { RawImportRow } from '@/lib/import/parse-file';

export type ImportQuestionType = 'single' | 'multiple' | 'true_false';

export interface ValidatedImportRow {
  rowNumber: number;
  errors: string[];
  preview: {
    competency_code: string;
    question_set_name: string;
    question_type: string;
    question_text: string;
    marks: number;
    options_preview: string;
    correct_preview: string;
  };
  /** Populated only when errors is empty — ready to send to the confirm step. */
  insert: null | {
    competency_id: string;
    question_set_id: string | null;
    question_type: ImportQuestionType;
    question_text: string;
    scenario_text: string;
    marks: number;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    explanation_admin_only: string;
    active: boolean;
    options: { option_key: string; option_text: string; is_correct: boolean }[];
  };
}

const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

const TYPE_ALIASES: Record<string, ImportQuestionType> = {
  single: 'single',
  singleanswer: 'single',
  singlechoice: 'single',
  multiple: 'multiple',
  multipleanswer: 'multiple',
  multiplechoice: 'multiple',
  multi: 'multiple',
  truefalse: 'true_false',
  tf: 'true_false',
};

function getField(values: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (values[key]) return values[key];
  }
  return '';
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseBool(text: string, fallback: boolean): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return fallback;
  return ['true', '1', 'yes', 'y', 'active'].includes(t);
}

export function questionDuplicateKey(competencyId: string, questionText: string): string {
  return `${competencyId}::${normalizeText(questionText)}`;
}

export function validateImportRows(
  rawRows: RawImportRow[],
  competencies: { id: string; code: string }[],
  questionSets: { id: string; competency_id: string; set_name: string }[],
  existingQuestionKeys: Set<string>
): ValidatedImportRow[] {
  const competencyByCode = new Map(competencies.map((c) => [c.code.trim().toLowerCase(), c]));
  const seenInFile = new Map<string, number>();

  return rawRows.map((row) => {
    const errors: string[] = [];
    const v = row.values;

    const competencyCodeRaw = getField(v, 'competencycode', 'competency', 'code');
    const questionSetName = getField(v, 'questionset', 'set', 'questionsetname');
    const questionTypeRaw = getField(v, 'questiontype', 'type');
    const questionText = getField(v, 'questiontext', 'question');
    const scenarioText = getField(v, 'scenariotext', 'scenario');
    const correctAnswerRaw = getField(v, 'correctanswer', 'correct', 'answer', 'correctoption', 'correctoptions');
    const marksRaw = getField(v, 'marks', 'mark');
    const difficultyRaw = getField(v, 'difficulty');
    const explanation = getField(v, 'explanationadminonly', 'explanation', 'adminexplanation', 'adminnote');
    const activeRaw = getField(v, 'active', 'status');

    // --- Competency ---------------------------------------------------
    let competency: { id: string; code: string } | undefined;
    if (!competencyCodeRaw) {
      errors.push('Missing competency code');
    } else {
      competency = competencyByCode.get(competencyCodeRaw.trim().toLowerCase());
      if (!competency) errors.push(`Invalid competency code "${competencyCodeRaw}"`);
    }

    // --- Question set (optional) ---------------------------------------
    let questionSetId: string | null = null;
    if (questionSetName && competency) {
      const match = questionSets.find(
        (s) =>
          s.competency_id === competency!.id &&
          s.set_name.trim().toLowerCase() === questionSetName.trim().toLowerCase()
      );
      if (!match) {
        errors.push(`Invalid question set "${questionSetName}" for competency ${competencyCodeRaw}`);
      } else {
        questionSetId = match.id;
      }
    }

    // --- Question type ---------------------------------------------------
    const typeKey = questionTypeRaw.trim().toLowerCase().replace(/[^a-z]/g, '');
    const questionType = TYPE_ALIASES[typeKey];
    if (!questionTypeRaw) {
      errors.push('Missing question type');
    } else if (!questionType) {
      errors.push(`Invalid question type "${questionTypeRaw}" (use Single, Multiple, or True/False)`);
    }

    // --- Question text ---------------------------------------------------
    if (!questionText) errors.push('Missing question text');

    // --- Options ---------------------------------------------------------
    let options: { key: string; text: string }[] = [];
    if (questionType === 'true_false') {
      options = [
        { key: 'A', text: 'True' },
        { key: 'B', text: 'False' },
      ];
    } else {
      for (const letter of OPTION_LETTERS) {
        const text = getField(v, `option${letter}`);
        if (text) options.push({ key: letter.toUpperCase(), text });
      }
      if (options.length < 2) errors.push('At least two answer options (Option A, Option B, …) are required');
    }

    // --- Marks -------------------------------------------------------
    let marks = 1;
    if (marksRaw) {
      const parsed = Number(marksRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.push(`Invalid marks value "${marksRaw}"`);
      } else {
        marks = parsed;
      }
    }

    // --- Difficulty ----------------------------------------------------
    let difficulty: 'easy' | 'medium' | 'hard' | null = null;
    if (difficultyRaw) {
      const d = difficultyRaw.trim().toLowerCase();
      if (d === 'easy' || d === 'medium' || d === 'hard') {
        difficulty = d;
      } else {
        errors.push(`Invalid difficulty "${difficultyRaw}" (use Easy, Medium, or Hard)`);
      }
    }

    // --- Correct answer(s) -----------------------------------------------
    const correctTokens = correctAnswerRaw
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let correctOptionKeys: string[] = [];
    if (!correctAnswerRaw) {
      errors.push('Missing correct answer');
    } else if (questionType === 'true_false') {
      const mapped = correctTokens.map((token) => {
        const lower = token.toLowerCase();
        if (lower === 'true' || lower === 'a') return 'A';
        if (lower === 'false' || lower === 'b') return 'B';
        return null;
      });
      if (correctTokens.length !== 1 || mapped.some((m) => !m)) {
        errors.push(`Correct answer "${correctAnswerRaw}" must be True or False`);
      } else {
        correctOptionKeys = mapped as string[];
      }
    } else if (options.length > 0) {
      const optionKeySet = new Set(options.map((o) => o.key));
      const mapped = correctTokens.map((k) => k.toUpperCase());
      const invalid = mapped.filter((k) => !optionKeySet.has(k));
      if (invalid.length > 0) {
        errors.push(`Correct answer references nonexistent option(s): ${invalid.join(', ')}`);
      } else {
        correctOptionKeys = mapped;
      }
      if (questionType === 'single' && mapped.length !== 1 && invalid.length === 0) {
        errors.push('Single-answer questions must have exactly one correct answer');
      }
      if (questionType === 'multiple' && mapped.length < 2 && invalid.length === 0) {
        errors.push('Multiple-answer questions must have at least two correct answers');
      }
    }

    // --- Duplicate detection (within file + against existing bank) -------
    if (competency && questionText) {
      const dupKey = questionDuplicateKey(competency.id, questionText);
      const firstRow = seenInFile.get(dupKey);
      if (firstRow) {
        errors.push(`Duplicate of row ${firstRow} in this file`);
      } else {
        seenInFile.set(dupKey, row.rowNumber);
        if (existingQuestionKeys.has(dupKey)) {
          errors.push('A question with this text already exists for this competency');
        }
      }
    }

    const active = parseBool(activeRaw, true);

    const insert =
      errors.length === 0 && competency && questionType
        ? {
            competency_id: competency.id,
            question_set_id: questionSetId,
            question_type: questionType,
            question_text: questionText.trim(),
            scenario_text: scenarioText.trim(),
            marks,
            difficulty,
            explanation_admin_only: explanation.trim(),
            active,
            options: options.map((o) => ({
              option_key: o.key,
              option_text: o.text,
              is_correct: correctOptionKeys.includes(o.key),
            })),
          }
        : null;

    return {
      rowNumber: row.rowNumber,
      errors,
      preview: {
        competency_code: competencyCodeRaw || '—',
        question_set_name: questionSetName || '—',
        question_type: questionType ?? (questionTypeRaw || '—'),
        question_text: questionText || '—',
        marks,
        options_preview: options.map((o) => `${o.key}: ${o.text}`).join('  |  '),
        correct_preview: correctOptionKeys.join(', ') || correctAnswerRaw || '—',
      },
      insert,
    };
  });
}
