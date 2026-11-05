import db from './db.js';
import { OFFICIAL_COMPANIES } from './officialCompanies.js';
import { generateFullBackup, saveLocalSnapshot, uploadToSupabaseStorage } from './backupManager.js';

export function syncOfficialCompaniesToDatabase() {
  console.log('[Sync] Synchronizing official 25 companies to exchange database...');

  // Step 0: Remove any corrupt or untrimmed duplicate stock rows with trailing whitespace
  try {
    db.prepare("DELETE FROM price_history WHERE stock_id LIKE '% '").run();
    db.prepare("DELETE FROM holdings WHERE stock_id LIKE '% '").run();
    db.prepare("DELETE FROM trades WHERE stock_id LIKE '% '").run();
    db.prepare("DELETE FROM stocks WHERE id LIKE '% ' OR symbol LIKE '% '").run();
  } catch (e) {}

  const officialSymbols = new Set(OFFICIAL_COMPANIES.map(c => c.symbol.toUpperCase()));
  const nowBucket = Math.floor(Date.now() / 15000) * 15;

  const insertOrReplaceStock = db.prepare(`
    INSERT INTO stocks (id, symbol, name, sector, total_float, available_float, price, prev_close, change_pct, day_high, day_low, volatility, description, ps_metrics, is_active)
    VALUES (@id, @symbol, @name, @sector, @total_float, @available_float, @price, @prev_close, 0.0, @day_high, @day_low, @volatility, @description, @ps_metrics, 1)
    ON CONFLICT(id) DO UPDATE SET
      symbol = @symbol,
      name = @name,
      total_float = @total_float,
      available_float = @available_float,
      price = @price,
      prev_close = @prev_close,
      change_pct = 0.0,
      day_high = @day_high,
      day_low = @day_low,
      volatility = 0.02,
      description = @description,
      ps_metrics = @ps_metrics,
      is_active = 1
  `);

  const insertCandle = db.prepare(`
    INSERT OR IGNORE INTO price_history (stock_id, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. Upsert all 25 official companies
  for (const comp of OFFICIAL_COMPANIES) {
    const cleanSym = comp.symbol.trim().toUpperCase();
    const stockId = 'stock-' + cleanSym.toLowerCase();
    const psMetricsJson = JSON.stringify({
      "Cost of Acquisition": comp.costOfAcquisition,
      "AUM / Capitalization": comp.aum
    });

    // Clean up any rogue rows with matching symbol under an unexpected ID
    try {
      const oldRows = db.prepare("SELECT id FROM stocks WHERE (TRIM(symbol) = ? OR symbol = ?) AND id != ?").all(cleanSym, cleanSym, stockId);
      for (const old of oldRows) {
        db.prepare('DELETE FROM price_history WHERE stock_id = ?').run(old.id);
        db.prepare('DELETE FROM holdings WHERE stock_id = ?').run(old.id);
        db.prepare('DELETE FROM trades WHERE stock_id = ?').run(old.id);
        db.prepare('DELETE FROM stocks WHERE id = ?').run(old.id);
      }
    } catch (e) {}

    insertOrReplaceStock.run({
      id: stockId,
      symbol: cleanSym,
      name: comp.name.trim(),
      sector: 'Equities',
      total_float: comp.total_float,
      available_float: comp.total_float,
      price: comp.price,
      prev_close: comp.price,
      day_high: comp.price,
      day_low: comp.price,
      volatility: 0.02,
      description: `${comp.name.trim()} (${cleanSym}) active on exchange.`,
      ps_metrics: psMetricsJson
    });

    // Check candle history for this stock
    const tradeCount = db.prepare('SELECT COUNT(*) as cnt FROM trades WHERE stock_id = ?').get(stockId)?.cnt || 0;
    const candleCheck = db.prepare('SELECT COUNT(*) as cnt, AVG(close) as avg_p FROM price_history WHERE stock_id = ?').get(stockId);
    const candleCount = candleCheck?.cnt || 0;
    const avgPrice = candleCheck?.avg_p || comp.price;
    const isPriceMismatched = Math.abs(avgPrice - comp.price) > 3.0;

    // Freshly calibrate baseline candles for every official company to eliminate any voids or cliff jumps
    if (tradeCount === 0 || candleCount < 30 || isPriceMismatched) {
      if (tradeCount === 0 || isPriceMismatched) {
        console.log(`[Sync] Recalibrating smooth baseline candles for ${cleanSym} (${stockId}) anchored to initial price ${comp.price} IC...`);
        db.prepare('DELETE FROM price_history WHERE stock_id = ?').run(stockId);
      } else {
        console.log(`[Sync] Seeding 45 baseline candles for ${cleanSym} (${stockId}) - had ${candleCount}...`);
      }
      const targetPrice = comp.price;
      const vol = 0.02;
      const count = 45;
      let currP = Math.round(targetPrice * (1 - (Math.random() * 0.04 - 0.02)) * 100) / 100;
      const step = (targetPrice - currP) / count;

      const tx = db.transaction(() => {
        for (let i = count; i >= 1; i--) {
          const t = nowBucket - (i * 15);
          const noise = (Math.random() - 0.49) * currP * vol * 0.40;
          const open = Math.round(currP * 100) / 100;
          let close = Math.round((currP + step + noise) * 100) / 100;
          if (i === 1) close = targetPrice;
          close = Math.max(1.0, close);

          const wick = Math.max(0.04, currP * vol * 0.18);
          const high = Math.round((Math.max(open, close) + Math.random() * wick) * 100) / 100;
          const low = Math.max(0.5, Math.round((Math.min(open, close) - Math.random() * wick) * 100) / 100);
          const volume = Math.floor(Math.random() * 35) + 6;

          insertCandle.run(stockId, t, open, high, low, close, volume);
          currP = close;
        }
      });
      tx();
    }
  }

  // 2. Remove / deactivate any stocks NOT in the official list of 25
  const allCurrentStocks = db.prepare('SELECT id, symbol FROM stocks').all();
  let deactivatedCount = 0;
  for (const stk of allCurrentStocks) {
    const sym = stk.symbol ? stk.symbol.trim().toUpperCase() : '';
    if (!officialSymbols.has(sym)) {
      console.log(`[Sync] Deactivating unapproved stock: ${stk.symbol} (${stk.id})`);
      db.prepare('DELETE FROM price_history WHERE stock_id = ?').run(stk.id);
      db.prepare('DELETE FROM holdings WHERE stock_id = ?').run(stk.id);
      db.prepare('DELETE FROM trades WHERE stock_id = ?').run(stk.id);
      db.prepare('DELETE FROM stocks WHERE id = ?').run(stk.id);
      deactivatedCount++;
    }
  }

  // 3. Clean up any trailing space in stock IDs or symbols
  try {
    db.prepare("DELETE FROM price_history WHERE stock_id LIKE '% '").run();
    db.prepare("DELETE FROM stocks WHERE id LIKE '% ' OR symbol LIKE '% '").run();
  } catch (e) {}

  const activeStocks = db.prepare('SELECT id, symbol, name, total_float, price, ps_metrics FROM stocks WHERE is_active = 1 ORDER BY symbol ASC').all();
  console.log(`[Sync] Complete! Active official companies: ${activeStocks.length} (Deactivated: ${deactivatedCount})`);

  // 4. Trigger immediate local & Supabase backup
  try {
    const backup = generateFullBackup();
    saveLocalSnapshot(backup);
    uploadToSupabaseStorage(backup).then(() => {
      console.log('[Sync] Cloud backup synchronized to Supabase with official 25 companies.');
    }).catch(() => {});
  } catch (err) {
    console.warn('[Sync] Backup notice:', err.message);
  }

  return activeStocks;
}

// If executed directly from command line (e.g. `node server/syncOfficialCompanies.js`)
if (process.argv[1] && process.argv[1].endsWith('syncOfficialCompanies.js')) {
  const stocks = syncOfficialCompaniesToDatabase();
  console.table(stocks.map((s, idx) => ({
    '#': idx + 1,
    'Symbol': s.symbol,
    'Name': s.name,
    'Float': s.total_float,
    'Price (IC)': s.price,
    'Metrics': s.ps_metrics
  })));
  process.exit(0);
}
