#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const oldUserId = 'user_3DzRzmuDxrOL23jmsxF7j7M8SSA';
const newUserId = 'user_3FHeTFY2qrzJTzsU2kWPFJWgKhB';

const client = new Client({ connectionString: DATABASE_URL });

async function updateUserId() {
  try {
    await client.connect();
    console.log(`🔄 Zamienianie user_id: ${oldUserId} → ${newUserId}\n`);

    const tables = ['suppliers', 'products', 'invoices', 'cost_centers', 'price_alerts', 'dishes', 'ksef_config', 'ai_cfo_sessions', 'user_categories'];

    for (const table of tables) {
      try {
        const result = await client.query(
          `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`,
          [newUserId, oldUserId]
        );
        if (result.rowCount > 0) {
          console.log(`✓ ${table}: zaktualizowano ${result.rowCount} wierszy`);
        }
      } catch (err) {
        // Tabela może nie mieć kolumny user_id
      }
    }

    console.log('\n✅ Zmiana user_id ukończona!');
  } catch (err) {
    console.error('❌ Błąd:', err.message);
  } finally {
    await client.end();
  }
}

updateUserId();
