import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER = 'user_3DOr1NsevIrWO8PPAXwexCBuSIe';

const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const cleanNip = (s) => (s ?? '').replace(/\D/g, '');
const cleanName = (s) => (s ?? '').replace(/&amp;/g, '').replace(/\s+/g, ' ').trim();

const client = await pool.connect();
let imported = 0, suppliersCreated = 0, productsCreated = 0, accepted = 0, skipped = 0, errored = 0;
const errors = [];

try {
  const { rows: pending } = await client.query(
    `SELECT id, ksef_number, raw_xml, parsed_json FROM ksef_pending_invoices
     WHERE user_id=$1 AND status='pending' ORDER BY id`, [USER]);
  console.log('pending to process:', pending.length);

  for (const row of pending) {
    const parsed = row.parsed_json;
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) { skipped++; continue; }
    const h = parsed.header || {};
    const nip = cleanNip(h.sellerNip);
    if (!nip) { skipped++; continue; }

    try {
      await client.query('BEGIN');
      let supRes = await client.query(
        `SELECT id FROM suppliers WHERE user_id=$1
         AND regexp_replace(tax_id,'[^0-9]','','g')=$2 LIMIT 1`, [USER, nip]);
      let supplierId;
      if (supRes.rows.length) {
        supplierId = supRes.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO suppliers (user_id, name, tax_id) VALUES ($1,$2,$3) RETURNING id`,
          [USER, cleanName(h.sellerName) || `Dostawca ${nip}`, nip]);
        supplierId = ins.rows[0].id;
        suppliersCreated++;
      }

      const productIds = [];
      for (const item of parsed.items) {
        const n = norm(item.name);
        let pRes = await client.query(
          `SELECT id FROM products WHERE user_id=$1
           AND regexp_replace(lower(name),'\\s+',' ','g')=$2 LIMIT 1`, [USER, n]);
        if (pRes.rows.length) {
          productIds.push(pRes.rows[0].id);
        } else {
          const ins = await client.query(
            `INSERT INTO products (user_id, name, unit) VALUES ($1,$2,$3) RETURNING id`,
            [USER, (item.name || '').trim(), (item.unit || 'szt').trim() || 'szt']);
          productIds.push(ins.rows[0].id);
          productsCreated++;
        }
      }

      const invNum = h.invoiceNumber || row.ksef_number;
      const invDate = h.invoiceDate || new Date().toISOString().slice(0, 10);
      const totalGross = h.totalGross ?? parsed.items.reduce((s, i) => s + (i.gross || 0), 0);

      const existing = await client.query(
        `SELECT id FROM invoices WHERE user_id=$1 AND supplier_id=$2 AND invoice_number=$3 LIMIT 1`,
        [USER, supplierId, invNum]);
      let wasNew = false;
      if (existing.rows.length) {
        await client.query(
          `UPDATE invoices SET ksef_number=$1, xml_content=$2, total_amount=$3, invoice_date=$4 WHERE id=$5`,
          [row.ksef_number, row.raw_xml, totalGross.toFixed(2), invDate, existing.rows[0].id]);
      } else {
        const ins = await client.query(
          `INSERT INTO invoices (user_id, supplier_id, invoice_number, invoice_date, total_amount, xml_content, ksef_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, ksef_number) DO NOTHING RETURNING id`,
          [USER, supplierId, invNum, invDate, totalGross.toFixed(2), row.raw_xml, row.ksef_number]);
        if (ins.rows.length) {
          wasNew = true;
          const invoiceId = ins.rows[0].id;
          for (let i = 0; i < parsed.items.length; i++) {
            const it = parsed.items[i];
            await client.query(
              `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit, unit_price, total_price, vat_rate)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [invoiceId, productIds[i], it.name, String(it.quantity ?? 0), it.unit || 'szt',
               String(it.unitPrice ?? 0), String(it.net ?? 0),
               it.vatRate != null ? String(it.vatRate) : null]);
          }
        }
      }
      await client.query(`UPDATE ksef_pending_invoices SET status='accepted' WHERE id=$1`, [row.id]);
      await client.query('COMMIT');
      if (wasNew) imported++;
      accepted++;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      errored++;
      errors.push(`#${row.id} ${row.ksef_number}: ${e.message}`);
    }
  }
} finally {
  client.release();
  await pool.end();
}
console.log(JSON.stringify({ imported, suppliersCreated, productsCreated, accepted, skipped, errored }, null, 2));
if (errors.length) console.log('first errors:', errors.slice(0, 10));
