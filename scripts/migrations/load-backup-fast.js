#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { Client } from 'pg';
import { parse } from 'csv-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wczytaj .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valParts] = line.split('=');
    if (key && !process.env[key]) {
      process.env[key] = valParts.join('=');
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL nie jest ustawiona');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function loadCsvViaInsert(filename, tableName, columns, defaults = {}) {
  try {
    const filePath = path.join(process.cwd(), filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    return new Promise((resolve) => {
      const parser = parse({ columns: true, skip_empty_lines: true });
      let inserted = 0;
      let processed = 0;
      let batch = [];

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          processed++;
          const values = columns.map(col => {
            const val = record[col] !== undefined ? record[col] : defaults[col];
            if (val === '' || val === null || val === undefined) return null;
            if (val === 'true') return true;
            if (val === 'false') return false;
            if (!isNaN(val) && val !== '') return Number(val);
            return val;
          });

          batch.push(values);

          // Załaduj batch co 100 wierszy
          if (batch.length >= 100) {
            await insertBatch();
          }
        }
      });

      parser.on('error', (err) => {
        console.error(`  ✗ ${filename}:`, err.message);
        resolve();
      });

      parser.on('end', async () => {
        if (batch.length > 0) {
          await insertBatch();
        }
        console.log(`  ✓ ${filename}: ${inserted}/${processed} wierszy załadowanych`);
        resolve();
      });

      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
      const query = `INSERT INTO ${tableName}(${columns.join(',')}) VALUES(${placeholders}) ON CONFLICT (id) DO NOTHING`;

      async function insertBatch() {
        for (const values of batch) {
          try {
            await client.query(query, values);
            inserted++;
          } catch (err) {
            // Ignore
          }
        }
        batch = [];
      }

      fs.createReadStream(filePath).pipe(parser);
    });
  } catch (err) {
    console.error(`  ✗ ${filename}:`, err.message);
  }
}

async function main() {
  console.log('🔄 Ładowanie backupu produkcji (szybka wersja)...\n');

  try {
    await client.connect();
    console.log('✓ Połączono z bazą\n');

    await loadCsvViaInsert('suppliers.csv', 'suppliers', ['id', 'user_id', 'name', 'is_active', 'default_category', 'default_cost_center_id', 'tax_id'], { tax_id: null });
    await loadCsvViaInsert('cost_centers.csv', 'cost_centers', ['id', 'user_id', 'name']);
    await loadCsvViaInsert('products.csv', 'products', ['id', 'user_id', 'name', 'unit', 'category', 'subcategory', 'canonical_name', 'classification_confidence', 'needs_review']);
    await loadCsvViaInsert('invoices.csv', 'invoices', ['id', 'user_id', 'supplier_id', 'invoice_number', 'invoice_date', 'total_amount', 'ksef_number', 'imported_at', 'excluded', 'payment_method', 'payment_due_date', 'is_paid', 'paid_at', 'cost_center_id', 'invoice_type', 'parent_invoice_id', 'corrected_invoice_number']);
    await loadCsvViaInsert('invoice_items.csv', 'invoice_items', ['id', 'invoice_id', 'product_id', 'product_name', 'unit', 'quantity', 'unit_price', 'total_price']);
    await loadCsvViaInsert('price_alerts.csv', 'price_alerts', ['id', 'user_id', 'product_id', 'threshold_percent', 'created_at']);
    await loadCsvViaInsert('dishes.csv', 'dishes', ['id', 'user_id', 'name', 'base_recipe_cost', 'selling_price']);

    console.log('\n✅ Backup załadowany pomyślnie!');
  } catch (err) {
    console.error('❌ Błąd:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
