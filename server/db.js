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

// Seed initial companies if missing
const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get().count;
if (stockCount === 0) {
  const seedStocks = [
    {
      id: 'stock-apex',
      symbol: 'APEX',
      name: 'Apex Global Asset Management',
      sector: 'Wealth & Asset Management',
      total_float: 1000,
      available_float: 1000,
      price: 125.0,
      prev_close: 125.0,
      volatility: 0.018,
      description: 'Global asset manager specializing in ETF unit creation, private equity, and fixed-income credit portfolios.',
      ps_metrics: JSON.stringify({
        "Cost of Acquisition (Future Assets)": "85.00 IC",
        "Total AUM (Assets Under Management)": "48.5M IC",
        "Expense Ratio / Mgmt Fee": "0.65%",
        "Projected Portfolio Yield": "7.20%",
        "Strategic Notes": "Acquiring a clean infrastructure debt portfolio at an 85 IC discount. Upside if ESG subsidy bill passes."
      })
    },
    {
      id: 'stock-nexs',
      symbol: 'NEXS',
      name: 'Nexus AI & Semiconductor',
      sector: 'DeepTech & Hardware',
      total_float: 1000,
      available_float: 1000,
      price: 240.0,
      prev_close: 240.0,
      volatility: 0.035,
      description: 'Foundry-less semiconductor enterprise manufacturing high-bandwidth AI accelerator chipsets.',
      ps_metrics: JSON.stringify({
        "Cost of Acquisition": "195.00 IC",
        "R&D Pipeline Capital": "16.2M IC",
        "Patent Portfolio Count": "48 Global IP Grants",
        "Gross Margin": "64.8%",
        "Strategic Notes": "Fab capacity expansion contract under negotiation with Tier-1 defense and cloud providers."
      })
    },
    {
      id: 'stock-verd',
      symbol: 'VERD',
      name: 'Verde Green Hydrogen & Energy',
      sector: 'Clean Energy & Renewables',
      total_float: 1000,
      available_float: 1000,
      price: 78.5,
      prev_close: 78.5,
      volatility: 0.028,
      description: 'Renewable energy generator with proprietary electrolyzer patents for zero-carbon hydrogen production.',
      ps_metrics: JSON.stringify({
        "Cost of Acquisition": "54.00 IC",
        "Installed Generation Capacity": "1.45 GW",
        "Carbon Offset Credits": "420k Units/Yr",
        "Government Capex Subsidy": "30% Tariff Incentive",
        "Strategic Notes": "Subject to international maritime clean fuel regulations taking effect next quarter."
      })
    },
    {
      id: 'stock-aero',
      symbol: 'AERO',
      name: 'Aerovance Defense & Avionics',
      sector: 'Aerospace & Defense',
      total_float: 1000,
      available_float: 1000,
      price: 315.0,
      prev_close: 315.0,
      volatility: 0.022,
      description: 'Tactical UAV systems, radar telemetry hardware, and autonomous avionics software contractor.',
      ps_metrics: JSON.stringify({
        "Cost of Acquisition": "260.00 IC",
        "Order Backlog Valuation": "94.0M IC",
        "EBITDA Margin": "31.4%",
        "Trailing P/E Ratio": "19.2x",
        "Strategic Notes": "Multi-year sovereign air-defense contract guarantees stable recurring cash flows."
      })
    }
  ];

  const insertStock = db.prepare(`
    INSERT INTO stocks (id, symbol, name, sector, total_float, available_float, price, prev_close, day_high, day_low, volatility, description, ps_metrics)
    VALUES (@id, @symbol, @name, @sector, @total_float, @available_float, @price, @prev_close, @price, @price, @volatility, @description, @ps_metrics)
  `);

  const now = Math.floor(Date.now() / 1000);
  const insertCandle = db.prepare(`
    INSERT INTO price_history (stock_id, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  seedStocks.forEach(s => {
    insertStock.run(s);

    // Generate 30 historical baseline candles (1 minute each) so the chart looks alive immediately!
    let currP = s.price * 0.92;
    for (let i = 30; i >= 1; i--) {
      const candleTime = now - (i * 60);
      const delta = (Math.random() - 0.48) * (currP * s.volatility);
      const open = Math.round(currP * 100) / 100;
      const close = Math.round((currP + delta) * 100) / 100;
      const high = Math.round((Math.max(open, close) + Math.random() * (currP * 0.008)) * 100) / 100;
      const low = Math.round((Math.min(open, close) - Math.random() * (currP * 0.008)) * 100) / 100;
      const volume = Math.floor(Math.random() * 45) + 10;
      insertCandle.run(s.id, candleTime, open, high, low, close, volume);
      currP = close;
    }
  });
}

export default db;
