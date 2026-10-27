import db from './db.js';

// Box-Muller Transform for standard normal distribution N(0, 1)
function sampleStandardNormal() {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

class MarketEngine {
  constructor(io) {
    this.io = io;
    this.tickInterval = null;
    this.timerInterval = null;
    this.currentCandles = new Map(); // stockId -> current working candle
    this.candleDurationSecs = 15; // 15-second candles for snappy hackathon action!
    this.sectorMomenta = new Map(); // sector -> momentum value
  }

  init() {
    this.startTickLoop();
    this.startRoundTimer();
    this.syncStateFromSupabase().catch(() => {});
    console.log('[MarketEngine] Initialized with 15-second synchronized candlestick interval.');
  }

  async syncStateFromSupabase() {
    try {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const res = await fetch(`${sbUrl}/rest/v1/hackathons?is_active=eq.true&select=upi_id`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows[0] && rows[0].upi_id && rows[0].upi_id.startsWith('MARKET_CONFIG:')) {
          const cfg = JSON.parse(rows[0].upi_id.replace('MARKET_CONFIG:', ''));
          if (cfg && cfg.credentials_released !== undefined) {
            const val = cfg.credentials_released ? 1 : 0;
            db.prepare("UPDATE market_state SET credentials_released = ?, updated_at = datetime('now') WHERE id = 1").run(val);
            console.log(`[MarketEngine] Restored credentials_released=${val} from Supabase config.`);
          }
        }
      }
    } catch (e) {
      console.log('[MarketEngine] Notice: Supabase state restore skipped:', e.message);
    }
  }

  getMarketState() {
    return db.prepare('SELECT * FROM market_state WHERE id = 1').get();
  }

  getAllStocks() {
    return db.prepare('SELECT * FROM stocks WHERE is_active = 1 ORDER BY symbol ASC').all().map(s => ({
      ...s,
      ps_metrics: JSON.parse(s.ps_metrics || '{}')
    }));
  }

  getStock(stockId) {
    const s = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!s) return null;
    return {
      ...s,
      ps_metrics: JSON.parse(s.ps_metrics || '{}')
    };
  }

  deleteStock(stockId) {
    const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!stock) throw new Error('Stock not found');

    // Remove or soft-delete (we mark is_active = 0 and cleanup references)
    db.prepare('UPDATE stocks SET is_active = 0 WHERE id = ?').run(stockId);
    this.currentCandles.delete(stockId);

    const headline = `DELISTING NOTICE: ${stock.symbol} delisted from active exchange trading.`;
    this.injectNews(headline, `By order of market administration, trading for ${stock.name} (${stock.symbol}) has ceased.`, [stock.symbol], 0);

    return stock;
  }

  getLatestCandles(stockId, limit = 60) {
    return db.prepare(`
      SELECT timestamp, open, high, low, close, volume 
      FROM price_history 
      WHERE stock_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(stockId, limit).reverse();
  }

  startTickLoop() {
    if (this.tickInterval) clearInterval(this.tickInterval);

    this.tickInterval = setInterval(() => {
      const state = this.getMarketState();
      if (state.status !== 'OPEN') return;

      const stocks = db.prepare('SELECT * FROM stocks WHERE is_active = 1').all();
      const nowSec = Math.floor(Date.now() / 1000);
      const candleBucket = Math.floor(nowSec / this.candleDurationSecs) * this.candleDurationSecs;

      const updatedStocks = [];
      const tickBroadcast = [];

      const updateStockPriceStmt = db.prepare(`
        UPDATE stocks 
        SET price = @price, 
            change_pct = @change_pct, 
            day_high = MAX(day_high, @price), 
            day_low = MIN(day_low, @price) 
        WHERE id = @id
      `);

      const insertCandleStmt = db.prepare(`
        INSERT INTO price_history (stock_id, timestamp, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const dbUpdates = [];

      for (const stock of stocks) {
        // Quantitative Price Physics:
        // Geometric Brownian Motion (GBM) + Ornstein-Uhlenbeck Mean Reversion + Sector Momentum Spillover
        const Z = sampleStandardNormal();
        const dt = 0.025; // 1.5s normalized time step
        // Mean reversion pull toward intrinsic baseline valuation (prev_close)
        const meanReversion = 0.04 * ((stock.prev_close - stock.price) / stock.prev_close) * dt;
        // Brownian stochastic diffusion
        const diffusion = stock.volatility * Math.sqrt(dt) * Z * 0.65;
        // Sector cross-asset beta spillover
        const sectorMom = this.sectorMomenta.get(stock.sector) || 0;
        const sectorSpillover = sectorMom * (stock.sector_beta || 1.0) * 0.12;

        const deltaPct = meanReversion + diffusion + sectorSpillover;
        let newPrice = Math.max(1.0, Math.round((stock.price * (1 + deltaPct)) * 100) / 100);

        const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

        let oldCandleToSave = null;
        let candle = this.currentCandles.get(stock.id);
        if (!candle || candle.timestamp !== candleBucket) {
          if (candle) {
            oldCandleToSave = candle;
          }

          candle = {
            stock_id: stock.id,
            timestamp: candleBucket,
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
            volume: Math.floor(Math.random() * 5) + 1
          };
          this.currentCandles.set(stock.id, candle);
        } else {
          candle.high = Math.max(candle.high, newPrice);
          candle.low = Math.min(candle.low, newPrice);
          candle.close = newPrice;
          candle.volume += Math.floor(Math.random() * 3);
        }

        dbUpdates.push({
          priceData: { id: stock.id, price: newPrice, change_pct: changePct },
          oldCandleToSave
        });

        updatedStocks.push({
          id: stock.id,
          symbol: stock.symbol,
          price: newPrice,
          change_pct: changePct,
          available_float: stock.available_float,
          total_float: stock.total_float
        });

        tickBroadcast.push({
          stockId: stock.id,
          symbol: stock.symbol,
          price: newPrice,
          change_pct: changePct,
          candle: { ...candle }
        });
      }

      // Execute all 40 stock ticks inside ONE atomic SQLite transaction (takes <0.5ms!)
      const executeAllTicksTx = db.transaction((updates) => {
        for (const u of updates) {
          updateStockPriceStmt.run(u.priceData);
          if (u.oldCandleToSave) {
            insertCandleStmt.run(
              u.oldCandleToSave.stock_id,
              u.oldCandleToSave.timestamp,
              u.oldCandleToSave.open,
              u.oldCandleToSave.high,
              u.oldCandleToSave.low,
              u.oldCandleToSave.close,
              u.oldCandleToSave.volume
            );
          }
        }
      });
      executeAllTicksTx(dbUpdates);

      // Broadcast unified ticks to all connected screens
      this.io.emit('market:tick', {
        timestamp: nowSec,
        ticks: tickBroadcast
      });

      // Decay sector cross-asset momentum
      for (const [sec, mom] of this.sectorMomenta.entries()) {
        this.sectorMomenta.set(sec, mom * 0.90);
      }

      // Match resting Limit & Stop-Loss Orders against new prices
      this.matchPendingOrders(updatedStocks);

    }, 1500); // 1.5 seconds tick frequency
  }

  startRoundTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const state = this.getMarketState();
      const now = Math.floor(Date.now() / 1000);

      // 1. Check for Pre-Scheduled Open
      if (state.status !== 'OPEN' && state.scheduled_open_at) {
        if (now >= state.scheduled_open_at) {
          // Time reached! Auto-open market!
          let exactDurationSecs = 0;
          if (state.scheduled_close_at && state.scheduled_close_at > now) {
            exactDurationSecs = state.scheduled_close_at - now;
          }

          if (exactDurationSecs > 0) {
            db.prepare(`
              UPDATE market_state 
              SET status = 'OPEN', round_duration_secs = ?, remaining_secs = ?, scheduled_open_at = NULL, updated_at = datetime('now')
              WHERE id = 1
            `).run(exactDurationSecs, exactDurationSecs);
          } else {
            db.prepare(`
              UPDATE market_state 
              SET status = 'OPEN', scheduled_open_at = NULL, updated_at = datetime('now')
              WHERE id = 1
            `).run();
          }

          const openedState = this.getMarketState();
          this.io.emit('market:status', openedState);
          this.broadcastAlert('🔔 PRE-SCHEDULED OPENING BELL', 'The market has opened on schedule! Live trading active.', 'success');
          return;
        } else {
          const timeUntilOpen = state.scheduled_open_at - now;
          this.io.emit('market:pre_open_countdown', { timeUntilOpen, scheduled_open_at: state.scheduled_open_at });
        }
      }

      // 2. Check for Pre-Scheduled Close or Active Countdown
      if (state.status === 'OPEN') {
        let remaining = state.remaining_secs;

        // If scheduled_close_at is set, enforce exact clock-based synchronization
        if (state.scheduled_close_at) {
          const diff = state.scheduled_close_at - now;
          if (diff <= 0) {
            db.prepare("UPDATE market_state SET status = 'CLOSED', remaining_secs = 0, scheduled_close_at = NULL, updated_at = datetime('now') WHERE id = 1").run();
            const closedState = this.getMarketState();
            this.io.emit('market:status', closedState);
            this.broadcastAlert('⏹️ SCHEDULED CLOSING BELL', 'The market closed on schedule. Trading round complete.', 'critical');
            return;
          }
          remaining = diff;
          db.prepare("UPDATE market_state SET remaining_secs = ?, updated_at = datetime('now') WHERE id = 1").run(remaining);
        } else if (remaining > 0) {
          remaining = remaining - 1;
          db.prepare("UPDATE market_state SET remaining_secs = ?, updated_at = datetime('now') WHERE id = 1").run(remaining);
        }

        // Broadcast timer sync every second
        this.io.emit('market:timer', { remaining_secs: remaining, status: state.status });

        // Automated notification thresholds
        if (remaining === 3600) {
          this.broadcastAlert('🕒 1 HOUR REMAINING', 'Market closing in 1 hour. Plan your strategic asset valuations.', 'info');
        } else if (remaining === 1800) {
          this.broadcastAlert('🕒 30 MINUTES REMAINING', 'Market closing in 30 minutes.', 'info');
        } else if (remaining === 600) {
          this.broadcastAlert('⚠️ 10 MINUTES REMAINING', 'Market closing in 10 minutes. Review asset valuations and portfolio allocation.', 'info');
        } else if (remaining === 300) {
          this.broadcastAlert('⚠️ 5 MINUTES REMAINING', 'Market closing in 5 minutes! Rebalance portfolios and finalize orders.', 'warning');
        } else if (remaining === 60) {
          this.broadcastAlert('🚨 1 MINUTE REMAINING', 'Final trading call! Market closes in 60 seconds.', 'danger');
        } else if (remaining === 30) {
          this.broadcastAlert('⏰ 30 SECONDS REMAINING', 'Final 30 seconds! Last chance to execute trades.', 'danger');
        } else if (remaining === 0) {
          this.setMarketStatus('CLOSED');
          this.broadcastAlert('⏹️ MARKET CLOSED', 'The closing bell has rung! Trading is now closed. Scores are finalized.', 'critical');
        }
      }
    }, 1000);
  }

  setBaseIC(amount, applyToAllTeams = true) {
    const baseIC = parseFloat(amount) || 10000.0;
    db.prepare(`
      UPDATE market_state
      SET base_ic = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(baseIC);

    let updatedTeamsCount = 0;
    if (applyToAllTeams) {
      const info = db.prepare(`
        UPDATE teams
        SET cash_balance = ?, initial_balance = ?
      `).run(baseIC, baseIC);
      updatedTeamsCount = info.changes;

      // Broadcast leaderboard to admins & alert
      this.io.to('admin').emit('leaderboard:updated', this.getLeaderboard());
      this.broadcastAlert(
        '💰 BASE CAPITAL CONFIGURED',
        `Starting capital for all teams updated to ${baseIC.toLocaleString()} IC.`,
        'info'
      );
    }

    const updatedState = this.getMarketState();
    this.io.emit('market:status', updatedState);
    return { state: updatedState, base_ic: baseIC, updatedTeamsCount };
  }

  setCredentialsReleased(released) {
    const val = released ? 1 : 0;
    db.prepare("UPDATE market_state SET credentials_released = ?, updated_at = datetime('now') WHERE id = 1").run(val);
    const updatedState = this.getMarketState();
    this.io.emit('market:credentials_state', { credentials_released: Boolean(val) });
    this.io.emit('market:status', updatedState);

    // Sync to Supabase in background
    try {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const configStr = 'MARKET_CONFIG:' + JSON.stringify({ credentials_released: Boolean(val) });
      fetch(`${sbUrl}/rest/v1/hackathons?is_active=eq.true`, {
        method: 'PATCH',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ upi_id: configStr })
      }).catch(e => console.warn('[MarketEngine] Supabase credentials update warning:', e.message));
    } catch (e) {
      console.warn('[MarketEngine] Supabase sync error:', e.message);
    }

    if (val) {
      this.broadcastAlert('🔑 CREDENTIALS RELEASED', 'Team codes & PINs have been released by the admin! You can now log into your trading terminal.', 'success');
    } else {
      this.broadcastAlert('🔒 CREDENTIALS LOCKED', 'Trading credentials visibility has been hidden by the admin.', 'warning');
    }

    return updatedState;
  }

  setTestSessionActive(active) {
    const val = active ? 1 : 0;
    db.prepare("UPDATE market_state SET test_session_active = ?, updated_at = datetime('now') WHERE id = 1").run(val);
    const updatedState = this.getMarketState();
    this.io.emit('market:status', updatedState);
    this.io.emit('market:state', updatedState);
    this.io.emit('market:test_session_state', { test_session_active: Boolean(val) });
    if (val) {
      this.broadcastAlert('🧪 TEST SESSION ACTIVATED', 'Guest trader test session is now active! The Join Test Session button is enabled on the login screen.', 'success');
    } else {
      this.broadcastAlert('🔒 TEST SESSION ENDED', 'Guest trader test session has ended. Guest login is disabled.', 'info');
    }
    return updatedState;
  }

  purgeTestData(resetStocks = false) {
    const runPurge = db.transaction(() => {
      const deletedTrades = db.prepare("DELETE FROM trades WHERE team_id LIKE 'test-%'").run().changes;
      const deletedHoldings = db.prepare("DELETE FROM holdings WHERE team_id LIKE 'test-%'").run().changes;
      const deletedOrders = db.prepare("DELETE FROM orders WHERE team_id LIKE 'test-%'").run().changes;
      const deletedTeams = db.prepare("DELETE FROM teams WHERE id LIKE 'test-%'").run().changes;

      if (resetStocks) {
        db.prepare("UPDATE stocks SET available_float = total_float, price = prev_close, change_pct = 0, day_high = prev_close, day_low = prev_close WHERE is_active = 1").run();
        this.currentCandles.clear();
      }

      return { deletedTrades, deletedHoldings, deletedOrders, deletedTeams };
    });

    const summary = runPurge();
    this.io.emit('market:stocks', this.getAllStocks());
    this.io.to('admin').emit('leaderboard:updated', this.getLeaderboard());
    this.broadcastAlert('🧹 TEST DATA PURGED', `Test session data wiped: ${summary.deletedTrades} trades, ${summary.deletedHoldings} holdings, and ${summary.deletedTeams} test accounts purged.`, 'warning');
    return summary;
  }

  scheduleMarketTimes({ scheduled_open_at, scheduled_close_at, durationMins }) {
    const now = Math.floor(Date.now() / 1000);
    let openAt = scheduled_open_at ? parseInt(scheduled_open_at, 10) : null;
    let closeAt = scheduled_close_at ? parseInt(scheduled_close_at, 10) : null;

    if (durationMins && !closeAt) {
      const base = openAt && openAt > now ? openAt : now;
      closeAt = base + (parseInt(durationMins, 10) * 60);
    }

    const currentState = this.getMarketState();
    let remaining = currentState.remaining_secs;
    let roundDuration = currentState.round_duration_secs;

    if (currentState.status === 'OPEN' && closeAt && closeAt > now) {
      remaining = closeAt - now;
      roundDuration = remaining;
    }

    db.prepare(`
      UPDATE market_state 
      SET scheduled_open_at = ?, scheduled_close_at = ?, remaining_secs = ?, round_duration_secs = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(openAt, closeAt, remaining, roundDuration);

    const updatedState = this.getMarketState();
    this.io.emit('market:status', updatedState);

    if (openAt && openAt > now) {
      const minsWait = Math.round((openAt - now) / 60);
      this.broadcastAlert('🕒 MARKET OPEN SCHEDULED', `Market is scheduled to open at ${new Date(openAt * 1000).toLocaleTimeString()} (in ${minsWait}m).`, 'info');
    }
    if (closeAt && closeAt > now) {
      this.broadcastAlert('🕒 MARKET CLOSE SCHEDULED', `Market is scheduled to close at ${new Date(closeAt * 1000).toLocaleTimeString()}.`, 'info');
    }

    return updatedState;
  }

  broadcastAlert(title, message, severity = 'info') {
    this.io.emit('market:alert', {
      id: 'alert-' + Date.now(),
      title,
      message,
      severity,
      timestamp: Date.now()
    });
  }

  resetTimer(durationMins = null) {
    const state = this.getMarketState();
    const duration = durationMins ? (durationMins * 60) : (state.round_duration_secs || 1200);
    db.prepare(`
      UPDATE market_state
      SET remaining_secs = ?, round_duration_secs = ?, scheduled_open_at = NULL, scheduled_close_at = NULL, updated_at = datetime('now')
      WHERE id = 1
    `).run(duration, duration);

    const updatedState = this.getMarketState();
    this.io.emit('market:status', updatedState);
    this.io.emit('market:timer', { remaining_secs: duration, status: updatedState.status });
    this.broadcastAlert('⏱️ TIMER RESET', `Round timer reset to ${Math.round(duration / 60)} minutes by administrator.`, 'info');
    return updatedState;
  }

  setMarketStatus(status, durationMins = null) {
    if (durationMins) {
      const secs = durationMins * 60;
      db.prepare(`
        UPDATE market_state 
        SET status = ?, round_duration_secs = ?, remaining_secs = ?, scheduled_open_at = NULL, updated_at = datetime('now')
        WHERE id = 1
      `).run(status, secs, secs);
    } else {
      db.prepare(`
        UPDATE market_state 
        SET status = ?, scheduled_open_at = NULL, updated_at = datetime('now')
        WHERE id = 1
      `).run(status);
    }

    const updatedState = this.getMarketState();
    this.io.emit('market:status', updatedState);

    if (status === 'OPEN') {
      this.broadcastAlert('🔔 MARKET IS OPEN', 'The opening bell has rung. Real-time trading is now active!', 'success');
    } else if (status === 'PAUSED') {
      this.broadcastAlert('⏸️ TRADING PAUSED', 'The market is temporarily frozen by the market administrator.', 'warning');
    } else if (status === 'CLOSED') {
      this.broadcastAlert('⏹️ MARKET CLOSED', 'Trading has ended. All prices and portfolios locked.', 'critical');
    }

    return updatedState;
  }

  // Stock Induction & Withdrawal (Admin Puppet-Master)
  induceShares(stockId, sharesToAdd) {
    const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!stock) throw new Error('Stock not found');

    const newTotalFloat = stock.total_float + sharesToAdd;
    const newAvailFloat = stock.available_float + sharesToAdd;

    // Slight price dilution due to supply surge (-3% to -8% based on ratio)
    const dilutionFactor = 1 - Math.min(0.20, (sharesToAdd / stock.total_float) * 0.35);
    const newPrice = Math.max(1.0, Math.round((stock.price * dilutionFactor) * 100) / 100);
    const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

    db.prepare(`
      UPDATE stocks 
      SET total_float = ?, available_float = ?, price = ?, change_pct = ?
      WHERE id = ?
    `).run(newTotalFloat, newAvailFloat, newPrice, changePct, stockId);

    const headline = `CORPORATE ACTION: ${stock.symbol} Induces ${sharesToAdd} New Shares to Market`;
    this.injectNews(headline, `The board approved a secondary offering of ${sharesToAdd} shares to expand capitalization.`, [stock.symbol], 0);

    return this.getStock(stockId);
  }

  withdrawShares(stockId, sharesToBurn) {
    const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!stock) throw new Error('Stock not found');

    const burnCount = Math.min(stock.available_float, sharesToBurn);
    if (burnCount <= 0) throw new Error('Not enough unowned float in market pool to withdraw');

    const newTotalFloat = Math.max(10, stock.total_float - burnCount);
    const newAvailFloat = stock.available_float - burnCount;

    // Price surge due to supply scarcity (+5% to +15%)
    const scarcityFactor = 1 + Math.min(0.35, (burnCount / stock.total_float) * 0.45);
    const newPrice = Math.max(1.0, Math.round((stock.price * scarcityFactor) * 100) / 100);
    const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

    db.prepare(`
      UPDATE stocks 
      SET total_float = ?, available_float = ?, price = ?, change_pct = ?
      WHERE id = ?
    `).run(newTotalFloat, newAvailFloat, newPrice, changePct, stockId);

    const headline = `SHARE BUYBACK: ${stock.symbol} Retires ${burnCount} Shares from Circulation`;
    this.injectNews(headline, `Central treasury completed a buyback program of ${burnCount} shares, reducing float scarcity.`, [stock.symbol], 0);

    return this.getStock(stockId);
  }

  // Inject News with Automated Market Shocks
  injectNews(headline, content, affectedSymbols = ['ALL'], priceImpactPct = 0) {
    const newsId = 'news-' + Date.now();
    const timestamp = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO news (id, headline, content, affected_symbols, price_impact_pct, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newsId, headline, content, affectedSymbols.join(','), priceImpactPct, timestamp);

    // Apply price impact
    if (priceImpactPct !== 0) {
      const symbolsToImpact = affectedSymbols.includes('ALL') 
        ? db.prepare('SELECT symbol FROM stocks').all().map(s => s.symbol)
        : affectedSymbols;

      const mult = 1 + (priceImpactPct / 100);

      symbolsToImpact.forEach(sym => {
        const s = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(sym);
        if (s) {
          const newPrice = Math.max(1.0, Math.round((s.price * mult) * 100) / 100);
          const changePct = Math.round(((newPrice - s.prev_close) / s.prev_close) * 10000) / 100;

          db.prepare(`
            UPDATE stocks 
            SET price = ?, change_pct = ?, day_high = MAX(day_high, ?), day_low = MIN(day_low, ?)
            WHERE id = ?
          `).run(newPrice, changePct, newPrice, newPrice, s.id);
        }
      });
    }

    const payload = {
      id: newsId,
      headline,
      content,
      affectedSymbols,
      priceImpactPct,
      timestamp
    };

    // Broadcast breaking news
    this.io.emit('breaking:news', payload);
    return payload;
  }

  // Stealth Price Shock Engine (Direct Market Intervention without participant notification)
  applyPriceShock({ targets = ['ALL'], priceImpactPct = 0, sector = null, volatilityBoost = false }) {
    const numImpact = parseFloat(priceImpactPct) || 0;
    if (numImpact === 0) return { affectedStocks: [], count: 0 };

    let stocksToImpact = [];
    if (sector && sector !== 'ALL') {
      stocksToImpact = db.prepare('SELECT * FROM stocks WHERE sector = ? AND is_active = 1').all(sector);
    } else if (targets.includes('ALL')) {
      stocksToImpact = db.prepare('SELECT * FROM stocks WHERE is_active = 1').all();
    } else {
      const placeholders = targets.map(() => '?').join(',');
      stocksToImpact = db.prepare(`SELECT * FROM stocks WHERE symbol IN (${placeholders}) AND is_active = 1`).all(...targets);
    }

    if (!stocksToImpact || stocksToImpact.length === 0) {
      return { affectedStocks: [], count: 0 };
    }

    const mult = 1 + (numImpact / 100);
    const nowSec = Math.floor(Date.now() / 1000);
    const candleBucket = Math.floor(nowSec / this.candleDurationSecs) * this.candleDurationSecs;
    const affectedStocks = [];

    const updateStockStmt = db.prepare(`
      UPDATE stocks 
      SET price = @price, 
          change_pct = @change_pct, 
          day_high = MAX(day_high, @price), 
          day_low = MIN(day_low, @price)
      WHERE id = @id
    `);

    for (const stock of stocksToImpact) {
      const oldPrice = stock.price;
      const newPrice = Math.max(1.0, Math.round((oldPrice * mult) * 100) / 100);
      const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

      updateStockStmt.run({
        id: stock.id,
        price: newPrice,
        change_pct: changePct
      });

      // Update in-memory candle
      let candle = this.currentCandles.get(stock.id);
      if (candle && candle.timestamp === candleBucket) {
        candle.high = Math.max(candle.high, newPrice);
        candle.low = Math.min(candle.low, newPrice);
        candle.close = newPrice;
        candle.volume = (candle.volume || 0) + 150;
        this.currentCandles.set(stock.id, candle);
      } else {
        candle = {
          stock_id: stock.id,
          timestamp: candleBucket,
          open: oldPrice,
          high: Math.max(oldPrice, newPrice),
          low: Math.min(oldPrice, newPrice),
          close: newPrice,
          volume: 150
        };
        this.currentCandles.set(stock.id, candle);
      }

      const updated = {
        ...stock,
        price: newPrice,
        change_pct: changePct,
        day_high: Math.max(stock.day_high || newPrice, newPrice),
        day_low: Math.min(stock.day_low || newPrice, newPrice)
      };

      affectedStocks.push({
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        oldPrice,
        newPrice,
        diff: Math.round((newPrice - oldPrice) * 100) / 100,
        changePct
      });

      this.io.emit('stock:updated', updated);
    }

    // Broadcast updated stocks snapshot to all connected clients
    this.io.emit('market:stocks', this.getAllStocks());

    // Optional Volatility Surge: boost volatility for 3 minutes
    if (volatilityBoost) {
      for (const stock of stocksToImpact) {
        db.prepare('UPDATE stocks SET volatility = MIN(volatility * 2, 0.45) WHERE id = ?').run(stock.id);
      }
      setTimeout(() => {
        try {
          for (const stock of stocksToImpact) {
            db.prepare('UPDATE stocks SET volatility = ? WHERE id = ?').run(stock.volatility, stock.id);
          }
        } catch {}
      }, 3 * 60 * 1000);
    }

    // NOTE: Intentionally DO NOT emit 'breaking:news' or participant alerts.
    // Price shock operates in silent stealth mode as requested.
    return { affectedStocks, count: affectedStocks.length };
  }

  // Level 2 Order Book Depth Generator (5 Bids & 5 Asks with real resting orders)
  getOrderBook(stockId) {
    const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!stock) return null;

    const halfSpread = Math.max(0.05, Math.round(stock.price * stock.volatility * 0.20 * 100) / 100);
    const bestBid = Math.max(0.5, Math.round((stock.price - halfSpread) * 100) / 100);
    const bestAsk = Math.round((stock.price + halfSpread) * 100) / 100;

    // Fetch active pending limit orders for this stock
    const pendingOrders = db.prepare("SELECT side, target_price, shares FROM orders WHERE stock_id = ? AND status = 'PENDING'").all(stockId);

    // Construct 5 Levels of Asks (above price)
    const asks = [];
    let cumAskShares = 0;
    for (let i = 1; i <= 5; i++) {
      const price = Math.round((stock.price + (halfSpread * i)) * 100) / 100;
      const syntheticShares = Math.max(10, Math.round((stock.available_float * 0.04) * (1 + (i - 1) * 0.3)));
      const limitShares = pendingOrders
        .filter(o => (o.side === 'SELL' || o.side === 'SHORT') && Math.abs(o.target_price - price) <= (halfSpread * 0.5))
        .reduce((sum, o) => sum + o.shares, 0);
      const levelShares = syntheticShares + limitShares;
      cumAskShares += levelShares;
      asks.push({
        level: i,
        price,
        shares: levelShares,
        total: cumAskShares
      });
    }

    // Construct 5 Levels of Bids (below price)
    const bids = [];
    let cumBidShares = 0;
    for (let i = 1; i <= 5; i++) {
      const price = Math.max(0.5, Math.round((stock.price - (halfSpread * i)) * 100) / 100);
      const syntheticShares = Math.max(10, Math.round((stock.available_float * 0.04) * (1 + (i - 1) * 0.3)));
      const limitShares = pendingOrders
        .filter(o => (o.side === 'BUY' || o.side === 'COVER') && Math.abs(o.target_price - price) <= (halfSpread * 0.5))
        .reduce((sum, o) => sum + o.shares, 0);
      const levelShares = syntheticShares + limitShares;
      cumBidShares += levelShares;
      bids.push({
        level: i,
        price,
        shares: levelShares,
        total: cumBidShares
      });
    }

    const spread = Math.round((bestAsk - bestBid) * 100) / 100;
    const spreadPct = Math.round(((bestAsk - bestBid) / stock.price) * 10000) / 100;

    return {
      stockId: stock.id,
      symbol: stock.symbol,
      currentPrice: stock.price,
      bestBid,
      bestAsk,
      spread,
      spreadPct,
      bids,
      asks
    };
  }

  // Calculate Weighted Average Execution Price with realistic order book slippage
  calculateExecutionPrice(stock, side, shares) {
    const ob = this.getOrderBook(stock.id);
    let remaining = shares;
    let totalCost = 0;

    if (side === 'BUY' || side === 'COVER') {
      // Walk Asks upward
      for (const level of ob.asks) {
        const take = Math.min(remaining, level.shares);
        totalCost += take * level.price;
        remaining -= take;
        if (remaining <= 0) break;
      }
      if (remaining > 0) {
        const topPrice = ob.asks[ob.asks.length - 1].price;
        totalCost += remaining * (topPrice * 1.015);
      }
      return Math.round((totalCost / shares) * 100) / 100;
    } else {
      // Walk Bids downward
      for (const level of ob.bids) {
        const take = Math.min(remaining, level.shares);
        totalCost += take * level.price;
        remaining -= take;
        if (remaining <= 0) break;
      }
      if (remaining > 0) {
        const bottomPrice = ob.bids[ob.bids.length - 1].price;
        totalCost += remaining * Math.max(0.5, bottomPrice * 0.985);
      }
      return Math.max(0.5, Math.round((totalCost / shares) * 100) / 100);
    }
  }

  // Trade Execution (ACID Protected with SQLite Transaction)
  // Supports BUY, SELL, SHORT, COVER with dynamic slippage & margin accounting
  executeOrder({ teamId, stockId, type, shares, isTriggeredOrder = false }) {
    const state = this.getMarketState();
    if (state.status !== 'OPEN') {
      throw new Error(`Market is currently ${state.status}. Orders are rejected.`);
    }

    if (!shares || shares <= 0 || !Number.isInteger(shares)) {
      throw new Error('Invalid share quantity. Must be a positive whole integer.');
    }

    if (!['BUY', 'SELL', 'SHORT', 'COVER'].includes(type)) {
      throw new Error(`Invalid order execution type: ${type}`);
    }

    const executeTx = db.transaction(() => {
      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
      if (!team) throw new Error('Team not found');

      const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
      if (!stock) throw new Error('Stock not found');

      // Realistic slippage execution price from order book depth
      const execPrice = this.calculateExecutionPrice(stock, type, shares);
      const totalIC = Math.round((shares * execPrice) * 100) / 100;

      const existingHolding = db.prepare('SELECT * FROM holdings WHERE team_id = ? AND stock_id = ?').get(teamId, stockId);

      if (type === 'BUY') {
        if (existingHolding && existingHolding.position_type === 'SHORT') {
          throw new Error("Active SHORT position exists. Please use 'COVER' to buy back borrowed shares.");
        }
        if (stock.available_float < shares) {
          throw new Error(`Insufficient market liquidity. Only ${stock.available_float} shares available in float.`);
        }
        if (team.cash_balance < totalIC) {
          throw new Error(`Insufficient IC balance. Required: ${totalIC.toFixed(2)} IC, Available: ${team.cash_balance.toFixed(2)} IC`);
        }

        const newCash = Math.round((team.cash_balance - totalIC) * 100) / 100;
        const newAvailFloat = stock.available_float - shares;

        // Buying shifts price up (scarcity impact)
        const priceShift = Math.min(0.20, (shares / Math.max(1, stock.available_float)) * 0.25);
        const newPrice = Math.max(1.0, Math.round((stock.price * (1 + priceShift)) * 100) / 100);
        const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

        db.prepare('UPDATE teams SET cash_balance = ? WHERE id = ?').run(newCash, teamId);
        db.prepare(`
          UPDATE stocks 
          SET available_float = ?, price = ?, change_pct = ?, day_high = MAX(day_high, ?)
          WHERE id = ?
        `).run(newAvailFloat, newPrice, changePct, newPrice, stockId);

        if (existingHolding) {
          const totalShares = existingHolding.shares + shares;
          const totalCost = (existingHolding.shares * existingHolding.avg_buy_price) + totalIC;
          const newAvgPrice = Math.round((totalCost / totalShares) * 100) / 100;

          db.prepare(`
            UPDATE holdings 
            SET shares = ?, avg_buy_price = ?, position_type = 'LONG', updated_at = datetime('now')
            WHERE id = ?
          `).run(totalShares, newAvgPrice, existingHolding.id);
        } else {
          db.prepare(`
            INSERT INTO holdings (team_id, stock_id, shares, avg_buy_price, position_type, collateral_ic)
            VALUES (?, ?, ?, ?, 'LONG', 0.0)
          `).run(teamId, stockId, shares, execPrice);
        }

        // Add momentum to sector
        const curMom = this.sectorMomenta.get(stock.sector) || 0;
        this.sectorMomenta.set(stock.sector, curMom + ((shares / stock.total_float) * 0.10));

      } else if (type === 'SELL') {
        if (!existingHolding || existingHolding.position_type !== 'LONG' || existingHolding.shares < shares) {
          throw new Error(`Insufficient long holdings. You currently own ${existingHolding?.position_type === 'LONG' ? existingHolding.shares : 0} shares.`);
        }

        const newCash = Math.round((team.cash_balance + totalIC) * 100) / 100;
        const newAvailFloat = Math.min(stock.total_float, stock.available_float + shares);
        const remainingHoldingShares = existingHolding.shares - shares;

        // Selling shifts price down
        const priceDrop = Math.min(0.18, (shares / stock.total_float) * 0.22);
        const newPrice = Math.max(1.0, Math.round((stock.price * (1 - priceDrop)) * 100) / 100);
        const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

        db.prepare('UPDATE teams SET cash_balance = ? WHERE id = ?').run(newCash, teamId);
        db.prepare(`
          UPDATE stocks 
          SET available_float = ?, price = ?, change_pct = ?, day_low = MIN(day_low, ?)
          WHERE id = ?
        `).run(newAvailFloat, newPrice, changePct, newPrice, stockId);

        if (remainingHoldingShares === 0) {
          db.prepare('DELETE FROM holdings WHERE id = ?').run(existingHolding.id);
        } else {
          db.prepare(`UPDATE holdings SET shares = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(remainingHoldingShares, existingHolding.id);
        }

        // Dampen momentum
        const curMom = this.sectorMomenta.get(stock.sector) || 0;
        this.sectorMomenta.set(stock.sector, curMom - ((shares / stock.total_float) * 0.10));

      } else if (type === 'SHORT') {
        if (existingHolding && existingHolding.position_type === 'LONG') {
          throw new Error('Active LONG position exists. Please SELL your long shares before opening a short.');
        }
        if (stock.available_float < shares) {
          throw new Error(`Insufficient market liquidity to borrow shares. Only ${stock.available_float} shares available in float.`);
        }

        // 100% Margin Collateral Requirement
        const requiredCollateral = totalIC;
        if (team.cash_balance < requiredCollateral) {
          throw new Error(`Insufficient cash for short margin collateral. Required: ${requiredCollateral.toFixed(2)} IC, Available: ${team.cash_balance.toFixed(2)} IC`);
        }

        const newCash = Math.round((team.cash_balance - requiredCollateral) * 100) / 100;
        const newAvailFloat = stock.available_float - shares;

        // Short selling introduces selling pressure on market
        const priceDrop = Math.min(0.18, (shares / stock.total_float) * 0.22);
        const newPrice = Math.max(1.0, Math.round((stock.price * (1 - priceDrop)) * 100) / 100);
        const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

        db.prepare('UPDATE teams SET cash_balance = ? WHERE id = ?').run(newCash, teamId);
        db.prepare(`
          UPDATE stocks 
          SET available_float = ?, price = ?, change_pct = ?, day_low = MIN(day_low, ?)
          WHERE id = ?
        `).run(newAvailFloat, newPrice, changePct, newPrice, stockId);

        if (existingHolding) {
          const totalShares = existingHolding.shares + shares;
          const totalCollateral = existingHolding.collateral_ic + requiredCollateral;
          const newAvgPrice = Math.round(((existingHolding.shares * existingHolding.avg_buy_price) + totalIC) / totalShares * 100) / 100;

          db.prepare(`
            UPDATE holdings 
            SET shares = ?, avg_buy_price = ?, collateral_ic = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(totalShares, newAvgPrice, totalCollateral, existingHolding.id);
        } else {
          db.prepare(`
            INSERT INTO holdings (team_id, stock_id, shares, avg_buy_price, position_type, collateral_ic)
            VALUES (?, ?, ?, ?, 'SHORT', ?)
          `).run(teamId, stockId, shares, execPrice, requiredCollateral);
        }

        const curMom = this.sectorMomenta.get(stock.sector) || 0;
        this.sectorMomenta.set(stock.sector, curMom - ((shares / stock.total_float) * 0.10));

      } else if (type === 'COVER') {
        if (!existingHolding || existingHolding.position_type !== 'SHORT' || existingHolding.shares < shares) {
          throw new Error(`No active SHORT position found to cover. You currently short ${existingHolding?.position_type === 'SHORT' ? existingHolding.shares : 0} shares.`);
        }

        // Realized P&L = (Entry Price - Current Execution Price) * Shares
        const realizedPL = Math.round(((existingHolding.avg_buy_price - execPrice) * shares) * 100) / 100;
        // Release proportional collateral
        const collateralToRelease = Math.round(((shares / existingHolding.shares) * existingHolding.collateral_ic) * 100) / 100;
        const netCashReturn = Math.max(0, collateralToRelease + realizedPL);

        const newCash = Math.round((team.cash_balance + netCashReturn) * 100) / 100;
        const newAvailFloat = Math.min(stock.total_float, stock.available_float + shares);
        const remainingHoldingShares = existingHolding.shares - shares;
        const remainingCollateral = Math.max(0, existingHolding.collateral_ic - collateralToRelease);

        // Covering buys back shares, shifting price up
        const priceShift = Math.min(0.20, (shares / Math.max(1, stock.available_float)) * 0.25);
        const newPrice = Math.max(1.0, Math.round((stock.price * (1 + priceShift)) * 100) / 100);
        const changePct = Math.round(((newPrice - stock.prev_close) / stock.prev_close) * 10000) / 100;

        db.prepare('UPDATE teams SET cash_balance = ? WHERE id = ?').run(newCash, teamId);
        db.prepare(`
          UPDATE stocks 
          SET available_float = ?, price = ?, change_pct = ?, day_high = MAX(day_high, ?)
          WHERE id = ?
        `).run(newAvailFloat, newPrice, changePct, newPrice, stockId);

        if (remainingHoldingShares === 0) {
          db.prepare('DELETE FROM holdings WHERE id = ?').run(existingHolding.id);
        } else {
          db.prepare(`UPDATE holdings SET shares = ?, collateral_ic = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(remainingHoldingShares, remainingCollateral, existingHolding.id);
        }

        const curMom = this.sectorMomenta.get(stock.sector) || 0;
        this.sectorMomenta.set(stock.sector, curMom + ((shares / stock.total_float) * 0.10));
      }

      // Record trade audit log
      const tradeId = 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
      const timestamp = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO trades (id, team_id, stock_id, type, shares, price_per_share, total_ic, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, teamId, stockId, type, shares, execPrice, totalIC, timestamp);

      return {
        tradeId,
        teamId,
        stockId,
        symbol: stock.symbol,
        type,
        shares,
        executedPrice: execPrice,
        totalIC,
        timestamp
      };
    });

    const tradeResult = executeTx();

    // Complete admin surveillance payload
    const teamMeta = db.prepare('SELECT team_name, team_code, leader_name FROM teams WHERE id = ?').get(teamId);
    const auditPayload = {
      ...tradeResult,
      team_name: teamMeta?.team_name || 'Unknown Team',
      team_code: teamMeta?.team_code || '',
      leader_name: teamMeta?.leader_name || ''
    };

    // Broadcast updated stock, orderbook, and portfolios
    const updatedStock = this.getStock(stockId);
    const orderBook = this.getOrderBook(stockId);

    this.io.emit('stock:updated', updatedStock);
    this.io.emit('orderbook:updated', orderBook);
    this.io.to('admin').emit('leaderboard:updated', this.getLeaderboard());
    this.io.to('admin').emit('admin:trade_executed', auditPayload);
    this.io.emit('trade:executed_global', auditPayload);

    return tradeResult;
  }

  // --- LIMIT ORDERS & STOP-LOSS ORDERS ENGINE ---

  placeOrder({ teamId, stockId, side, orderType, targetPrice, shares }) {
    const state = this.getMarketState();
    if (state.status !== 'OPEN') {
      throw new Error(`Market is currently ${state.status}. Orders cannot be placed.`);
    }

    const parsedShares = Number(shares);
    const parsedTarget = Math.round(Number(targetPrice) * 100) / 100;

    if (!Number.isInteger(parsedShares) || parsedShares <= 0 || parsedShares > 500) {
      throw new Error('Order quantity must be a positive integer up to 500 shares.');
    }
    if (!parsedTarget || parsedTarget <= 0) {
      throw new Error('Target price must be a valid positive number.');
    }
    if (!['BUY', 'SELL', 'SHORT', 'COVER'].includes(side)) {
      throw new Error('Invalid order side.');
    }
    if (!['LIMIT', 'STOP_LOSS'].includes(orderType)) {
      throw new Error('Invalid order type.');
    }

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) throw new Error('Team not found.');

    const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId);
    if (!stock) throw new Error('Stock not found.');

    const holding = db.prepare('SELECT * FROM holdings WHERE team_id = ? AND stock_id = ?').get(teamId, stockId);
    const requiredCost = Math.round(parsedShares * parsedTarget * 100) / 100;

    if (side === 'BUY' && team.cash_balance < requiredCost) {
      throw new Error(`Insufficient IC balance for limit buy. Required: ${requiredCost.toFixed(2)} IC, Cash: ${team.cash_balance.toFixed(2)} IC`);
    }
    if (side === 'SELL') {
      if (!holding || holding.position_type !== 'LONG' || holding.shares < parsedShares) {
        throw new Error(`Insufficient long shares owned. You hold ${holding?.position_type === 'LONG' ? holding.shares : 0} long shares.`);
      }
    }
    if (side === 'SHORT' && team.cash_balance < requiredCost) {
      throw new Error(`Insufficient margin collateral for limit short. Required: ${requiredCost.toFixed(2)} IC, Cash: ${team.cash_balance.toFixed(2)} IC`);
    }
    if (side === 'COVER') {
      if (!holding || holding.position_type !== 'SHORT' || holding.shares < parsedShares) {
        throw new Error(`No matching short position. You currently short ${holding?.position_type === 'SHORT' ? holding.shares : 0} shares.`);
      }
    }

    const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO orders (id, team_id, stock_id, side, order_type, target_price, shares, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(orderId, teamId, stockId, side, orderType, parsedTarget, parsedShares, now);

    const placedOrder = {
      id: orderId,
      team_id: teamId,
      stock_id: stockId,
      symbol: stock.symbol,
      side,
      order_type: orderType,
      target_price: parsedTarget,
      shares: parsedShares,
      status: 'PENDING',
      created_at: now
    };

    this.io.to(`team:${teamId}`).emit('order:placed', placedOrder);
    return placedOrder;
  }

  cancelOrder({ orderId, teamId }) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found.');
    if (order.team_id !== teamId) throw new Error('Unauthorized to cancel this order.');
    if (order.status !== 'PENDING') throw new Error(`Cannot cancel order in ${order.status} state.`);

    db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
    const updated = { ...order, status: 'CANCELLED' };
    this.io.to(`team:${teamId}`).emit('order:cancelled', updated);
    return updated;
  }

  getTeamOrders(teamId) {
    return db.prepare(`
      SELECT o.*, s.symbol, s.name as stock_name
      FROM orders o
      JOIN stocks s ON o.stock_id = s.id
      WHERE o.team_id = ?
      ORDER BY o.created_at DESC
      LIMIT 50
    `).all(teamId);
  }

  matchPendingOrders(stocks) {
    const pendingOrders = db.prepare("SELECT * FROM orders WHERE status = 'PENDING'").all();
    if (pendingOrders.length === 0) return;

    for (const order of pendingOrders) {
      const stock = stocks.find(s => s.id === order.stock_id);
      if (!stock) continue;

      let isTriggered = false;

      if (order.order_type === 'LIMIT') {
        if (order.side === 'BUY' && stock.price <= order.target_price) isTriggered = true;
        if (order.side === 'SELL' && stock.price >= order.target_price) isTriggered = true;
        if (order.side === 'SHORT' && stock.price >= order.target_price) isTriggered = true;
        if (order.side === 'COVER' && stock.price <= order.target_price) isTriggered = true;
      } else if (order.order_type === 'STOP_LOSS') {
        if (order.side === 'SELL' && stock.price <= order.target_price) isTriggered = true;
        if (order.side === 'COVER' && stock.price >= order.target_price) isTriggered = true;
      }

      if (isTriggered) {
        try {
          const trade = this.executeOrder({
            teamId: order.team_id,
            stockId: order.stock_id,
            type: order.side,
            shares: order.shares,
            isTriggeredOrder: true
          });

          const now = Math.floor(Date.now() / 1000);
          db.prepare("UPDATE orders SET status = 'FILLED', filled_at = ? WHERE id = ?").run(now, order.id);

          this.io.to(`team:${order.team_id}`).emit('order:filled', { orderId: order.id, trade });
          const updatedPort = this.getTeamPortfolio(order.team_id);
          this.io.to(`team:${order.team_id}`).emit('portfolio:updated', updatedPort);
        } catch (err) {
          db.prepare("UPDATE orders SET status = 'REJECTED' WHERE id = ?").run(order.id);
          this.io.to(`team:${order.team_id}`).emit('order:rejected', { orderId: order.id, reason: err.message });
        }
      }
    }
  }

  getTeamPortfolio(teamId) {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return null;

    const holdingsRows = db.prepare(`
      SELECT h.*, s.symbol, s.name, s.price as current_price, s.sector 
      FROM holdings h
      JOIN stocks s ON h.stock_id = s.id
      WHERE h.team_id = ?
    `).all(teamId);

    let stockPortfolioValue = 0;
    let totalInvestedCost = 0;

    const holdings = holdingsRows.map(h => {
      const isShort = h.position_type === 'SHORT';
      let marketVal = 0;
      let costBasis = 0;
      let unrealizedPL = 0;
      let unrealizedPLPct = 0;

      if (isShort) {
        costBasis = h.collateral_ic || Math.round((h.shares * h.avg_buy_price) * 100) / 100;
        unrealizedPL = Math.round(((h.avg_buy_price - h.current_price) * h.shares) * 100) / 100;
        marketVal = Math.max(0, Math.round((costBasis + unrealizedPL) * 100) / 100);
        unrealizedPLPct = h.avg_buy_price > 0 ? Math.round(((h.avg_buy_price - h.current_price) / h.avg_buy_price) * 10000) / 100 : 0;
      } else {
        marketVal = Math.round((h.shares * h.current_price) * 100) / 100;
        costBasis = Math.round((h.shares * h.avg_buy_price) * 100) / 100;
        unrealizedPL = Math.round((marketVal - costBasis) * 100) / 100;
        unrealizedPLPct = costBasis > 0 ? Math.round(((marketVal - costBasis) / costBasis) * 10000) / 100 : 0;
      }

      stockPortfolioValue += marketVal;
      totalInvestedCost += costBasis;

      return {
        ...h,
        position_type: h.position_type || 'LONG',
        collateral_ic: h.collateral_ic || 0,
        market_value: marketVal,
        cost_basis: costBasis,
        unrealized_pl: unrealizedPL,
        unrealized_pl_pct: unrealizedPLPct
      };
    });

    const totalNetWorth = Math.round((team.cash_balance + stockPortfolioValue) * 100) / 100;
    const totalProfitLoss = Math.round((totalNetWorth - team.initial_balance) * 100) / 100;
    const totalReturnPct = Math.round((totalProfitLoss / team.initial_balance) * 10000) / 100;

    const trades = db.prepare(`
      SELECT t.*, s.symbol, s.name 
      FROM trades t
      JOIN stocks s ON t.stock_id = s.id
      WHERE t.team_id = ?
      ORDER BY t.timestamp DESC 
      LIMIT 25
    `).all(teamId);

    return {
      team: {
        id: team.id,
        team_code: team.team_code,
        team_name: team.team_name,
        leader_name: team.leader_name,
        leader_email: team.leader_email,
        cash_balance: team.cash_balance,
        initial_balance: team.initial_balance,
        is_leader_active: team.is_leader_active
      },
      holdings,
      stock_portfolio_value: Math.round(stockPortfolioValue * 100) / 100,
      total_net_worth: totalNetWorth,
      total_profit_loss: totalProfitLoss,
      total_return_pct: totalReturnPct,
      trades
    };
  }

  getLeaderboard() {
    const teams = db.prepare('SELECT id, team_code, team_name, leader_name, cash_balance, initial_balance, is_leader_active FROM teams').all();

    const leaderboard = teams.map(t => {
      const holdings = db.prepare(`
        SELECT h.shares, h.avg_buy_price, h.position_type, h.collateral_ic, s.price 
        FROM holdings h
        JOIN stocks s ON h.stock_id = s.id
        WHERE h.team_id = ?
      `).all(t.id);

      const stockVal = holdings.reduce((sum, h) => {
        if (h.position_type === 'SHORT') {
          const collateral = h.collateral_ic || (h.shares * h.avg_buy_price);
          const pnl = (h.avg_buy_price - h.price) * h.shares;
          return sum + Math.max(0, collateral + pnl);
        }
        return sum + (h.shares * h.price);
      }, 0);

      const netWorth = Math.round((t.cash_balance + stockVal) * 100) / 100;
      const profitLoss = Math.round((netWorth - t.initial_balance) * 100) / 100;
      const returnPct = Math.round((profitLoss / t.initial_balance) * 10000) / 100;

      const tradeCount = db.prepare('SELECT COUNT(*) as count FROM trades WHERE team_id = ?').get(t.id).count;

      return {
        id: t.id,
        team_code: t.team_code,
        team_name: t.team_name,
        leader_name: t.leader_name,
        cash_balance: t.cash_balance,
        stock_value: Math.round(stockVal * 100) / 100,
        net_worth: netWorth,
        profit_loss: profitLoss,
        return_pct: returnPct,
        trades_count: tradeCount,
        is_online: Boolean(t.is_leader_active)
      };
    });

    leaderboard.sort((a, b) => b.net_worth - a.net_worth);
    return leaderboard.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }
}

export default MarketEngine;
