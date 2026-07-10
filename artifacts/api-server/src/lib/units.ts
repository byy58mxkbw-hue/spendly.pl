import { sql, type SQL } from "drizzle-orm";

/**
 * Normalizacja jednostki miary z pozycji faktury (free-text z XML KSeF, tag P_8A,
 * lub domyślne "szt" — patrz invoice-items.ts). Ten sam produkt bywa zapisany
 * w różnych wariantach tej samej jednostki ("kg"/"KG"/"kg."), więc bez normalizacji
 * porównania cen (zmiana %, alerty) mieszają jednostki i dają fałszywe skoki.
 */
export function normalizeUnit(u: string | null | undefined): string {
  if (!u) return "";
  const cleaned = u.toLowerCase().trim().replace(/\.+$/, "").replace(/\s+/g, "");

  const map: Record<string, string> = {
    kg: "kg",
    kilogram: "kg",
    kilogramy: "kg",
    g: "g",
    gram: "g",
    gramy: "g",
    szt: "szt",
    sztuk: "szt",
    sztuka: "szt",
    sztuki: "szt",
    l: "l",
    litr: "l",
    litry: "l",
    ml: "ml",
    mililitr: "ml",
    opak: "opak",
    op: "opak",
    opakowanie: "opak",
    opakowania: "opak",
  };

  return map[cleaned] ?? cleaned;
}

/**
 * Wersja SQL normalizeUnit() — do użycia w PARTITION BY / DISTINCT ON, żeby "poprzednia
 * cena" liczyła się tylko w obrębie tej samej jednostki. MUSI zwracać te same klucze
 * co normalizeUnit() dla tych samych wejść (mapowanie ręcznie zsynchronizowane — testy
 * w units.test.ts pokrywają obie strony na tych samych przykładach).
 */
export function normalizedUnitSql(unitColumn: SQL): SQL {
  const cleaned = sql`regexp_replace(lower(btrim(${unitColumn})), '\\.+$', '')`;
  return sql`(CASE ${cleaned}
    WHEN 'kg' THEN 'kg' WHEN 'kilogram' THEN 'kg' WHEN 'kilogramy' THEN 'kg'
    WHEN 'g' THEN 'g' WHEN 'gram' THEN 'g' WHEN 'gramy' THEN 'g'
    WHEN 'szt' THEN 'szt' WHEN 'sztuk' THEN 'szt' WHEN 'sztuka' THEN 'szt' WHEN 'sztuki' THEN 'szt'
    WHEN 'l' THEN 'l' WHEN 'litr' THEN 'l' WHEN 'litry' THEN 'l'
    WHEN 'ml' THEN 'ml' WHEN 'mililitr' THEN 'ml'
    WHEN 'opak' THEN 'opak' WHEN 'op' THEN 'opak' WHEN 'opakowanie' THEN 'opak' WHEN 'opakowania' THEN 'opak'
    ELSE ${cleaned}
  END)`;
}
