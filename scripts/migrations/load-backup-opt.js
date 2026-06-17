#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

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

const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 60000 });

async function loadCSVFast(filename, tableName, columns, defaults = {}) {
  try {
    const filePath = path.join(process.cwd(), filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    if (records.length === 0) {
      console.log(`  ⚠ ${filename}: brak danych`);
      return;
    }

    let inserted = 0;
    const batchSize = 1000;

    // Ładuj w batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, Math.min(i + batchSize, records.length));
      const values = [];
      let paramIndex = 1;

      const valueClauses = batch.map(record => {
        const rowVals = columns.map(col => {
          const val = record[col] !== undefined ? record[col] : defaults[col];
          if (val === '' || val === null || val === undefined) return null;
          if (val === 'true') return true;
          if (val === 'false') return false;
          if (!isNaN(val) && val !== '') return Number(val);
          return val;
        });
        values.push(...rowVals);

        const placeholders = rowVals.map(() => `$${paramIndex++}`).join(',');
        return `(${placeholders})`;
      }).join(',');

      const query = `INSERT INTO ${tableName}(${columns.join(',')}) VALUES ${valueClauses} ON CONFLICT (id) DO NOTHING`;

      try {
        const result = await client.query(query, values);
        inserted += result.rowCount || 0;
        process.stdout.write(`.`);
      } catch (err) {
        console.error(`\n    ✗ Błąd batch-u: ${err.message}`);
      }
    }

    console.log(`\n  ✓ ${filename}: ${inserted}/${records.length} wierszy załadowanych`);
  } catch (err) {
    console.error(`  ✗ ${filename}:`, err.message);
  }
}

async function main() {
  console.log('🔄 Ładowanie backupu produkcji (optimized)...\n');

  try {
    await client.connect();
    console.log('✓ Połączono z bazą\n');

    await loadCSVFast('suppliers.csv', 'suppliers', ['id', 'user_id', 'name', 'is_active', 'default_category', 'default_cost_center_id', 'tax_id'], { tax_id: null });
    await loadCSVFast('cost_centers.csv', 'cost_centers', ['id', 'user_id', 'name']);
    await loadCSVFast('products.csv', 'products', ['id', 'user_id', 'name', 'unit', 'category', 'subcategory', 'canonical_name', 'classification_confidence', 'needs_review']);
    await loadCSVFast('invoices.csv', 'invoices', ['id', 'user_id', 'supplier_id', 'invoice_number', 'invoice_date', 'total_amount', 'ksef_number', 'imported_at', 'excluded', 'payment_method', 'payment_due_date', 'is_paid', 'paid_at', 'cost_center_id', 'invoice_type', 'parent_invoice_id', 'corrected_invoice_number']);
    await loadCSVFast('invoice_items.csv', 'invoice_items', ['id', 'invoice_id', 'product_id', 'product_name', 'unit', 'quantity', 'unit_price', 'total_price']);
    await loadCSVFast('price_alerts.csv', 'price_alerts', ['id', 'user_id', 'product_id', 'threshold_percent', 'created_at']);
    await loadCSVFast('dishes.csv', 'dishes', ['id', 'user_id', 'name', 'base_recipe_cost', 'selling_price']);

    console.log('\n✅ Backup załadowany pomyślnie!');
  } catch (err) {
    console.error('❌ Błąd:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
