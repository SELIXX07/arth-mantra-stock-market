import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupsDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const SB_URL = 'https://hxfzxbkegkvdxdortkox.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';

let lastSnapshotTime = null;
let lastCloudBackupTime = null;
let backupInProgress = false;

/**
 * Capture full state of the market database
 */
export function generateFullBackup() {
  const market_state = db.prepare('SELECT * FROM market_state').all();
  const stocks = db.prepare('SELECT * FROM stocks').all();
  const teams = db.prepare('SELECT * FROM teams').all();
  const holdings = db.prepare('SELECT * FROM holdings').all();
  const trades = db.prepare('SELECT * FROM trades ORDER BY timestamp ASC').all();
  const news = db.prepare('SELECT * FROM news ORDER BY timestamp ASC').all();
  const price_history = db.prepare('SELECT * FROM price_history ORDER BY timestamp ASC LIMIT 2000').all();

  return {
    version: '1.0',
    platform: 'arthmantra-market',
    created_at: new Date().toISOString(),
    metrics: {
      total_teams: teams.length,
      total_trades: trades.length,
      total_holdings: holdings.length,
      total_stocks: stocks.length
    },
    data: {
      market_state,
      stocks,
      teams,
      holdings,
      trades,
      news,
      price_history
    }
  };
}

/**
 * Save snapshot locally to disk
 */
export function saveLocalSnapshot(backupData) {
  try {
    const latestPath = path.join(backupsDir, 'latest_market_backup.json');
    fs.writeFileSync(latestPath, JSON.stringify(backupData, null, 2), 'utf-8');
    lastSnapshotTime = backupData.created_at;

    // Keep up to 10 historical snapshots on disk
    const timestampName = `market_backup_${backupData.created_at.replace(/[:.]/g, '-')}.json`;
    const histPath = path.join(backupsDir, timestampName);
    fs.writeFileSync(histPath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Clean old files if > 15
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('market_backup_') && f.endsWith('.json'))
      .sort();
    if (files.length > 15) {
      files.slice(0, files.length - 15).forEach(f => {
        try { fs.unlinkSync(path.join(backupsDir, f)); } catch {}
      });
    }

    return true;
  } catch (err) {
    console.error('[BackupManager] Local save error:', err.message);
    return false;
  }
}

/**
 * Upload snapshot to Supabase Cloud Storage for multi-cloud redundancy
 */
export async function uploadToSupabaseStorage(backupData) {
  try {
    const payload = JSON.stringify(backupData, null, 2);
    const fileName = 'market-backups/latest_market_backup.json';

    const res = await fetch(`${SB_URL}/storage/v1/object/payment-screenshots/${fileName}`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: payload
    });

    if (res.ok) {
      lastCloudBackupTime = new Date().toISOString();
      console.log(`[BackupManager] Successfully synchronized live market backup to Supabase Cloud Storage (${backupData.metrics.total_trades} trades, ${backupData.metrics.total_teams} teams).`);
      return true;
    } else {
      const txt = await res.text();
      console.warn('[BackupManager] Supabase upload failed:', txt);
      return false;
    }
  } catch (err) {
    console.warn('[BackupManager] Remote storage sync error:', err.message);
    return false;
  }
}

/**
 * Fetch latest cloud backup from Supabase Storage
 */
