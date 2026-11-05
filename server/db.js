import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'market.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS market_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'CLOSED', -- 'OPEN', 'PAUSED', 'CLOSED'
    round_name TEXT DEFAULT 'Round 3: Asset Valuation & Trading',
    round_duration_secs INTEGER DEFAULT 1200, -- 20 minutes default
    remaining_secs INTEGER DEFAULT 1200,
    credentials_released INTEGER DEFAULT 0,
    scheduled_open_at INTEGER,
    scheduled_close_at INTEGER,
    base_ic REAL DEFAULT 10000.0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stocks (
    id TEXT PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    total_float INTEGER NOT NULL DEFAULT 1000,
    available_float INTEGER NOT NULL DEFAULT 1000,
    price REAL NOT NULL DEFAULT 100.0,
    prev_close REAL NOT NULL DEFAULT 100.0,
    change_pct REAL NOT NULL DEFAULT 0.0,
    day_high REAL NOT NULL DEFAULT 100.0,
    day_low REAL NOT NULL DEFAULT 100.0,
    volatility REAL NOT NULL DEFAULT 0.02,
    description TEXT,
    ps_metrics TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(stock_id) REFERENCES stocks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_stock_time ON price_history(stock_id, timestamp);

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    team_code TEXT UNIQUE NOT NULL,
    team_name TEXT NOT NULL,
    password TEXT NOT NULL,
    leader_email TEXT,
    leader_name TEXT,
    cash_balance REAL NOT NULL DEFAULT 10000.0,
    initial_balance REAL NOT NULL DEFAULT 10000.0,
    is_leader_active INTEGER DEFAULT 0,
    active_session_id TEXT,
    last_active_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    shares INTEGER NOT NULL DEFAULT 0,
    avg_buy_price REAL NOT NULL DEFAULT 0.0,
    position_type TEXT NOT NULL DEFAULT 'LONG',
    collateral_ic REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(team_id, stock_id),
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(stock_id) REFERENCES stocks(id)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL', 'SHORT', 'COVER')),
    shares INTEGER NOT NULL,
    price_per_share REAL NOT NULL,
    total_ic REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(stock_id) REFERENCES stocks(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL', 'SHORT', 'COVER')),
    order_type TEXT NOT NULL CHECK(order_type IN ('LIMIT', 'STOP_LOSS')),
    target_price REAL NOT NULL,
    shares INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    filled_at INTEGER,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(stock_id) REFERENCES stocks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_team ON orders(team_id, status);
  CREATE INDEX IF NOT EXISTS idx_orders_stock ON orders(stock_id, status);

  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    headline TEXT NOT NULL,
    content TEXT,
    affected_symbols TEXT DEFAULT 'ALL',
    price_impact_pct REAL DEFAULT 0.0,
    timestamp INTEGER NOT NULL,
    is_broadcast INTEGER DEFAULT 1
  );
`);

// Migration helper for existing databases
try {
  db.exec('ALTER TABLE market_state ADD COLUMN credentials_released INTEGER DEFAULT 0;');
} catch (e) {}
try {
  db.exec('ALTER TABLE market_state ADD COLUMN scheduled_open_at INTEGER;');
} catch (e) {}
try {
  db.exec('ALTER TABLE market_state ADD COLUMN scheduled_close_at INTEGER;');
} catch (e) {}
try {
  db.exec('ALTER TABLE market_state ADD COLUMN base_ic REAL DEFAULT 10000.0;');
} catch (e) {}
try {
  db.exec('ALTER TABLE market_state ADD COLUMN test_session_active INTEGER DEFAULT 0;');
} catch (e) {}
try {
  db.exec("ALTER TABLE holdings ADD COLUMN position_type TEXT NOT NULL DEFAULT 'LONG';");
} catch (e) {}
try {
  db.exec('ALTER TABLE holdings ADD COLUMN collateral_ic REAL NOT NULL DEFAULT 0.0;');
} catch (e) {}
try {
  db.exec('ALTER TABLE stocks ADD COLUMN sector_beta REAL NOT NULL DEFAULT 1.0;');
} catch (e) {}

// Safe migration for trades table if older CHECK constraint is present
try {
  const tradeTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trades'").get();
  if (tradeTableSql && tradeTableSql.sql && !tradeTableSql.sql.includes('SHORT')) {
    db.exec(`
      CREATE TABLE trades_new (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        stock_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL', 'SHORT', 'COVER')),
        shares INTEGER NOT NULL,
        price_per_share REAL NOT NULL,
        total_ic REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(team_id) REFERENCES teams(id),
        FOREIGN KEY(stock_id) REFERENCES stocks(id)
      );
      INSERT INTO trades_new (id, team_id, stock_id, type, shares, price_per_share, total_ic, timestamp)
        SELECT id, team_id, stock_id, type, shares, price_per_share, total_ic, timestamp FROM trades;
      DROP TABLE trades;
      ALTER TABLE trades_new RENAME TO trades;
    `);
    console.log('[DB] Migrated trades table to support SHORT/COVER sides.');
  }
} catch (e) {
  console.warn('[DB Migration] trades table notice:', e.message);
}

// Seed initial market state if missing
const stateCheck = db.prepare('SELECT id, round_name FROM market_state WHERE id = 1').get();
if (!stateCheck) {
  db.prepare(`
    INSERT INTO market_state (id, status, round_name, round_duration_secs, remaining_secs)
    VALUES (1, 'CLOSED', 'Round 3: Asset Valuation & Trading', 1200, 1200)
  `).run();
} else if (stateCheck.round_name && stateCheck.round_name.includes('Round 2')) {
  db.prepare(`UPDATE market_state SET round_name = 'Round 3: Asset Valuation & Trading' WHERE id = 1`).run();
}

import { OFFICIAL_COMPANIES } from './officialCompanies.js';

// Seed initial companies if missing
const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks WHERE is_active = 1').get().count;
if (stockCount === 0) {
  const insertStock = db.prepare(`
    INSERT INTO stocks (id, symbol, name, sector, total_float, available_float, price, prev_close, day_high, day_low, volatility, description, ps_metrics, is_active)
    VALUES (@id, @symbol, @name, @sector, @total_float, @available_float, @price, @prev_close, @price, @price, @volatility, @description, @ps_metrics, 1)
  `);

  const nowBucket = Math.floor(Date.now() / 15000) * 15;
  const insertCandle = db.prepare(`
    INSERT INTO price_history (stock_id, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  OFFICIAL_COMPANIES.forEach(comp => {
    const cleanSym = comp.symbol.trim().toUpperCase();
    const stockId = 'stock-' + cleanSym.toLowerCase();
    const psMetricsJson = JSON.stringify({
      "Cost of Acquisition": comp.costOfAcquisition,
      "AUM / Capitalization": comp.aum
    });

    insertStock.run({
      id: stockId,
      symbol: cleanSym,
      name: comp.name.trim(),
      sector: 'Equities',
      total_float: comp.total_float,
      available_float: comp.total_float,
      price: comp.price,
      prev_close: comp.price,
      volatility: 0.02,
      description: `${comp.name.trim()} (${cleanSym}) active on exchange.`,
      ps_metrics: psMetricsJson
    });

    // Generate 45 historical baseline candles (15 seconds each) synchronized to live engine interval
    let currP = comp.price * 0.95;
    const count = 45;
    const step = (comp.price - currP) / count;
    for (let i = count; i >= 1; i--) {
      const candleTime = nowBucket - (i * 15);
      const delta = (Math.random() - 0.49) * (currP * 0.02 * 0.45);
      const open = Math.round(currP * 100) / 100;
      let close = Math.round((currP + step + delta) * 100) / 100;
      if (i === 1) close = comp.price;
      const wick = Math.max(0.05, currP * 0.02 * 0.22);
      const high = Math.round((Math.max(open, close) + Math.random() * wick) * 100) / 100;
      const low = Math.max(0.5, Math.round((Math.min(open, close) - Math.random() * wick) * 100) / 100);
      const volume = Math.floor(Math.random() * 35) + 6;
      insertCandle.run(stockId, candleTime, open, high, low, close, volume);
      currP = close;
    }
  });
}

export default db;
