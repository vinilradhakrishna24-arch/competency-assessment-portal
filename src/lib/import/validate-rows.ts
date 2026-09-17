import type { RawImportRow } from '@/lib/import/parse-file';
import {
  normalizeExact,
  matchElement,
  competencyTypeMismatchMessage,
  type ElementCandidate,
  type CompetencyTypeValue,
} from '@/lib/taxonomy/element-match';

export type ImportQuestionType = 'single' | 'multiple' | 'true_false';

export interface ValidatedImportRow {
  rowNumber: number;
  errors: string[];
  /** True when this row's errors list is exactly a duplicate finding (either
   * within the file or against the existing bank) -- lets the UI surface a
   * distinct "Duplicates" count separately from other validation errors. */
  isDuplicate: boolean;
  preview: {
    competency_code: string;
    competency_name: string;
    question_set_name: string;
    /** Element (competency_areas.area_name), HSE only. */
    element_name: string;
    /** Knowledge/Skill for HSE rows -- derived from the element unless the
     * sheet supplied its own Competency Type column, in which case this is
     * whichever was ultimately accepted (always the master-mapping value;
     * a mismatched sheet value is rejected as an error, never silently used). */
    competency_type: CompetencyTypeValue | null;
    question_type: string;
    question_text: string;
    marks: number;
    options_preview: string;
    correct_preview: string;
  };
  /** Populated only when errors is empty — ready to send to the confirm step. */
  insert: null | {
    competency_id: string;
    competency_area_id: string | null;
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
  // "Scenario" is not a distinct storage type -- it's a single- or
  // multiple-choice question presented with scenario context (scenario_text).
  // Default an unqualified "Scenario" to single-answer; a row explicitly
  // requesting multiple correct answers should say "Scenario Multiple".
  scenario: 'single',
  scenariosingle: 'single',
  scenariosinglechoice: 'single',
  scenariomcq: 'single',
  scenariomultiple: 'multiple',
  scenariomultiplechoice: 'multiple',
};

function getField(values: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (values[key]) return values[key];
  }
  return '';
}

function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseBool(text: string, fallback: boolean): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return fallback;
  return ['true', '1', 'yes', 'y', 'active'].includes(t);
}

/** Duplicate key now includes the Element (competency_area_id), per spec:
 * the same question text under the same competency but a DIFFERENT element
 * is not automatically a duplicate, and identical text under a different
 * competency entirely is never a duplicate. `null` area is used as-is for
 * technical competencies (which never have elements), preserving the
 * original competency-only behavior for them. */
export function questionDuplicateKey(competencyId: string, competencyAreaId: string | null, questionText: string): string {
  return `${competencyId}::${competencyAreaId ?? ''}::${normalizeQuestionText(questionText)}`;
}

export interface ImportCompetency {
  id: string;
  code: string;
  competency_name: string;
  stream: string;
}

export type ImportCompetencyArea = ElementCandidate & { competency_id: string };

