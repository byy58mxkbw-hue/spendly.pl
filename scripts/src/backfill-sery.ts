// Jednorazowa migracja Z8: przenieś produkty z kategorii "nabiał" do "sery",
// jeśli po nowych regułach słów kluczowych wychodzi "sery".
//
// URUCHAMIAJ RĘCZNIE i PO BACKUPIE BAZY:
//   pnpm --filter @workspace/scripts run backfill-sery
//
// Bezpieczeństwo:
// - NIE rusza produktów, które user ręcznie skorygował (product_corrections) — user > auto.
// - Zmienia tylko `category`; korekty użytkownika zawsze mają pierwszeństwo.
// - Domyślnie DRY-RUN (tylko liczy). Uruchom z `--apply`, żeby zapisać zmiany.
import { db, productsTable, productCorrectionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { categorizeProduct } from "../../artifacts/api-server/src/lib/categorize.ts";
import { normalizeProductName } from "../../artifacts/api-server/src/lib/categorize-ai.ts";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // Zbiór (userId::normalizedName) z ręcznymi korektami — tych nie ruszamy.
  const corrections = await db
    .select({ userId: productCorrectionsTable.userId, normalizedName: productCorrectionsTable.normalizedName })
    .from(productCorrectionsTable);
  const corrected = new Set(corrections.map((c) => `${c.userId}::${c.normalizedName}`));

  const products = await db
    .select({ id: productsTable.id, userId: productsTable.userId, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.category, "nabiał"));

  const toMove: number[] = [];
  let skippedByCorrection = 0;
  for (const p of products) {
    const norm = normalizeProductName(p.name);
    if (corrected.has(`${p.userId}::${norm}`)) {
      skippedByCorrection++;
      continue;
    }
    if (categorizeProduct(p.name) === "sery") toMove.push(p.id);
  }

  console.log(
    `Produkty w "nabiał": ${products.length}\n` +
      `Do przeniesienia → "sery": ${toMove.length}\n` +
      `Pominięte (ręczna korekta): ${skippedByCorrection}`,
  );

  if (!apply) {
    console.log('\nDRY-RUN. Uruchom z "--apply", żeby zapisać zmiany.');
    process.exit(0);
  }

  const BATCH = 500;
  for (let i = 0; i < toMove.length; i += BATCH) {
    const ids = toMove.slice(i, i + BATCH);
    await db.update(productsTable).set({ category: "sery" }).where(inArray(productsTable.id, ids));
  }
  console.log(`\nZapisano: ${toMove.length} produktów przeniesionych do "sery".`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
