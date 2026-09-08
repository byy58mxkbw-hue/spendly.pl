import { CATEGORY_DEFS } from "./rules.js";
import { buildKeywordMatcher, type KeywordMatcher } from "./keyword-matcher.js";
import { normalizeForMatch } from "./text-normalize.js";

// Prekompilacja raz przy starcie (categorizeProduct bywa w gorących pętlach importu).
const COMPILED_RULES: Array<{ id: string; matchers: KeywordMatcher[] }> = CATEGORY_DEFS.map(
  (rule) => ({ id: rule.id, matchers: rule.keywords.map(buildKeywordMatcher) }),
);

/**
 * Fast keyword-based categorization (synchronous).
 * Returns a built-in category ID or "inne" if nothing matched.
 */
export function categorizeProduct(name: string): string {
  const normalized = normalizeForMatch(name);
  for (const rule of COMPILED_RULES) {
    if (rule.matchers.some((m) => m(normalized))) {
      return rule.id;
    }
  }
  return "inne";
}

/** Czy dana kategoria jest budowana z konkretnego tokenu przez statyczny keyword matcher. */
export function categoryHasStaticMatch(token: string): boolean {
  return categorizeProduct(token) !== "inne";
}
