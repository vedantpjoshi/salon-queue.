import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

export class AppDatabase {
  private autoSave = true;

  constructor(
    private sqlite?: SqlJsDatabase,
    private saveSqlite?: () => void,
    private pool?: Pool,
    private client?: PoolClient,
  ) {}

  get isPostgres() {
    return Boolean(this.pool);
  }

  async all<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.pool) {
      const result = await (this.client ?? this.pool).query<T>(toPostgresSql(sql), params);
      return result.rows;
    }
    const stmt = this.sqlite!.prepare(sql);
    if (params.length) stmt.bind(params as any[]);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  async get<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    if (this.pool) {
      const insert = /^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql);
      const statement = insert ? `${sql.trim().replace(/;$/, '')} RETURNING id` : sql;
      const result = await (this.client ?? this.pool).query(toPostgresSql(statement), params);
      return {
        lastInsertRowid: Number(result.rows[0]?.id ?? 0),
        changes: result.rowCount ?? 0,
      };
    }

    this.sqlite!.run(sql, params as any[]);
    const id = this.sqlite!.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] ?? 0;
    const changes = this.sqlite!.exec('SELECT changes() AS count')[0]?.values[0]?.[0] ?? 0;
    if (this.autoSave) this.saveSqlite?.();
    return { lastInsertRowid: Number(id), changes: Number(changes) };
  }

  async exec(sql: string) {
    if (this.pool) {
      await (this.client ?? this.pool).query(sql);
      return;
    }
    this.sqlite!.exec(sql);
    if (this.autoSave) this.saveSqlite?.();
  }

  async transaction<T>(work: (transaction: AppDatabase) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(new AppDatabase(undefined, undefined, this.pool, client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    this.autoSave = false;
    this.sqlite!.exec('BEGIN TRANSACTION');
    try {
      const result = await work(this);
      this.sqlite!.exec('COMMIT');
      this.autoSave = true;
      this.saveSqlite?.();
      return result;
    } catch (error) {
      this.sqlite!.exec('ROLLBACK');
      this.autoSave = true;
      throw error;
    }
  }
}

function toPostgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const dbFile = () => process.env.DATABASE_PATH || path.join(process.cwd(), 'salon.db');
let database: AppDatabase;

const seedServices = [
  { name: "Men's Haircut", category: 'Hair', price: 200, duration: 30, description: "Classic men's haircut with styling", type: 'Quick' },
  { name: "Women's Haircut", category: 'Hair', price: 400, duration: 45, description: "Women's haircut with wash and blow dry", type: 'Standard' },
  { name: 'Hair Coloring', category: 'Hair', price: 1500, duration: 90, description: 'Full hair color with premium products', type: 'Premium' },
  { name: 'Hair Spa', category: 'Hair', price: 800, duration: 60, description: 'Deep conditioning hair spa treatment', type: 'Standard' },
  { name: 'Blow Dry & Styling', category: 'Hair', price: 500, duration: 45, description: 'Professional blow dry with heat styling', type: 'Standard' },
  { name: 'Keratin Treatment', category: 'Hair', price: 3000, duration: 120, description: 'Smoothing keratin treatment for frizz-free hair', type: 'Premium' },
  { name: 'Beard Trim', category: 'Hair', price: 100, duration: 15, description: 'Beard shaping and trim', type: 'Quick' },
  { name: 'Classic Facial', category: 'Skin', price: 600, duration: 45, description: 'Deep cleansing facial with massage', type: 'Standard' },
  { name: 'Gold Facial', category: 'Skin', price: 1200, duration: 60, description: 'Luxury gold-infused facial treatment', type: 'Premium' },
  { name: 'De-Tan Treatment', category: 'Skin', price: 500, duration: 30, description: 'Tan removal treatment for face and neck', type: 'Standard' },
  { name: 'Cleanup', category: 'Skin', price: 300, duration: 20, description: 'Basic skin cleanup and toning', type: 'Quick' },
  { name: 'Threading (Eyebrows)', category: 'Skin', price: 50, duration: 10, description: 'Eyebrow threading and shaping', type: 'Quick' },
  { name: 'Manicure', category: 'Nails', price: 400, duration: 30, description: 'Classic manicure with nail shaping and polish', type: 'Standard' },
  { name: 'Pedicure', category: 'Nails', price: 500, duration: 40, description: 'Relaxing pedicure with foot massage', type: 'Standard' },
  { name: 'Nail Art', category: 'Nails', price: 300, duration: 30, description: 'Custom nail art designs', type: 'Standard' },
  { name: 'Gel Nails', category: 'Nails', price: 800, duration: 45, description: 'Long-lasting gel nail application', type: 'Premium' },
  { name: 'Full Body Massage', category: 'Spa', price: 1500, duration: 60, description: 'Relaxing full body massage with aromatic oils', type: 'Premium' },
  { name: 'Head Massage', category: 'Spa', price: 300, duration: 20, description: 'Stress-relieving head and scalp massage', type: 'Quick' },
  { name: 'Aromatherapy', category: 'Spa', price: 2000, duration: 75, description: 'Therapeutic aromatherapy massage session', type: 'Premium' },
  { name: 'Foot Reflexology', category: 'Spa', price: 600, duration: 30, description: 'Pressure point foot massage for relaxation', type: 'Standard' },
];

export async function initDB() {
  if (process.env.DATABASE_URL) {
    const caFile = path.join(process.cwd(), 'server', 'supabase-ca.crt');
    const ssl = fs.existsSync(caFile)
      ? { ca: fs.readFileSync(caFile, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    database = new AppDatabase(undefined, undefined, pool);
    await database.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        description TEXT DEFAULT '',
        type TEXT DEFAULT 'Standard',
        is_available INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        token_number INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        status TEXT DEFAULT 'Placed',
        total INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        service_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL,
        duration INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS salon_settings (
        id INTEGER PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'auto'
      );
    `);
  } else {
    const SQL = await initSqlJs();
    const file = dbFile();
    const sqlDb = fs.existsSync(file)
      ? new SQL.Database(fs.readFileSync(file))
      : new SQL.Database();
    database = new AppDatabase(sqlDb, () => fs.writeFileSync(file, Buffer.from(sqlDb.export())));
    await database.exec('PRAGMA foreign_keys = ON');
    await database.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        description TEXT DEFAULT '',
        type TEXT DEFAULT 'Standard',
        is_available INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_number INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        status TEXT DEFAULT 'Placed',
        total INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
      CREATE TABLE IF NOT EXISTS salon_settings (
        id INTEGER PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'auto'
      );
    `);
  }

  await database.exec("INSERT INTO salon_settings (id, mode) VALUES (1, 'auto') ON CONFLICT(id) DO NOTHING");

  if (database.isPostgres) {
    await database.exec('ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_token TEXT');
  } else {
    const columns = await database.all<{ name: string }>('PRAGMA table_info(orders)');
    if (!columns.some((column) => column.name === 'cancel_token')) {
      await database.exec('ALTER TABLE orders ADD COLUMN cancel_token TEXT');
    }
  }

  const count = await database.get<{ count: number }>('SELECT COUNT(*) AS count FROM services');
  if (Number(count?.count) === 0) {
    await database.transaction(async (transaction) => {
      for (const service of seedServices) {
        await transaction.run(
          'INSERT INTO services (name, category, price, duration, description, type) VALUES (?, ?, ?, ?, ?, ?)',
          [service.name, service.category, service.price, service.duration, service.description, service.type],
        );
      }
    });
    console.log(`📋 Seeded ${seedServices.length} salon services`);
  }

  console.log(`✅ Database initialized (${process.env.DATABASE_URL ? 'PostgreSQL' : 'local sql.js'})`);
}

export function getDB() {
  if (!database) throw new Error('Database has not been initialized');
  return database;
}
