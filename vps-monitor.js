#!/usr/bin/env node

/**
 * Arth Mantra VPS Performance Manager & Remote Controller (CLI)
 * Run from your laptop:
 *   node vps-monitor.js
 *   node vps-monitor.js --url https://arthmantratrading.app --pass ArthAdmin2026!
 */

import readline from 'readline';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
}

const VPS_URL = (getArg('--url', process.env.VPS_URL || 'https://arthmantratrading.app')).replace(/\/+$/, '');
const ADMIN_PASSWORD = getArg('--pass', process.env.ADMIN_PASSWORD || 'ArthAdmin2026!');
const POLL_INTERVAL_MS = parseInt(getArg('--poll', '2500'), 10);

// Disable TLS reject for self-signed or intercepted local WiFi proxy if needed
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let adminToken = null;
let lastTelemetry = null;
let lastStatusMsg = null;
let logViewActive = false;
let recentLogs = [];
let isBusy = false;

// ANSI Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  emerald: '\x1b[32m',
  amber: '\x1b[33m',
  rose: '\x1b[31m',
  indigo: '\x1b[34m',
  white: '\x1b[37m',
  bgSlate: '\x1b[48;5;236m',
  bgDark: '\x1b[40m'
};

function drawBar(pct, width = 28) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;
  const color = p > 80 ? C.rose : p > 50 ? C.amber : C.emerald;
  return `${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset} ${color}${p.toFixed(1)}%${C.reset}`;
}

function formatUptime(sec = 0) {
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m ${Math.floor(sec % 60)}s`;
}

async function login() {
  try {
    const res = await fetch(`${VPS_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD })
    });
    const data = await res.json();
    if (data.success && data.token) {
      adminToken = data.token;
      return true;
    } else {
      lastStatusMsg = `${C.rose}Login failed: ${data.error || 'Invalid credentials'}${C.reset}`;
      return false;
    }
  } catch (err) {
    lastStatusMsg = `${C.rose}Connection failed to ${VPS_URL}: ${err.message}${C.reset}`;
    return false;
  }
}

async function fetchTelemetry() {
  if (!adminToken) {
    const ok = await login();
    if (!ok) return;
  }

  try {
    const t0 = Date.now();
    const res = await fetch(`${VPS_URL}/api/admin/system/metrics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const latency = Date.now() - t0;

    if (res.status === 401) {
      adminToken = null;
      return;
    }

    const data = await res.json();
    if (data.success && data.telemetry) {
      lastTelemetry = { ...data.telemetry, latency };
    }
  } catch (err) {
    lastStatusMsg = `${C.rose}Poll error: ${err.message}${C.reset}`;
  }
}

async function executeAction(action, label) {
  if (isBusy) return;
  isBusy = true;
  lastStatusMsg = `${C.amber}Executing [${label}]...${C.reset}`;
  render();

  try {
    const res = await fetch(`${VPS_URL}/api/admin/system/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      lastStatusMsg = `${C.emerald}✓ ${data.message || 'Action executed successfully.'}${C.reset}`;
    } else {
      lastStatusMsg = `${C.rose}✗ Error: ${data.error || 'Action failed'}${C.reset}`;
    }
  } catch (err) {
    lastStatusMsg = `${C.rose}✗ Network error: ${err.message}${C.reset}`;
  } finally {
    isBusy = false;
    setTimeout(fetchTelemetry, 1000);
  }
}

