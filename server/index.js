import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import db from './db.js';
import MarketEngine from './marketEngine.js';
import { 
  generateFullBackup, 
  restoreFromBackup, 
  initAutoBackup, 
  triggerSnapshot, 
  getBackupStatus 
} from './backupManager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// In-memory security state
const adminTokens = new Set();
const lastTradeTimes = new Map(); // teamId -> timestamp ms
let snapshotDebounce = null;
const requestDebouncedSnapshot = () => {
  if (snapshotDebounce) return;
  snapshotDebounce = setTimeout(() => {
    snapshotDebounce = null;
    triggerSnapshot().catch(() => {});
  }, 15000); // Trigger snapshot at most once per 15s under high trading load
};
// Dynamic synchronized market admins list pulled from main hackathon portal
let syncedMarketAdmins = [
  { email: 'artharambachalil@gmail.com', role: 'superadmin' }
];

// Helper to check if an email or token is an authorized market admin
const isAuthorizedMarketAdmin = (email) => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (clean === 'artharambachalil@gmail.com') return true;
  return syncedMarketAdmins.some(a => a.email?.toLowerCase() === clean && (a.role === 'market_admin' || a.role === 'superadmin' || a.role === 'admin'));
};

// Auth Middleware: Verify Admin Bearer Token
const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Valid Admin Session Token required.' });
  }
  next();
};

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Initialize Market Simulation Engine
const engine = new MarketEngine(io);
engine.init();

// --- SOCKET.IO REALTIME EVENTS ---
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send initial snapshot on connect
  socket.emit('market:state', engine.getMarketState());
  socket.emit('market:stocks', engine.getAllStocks());

  // Join dedicated rooms if needed
  socket.on('join:team', ({ teamId }) => {
    socket.join(`team:${teamId}`);
  });

  socket.on('join:admin', () => {
    socket.join('admin');
    socket.emit('leaderboard:updated', engine.getLeaderboard());
  });

  socket.on('admin:toggle_projector_trades', ({ visible }) => {
    io.emit('projector:trades_visibility', { visible: Boolean(visible) });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// --- REST API ROUTES ---

// 1. Health & Status
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/market/state', (req, res) => {
  const state = engine.getMarketState();
  const stocks = engine.getAllStocks();
  const news = db.prepare('SELECT * FROM news ORDER BY timestamp DESC LIMIT 20').all();
  res.json({ state, stocks, news });
});

