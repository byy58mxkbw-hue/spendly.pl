/** Odmiana liczebników: plural(3, ["restauracja", "restauracje", "restauracji"]) → „restauracje”. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms[0];
  const d = abs % 10;
  const t = abs % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? forms[1] : forms[2];
}
