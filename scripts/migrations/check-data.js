import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
let dbUrl = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('DATABASE_URL')) {
    dbUrl = line.split('=')[1];
  }
});

const client = new Client({ connectionString: dbUrl });

async function check() {
  try {
    await client.connect();
    const newUserId = 'user_3DzRzmuDxrOL23jmsxF7j7M8SSA';
    
    const suppliers = await client.query('SELECT COUNT(*) FROM suppliers WHERE user_id = $1', [newUserId]);
    const invoices = await client.query('SELECT COUNT(*) FROM invoices WHERE user_id = $1', [newUserId]);
    const products = await client.query('SELECT COUNT(*) FROM products WHERE user_id = $1', [newUserId]);
    
    console.log('✓ Suppliers:', suppliers.rows[0].count);
    console.log('✓ Invoices:', invoices.rows[0].count);
    console.log('✓ Products:', products.rows[0].count);
  } finally {
    await client.end();
  }
}

check();
