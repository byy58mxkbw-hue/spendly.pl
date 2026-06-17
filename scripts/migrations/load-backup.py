import os
import csv
import psycopg2
from psycopg2 import extras

# Connection
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

tables = [
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
]

backup_dir = 'C:/Users/nowys/Downloads'

def load_table(table_name):
    csv_path = os.path.join(backup_dir, f'{table_name}.csv')
    if not os.path.exists(csv_path):
        print(f'⏭️ {table_name}.csv not found, skipping...')
        return

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        print(f'⏭️ {table_name} is empty')
        return

    # Insert rows
    columns = list(rows[0].keys())
    for row in rows:
        values = [row.get(col) for col in columns]
        placeholders = ', '.join(['%s'] * len(columns))
        sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        try:
            cur.execute(sql, values)
        except Exception as e:
            print(f'Error inserting row into {table_name}: {e}')

    conn.commit()
    print(f'✅ Loaded {len(rows)} rows into {table_name}')

print('🚀 Starting backup restore...\n')
for table in tables:
    load_table(table)

conn.close()
print('\n✅ Backup restore complete!')