export async function fetchCloudBackup() {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/public/payment-screenshots/market-backups/latest_market_backup.json`, {
      cache: 'no-store'
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[BackupManager] Could not fetch remote cloud backup:', err.message);
  }
  return null;
}

/**
 * Restore market database from a backup object
 */
export function restoreFromBackup(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data structure.');
  }

  const { data } = backupData;
  console.log(`[BackupManager] Initiating full database restore...`);

  const runRestore = db.transaction(() => {
    // 1. Restore market state
    if (Array.isArray(data.market_state) && data.market_state.length > 0) {
      db.prepare('DELETE FROM market_state').run();
      const insertState = db.prepare(`
        INSERT INTO market_state (id, status, round_name, round_duration_secs, remaining_secs, credentials_released, scheduled_open_at, scheduled_close_at, base_ic, updated_at)
        VALUES (@id, @status, @round_name, @round_duration_secs, @remaining_secs, @credentials_released, @scheduled_open_at, @scheduled_close_at, @base_ic, @updated_at)
      `);
      for (const st of data.market_state) {
        insertState.run(st);
      }
    }

    // 2. Restore stocks
    if (Array.isArray(data.stocks) && data.stocks.length > 0) {
      db.prepare('DELETE FROM stocks').run();
      const insertStock = db.prepare(`
        INSERT INTO stocks (id, symbol, name, sector, total_float, available_float, price, prev_close, change_pct, day_high, day_low, volatility, description, ps_metrics, is_active, created_at)
        VALUES (@id, @symbol, @name, @sector, @total_float, @available_float, @price, @prev_close, @change_pct, @day_high, @day_low, @volatility, @description, @ps_metrics, @is_active, @created_at)
      `);
      for (const stk of data.stocks) {
        insertStock.run(stk);
      }
    }

    // 3. Restore teams
    if (Array.isArray(data.teams) && data.teams.length > 0) {
      db.prepare('DELETE FROM teams').run();
      const insertTeam = db.prepare(`
        INSERT INTO teams (id, team_code, team_name, password, leader_email, leader_name, cash_balance, initial_balance, is_leader_active, active_session_id, last_active_at, created_at)
        VALUES (@id, @team_code, @team_name, @password, @leader_email, @leader_name, @cash_balance, @initial_balance, @is_leader_active, @active_session_id, @last_active_at, @created_at)
      `);
      for (const tm of data.teams) {
        insertTeam.run(tm);
      }
    }

    // 4. Restore holdings
    if (Array.isArray(data.holdings)) {
      db.prepare('DELETE FROM holdings').run();
      const insertHolding = db.prepare(`
        INSERT INTO holdings (id, team_id, stock_id, shares, avg_buy_price, updated_at)
        VALUES (@id, @team_id, @stock_id, @shares, @avg_buy_price, @updated_at)
      `);
      for (const h of data.holdings) {
        insertHolding.run(h);
      }
    }

    // 5. Restore trades
    if (Array.isArray(data.trades)) {
      db.prepare('DELETE FROM trades').run();
      const insertTrade = db.prepare(`
        INSERT INTO trades (id, team_id, stock_id, type, shares, price_per_share, total_ic, timestamp)
        VALUES (@id, @team_id, @stock_id, @type, @shares, @price_per_share, @total_ic, @timestamp)
      `);
      for (const tr of data.trades) {
        insertTrade.run(tr);
      }
    }

    // 6. Restore news
    if (Array.isArray(data.news)) {
      db.prepare('DELETE FROM news').run();
      const insertNews = db.prepare(`
        INSERT INTO news (id, stock_id, headline, content, impact_pct, timestamp)
        VALUES (@id, @stock_id, @headline, @content, @impact_pct, @timestamp)
      `);
      for (const n of data.news) {
        insertNews.run(n);
      }
    }

    // 7. Restore price history
    if (Array.isArray(data.price_history)) {
      db.prepare('DELETE FROM price_history').run();
      const insertHist = db.prepare(`
        INSERT INTO price_history (id, stock_id, timestamp, open, high, low, close, volume)
        VALUES (@id, @stock_id, @timestamp, @open, @high, @low, @close, @volume)
      `);
      for (const ph of data.price_history) {
        insertHist.run(ph);
      }
    }
  });

  runRestore();
  lastSnapshotTime = new Date().toISOString();
  console.log(`[BackupManager] Database restore complete.`);
  return true;
}

/**
 * Automatically check and restore if the database is blank/fresh container
 */
export async function autoRestoreIfEmpty() {
  try {
    const tradeCount = db.prepare('SELECT COUNT(*) as count FROM trades').get().count;
    const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;

    if (tradeCount === 0 && teamCount <= 1) {
      console.log(`[BackupManager] Database is fresh or empty. Checking for existing remote cloud backup in Supabase...`);
      const cloudBackup = await fetchCloudBackup();
      if (cloudBackup && cloudBackup.data && cloudBackup.metrics && (cloudBackup.metrics.total_trades > 0 || cloudBackup.metrics.total_teams > 1)) {
        console.log(`[BackupManager] Discovered remote backup with ${cloudBackup.metrics.total_trades} trades. Auto-restoring...`);
        restoreFromBackup(cloudBackup);
        return true;
      }

      // Check local disk backup
      const localPath = path.join(backupsDir, 'latest_market_backup.json');
      if (fs.existsSync(localPath)) {
        const localData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
        if (localData && localData.data) {
          console.log(`[BackupManager] Restoring from local disk snapshot...`);
          restoreFromBackup(localData);
          return true;
        }
      }
    }
  } catch (err) {
    console.warn('[BackupManager] Auto-restore check notice:', err.message);
  }
  return false;
}

/**
 * Trigger immediate combined backup
 */
export async function triggerSnapshot() {
  if (backupInProgress) return;
  backupInProgress = true;
  try {
    const backup = generateFullBackup();
    saveLocalSnapshot(backup);
    await uploadToSupabaseStorage(backup);
  } catch (err) {
    console.error('[BackupManager] Snapshot trigger error:', err.message);
  } finally {
    backupInProgress = false;
  }
}

/**
 * Initialize automatic periodic backup loop
 */
export function initAutoBackup(intervalSeconds = 60) {
  console.log(`[BackupManager] Continuous auto-backup enabled (every ${intervalSeconds}s to Local Disk + Supabase Cloud).`);
  
  // First auto-restore check
  setTimeout(async () => {
    await autoRestoreIfEmpty();
  }, 1000);

  // Periodic backup interval
  setInterval(async () => {
    try {
      await triggerSnapshot();
    } catch {}
  }, intervalSeconds * 1000);
}

export function getBackupStatus() {
  const tradeCount = db.prepare('SELECT COUNT(*) as count FROM trades').get().count;
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
  const holdingCount = db.prepare('SELECT COUNT(*) as count FROM holdings').get().count;

  return {
    lastSnapshotTime,
    lastCloudBackupTime,
    totalTeams: teamCount,
    totalTrades: tradeCount,
    totalHoldings: holdingCount,
    cloudSyncActive: true,
    supabaseBucket: 'payment-screenshots/market-backups'
  };
}