app.get('/api/market/candles/:stockId', (req, res) => {
  try {
    const candles = engine.getLatestCandles(req.params.stockId, 120);
    res.json({ candles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market/orderbook/:stockId', (req, res) => {
  try {
    const orderbook = engine.getOrderBook(req.params.stockId);
    if (!orderbook) return res.status(404).json({ error: 'Stock not found' });
    res.json(orderbook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to generate a unique, deterministic 4-digit PIN for each team
function getTeamTraderPin(reg) {
  if (reg && reg.utr_reference) {
    const digits = String(reg.utr_reference).replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
  }
  let hash = 0;
  const str = (reg && reg.id) || 'team';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return String(1000 + (Math.abs(hash) % 9000));
}

// Helper to automatically pull approved teams from Supabase
async function pullApprovedTeamsFromSupabase() {
  const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
  const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
  try {
    const res = await fetch(`${sbUrl}/rest/v1/team_registrations?status=eq.approved&select=*`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return 0;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return 0;

    const currentState = engine.getMarketState();
    const startingIC = currentState?.base_ic || 10000.0;

    const insertOrUpdate = db.prepare(`
      INSERT INTO teams (id, team_code, team_name, password, leader_name, leader_email, cash_balance, initial_balance)
      VALUES (@id, @team_code, @team_name, @password, @leader_name, @leader_email, @starting_ic, @starting_ic)
      ON CONFLICT(team_code) DO UPDATE SET 
        team_name = @team_name,
        password = @password,
        leader_name = @leader_name,
        leader_email = @leader_email
    `);

    let synced = 0;
    for (const d of data) {
      const code = `ARTH-${d.id.slice(-4).toUpperCase()}`;
      insertOrUpdate.run({
        id: d.id,
        team_code: code,
        team_name: d.team_name || 'Team ' + code,
        password: getTeamTraderPin(d),
        leader_name: d.leader_email ? d.leader_email.split('@')[0] : 'Leader',
        leader_email: d.leader_email || '',
        starting_ic: startingIC
      });
      synced++;
    }
    console.log(`[TeamsSync] Successfully synced ${synced} approved teams from Supabase.`);
    return synced;
  } catch (err) {
    console.warn('[TeamsSync] Supabase pull warning:', err.message);
    return 0;
  }
}

// 2. Authentication (Team Leader Login with Single-Session Lock)
app.post('/api/auth/login', async (req, res) => {
  const { team_code, password, force_takeover } = req.body;

  if (!team_code || !password) {
    return res.status(400).json({ error: 'Team code and password/PIN are required' });
  }

  const trimmedCode = team_code.trim();
  const searchUpper = trimmedCode.toUpperCase();
  const rawCode = searchUpper.replace(/^ARTH-/, '');

  let team = db.prepare(`
    SELECT * FROM teams 
    WHERE UPPER(team_code) = ? 
       OR UPPER(team_code) = ? 
       OR UPPER(id) = ? 
       OR UPPER(REPLACE(team_code, 'ARTH-', '')) = ?
  `).get(searchUpper, `ARTH-${rawCode}`, searchUpper, rawCode);

  // If team not found in local SQLite, auto-pull approved teams from Supabase on the fly
  if (!team) {
    try {
      await pullApprovedTeamsFromSupabase();
      team = db.prepare(`
        SELECT * FROM teams 
        WHERE UPPER(team_code) = ? 
           OR UPPER(team_code) = ? 
           OR UPPER(id) = ? 
           OR UPPER(REPLACE(team_code, 'ARTH-', '')) = ?
      `).get(searchUpper, `ARTH-${rawCode}`, searchUpper, rawCode);
    } catch (_) {}
  }

  if (!team) {
    return res.status(401).json({ error: 'Invalid team code. Please verify the code displayed on your hackathon profile.' });
  }

  if (team.password !== password.trim()) {
    return res.status(401).json({ error: 'Incorrect password / PIN.' });
  }

  // Single-Session Lock Check
  if (team.is_leader_active && !force_takeover) {
    return res.status(409).json({
      error: 'An active trading session is already in progress for this team leader.',
      requiresConfirmation: true,
      message: 'Only one person (the Team Leader) can trade at a time. Do you want to terminate the existing session and take over?'
    });
  }

  const newSessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

  db.prepare(`
    UPDATE teams 
    SET is_leader_active = 1, active_session_id = ?, last_active_at = datetime('now')
    WHERE id = ?
  `).run(newSessionId, team.id);

  // Notify admin
  io.to('admin').emit('team:session_changed', { teamId: team.id, isOnline: true });
  io.emit('leaderboard:updated', engine.getLeaderboard());

  res.json({
    success: true,
    sessionId: newSessionId,
    team: {
      id: team.id,
      team_code: team.team_code,
      team_name: team.team_name,
      leader_name: team.leader_name,
      cash_balance: team.cash_balance,
      initial_balance: team.initial_balance
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const { teamId } = req.body;
  if (teamId) {
    db.prepare('UPDATE teams SET is_leader_active = 0, active_session_id = NULL WHERE id = ?').run(teamId);
    io.to('admin').emit('team:session_changed', { teamId, isOnline: false });
    io.emit('leaderboard:updated', engine.getLeaderboard());
  }
  res.json({ success: true });
});

// 2b. Guest Test Trader Login (Instant 1-Click for Dry-Runs)
app.post('/api/auth/guest-login', (req, res) => {
  try {
    const state = engine.getMarketState();
    if (!state.test_session_active) {
      return res.status(403).json({ error: 'Test trading session is not currently active. Please contact the administrator.' });
    }

    const baseIC = state.base_ic || 10000.0;
    let chosenTeam = null;

    // Find or create next available test team (TEST-01 to TEST-50)
    for (let i = 1; i <= 50; i++) {
      const code = `TEST-${String(i).padStart(2, '0')}`;
      const teamId = `test-${String(i).padStart(2, '0')}`;
      let existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
      if (!existing) {
        db.prepare(`
          INSERT INTO teams (id, team_code, team_name, password, leader_name, leader_email, cash_balance, initial_balance, is_leader_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(teamId, code, `Test Trader ${String(i).padStart(2, '0')}`, '1111', `Tester ${i}`, `tester${i}@arthmantra.tech`, baseIC, baseIC);
        existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
      }
      
      if (!existing.is_leader_active) {
        chosenTeam = existing;
        break;
      }
    }

    // Fallback if all 50 slots are active: take over oldest inactive slot
    if (!chosenTeam) {
      chosenTeam = db.prepare("SELECT * FROM teams WHERE id LIKE 'test-%' ORDER BY last_active_at ASC LIMIT 1").get();
    }

    if (!chosenTeam) {
      return res.status(500).json({ error: 'No test trader slots available right now.' });
    }

    const newSessionId = 'sess-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    db.prepare(`
      UPDATE teams 
      SET is_leader_active = 1, active_session_id = ?, last_active_at = datetime('now')
      WHERE id = ?
    `).run(newSessionId, chosenTeam.id);

    io.to('admin').emit('team:session_changed', { teamId: chosenTeam.id, isOnline: true });
    io.emit('leaderboard:updated', engine.getLeaderboard());

    res.json({
      success: true,
      sessionId: newSessionId,
      team: {
        id: chosenTeam.id,
        team_code: chosenTeam.team_code,
        team_name: chosenTeam.team_name,
        leader_name: chosenTeam.leader_name,
        cash_balance: chosenTeam.cash_balance,
        initial_balance: chosenTeam.initial_balance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Login (Accepts Master Password or Synced Market Admin Credentials)
app.post('/api/auth/admin-login', (req, res) => {
  const { password, email } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || process.env.PORTAL_SYNC_SECRET || 'ArthAdmin2026!';

  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanPass = password ? password.trim() : '';

  // 1. Master password match
  const isMasterMatch = cleanPass === adminPass;
  // 2. Email-based Market Admin authorization
  const isMarketAdminUser = cleanEmail && isAuthorizedMarketAdmin(cleanEmail) && (cleanPass === adminPass || cleanPass.length >= 6);

  if (isMasterMatch || isMarketAdminUser) {
    const token = 'adm_' + crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    res.json({ 
      success: true, 
      role: isMarketAdminUser ? 'market_admin' : 'admin', 
      email: cleanEmail || 'superadmin',
      token 
    });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials or unauthorized market admin role.' });
  }
});

// Verify Admin Session Token
app.get('/api/auth/verify-admin', requireAdminAuth, (req, res) => {
  res.json({ success: true, valid: true });
});

// 3. Trade Orders (Secured with Session Validation & 1.5s Rate Limiter)
app.post('/api/trade/order', (req, res) => {
  try {
    const { teamId, sessionId, stockId, type, shares } = req.body;
    
    // Check missing fields
    if (!teamId || !stockId || !type) {
      return res.status(400).json({ error: 'Missing required order parameters.' });
    }

    // 1. Session verification & Ownership check (Prevent IDOR attack)
    const authHeader = req.headers.authorization;
    const bearerSession = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const effectiveSessionId = sessionId || bearerSession;

    if (!effectiveSessionId) {
      return res.status(401).json({ error: 'Authentication required: Active Session ID missing.' });
    }

    const team = db.prepare('SELECT id, is_leader_active, active_session_id FROM teams WHERE id = ?').get(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team record not found.' });
    }

    if (team.active_session_id !== effectiveSessionId) {
      return res.status(403).json({ 
        error: 'Session invalid or expired. Only the logged-in Team Leader can execute trades.' 
      });
    }

    // 2. Strict Input Sanitization
    const parsedShares = Number(shares);
    if (!Number.isInteger(parsedShares) || parsedShares <= 0) {
      return res.status(400).json({ error: 'Order shares must be a positive whole integer.' });
    }
    if (parsedShares > 500) {
      return res.status(400).json({ error: 'Maximum order cap exceeded: 500 shares per execution.' });
    }

    // 3. Bot Protection & Rate Limiting (1.5 second cooldown per team)
    const now = Date.now();
    const lastTrade = lastTradeTimes.get(teamId) || 0;
    if (now - lastTrade < 1500) {
      const waitRemaining = Math.ceil((1500 - (now - lastTrade)) / 100) / 10;
      return res.status(429).json({ 
        error: `High-frequency cooldown: Please wait ${waitRemaining}s before submitting another order.` 
      });
    }
    lastTradeTimes.set(teamId, now);

    const result = engine.executeOrder({ teamId, stockId, type, shares: parsedShares });

    // Send updated portfolio back to this team's room
    const updatedPortfolio = engine.getTeamPortfolio(teamId);
    io.to(`team:${teamId}`).emit('portfolio:updated', updatedPortfolio);

    // Asynchronously snapshot market state for fault tolerance & multi-cloud redundancy
    requestDebouncedSnapshot();

    res.json({ success: true, trade: result, portfolio: updatedPortfolio });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/team/portfolio/:teamId', (req, res) => {
  const portfolio = engine.getTeamPortfolio(req.params.teamId);
  if (!portfolio) return res.status(404).json({ error: 'Team not found' });
  res.json(portfolio);
});

// Place Resting Limit or Stop-Loss Order
app.post('/api/orders/place', (req, res) => {
  try {
    const { teamId, sessionId, stockId, side, orderType, targetPrice, shares } = req.body;
    if (!teamId || !stockId || !side || !orderType || !targetPrice || !shares) {
      return res.status(400).json({ error: 'Missing required order parameters.' });
    }

    const authHeader = req.headers.authorization;
    const bearerSession = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const effectiveSessionId = sessionId || bearerSession;

    const team = db.prepare('SELECT id, active_session_id FROM teams WHERE id = ?').get(teamId);
    if (!team || team.active_session_id !== effectiveSessionId) {
      return res.status(403).json({ error: 'Session invalid or expired. Only the logged-in Team Leader can place orders.' });
    }

    const order = engine.placeOrder({ teamId, stockId, side, orderType, targetPrice, shares });
    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel Resting Order
app.post('/api/orders/cancel', (req, res) => {
  try {
    const { teamId, sessionId, orderId } = req.body;
    if (!teamId || !orderId) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const authHeader = req.headers.authorization;
    const bearerSession = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const effectiveSessionId = sessionId || bearerSession;

    const team = db.prepare('SELECT id, active_session_id FROM teams WHERE id = ?').get(teamId);
    if (!team || team.active_session_id !== effectiveSessionId) {
      return res.status(403).json({ error: 'Session invalid or expired. Only the logged-in Team Leader can cancel orders.' });
    }

    const cancelledOrder = engine.cancelOrder({ orderId, teamId });
    res.json({ success: true, order: cancelledOrder });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Team Orders
app.get('/api/team/orders/:teamId', (req, res) => {
  try {
    const orders = engine.getTeamOrders(req.params.teamId);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Leaderboard (Scorecard is restricted to authorized Admins; team codes stripped)
app.get('/api/leaderboard', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAdmin = token && adminTokens.has(token);

  if (!isAdmin) {
    return res.status(403).json({ error: 'Access Denied: Scorecard is restricted to authorized administrators.' });
  }

  // Sanitize: strip unique team_code so team codes are not displayed anywhere
  const sanitized = engine.getLeaderboard().map(entry => {
    const { team_code, ...rest } = entry;
    return rest;
  });

  res.json({ leaderboard: sanitized });
});

// 5. Admin Controls (Protected by requireAdminAuth)
app.post('/api/admin/market-control', requireAdminAuth, (req, res) => {
  const { status, durationMins } = req.body;
  try {
    const state = engine.setMarketStatus(status, durationMins ? parseInt(durationMins, 10) : null);
    res.json({ success: true, state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/reset-timer', requireAdminAuth, (req, res) => {
  const { durationMins } = req.body;
  try {
    const state = engine.resetTimer(durationMins ? parseInt(durationMins, 10) : null);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Test Session Button on Login Page
app.post('/api/admin/toggle-test-session', requireAdminAuth, (req, res) => {
  const { active } = req.body;
  try {
    const state = engine.setTestSessionActive(Boolean(active));
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Purge all test session data (trades, holdings, and test accounts)
app.post('/api/admin/purge-test-data', requireAdminAuth, (req, res) => {
  const { resetStocks } = req.body;
  try {
    const summary = engine.purgeTestData(Boolean(resetStocks));
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projector/recent-trades', (req, res) => {
  try {
    const trades = db.prepare(`
      SELECT t.id, t.type, t.shares, t.price_per_share, t.total_ic, t.timestamp, s.symbol, tm.team_name, tm.leader_name
      FROM trades t
      JOIN stocks s ON t.stock_id = s.id
      JOIN teams tm ON t.team_id = tm.id
      ORDER BY t.timestamp DESC
      LIMIT 15
    `).all();
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle visibility of credentials to participants (separate button)
app.post('/api/admin/toggle-credentials', requireAdminAuth, async (req, res) => {
  const { released } = req.body;
  try {
    const state = engine.setCredentialsReleased(Boolean(released));
    
    // Sync to Supabase active hackathon config
    try {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const configStr = `MARKET_CONFIG:${JSON.stringify({ credentials_released: Boolean(released) })}`;
      await fetch(`${sbUrl}/rest/v1/hackathons?is_active=eq.true`, {
        method: 'PATCH',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ upi_id: configStr })
      });
    } catch (e) {
      console.warn('[Credentials] Failed to patch Supabase hackathon:', e.message);
    }

    if (released) {
      pullApprovedTeamsFromSupabase().catch(() => {});
    }
    res.json({ success: true, credentials_released: Boolean(state.credentials_released), state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Schedule Future Open & Close
app.post('/api/admin/schedule-times', requireAdminAuth, (req, res) => {
  const { scheduled_open_at, scheduled_close_at, durationMins } = req.body;
  try {
    const state = engine.scheduleMarketTimes({ scheduled_open_at, scheduled_close_at, durationMins });
    res.json({ success: true, state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/induce-withdraw', requireAdminAuth, (req, res) => {
  const { stockId, action, shares } = req.body;
  try {
    const count = parseInt(shares, 10);
    let updated;
    if (action === 'INDUCE') {
      updated = engine.induceShares(stockId, count);
    } else if (action === 'WITHDRAW') {
      updated = engine.withdrawShares(stockId, count);
    } else {
      throw new Error('Action must be INDUCE or WITHDRAW');
    }

    io.emit('stock:updated', updated);
    res.json({ success: true, stock: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/news', requireAdminAuth, (req, res) => {
  const { headline, content, affectedSymbols, priceImpactPct } = req.body;
  try {
    const news = engine.injectNews(
      headline,
      content,
      affectedSymbols || ['ALL'],
      parseFloat(priceImpactPct) || 0
    );
    res.json({ success: true, news });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Stealth Price Shock Engine (No participant notifications)
app.post('/api/admin/price-shock', requireAdminAuth, (req, res) => {
  const { targets, priceImpactPct, sector, volatilityBoost } = req.body;
  try {
    const result = engine.applyPriceShock({
      targets: targets || ['ALL'],
      priceImpactPct: parseFloat(priceImpactPct) || 0,
      sector: sector || null,
      volatilityBoost: Boolean(volatilityBoost)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create or update stock
app.post('/api/admin/stock', requireAdminAuth, (req, res) => {
  const { id, symbol, name, sector, total_float, price, volatility, description, ps_metrics } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM stocks WHERE id = ? OR symbol = ?').get(id || '', (symbol || '').toUpperCase());

    const numTotalFloat = parseInt(total_float, 10) || 1000;
    const numPrice = parseFloat(price) || 100.0;
    const numVol = parseFloat(volatility) || 0.02;
    const cleanSym = (symbol || '').toUpperCase();

    if (existing) {
      db.prepare(`
        UPDATE stocks 
        SET symbol = @symbol, name = @name, sector = @sector, total_float = @total_float, 
            available_float = @available_float, price = @price, volatility = @volatility, 
            description = @description, ps_metrics = @ps_metrics, is_active = 1
        WHERE id = @id
      `).run({
        id: existing.id,
        symbol: cleanSym,
        name,
        sector,
        total_float: numTotalFloat,
        available_float: numTotalFloat,
        price: numPrice,
        volatility: numVol,
        description: description || '',
        ps_metrics: typeof ps_metrics === 'object' ? JSON.stringify(ps_metrics) : (ps_metrics || '{}')
      });

      engine.injectNews(
        `EXCHANGE UPDATE: ${cleanSym} corporate parameters revised`,
        `${name} (${cleanSym}) shares active on the exchange. Available float reset to ${numTotalFloat}.`,
        [cleanSym],
        0
      );
    } else {
      const stockId = 'stock-' + cleanSym.toLowerCase();
      db.prepare(`
        INSERT INTO stocks (id, symbol, name, sector, total_float, available_float, price, prev_close, day_high, day_low, volatility, description, ps_metrics, is_active)
        VALUES (@id, @symbol, @name, @sector, @total_float, @available_float, @price, @price, @price, @price, @volatility, @description, @ps_metrics, 1)
      `).run({
        id: stockId,
        symbol: cleanSym,
        name,
        sector,
        total_float: numTotalFloat,
        available_float: numTotalFloat,
        price: numPrice,
        volatility: numVol,
        description: description || '',
        ps_metrics: typeof ps_metrics === 'object' ? JSON.stringify(ps_metrics) : (ps_metrics || '{}')
      });

      engine.currentCandles.set(stockId, {
        open: numPrice,
        high: numPrice,
        low: numPrice,
        close: numPrice,
        volume: 0,
        timestamp: Math.floor(Date.now() / 15000) * 15
      });

      engine.injectNews(
        `NEW IPO LISTING: ${cleanSym} officially inducted into exchange!`,
        `${name} (${cleanSym}) is now live for trading. Sector: ${sector}. Float: ${numTotalFloat} shares @ ${numPrice.toFixed(2)} IC.`,
        [cleanSym],
        0
      );
    }

    const allStocks = engine.getAllStocks();
    io.emit('market:stocks', allStocks);
    res.json({ success: true, stocks: allStocks });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete (Delist) stock
app.delete('/api/admin/stock/:stockId', requireAdminAuth, (req, res) => {
  try {
    const { stockId } = req.params;
    const deleted = engine.deleteStock(stockId);
    const allStocks = engine.getAllStocks();
    io.emit('market:stocks', allStocks);
    res.json({ success: true, delisted: deleted, stocks: allStocks });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Teams List & Management
app.get('/api/admin/teams', requireAdminAuth, async (req, res) => {
  let teams = db.prepare('SELECT * FROM teams ORDER BY team_name ASC').all();
  if (!teams || teams.length === 0) {
    try {
      await pullApprovedTeamsFromSupabase();
      teams = db.prepare('SELECT * FROM teams ORDER BY team_name ASC').all();
    } catch (e) {
      console.warn('Auto-pull teams failed:', e.message);
    }
  }
  const enhanced = teams.map(t => {
    const portfolio = engine.getTeamPortfolio(t.id);
    return {
      ...t,
      net_worth: portfolio.total_net_worth,
      stock_value: portfolio.stock_portfolio_value,
      profit_loss: portfolio.total_profit_loss,
      holdings: portfolio.holdings,
      trades: portfolio.trades
    };
  });
  res.json({ teams: enhanced });
});

// Comprehensive Trade Surveillance & Audit Log for Admins
app.get('/api/admin/trades', requireAdminAuth, (req, res) => {
  try {
    const { teamId, stockId, limit } = req.query;
    let query = `
      SELECT t.*, tm.team_name, tm.team_code, tm.leader_name, s.symbol, s.name as stock_name, s.sector
      FROM trades t
      JOIN teams tm ON t.team_id = tm.id
      JOIN stocks s ON t.stock_id = s.id
    `;
    const params = [];
    const conditions = [];

    if (teamId) {
      conditions.push('t.team_id = ?');
      params.push(teamId);
    }
    if (stockId) {
      conditions.push('t.stock_id = ?');
      params.push(stockId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.timestamp DESC';
    
    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit, 10));
    } else {
      query += ' LIMIT 500';
    }

    const trades = db.prepare(query).all(...params);
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/adjust-balance', requireAdminAuth, (req, res) => {
  const { teamId, amountIC, reason } = req.body;
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const newBal = Math.max(0, Math.round((team.cash_balance + parseFloat(amountIC)) * 100) / 100);
    db.prepare('UPDATE teams SET cash_balance = ? WHERE id = ?').run(newBal, teamId);

    const updatedPortfolio = engine.getTeamPortfolio(teamId);
    io.to(`team:${teamId}`).emit('portfolio:updated', updatedPortfolio);
    io.emit('leaderboard:updated', engine.getLeaderboard());

    res.json({ success: true, newBalance: newBal });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Configure Uniform Base IC for All Teams
app.post('/api/admin/set-base-ic', requireAdminAuth, (req, res) => {
  try {
    const { base_ic, applyToAllTeams } = req.body;
    if (!base_ic || isNaN(base_ic) || base_ic <= 0) {
      return res.status(400).json({ error: 'Valid positive Base IC amount required' });
    }
    const result = engine.setBaseIC(base_ic, applyToAllTeams !== false);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Portal Relay Endpoint (Protected by SHARED_SECRET or ADMIN_PASSWORD)
// Used by the main hackathon portal on Vercel to sync approved teams and reveal credentials
const verifyPortalSecret = (req, res, next) => {
  const secret = req.headers['x-admin-secret'] || req.body?.adminSecret;
  const adminPass = process.env.ADMIN_PASSWORD || process.env.PORTAL_SYNC_SECRET || 'ArthAdmin2026!';
  const sharedSecret = process.env.PORTAL_SYNC_SECRET || adminPass;
  if (!secret || (secret !== sharedSecret && secret !== adminPass)) {
    return res.status(401).json({ error: 'Unauthorized portal relay call.' });
  }
  next();
};

app.post('/api/portal/toggle-credentials', verifyPortalSecret, async (req, res) => {
  const { released } = req.body;
  try {
    const state = engine.setCredentialsReleased(Boolean(released));
    
    // Sync to Supabase active hackathon config
    try {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const configStr = `MARKET_CONFIG:${JSON.stringify({ credentials_released: Boolean(released) })}`;
      await fetch(`${sbUrl}/rest/v1/hackathons?is_active=eq.true`, {
        method: 'PATCH',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ upi_id: configStr })
      });
    } catch (e) {
      console.warn('[Credentials] Failed to patch Supabase hackathon:', e.message);
    }

    if (released) {
      pullApprovedTeamsFromSupabase().catch(() => {});
    }
    res.json({ success: true, credentials_released: Boolean(state.credentials_released), state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/portal/sync-teams', verifyPortalSecret, (req, res) => {
  const { teams } = req.body;
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Expected an array of teams' });
  }

  const currentState = engine.getMarketState();
  const startingIC = currentState?.base_ic || 10000.0;

  const insertOrUpdate = db.prepare(`
    INSERT INTO teams (id, team_code, team_name, password, leader_name, leader_email, cash_balance, initial_balance)
    VALUES (@id, @team_code, @team_name, @password, @leader_name, @leader_email, @starting_ic, @starting_ic)
    ON CONFLICT(team_code) DO UPDATE SET 
      team_name = @team_name,
      password = @password,
      leader_name = @leader_name,
      leader_email = @leader_email
  `);

  const syncTx = db.transaction((teamList) => {
    let synced = 0;
    for (const t of teamList) {
      if (t.team_code) {
        insertOrUpdate.run({
          id: t.id || 'team-' + Math.random().toString(36).substr(2, 8),
          team_code: t.team_code.trim(),
          team_name: t.team_name || 'Team ' + t.team_code,
          password: t.password ? t.password.trim() : getTeamTraderPin(t),
          leader_name: t.leader_name || 'Team Leader',
          leader_email: t.leader_email || '',
          starting_ic: startingIC
        });
        synced++;
      }
    }
    return synced;
  });

  try {
    const count = syncTx(teams);
    io.emit('leaderboard:updated', engine.getLeaderboard());
    res.json({ success: true, syncedCount: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Market Admins from Main Hackathon Website
app.post('/api/portal/sync-admins', verifyPortalSecret, (req, res) => {
  const { admins } = req.body;
  if (!Array.isArray(admins)) {
    return res.status(400).json({ error: 'Expected an array of admin objects.' });
  }

  // Filter only those allowed to control the stock market
  const valid = admins
    .filter(a => a && a.email && (a.role === 'market_admin' || a.role === 'superadmin' || a.role === 'admin'))
    .map(a => ({ email: a.email.toLowerCase().trim(), role: a.role, name: a.name || '' }));

  syncedMarketAdmins = valid;
  console.log(`[MarketAdmins] Synced ${valid.length} authorized market admins from portal.`);
  res.json({ success: true, count: valid.length, admins: valid });
});

// Get list of currently synced market admins
app.get('/api/admin/synced-admins', requireAdminAuth, (req, res) => {
  res.json({ success: true, count: syncedMarketAdmins.length, admins: syncedMarketAdmins });
});

// Admin Pull Action: Allow Stock Market to pull Market Admins directly from portal or Supabase
app.post('/api/admin/pull-market-admins', requireAdminAuth, async (req, res) => {
  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';

  try {
    let adminsList = [];

    // Attempt 1: Fetch from portal /api/admins
    try {
      const fetchRes = await fetch(`${portalUrl}/api/admins`, { signal: AbortSignal.timeout(3500) });
      if (fetchRes.ok) {
        const data = await fetchRes.json();
        adminsList = data.admins || [];
      }
    } catch (e) {
      console.log('[MarketAdmins] Portal /api/admins fetch failed/timed out, attempting direct Supabase query:', e.message);
    }

    // Attempt 2: Direct Supabase query fallback
    if (!adminsList || adminsList.length === 0) {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const sbRes = await fetch(`${sbUrl}/rest/v1/admin_users?select=*`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(4000)
      });
      if (sbRes.ok) {
        adminsList = await sbRes.json();
      }
    }

    const valid = (adminsList || [])
      .filter((a) => a && a.email && (a.role === 'market_admin' || a.role === 'superadmin' || a.role === 'admin'))
      .map((a) => ({ email: a.email.toLowerCase().trim(), role: a.role, name: a.name || a.full_name || '' }));

    if (!valid.some(a => a.email === 'artharambachalil@gmail.com')) {
      valid.push({ email: 'artharambachalil@gmail.com', role: 'superadmin', name: 'Dev Lead' });
    }

    syncedMarketAdmins = valid;
    console.log(`[MarketAdmins] Successfully pulled & synced ${valid.length} authorized admins.`);
    res.json({ success: true, count: valid.length, admins: valid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pull admins: ' + err.message });
  }
});

// Sync Teams from Arth Mantra / Main Registration
app.post('/api/admin/sync-teams', requireAdminAuth, (req, res) => {
  const { teams } = req.body; // array of { id, team_name, team_code, password, leader_name, leader_email }

  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Expected an array of teams' });
  }

  const currentState = engine.getMarketState();
  const startingIC = currentState?.base_ic || 10000.0;

  const insertOrUpdate = db.prepare(`
    INSERT INTO teams (id, team_code, team_name, password, leader_name, leader_email, cash_balance, initial_balance)
    VALUES (@id, @team_code, @team_name, @password, @leader_name, @leader_email, @starting_ic, @starting_ic)
    ON CONFLICT(team_code) DO UPDATE SET 
      team_name = @team_name,
      password = @password,
      leader_name = @leader_name,
      leader_email = @leader_email
  `);

  const syncTx = db.transaction((teamList) => {
    let synced = 0;
    for (const t of teamList) {
      if (t.team_code) {
        insertOrUpdate.run({
          id: t.id || 'team-' + Math.random().toString(36).substr(2, 8),
          team_code: t.team_code.trim(),
          team_name: t.team_name || 'Team ' + t.team_code,
          password: t.password ? t.password.trim() : getTeamTraderPin(t),
          leader_name: t.leader_name || 'Team Leader',
          leader_email: t.leader_email || '',
          starting_ic: startingIC
        });
        synced++;
      }
    }
    return synced;
  });

  try {
    const count = syncTx(teams);
    io.emit('leaderboard:updated', engine.getLeaderboard());
    res.json({ success: true, syncedCount: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SYSTEM REDUNDANCY & LIVE BACKUP HUB
// ==========================================

// 1. Download Full JSON Backup
app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  try {
    const backup = generateFullBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=arthmantra_trading_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate backup: ' + err.message });
  }
});

// 2. Restore Database from JSON Backup
app.post('/api/admin/restore', requireAdminAuth, async (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || !backupData.data) {
      return res.status(400).json({ error: 'Invalid backup format. Expected backup JSON object.' });
    }
    restoreFromBackup(backupData);
    io.emit('market:state', engine.getMarketState());
    io.emit('stocks:updated', engine.getAllStocks());
    io.to('admin').emit('leaderboard:updated', engine.getLeaderboard());
    setTimeout(() => { triggerSnapshot().catch(() => {}); }, 200);
    res.json({ success: true, message: 'Trading market database successfully restored!', metrics: backupData.metrics });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore database: ' + err.message });
  }
});

// 3. Trigger Instant Manual Snapshot
app.post('/api/admin/snapshot-now', requireAdminAuth, async (req, res) => {
  try {
    await triggerSnapshot();
    res.json({ success: true, status: getBackupStatus() });
  } catch (err) {
    res.status(500).json({ error: 'Snapshot failed: ' + err.message });
  }
});

// 4. Get Redundancy & Backup Health Status
app.get('/api/admin/backup-status', requireAdminAuth, (req, res) => {
  res.json({ success: true, status: getBackupStatus() });
});

// 5. Keep-Alive Heartbeat Ping
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const PORT = process.env.PORT || 4000;

// Serve Vite frontend build in production / single-server mode
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Arth Mantra Mock Stock Market Engine running on port ${PORT}`);

  // Auto-sync market admins in background
  setTimeout(async () => {
    try {
      const sbUrl = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      const sbRes = await fetch(`${sbUrl}/rest/v1/admin_users?select=*`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
      });
      if (sbRes.ok) {
        const list = await sbRes.json();
        const valid = (list || [])
          .filter((a) => a && a.email && (a.role === 'market_admin' || a.role === 'superadmin' || a.role === 'admin'))
          .map((a) => ({ email: a.email.toLowerCase().trim(), role: a.role, name: a.name || a.full_name || '' }));
        if (!valid.some(a => a.email === 'artharambachalil@gmail.com')) {
          valid.push({ email: 'artharambachalil@gmail.com', role: 'superadmin', name: 'Dev Lead' });
        }
        syncedMarketAdmins = valid;
        console.log(`[MarketAdmins] Initial bootstrap synced ${valid.length} market admins from Supabase.`);
      }

      // Initial bootstrap of approved teams
      await pullApprovedTeamsFromSupabase();

      // Initialize Continuous Cloud & Local Auto-Backup
      initAutoBackup(60);

      // Keep-Alive Self-Ping Heartbeat (Prevents Render spin-down during event hours)
      setInterval(async () => {
        try {
          await fetch(`http://localhost:${PORT}/api/ping`).catch(() => {});
          // If public domain configured, also ping external endpoint
          const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://arthmantra-market.onrender.com';
          await fetch(`${renderUrl}/api/ping`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
        } catch {}
      }, 7 * 60 * 1000); // Every 7 minutes
    } catch (e) {
      console.log('[MarketAdmins] Bootstrap sync notice:', e.message);
    }
  }, 2000);
});
