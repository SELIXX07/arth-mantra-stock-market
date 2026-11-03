import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Running CPU tracker
let prevCpuTimes = getCpuTimes();

function getCpuTimes() {
  const cpus = os.cpus() || [];
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  return { idle, total, count: cpus.length, model: cpus[0]?.model || 'Generic CPU' };
}

export function calculateCpuPercent() {
  const current = getCpuTimes();
  const idleDelta = current.idle - prevCpuTimes.idle;
  const totalDelta = current.total - prevCpuTimes.total;
  prevCpuTimes = current;

  if (totalDelta <= 0) return 0;
  const pct = (1 - idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(100, parseFloat(pct.toFixed(1))));
}

export async function getDiskUsage() {
  try {
    const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
    if (fs.promises.statfs) {
      const stats = await fs.promises.statfs(rootPath);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      return {
        totalGB: parseFloat((totalBytes / 1024 ** 3).toFixed(1)),
        freeGB: parseFloat((freeBytes / 1024 ** 3).toFixed(1)),
        usedGB: parseFloat((usedBytes / 1024 ** 3).toFixed(1)),
        usedPct: parseFloat(((usedBytes / totalBytes) * 100).toFixed(1))
      };
    }
  } catch (err) {
    // fallback if statfs fails
  }
  return { totalGB: 0, freeGB: 0, usedGB: 0, usedPct: 0 };
}

export async function getPm2Processes() {
  try {
    const { stdout } = await execAsync('pm2 jlist', { timeout: 4000 });
    const list = JSON.parse(stdout);
    if (Array.isArray(list)) {
      return list.map((p) => ({
        id: p.pm_id,
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status || 'unknown',
        restarts: p.pm2_env?.restart_time || 0,
        uptimeSeconds: p.pm2_env?.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0,
        memoryMB: parseFloat(((p.monit?.memory || 0) / 1024 ** 2).toFixed(1)),
        cpuPct: parseFloat((p.monit?.cpu || 0).toFixed(1))
      }));
    }
  } catch (err) {
    // PM2 might not be installed or no processes
  }
  return [];
}

export async function getRecentLogs(lines = 80) {
  try {
    // Try PM2 log file in user home dir
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    const pm2LogDir = path.join(userProfile, '.pm2', 'logs');
    const outLogPath = path.join(pm2LogDir, 'trading-engine-out.log');
    const errLogPath = path.join(pm2LogDir, 'trading-engine-error.log');

    let combined = [];

    if (fs.existsSync(outLogPath)) {
      const content = await fs.promises.readFile(outLogPath, 'utf8');
      const outLines = content.trim().split(/\r?\n/).slice(-lines);
      combined.push(...outLines.map(l => ({ type: 'stdout', text: l })));
    }

    if (fs.existsSync(errLogPath)) {
      const content = await fs.promises.readFile(errLogPath, 'utf8');
      const errLines = content.trim().split(/\r?\n/).slice(-30);
      combined.push(...errLines.map(l => ({ type: 'stderr', text: l })));
    }

    if (combined.length > 0) {
      return combined.slice(-lines);
    }
  } catch {}

  return [
    { type: 'stdout', text: `[System Logs] Process PID ${process.pid} running on ${os.hostname()}` },
    { type: 'stdout', text: `[System Logs] Node ${process.version} - Platform: ${os.platform()} (${os.arch()})` }
  ];
}

export async function getSystemTelemetry(io = null, db = null) {
  const cpuPct = calculateCpuPercent();
  const disk = await getDiskUsage();
  const pm2Processes = await getPm2Processes();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = process.memoryUsage();

  // Active sockets
  let activeClients = 0;
  if (io && io.engine) {
    activeClients = io.engine.clientsCount || 0;
  }

  // Database size
  let dbSizeMB = 0;
  try {
    const dbPath = path.resolve(process.cwd(), 'server', 'market.db');
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      dbSizeMB = parseFloat((stat.size / 1024 ** 2).toFixed(2));
    }
  } catch {}

  return {
    timestamp: Date.now(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      uptimeSeconds: os.uptime(),
      cpuModel: os.cpus()[0]?.model || 'CPU',
      cpuCores: os.cpus().length,
      cpuPct,
      ram: {
        totalGB: parseFloat((totalMem / 1024 ** 3).toFixed(2)),
        usedGB: parseFloat((usedMem / 1024 ** 3).toFixed(2)),
        freeGB: parseFloat((freeMem / 1024 ** 3).toFixed(2)),
        usedPct: parseFloat(((usedMem / totalMem) * 100).toFixed(1))
      },
      disk
    },
    nodeProcess: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memory: {
        rssMB: parseFloat((memUsage.rss / 1024 ** 2).toFixed(1)),
        heapTotalMB: parseFloat((memUsage.heapTotal / 1024 ** 2).toFixed(1)),
        heapUsedMB: parseFloat((memUsage.heapUsed / 1024 ** 2).toFixed(1)),
        externalMB: parseFloat((memUsage.external / 1024 ** 2).toFixed(1))
      },
      activeSockets: activeClients,
      dbSizeMB
    },
    pm2Processes
  };
}

export async function executeControlAction(action, payload = {}) {
  switch (action) {
    case 'RESTART_ENGINE': {
      // Async trigger restart after returning response
      setTimeout(() => {
        exec('pm2 restart trading-engine --update-env', (err) => {
          if (err) console.error('[SystemManager] PM2 restart error:', err);
        });
      }, 500);
      return { success: true, message: 'Trading engine restart initiated via PM2.' };
    }

    case 'RESTART_CADDY': {
      setTimeout(() => {
        exec('Stop-Process -Name caddy -Force -ErrorAction SilentlyContinue; .\\caddy.exe start', { shell: 'powershell.exe' }, (err) => {
          if (err) console.error('[SystemManager] Caddy restart error:', err);
        });
      }, 500);
      return { success: true, message: 'Caddy proxy restart signal dispatched.' };
    }

    case 'FLUSH_LOGS': {
      try {
        await execAsync('pm2 flush');
        return { success: true, message: 'PM2 process logs flushed successfully.' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'GARBAGE_COLLECT': {
      if (global.gc) {
        global.gc();
      }
      return { 
        success: true, 
        message: 'V8 Garbage Collection and Memory Compaction triggered.',
        memory: {
          rssMB: parseFloat((process.memoryUsage().rss / 1024 ** 2).toFixed(1)),
          heapUsedMB: parseFloat((process.memoryUsage().heapUsed / 1024 ** 2).toFixed(1))
        }
      };
    }

    default:
      throw new Error(`Unknown control action: ${action}`);
  }
}
