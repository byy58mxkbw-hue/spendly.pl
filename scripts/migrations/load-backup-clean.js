#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valParts] = line.split('=');
    if (key && !process.env[key]) {
      process.env[key] = valParts.join('=').trim();
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL nie jest ustawiona');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 120000 });

async function loadCSVClean(filename, tableName, columns, defaults = {}) {
  try {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${filename}: plik nie istnieje`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    if (records.length === 0) {
      console.log(`  ⚠ ${filename}: brak danych`);
      return;
    }

    let inserted = 0;
    const batchSize = 1000;

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

      const query = `INSERT INTO ${tableName}(${columns.join(',')}) VALUES ${valueClauses}`;

      try {
        const result = await client.query(query, values);
        inserted += result.rowCount || batch.length;
        process.stdout.write('.');
      } catch (err) {
        console.error(`\n✗ Błąd: ${err.message}`);
      }
    }

    console.log(`\n  ✓ ${filename}: ${inserted}/${records.length} załadowanych`);
  } catch (err) {
    console.error(`  ✗ ${filename}: ${err.message}`);
  }
}

async function main() {
  console.log('🔄 Ładowanie backupu (czysty import)...\n');

  try {
    await client.connect();
    console.log('✓ Połączono z bazą\n');

    await loadCSVClean('suppliers.csv', 'suppliers', ['id', 'user_id', 'name', 'is_active', 'default_category', 'default_cost_center_id', 'tax_id'], { tax_id: null });
    await loadCSVClean('cost_centers.csv', 'cost_centers', ['id', 'user_id', 'name']);
    await loadCSVClean('products.csv', 'products', ['id', 'user_id', 'name', 'unit', 'category', 'subcategory', 'canonical_name', 'classification_confidence', 'needs_review']);
    await loadCSVClean('invoices.csv', 'invoices', ['id', 'user_id', 'supplier_id', 'invoice_number', 'invoice_date', 'total_amount', 'ksef_number', 'imported_at', 'excluded', 'payment_method', 'payment_due_date', 'is_paid', 'paid_at', 'cost_center_id', 'invoice_type', 'parent_invoice_id', 'corrected_invoice_number']);
    await loadCSVClean('invoice_items.csv', 'invoice_items', ['id', 'invoice_id', 'product_id', 'product_name', 'unit', 'quantity', 'unit_price', 'total_price']);
    await loadCSVClean('price_alerts.csv', 'price_alerts', ['id', 'user_id', 'product_id', 'threshold_percent', 'created_at']);
    await loadCSVClean('dishes.csv', 'dishes', ['id', 'user_id', 'name', 'base_recipe_cost', 'selling_price']);

    console.log('\n✅ Backup załadowany!');
  } catch (err) {
    console.error('❌ Błąd główny:', err.message);
  } finally {
    await client.end();
  }
}

main();
