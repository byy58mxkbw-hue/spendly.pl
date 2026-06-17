import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const tables = [
  'suppliers',
  'products',
  'invoices',
  'invoice_items',
  'price_alerts',
  'dishes',
  'dish_ingredients',
  'ksef_config',
  'user_categories',
  'cost_centers',
  'product_corrections',
  'ai_cfo_sessions',
  'ai_insights',
];

const backupDir = 'C:/Users/nowys/Downloads';

async function loadTable(tableName) {
  const csvPath = path.join(backupDir, `${tableName}.csv`);
  if (!fs.existsSync(csvPath)) {
    console.log(`⏭️ ${tableName}.csv not found, skipping...`);
    return;
  }

  const csv = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  if (records.length === 0) {
    console.log(`⏭️ ${tableName} is empty`);
    return;
  }

  const columns = Object.keys(records[0]);
  const values = records.map(r => columns.map(c => r[c]));

  const placeholders = values.map((_, i) =>
    `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
  ).join(', ');

  const flatValues = values.flat();
  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;

  try {
    await pool.query(query, flatValues);
    console.log(`✅ Loaded ${records.length} rows into ${tableName}`);
  } catch (err) {
    console.error(`❌ Error loading ${tableName}:`, err.message);
  }
}

async function main() {
  try {
    console.log('🚀 Starting backup restore...\n');
    for (const table of tables) {
      await loadTable(table);
    }
    console.log('\n✅ Backup restore complete!');
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await pool.end();
  }
}

main();
