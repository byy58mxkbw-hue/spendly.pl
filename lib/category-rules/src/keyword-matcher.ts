import { foldDiacritics } from "./text-normalize.js";

// Z5 — twardsze dopasowanie słów kluczowych.
// - Frazy wieloczłonowe (spacja W ŚRODKU, np. "grana padano") → zostają na includes,
//   fraza sama w sobie jest wystarczająco specyficzna.
// - Pojedyncze słowa → dopasowanie po GRANICY SŁOWA: start łańcucha lub poprzedzone
//   nie-literą. Dzięki temu „por" nie łapie „imPORt", a „sum" nie łapie „konSUMpcyjny".
//   Granica tylko z przodu (nie z tyłu) — żeby „por" dalej łapało „pory"/„pora".
// - Pojedyncze słowo z KOŃCOWĄ spacją (np. "ser ") — to była (przed naprawą) pułapka:
//   trafiało do gałęzi "fraza" (bo zawiera spację) i leciało na gołym includes, więc
//   „ser " łapało się jako podciąg w środku dłuższego słowa („koneSER go", „deSER").
//   Traktujemy to jak pojedyncze słowo z granicą po OBU stronach.
//
// Klasa znaków słowa to już tylko a-z0-9 — wejście (nazwa produktu i słowa kluczowe)
// przechodzi przez foldDiacritics() PRZED dopasowaniem (patrz normalizeForMatch),
// więc nie trzeba tu polskich liter w regexie.
const KW_WORD_CHARS = "a-z0-9";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type KeywordMatcher = (normalized: string) => boolean;

/**
 * Skompiluj słowo kluczowe (może zawierać polskie znaki, piszemy je czytelnie
 * w listach źródłowych) w matcher testowany na już znormalizowanym (fold+lowercase)
 * wejściu.
 */
export function buildKeywordMatcher(rawKeyword: string): KeywordMatcher {
  const k = foldDiacritics(rawKeyword.toLowerCase());
  const trimmed = k.trimEnd();
  if (trimmed.includes(" ")) return (n) => n.includes(k);
  const needsRightBoundary = k.endsWith(" ");
  const rightBoundary = needsRightBoundary ? "(?=[^" + KW_WORD_CHARS + "]|$)" : "";
  const re = new RegExp("(^|[^" + KW_WORD_CHARS + "])" + escapeRegex(trimmed) + rightBoundary);
  return (n) => re.test(n);
}
