/**
 * Single shared normalization/matching logic for Competency, Element and
 * Competency Type text values -- used by BOTH the bulk-upload validator
 * (src/lib/import/validate-rows.ts) and anywhere else that needs to resolve
 * free-text spreadsheet/user input against the approved HSE taxonomy
 * (competencies.competency_name and competency_areas.area_name/competency_type).
 *
 * No framework imports here (must be safe to import from client components
 * too, e.g. the manual Add/Edit Question form) -- plain string functions only.
 *
 * Design intent (see migration 0018 and the bulk-upload spec):
 *  - Competency identity must be EXACT (after trivial whitespace/case
 *    normalization only) -- "Advisor", "HSE Adviser", "Safety Manager" etc.
 *    must never silently resolve to "HSE Advisor" / "HSE Manager".
 *  - Element identity may tolerate trivial spelling/formatting variance
 *    (extra spaces, "&" vs "and", British vs American "-ise/-ize" and
 *    "-our/-or" spelling, punctuation) but must NEVER silently map two
 *    genuinely different or ambiguous element names together.
 *  - Competency Type must always be validated against the (Competency +
 *    Element) -> Competency Type master mapping stored in
 *    competency_areas.competency_type -- never inferred from Element name
 *    alone.
 */

export type CompetencyTypeValue = 'knowledge' | 'skill';

/** Collapse whitespace and case only -- used for exact-identity fields like
 * Competency name/code, where we deliberately do NOT tolerate spelling
 * variance. */
export function normalizeExact(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Looser normalization for Element names: tolerates punctuation, "&" vs
 * "and", and the common British/American spelling differences seen in HSE
 * terminology (e.g. "Organisational" vs "Organizational"). Two element names
 * that normalize to the same string are treated as the same element. */
export function normalizeElement(text: string): string {
  let t = text.trim().toLowerCase();
  t = t.replace(/&/g, ' and ');
  // British -> American spelling normalization (both directions collapse to
  // the same "z"/"or" form so either spelling in the sheet or the database
  // matches).
  t = t.replace(/is(e|ed|ing|ation|ations)\b/g, (_m, suffix: string) => `iz${suffix}`);
  t = t.replace(/our\b/g, 'or');
  // Strip punctuation (commas, periods, hyphens, slashes, parens) to spaces.
  t = t.replace(/[.,/#!$%^*;:{}=\-_`~()]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Plain Levenshtein edit distance -- small inputs only (element names are
 * short phrases), no need for a fancier algorithm. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n]!;
}

export interface ElementCandidate {
  id: string;
  code: string;
  area_name: string;
  competency_type: CompetencyTypeValue;
}

export interface ElementMatchResult {
  match: ElementCandidate | null;
  /** True when a match was found only via fuzzy (edit-distance) matching,
   * not an exact normalized match -- callers may want to surface this so an
   * import preview can show "matched as X" rather than silently accepting it. */
  fuzzy: boolean;
}

/** A fuzzy match is only accepted when it is both close AND unambiguous:
 * the edit distance to the best candidate must be small relative to the
 * input's length, and clearly better than the distance to every other
 * candidate -- otherwise we'd risk silently mapping two different elements
 * together, which the spec explicitly forbids. */
export function matchElement(rawName: string, candidates: ElementCandidate[]): ElementMatchResult {
  const target = normalizeElement(rawName);
  if (!target) return { match: null, fuzzy: false };

  const exact = candidates.find((c) => normalizeElement(c.area_name) === target);
  if (exact) return { match: exact, fuzzy: false };

  const scored = candidates
    .map((c) => ({ c, dist: levenshtein(target, normalizeElement(c.area_name)) }))
    .sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  const secondBest = scored[1];
  if (!best) return { match: null, fuzzy: false };

  const maxAllowedDistance = Math.max(2, Math.floor(target.length * 0.12));
  const isCloseEnough = best.dist <= maxAllowedDistance;
  const isUnambiguous = !secondBest || secondBest.dist - best.dist >= 2;

  if (isCloseEnough && isUnambiguous) {
    return { match: best.c, fuzzy: true };
  }
  return { match: null, fuzzy: false };
}

/** Formats the exact rejection message the spec requires when a
 * Competency Type in the sheet contradicts the master mapping, e.g.:
 * "Row 12 – Invalid Competency Type. 'Leadership and Commitment' is
 * classified as 'Knowledge' for HSE Advisor." */
export function competencyTypeMismatchMessage(
  elementName: string,
  competencyName: string,
  expected: CompetencyTypeValue
): string {
  const label = expected === 'knowledge' ? 'Knowledge' : 'Skill';
  return `Invalid Competency Type. '${elementName}' is classified as '${label}' for ${competencyName}.`;
}
