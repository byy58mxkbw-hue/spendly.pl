import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Jednorazowe/idempotentne czyszczenie encji HTML w nazwach zapisanych wcześniej
// (przed poprawką parsera). Rozwija &amp; &quot; &apos; &#39; &lt; &gt; w products.name,
// products.canonical_name i suppliers.name. Bezpieczne przy każdym boocie — po odkodowaniu
// wzorce znikają, więc kolejne uruchomienia nie łapią już tych wierszy.
const DECODE = (col: string) => sql.raw(
  `replace(replace(replace(replace(replace(replace(${col},'&#39;',''''),'&apos;',''''),'&quot;','"'),'&lt;','<'),'&gt;','>'),'&amp;','&')`,
);
const HAS_ENTITY = (col: string) =>
  `(${col} LIKE '%&amp;%' OR ${col} LIKE '%&quot;%' OR ${col} LIKE '%&apos;%' OR ${col} LIKE '%&#39;%' OR ${col} LIKE '%&lt;%' OR ${col} LIKE '%&gt;%')`;

export async function ensureDecodedNames(log: Logger): Promise<void> {
  try {
    await db.execute(sql`UPDATE products SET name = ${DECODE("name")} WHERE ${sql.raw(HAS_ENTITY("name"))}`);
    await db.execute(sql`UPDATE products SET canonical_name = ${DECODE("canonical_name")} WHERE canonical_name IS NOT NULL AND ${sql.raw(HAS_ENTITY("canonical_name"))}`);
    await db.execute(sql`UPDATE suppliers SET name = ${DECODE("name")} WHERE ${sql.raw(HAS_ENTITY("name"))}`);
    log.info("encje HTML w nazwach: odkodowane");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się odkodować encji w nazwach");
  }
}
