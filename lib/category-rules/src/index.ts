export type { CategoryDef } from "./rules.js";
export { CATEGORY_DEFS, BUILTIN_CATEGORY_DEFS } from "./rules.js";
export { categorizeProduct, categoryHasStaticMatch } from "./categorize.js";
export { buildKeywordMatcher, type KeywordMatcher } from "./keyword-matcher.js";
export { foldDiacritics, normalizeForMatch } from "./text-normalize.js";
export { significantTokens } from "./tokenize.js";
