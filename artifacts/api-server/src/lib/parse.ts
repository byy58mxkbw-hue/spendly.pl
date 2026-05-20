/**
 * Safely convert a DB-returned value (numeric columns come back as strings
 * from pg/drizzle) to a JavaScript number.
 */
export function toNum(value: unknown): number {
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const n = parseFloat(String(value ?? ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Same as toNum but preserves null/undefined rather than converting to 0.
 */
export function toNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}
