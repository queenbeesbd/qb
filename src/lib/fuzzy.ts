/**
 * Fuzzy text matching for the two search boxes the shop has (storefront and admin).
 *
 * **No dependency.** A search library would be a new runtime dependency for one ranking function, and
 * the matching the shop actually needs is small: a typed word should find a product by its start, by
 * any word's start, by any substring, by letters in order, or by a one-letter typo. That is what this
 * module does, in one place, so the storefront listing and the owner's product list cannot drift into
 * two different definitions of "matches".
 *
 * The storefront's *scope* is unchanged (name, brand and pack only - ADR 0011); this changes how a
 * term is compared, not what may be searched.
 *
 * Scores are ranks, not probabilities: 1000 is an exact field, 300 is a tolerated typo. A caller that
 * needs an order sorts on the score with name and id as tie-breakers, so the same query always yields
 * the same list.
 */

import { normaliseForSearch } from './format';

/** What a match is worth. Higher is better; the bands are ordered on purpose. */
const SCORE = {
  exact: 1000,
  prefix: 850,
  wordPrefix: 750,
  substring: 600,
  subsequence: 450,
  typo: 300,
} as const;

/**
 * Below this length a term is only compared as a prefix or a substring. A two-letter needle matched as
 * a subsequence or a typo would match nearly every name, which is noise rather than recall.
 */
const MIN_FUZZY_TOKEN = 3;

/** A typo is forgiven only for a term long enough that one wrong character is still a guess at a word. */
const MIN_TYPO_TOKEN = 4;

/** The words of a normalised string, split on anything that is not a letter or a digit. */
const WORD_BREAK = /[^\p{L}\p{N}]+/u;

function words(haystack: string): string[] {
  return haystack.split(WORD_BREAK).filter((word) => word.length > 0);
}

/** The first index where `token` starts a word ("serum" in "lilac serum 30ml"). */
function wordStartIndex(haystack: string, token: string): number | null {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(token, from);
    if (at === -1) return null;
    if (at === 0) return 0;
    const before = haystack[at - 1] ?? '';
    if (WORD_BREAK.test(before)) return at;
    from = at + 1;
  }
}

/** The token's letters appear in order, not necessarily together. Gaps cost rank. */
function subsequenceScore(haystack: string, token: string): number | null {
  let from = 0;
  let gaps = 0;
  let previous = -1;
  for (const character of token) {
    const found = haystack.indexOf(character, from);
    if (found === -1) return null;
    if (previous !== -1) gaps += found - previous - 1;
    previous = found;
    from = found + 1;
  }
  return SCORE.subsequence - Math.min(149, gaps);
}

/** Optimal-string-alignment distance of at most one: a substitution, an insertion or a swap. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const lengthA = a.length;
  const lengthB = b.length;
  if (Math.abs(lengthA - lengthB) > 1) return false;

  if (lengthA === lengthB) {
    const mismatches: number[] = [];
    for (let index = 0; index < lengthA; index += 1) {
      if (a[index] !== b[index]) mismatches.push(index);
    }
    if (mismatches.length === 1) return true;
    const first = mismatches[0];
    const second = mismatches[1];
    if (first !== undefined && second !== undefined && second === first + 1) {
      return a[first] === b[second] && a[second] === b[first];
    }
    return false;
  }

  const shorter = lengthA < lengthB ? a : b;
  const longer = lengthA < lengthB ? b : a;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = 0;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    skipped += 1;
    if (skipped > 1) return false;
    longIndex += 1;
  }
  return true;
}

function typoMatch(haystack: string, token: string): boolean {
  for (const word of words(haystack)) {
    if (Math.abs(word.length - token.length) > 1) continue;
    if (withinOneEdit(word, token)) return true;
  }
  return false;
}

/** One token against one normalised field. `null` means no match at all. */
function tokenScore(haystack: string, token: string): number | null {
  if (haystack === token) return SCORE.exact;
  if (haystack.startsWith(token)) return SCORE.prefix - Math.min(99, haystack.length - token.length);

  const atWord = wordStartIndex(haystack, token);
  if (atWord !== null) return SCORE.wordPrefix - Math.min(99, atWord);

  const at = haystack.indexOf(token);
  if (at !== -1) return SCORE.substring - Math.min(99, at);

  /*
   * "30ml" against a stored "30 ml": a shopper does not type the space, and the field's punctuation is
   * not part of the word. Compared only as a prefix/substring, so removing separators cannot turn a
   * short term into a loose match.
   */
  const compact = haystack.replace(WORD_BREAK, '');
  if (compact !== haystack && compact.includes(token)) return SCORE.substring - 50;

  /*
   * The loose matches are per **word**, never across the whole field. Matching letters in order over a
   * whole product name let "serun" match "innsaei Hyaluronic Sunscreen" by taking s and e from the
   * brand and r, u and n from two other words - a match a shopper would call wrong, outranking the
   * serum they meant. A subsequence inside one word ("srm" -> "serum") is still a plausible miss, and
   * a one-character difference inside one word is a plausible typo.
   */
  if (token.length >= MIN_FUZZY_TOKEN) {
    for (const word of words(haystack)) {
      const subsequence = subsequenceScore(word, token);
      if (subsequence !== null) return subsequence;
    }
    if (token.length >= MIN_TYPO_TOKEN && typoMatch(haystack, token)) return SCORE.typo;
  }
  return null;
}

/**
 * The score of a term against one field, or `null` when it does not match.
 *
 * A multi-word term is matched word by word: every word must match the field, and the scores are
 * added. "lilac serum" therefore does not match a product called only "Lilac".
 */
export function fuzzyScore(needle: string, haystack: string): number | null {
  const tokens = words(normaliseForSearch(needle));
  if (tokens.length === 0) return 0;
  const field = normaliseForSearch(haystack);
  if (field.length === 0) return null;

  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(field, token);
    if (score === null) return null;
    total += score;
  }
  return total;
}

/**
 * The score of a term against several fields, where each word of the term may land in a different
 * field - a shopper typing "lilac 30ml" should find the Lilac serum whose pack is 30 ml. The best field
 * per word wins, so a field that matches exactly is not dragged down by a weaker match elsewhere.
 */
export function fuzzyScoreAcross(
  needle: string,
  fields: readonly (string | null | undefined)[],
): number | null {
  const tokens = words(normaliseForSearch(needle));
  if (tokens.length === 0) return 0;

  const haystacks = fields
    .filter((field): field is string => typeof field === 'string' && field.trim().length > 0)
    .map(normaliseForSearch)
    .filter((field) => field.length > 0);
  if (haystacks.length === 0) return null;

  let total = 0;
  for (const token of tokens) {
    let best: number | null = null;
    for (const haystack of haystacks) {
      const score = tokenScore(haystack, token);
      if (score !== null && (best === null || score > best)) best = score;
    }
    if (best === null) return null;
    total += best;
  }
  return total;
}