export function validateImportRows(
  rawRows: RawImportRow[],
  competencies: ImportCompetency[],
  questionSets: { id: string; competency_id: string; set_name: string }[],
  existingQuestionKeys: Set<string>,
  competencyAreas: ImportCompetencyArea[] = []
): ValidatedImportRow[] {
  const seenInFile = new Map<string, number>();

  // Competency identity is intentionally strict: exact match (whitespace/case
  // normalized only) against either the competency's code OR its full name.
  // "Advisor", "HSE Adviser", "Safety Manager", "HSE-Manager" etc. must never
  // resolve -- they simply won't equal either stored value.
  const competencyByExact = new Map<string, ImportCompetency>();
  for (const c of competencies) {
    competencyByExact.set(normalizeExact(c.code), c);
    competencyByExact.set(normalizeExact(c.competency_name), c);
  }

  return rawRows.map((row) => {
    const errors: string[] = [];
    let isDuplicate = false;
    const v = row.values;

    const competencyRaw = getField(v, 'competency', 'competencycode', 'competencyname', 'code');
    const questionSetName = getField(v, 'questionset', 'set', 'questionsetname');
    const elementRaw = getField(v, 'element', 'competencyarea', 'area', 'competencyareacode', 'areacode');
    const competencyTypeRaw = getField(v, 'competencytype');
    const questionTypeRaw = getField(v, 'questiontype', 'type');
    const questionText = getField(v, 'questiontext', 'question');
    const scenarioText = getField(v, 'scenariotext', 'scenario');
    const correctAnswerRaw = getField(v, 'correctanswer', 'correct', 'answer', 'correctoption', 'correctoptions');
    const marksRaw = getField(v, 'marks', 'mark');
    const difficultyRaw = getField(v, 'difficulty');
    const explanation = getField(v, 'explanationadminonly', 'explanation', 'adminexplanation', 'adminnote');
    const activeRaw = getField(v, 'active', 'status');

    // --- Competency ---------------------------------------------------
    let competency: ImportCompetency | undefined;
    if (!competencyRaw) {
      errors.push('Missing Competency');
    } else {
      competency = competencyByExact.get(normalizeExact(competencyRaw));
      if (!competency) {
        errors.push(
          `Invalid Competency "${competencyRaw}". Must be an exact match for an existing competency name or code (e.g. "HSE Advisor", "HSE Manager") — close variants are not accepted.`
        );
      }
    }
    const isHse = competency?.stream === 'hse';

    // --- Question set (optional) ---------------------------------------
    let questionSetId: string | null = null;
    if (questionSetName && competency) {
      const match = questionSets.find(
        (s) => s.competency_id === competency!.id && normalizeExact(s.set_name) === normalizeExact(questionSetName)
      );
      if (!match) {
        errors.push(`Invalid Question Set "${questionSetName}" for competency ${competency.competency_name}`);
      } else {
        questionSetId = match.id;
      }
    }

    // --- Element (required for HSE competencies, ignored otherwise) -----
    let competencyAreaId: string | null = null;
    let elementName = '';
    let derivedType: CompetencyTypeValue | null = null;
    if (competency) {
      const areasForCompetency = competencyAreas.filter((a) => a.competency_id === competency!.id);
      if (isHse) {
        if (!elementRaw) {
          errors.push(`Missing Element — required for ${competency.competency_name}`);
        } else {
          const { match } = matchElement(elementRaw, areasForCompetency);
          if (!match) {
            errors.push(
              `Invalid Element "${elementRaw}" for ${competency.competency_name}. Must match one of the 22 approved elements (minor spelling/formatting differences are tolerated, but this does not resolve to any of them).`
            );
          } else {
            competencyAreaId = match.id;
            elementName = match.area_name;
            derivedType = match.competency_type;
          }
        }
      } else if (elementRaw) {
        // Technical competencies have no elements at all -- if a sheet still
        // fills this in, don't silently drop it without telling the uploader.
        errors.push(`"${competency.competency_name}" does not use Elements — leave this column blank for this competency.`);
      }
    }

    // --- Competency Type (optional column; validated, never inferred alone) --
    let competencyType: CompetencyTypeValue | null = derivedType;
    if (competencyTypeRaw) {
      const t = normalizeExact(competencyTypeRaw);
      const asType: CompetencyTypeValue | null = t === 'knowledge' ? 'knowledge' : t === 'skill' ? 'skill' : null;
      if (!asType) {
        errors.push(`Invalid Competency Type "${competencyTypeRaw}" (use Knowledge or Skill)`);
      } else if (derivedType && asType !== derivedType && competency) {
        errors.push(competencyTypeMismatchMessage(elementName || elementRaw, competency.competency_name, derivedType));
      } else if (!derivedType) {
        // Element itself failed to resolve -- already errored above; nothing
        // further to check against a mapping we don't have.
      } else {
        competencyType = asType;
      }
    }

    // --- Question type ---------------------------------------------------
    const typeKey = questionTypeRaw.trim().toLowerCase().replace(/[^a-z]/g, '');
    const questionType = TYPE_ALIASES[typeKey];
    if (!questionTypeRaw) {
      errors.push('Missing Question Type');
    } else if (!questionType) {
      errors.push(`Invalid Question Type "${questionTypeRaw}" (use Single Choice, Multiple Choice, True/False, or Scenario)`);
    } else if (typeKey.includes('scenario') && !scenarioText.trim()) {
      errors.push('Scenario questions must include Scenario Text');
    }

    // --- Question text ---------------------------------------------------
    if (!questionText) errors.push('Missing Question text');

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
        errors.push(`Invalid Marks value "${marksRaw}"`);
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
        errors.push(`Invalid Difficulty "${difficultyRaw}" (use Easy, Medium, or Hard)`);
      }
    }

    // --- Correct answer(s) -----------------------------------------------
    const correctTokens = correctAnswerRaw
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let correctOptionKeys: string[] = [];
    if (!correctAnswerRaw) {
      errors.push('Missing Correct Answer');
    } else if (questionType === 'true_false') {
      const mapped = correctTokens.map((token) => {
        const lower = token.toLowerCase();
        if (lower === 'true' || lower === 'a') return 'A';
        if (lower === 'false' || lower === 'b') return 'B';
        return null;
      });
      if (correctTokens.length !== 1 || mapped.some((m) => !m)) {
        errors.push(`Correct Answer "${correctAnswerRaw}" must be True or False`);
      } else {
        correctOptionKeys = mapped as string[];
      }
    } else if (options.length > 0) {
      const optionKeySet = new Set(options.map((o) => o.key));
      const mapped = correctTokens.map((k) => k.toUpperCase());
      const invalid = mapped.filter((k) => !optionKeySet.has(k));
      if (invalid.length > 0) {
        errors.push(`Correct Answer references nonexistent option(s): ${invalid.join(', ')}`);
      } else {
        correctOptionKeys = mapped;
      }
      if (questionType === 'single' && mapped.length !== 1 && invalid.length === 0) {
        errors.push('Single Choice questions must have exactly one correct answer');
      }
      if (questionType === 'multiple' && mapped.length < 2 && invalid.length === 0) {
        errors.push('Multiple Choice questions must have at least two correct answers');
      }
    }

    // --- Duplicate detection (within file + against existing bank) -------
    // Key = competency + element + normalized question text: identical text
    // under a different competency, or under the same competency but a
    // different element, is not automatically flagged.
    if (competency && questionText) {
      const dupKey = questionDuplicateKey(competency.id, competencyAreaId, questionText);
      const firstRow = seenInFile.get(dupKey);
      if (firstRow) {
        errors.push(`Duplicate of row ${firstRow} in this file`);
        isDuplicate = true;
      } else {
        seenInFile.set(dupKey, row.rowNumber);
        if (existingQuestionKeys.has(dupKey)) {
          errors.push('A question with this text already exists for this competency/element');
          isDuplicate = true;
        }
      }
    }

    const active = parseBool(activeRaw, true);

    const insert =
      errors.length === 0 && competency && questionType
        ? {
            competency_id: competency.id,
            competency_area_id: competencyAreaId,
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
      isDuplicate,
      preview: {
        competency_code: competency?.code ?? competencyRaw ?? '—',
        competency_name: competency?.competency_name ?? competencyRaw ?? '—',
        question_set_name: questionSetName || '—',
        element_name: elementName || (elementRaw ? elementRaw : '—'),
        competency_type: competencyType,
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