async function fetchLogs() {
  if (isBusy) return;
  isBusy = true;
  lastStatusMsg = `${C.cyan}Fetching latest VPS logs...${C.reset}`;
  render();

  try {
    const res = await fetch(`${VPS_URL}/api/admin/system/logs?lines=40`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (data.success && data.logs) {
      recentLogs = data.logs;
      logViewActive = true;
      lastStatusMsg = `${C.emerald}Loaded ${data.logs.length} log lines. Press [L] or [Esc] to return to dashboard.${C.reset}`;
    }
  } catch (err) {
    lastStatusMsg = `${C.rose}Failed to fetch logs: ${err.message}${C.reset}`;
  } finally {
    isBusy = false;
    render();
  }
}

function render() {
  // Clear screen
  process.stdout.write('\x1B[2J\x1B[0f');

  console.log(`${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   ARTH MANTRA VPS PERFORMANCE MANAGER • REMOTE INSTITUTIONAL CONTROL TERMINAL    ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);

  if (!lastTelemetry) {
    console.log(`\n  Connecting to ${C.cyan}${VPS_URL}${C.reset}...`);
    if (lastStatusMsg) console.log(`  ${lastStatusMsg}`);
    console.log(`\n  ${C.dim}Authenticating with Admin token...${C.reset}\n`);
    return;
  }

  const { system, nodeProcess, pm2Processes, latency } = lastTelemetry;

  console.log(`  ${C.bold}Target VPS:${C.reset} ${C.white}${VPS_URL}${C.reset}  |  ${C.bold}Host:${C.reset} ${C.cyan}${system.hostname}${C.reset}  |  ${C.bold}OS:${C.reset} ${system.platform} (${system.release})  |  ${C.bold}Ping:${C.reset} ${latency}ms`);
  console.log(`  ${C.bold}Host Uptime:${C.reset} ${formatUptime(system.uptimeSeconds)}  |  ${C.bold}Engine Uptime:${C.reset} ${formatUptime(nodeProcess.uptimeSeconds)}  |  ${C.bold}Active Sockets:${C.reset} ${C.emerald}${nodeProcess.activeSockets || 0}${C.reset}`);
  console.log(`${C.dim}──────────────────────────────────────────────────────────────────────────────────────${C.reset}`);

  if (logViewActive) {
    console.log(`\n  ${C.bold}${C.amber}=== RECENT VPS CONSOLE LOGS (Last 40 Lines) ===${C.reset}\n`);
    for (const log of recentLogs.slice(-25)) {
      const col = log.type === 'stderr' ? C.rose : log.text.includes('error') ? C.amber : C.dim;
      console.log(`  ${col}${log.text}${C.reset}`);
    }
    console.log(`\n  ${C.dim}Press [L] or [Esc] to return to Live Gauges • [Q] to quit${C.reset}`);
    return;
  }

  // Gauges Section
  console.log(`\n  ${C.bold}RESOURCE UTILIZATION GAUGES:${C.reset}`);
  console.log(`  CPU Load:      [${drawBar(system.cpuPct)}]   ${C.dim}(${system.cpuCores} cores: ${system.cpuModel?.trim().slice(0, 24)})${C.reset}`);
  console.log(`  Physical RAM:  [${drawBar(system.ram.usedPct)}]   ${C.dim}(${system.ram.usedGB} / ${system.ram.totalGB} GB, Free: ${system.ram.freeGB} GB)${C.reset}`);
  console.log(`  C: Drive Disk: [${drawBar(system.disk.usedPct)}]   ${C.dim}(${system.disk.usedGB} / ${system.disk.totalGB} GB, Free: ${system.disk.freeGB} GB)${C.reset}`);
  
  const heapPct = nodeProcess.memory.heapTotalMB ? ((nodeProcess.memory.heapUsedMB / nodeProcess.memory.heapTotalMB) * 100) : 0;
  console.log(`  Node.js Heap:  [${drawBar(heapPct)}]   ${C.dim}(Used: ${nodeProcess.memory.heapUsedMB} MB, RSS: ${nodeProcess.memory.rssMB} MB, DB: ${nodeProcess.dbSizeMB} MB)${C.reset}`);

  // PM2 Process Grid
  console.log(`\n  ${C.bold}PM2 MANAGED PROCESSES:${C.reset}`);
  console.log(`  ${C.dim}ID   Name              PID      Status      CPU %    Memory     Restarts   Uptime${C.reset}`);
  console.log(`  ${C.dim}───  ────────────────  ───────  ──────────  ───────  ─────────  ─────────  ──────────${C.reset}`);

  if (pm2Processes && pm2Processes.length > 0) {
    for (const p of pm2Processes) {
      const stColor = p.status === 'online' ? C.emerald : C.rose;
      const idStr = String(p.id).padEnd(4);
      const nameStr = String(p.name).slice(0, 16).padEnd(17);
      const pidStr = String(p.pid).padEnd(8);
      const stStr = `${stColor}${String(p.status).padEnd(11)}${C.reset}`;
      const cpuStr = `${String(p.cpuPct)}%`.padEnd(8);
      const memStr = `${String(p.memoryMB)} MB`.padEnd(10);
      const rstStr = String(p.restarts).padEnd(10);
      const upStr = formatUptime(p.uptimeSeconds);
      console.log(`  ${idStr} ${nameStr} ${pidStr} ${stStr} ${cpuStr} ${memStr} ${rstStr} ${upStr}`);
    }
  } else {
    const stStr = `${C.emerald}online     ${C.reset}`;
    console.log(`  0    trading-engine    ${String(nodeProcess.pid).padEnd(8)} ${stStr} ${String(system.cpuPct)}%     ${String(nodeProcess.memory.rssMB)} MB     0          ${formatUptime(nodeProcess.uptimeSeconds)}`);
  }

  // Status Message
  if (lastStatusMsg) {
    console.log(`\n  ${lastStatusMsg}`);
  }

  // Interactive Control Menu
  console.log(`\n${C.dim}──────────────────────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.bold}REMOTE ACTIONS (Execute from your laptop):${C.reset}`);
  console.log(`  ${C.cyan}[R]${C.reset} Restart Engine (PM2)    ${C.cyan}[C]${C.reset} Restart Caddy SSL     ${C.cyan}[M]${C.reset} Compact Memory & DB`);
  console.log(`  ${C.cyan}[F]${C.reset} Flush PM2 Logs          ${C.cyan}[L]${C.reset} View Server Logs      ${C.cyan}[Q]${C.reset} Quit Controller`);
}

// Keypress handling
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c' || key.name === 'q') {
    process.stdout.write('\x1B[2J\x1B[0f');
    console.log('Exiting VPS Performance Manager. Bye!\n');
    process.exit(0);
  }

  if (key.name === 'r') {
    executeAction('RESTART_ENGINE', 'Restart Trading Engine');
  } else if (key.name === 'c') {
    executeAction('RESTART_CADDY', 'Restart Caddy SSL');
  } else if (key.name === 'm') {
    executeAction('GARBAGE_COLLECT', 'Compact Memory & DB');
  } else if (key.name === 'f') {
    executeAction('FLUSH_LOGS', 'Flush PM2 Logs');
  } else if (key.name === 'l') {
    if (logViewActive) {
      logViewActive = false;
      render();
    } else {
      fetchLogs();
    }
  } else if (key.name === 'escape') {
    logViewActive = false;
    render();
  }
});

// Main Loop
console.log('Initializing VPS connection...');
fetchTelemetry().then(render);
setInterval(async () => {
  if (!logViewActive) {
    await fetchTelemetry();
    render();
  }
}, POLL_INTERVAL_MS);
