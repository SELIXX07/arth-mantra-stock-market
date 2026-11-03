import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { 
  Activity, Cpu, HardDrive, Server, Zap, RefreshCw, X, 
  CheckCircle2, AlertTriangle, Terminal, Play, RotateCcw, 
  Trash2, ShieldAlert, Sparkles, Clock, Globe, ArrowUpRight,
  Database, Radio
} from 'lucide-react';

interface PerformanceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PerformanceManagerModal: React.FC<PerformanceManagerModalProps> = ({ isOpen, onClose }) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [logs, setLogs] = useState<Array<{ type: string; text: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(3); // seconds, 0 = off
  const [logFilter, setLogFilter] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchMetrics = async () => {
    try {
      const res = await api.getSystemTelemetry();
      if (res.success && res.telemetry) {
        setTelemetry(res.telemetry);
      }
    } catch (err: any) {
      console.error('Failed to fetch telemetry:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.getSystemLogs(100);
      if (res.success && res.logs) {
        setLogs(res.logs);
      }
    } catch (err: any) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const refreshAll = async () => {
    setIsLoading(true);
    await Promise.all([fetchMetrics(), fetchLogs()]);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshAll();

    if (autoRefreshInterval > 0) {
      const timer = setInterval(() => {
        fetchMetrics();
      }, autoRefreshInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [isOpen, autoRefreshInterval]);

  const handleControl = async (action: string, label: string) => {
    if (!confirm(`Are you sure you want to execute [${label}] on the remote VPS?`)) return;

    setIsExecuting(action);
    setStatusMessage(null);
    try {
      const res = await api.executeSystemControl(action);
      if (res.success) {
        setStatusMessage({ text: res.message || `Successfully executed ${label}` });
        setTimeout(() => refreshAll(), 1500);
      } else {
        setStatusMessage({ text: res.error || `Failed to execute ${label}`, isError: true });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || `Error executing ${label}`, isError: true });
    } finally {
      setIsExecuting(null);
    }
  };

  if (!isOpen) return null;

  const sys = telemetry?.system || {};
  const node = telemetry?.nodeProcess || {};
  const pm2 = telemetry?.pm2Processes || [];

  const formatUptime = (sec: number = 0) => {
    const days = Math.floor(sec / 86400);
    const hrs = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d ${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${Math.floor(sec % 60)}s`;
  };

  const filteredLogs = logs.filter(l => 
    !logFilter || l.text.toLowerCase().includes(logFilter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-[#0B0F19] border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col my-auto font-mono text-xs text-slate-200 max-h-[92vh]">
        
        {/* Top Header Bar */}
        <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-inner">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-black tracking-wider text-white uppercase">
                  VPS Resource Performance Manager
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>ONLINE</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Host: <strong className="text-cyan-300">{sys.hostname || 'VPS'}</strong> • OS: {sys.platform} ({sys.release}) • Host Uptime: {formatUptime(sys.uptimeSeconds)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Auto Refresh Selector */}
            <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[11px]">
              <span className="text-slate-400 px-1">Poll:</span>
              {[
                { label: '2s', val: 2 },
                { label: '5s', val: 5 },
                { label: 'Pause', val: 0 }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setAutoRefreshInterval(opt.val)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    autoRefreshInterval === opt.val
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={refreshAll}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Refresh Metrics & Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className={`px-5 py-2.5 flex items-center space-x-2 border-b text-xs ${
            statusMessage.isError
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}>
            {statusMessage.isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          
          {/* Top 4 Hero Resource Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            
            {/* 1. CPU Usage */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-cyan-400">
                  <Cpu className="w-4 h-4" />
                  <span>CPU Load</span>
                </span>
                <span className="text-[10px] text-slate-500">{sys.cpuCores || 1} Cores</span>
              </div>
              
              <div className="flex items-baseline justify-between pt-1">
                <span className={`text-2xl font-black ${
                  (sys.cpuPct || 0) > 80 ? 'text-rose-400' : (sys.cpuPct || 0) > 50 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {sys.cpuPct !== undefined ? `${sys.cpuPct}%` : '--'}
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={sys.cpuModel}>
                  {sys.cpuModel || 'CPU'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-500 ${
                    (sys.cpuPct || 0) > 80 ? 'bg-rose-500' : (sys.cpuPct || 0) > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, sys.cpuPct || 0)}%` }}
                />
              </div>
            </div>

            {/* 2. System RAM */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-indigo-400">
                  <Server className="w-4 h-4" />
                  <span>Physical RAM</span>
                </span>
                <span className="text-[10px] text-slate-500">Free: {sys.ram?.freeGB || 0} GB</span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <span className={`text-2xl font-black ${
                  (sys.ram?.usedPct || 0) > 85 ? 'text-rose-400' : (sys.ram?.usedPct || 0) > 65 ? 'text-amber-400' : 'text-indigo-300'
                }`}>
                  {sys.ram?.usedPct || 0}%
                </span>
                <span className="text-[11px] text-slate-300">
                  <strong>{sys.ram?.usedGB || 0}</strong> / {sys.ram?.totalGB || 0} GB
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-500 ${
                    (sys.ram?.usedPct || 0) > 85 ? 'bg-rose-500' : (sys.ram?.usedPct || 0) > 65 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, sys.ram?.usedPct || 0)}%` }}
                />
              </div>
            </div>

            {/* 3. Disk Space (Drive C:) */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-amber-400">
                  <HardDrive className="w-4 h-4" />
                  <span>Drive C: Disk</span>
                </span>
                <span className="text-[10px] text-slate-500">Free: {sys.disk?.freeGB || 0} GB</span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <span className={`text-2xl font-black ${
                  (sys.disk?.usedPct || 0) > 90 ? 'text-rose-400' : (sys.disk?.usedPct || 0) > 75 ? 'text-amber-400' : 'text-amber-300'
                }`}>
                  {sys.disk?.usedPct || 0}%
                </span>
                <span className="text-[11px] text-slate-300">
                  <strong>{sys.disk?.usedGB || 0}</strong> / {sys.disk?.totalGB || 0} GB
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-500 ${
                    (sys.disk?.usedPct || 0) > 90 ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, sys.disk?.usedPct || 0)}%` }}
                />
              </div>
            </div>

            {/* 4. Node Engine Memory & WebSockets */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-emerald-400">
                  <Radio className="w-4 h-4" />
                  <span>Node Process</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  {node.activeSockets || 0} WebSockets
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-2xl font-black text-emerald-400">
                    {node.memory?.rssMB || 0} MB
                  </span>
                  <span className="text-[10px] text-slate-400 block">RSS Memory</span>
                </div>
                <div className="text-right text-[11px] text-slate-300">
                  <div>Heap: <strong>{node.memory?.heapUsedMB || 0}</strong> MB</div>
                  <div className="text-[10px] text-slate-400">DB: {node.dbSizeMB || 0} MB</div>
                </div>
              </div>

              {/* Heap Progress */}
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ 
                    width: `${node.memory?.heapTotalMB ? Math.min(100, ((node.memory?.heapUsedMB || 0) / node.memory?.heapTotalMB) * 100) : 30}%` 
                  }}
                />
              </div>
            </div>

          </div>

          {/* Remote VPS Control Action Center */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">
                  Remote Process Control Center (Execute from Laptop)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Commands execute directly in VPS environment</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              
              {/* Action 1: Restart Trading Engine */}
              <button
                disabled={isExecuting !== null}
                onClick={() => handleControl('RESTART_ENGINE', 'Restart Trading Engine')}
                className="p-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-300 text-xs flex items-center space-x-1.5">
                    <RotateCcw className={`w-3.5 h-3.5 text-amber-400 ${isExecuting === 'RESTART_ENGINE' ? 'animate-spin' : 'group-hover:rotate-180 transition-transform'}`} />
                    <span>Restart Engine</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 font-mono">PM2</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Restarts the Node trading engine process with fresh memory & environment.
                </p>
              </button>

              {/* Action 2: Restart Caddy SSL */}
              <button
                disabled={isExecuting !== null}
                onClick={() => handleControl('RESTART_CADDY', 'Restart Caddy SSL Proxy')}
                className="p-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-cyan-300 text-xs flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Restart Caddy SSL</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono">Port 443</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Reloads Caddy reverse proxy & re-establishes Let's Encrypt TLS binding.
                </p>
              </button>

              {/* Action 3: Garbage Collection & DB Compaction */}
              <button
                disabled={isExecuting !== null}
                onClick={() => handleControl('GARBAGE_COLLECT', 'Free RAM & Compact DB')}
                className="p-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-emerald-500/40 hover:border-emerald-400 text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-emerald-300 text-xs flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Compact Memory</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono">V8 GC</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Flushes inactive buffers, truncates SQLite WAL, and releases idle memory.
                </p>
              </button>

              {/* Action 4: Flush PM2 Logs */}
              <button
                disabled={isExecuting !== null}
                onClick={() => handleControl('FLUSH_LOGS', 'Flush PM2 Logs')}
                className="p-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-700 hover:border-slate-500 text-left transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Flush PM2 Logs</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Disk</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Truncates stdout and stderr log files on VPS to reclaim storage space.
                </p>
              </button>

            </div>
          </div>

          {/* PM2 Process Grid */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-white text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Managed PM2 Processes</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Engine PID: <strong className="text-cyan-300">{node.pid}</strong> • Node Uptime: {formatUptime(node.uptimeSeconds)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">ID</th>
                    <th className="py-2 px-3">Process Name</th>
                    <th className="py-2 px-3">PID</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">CPU %</th>
                    <th className="py-2 px-3">Memory</th>
                    <th className="py-2 px-3">Restarts</th>
                    <th className="py-2 px-3">Uptime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pm2 && pm2.length > 0 ? (
                    pm2.map((p: any) => (
                      <tr key={p.id || p.name} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-400">{p.id}</td>
                        <td className="py-2 px-3 font-bold text-white">{p.name}</td>
                        <td className="py-2 px-3 text-cyan-300">{p.pid}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-flex items-center space-x-1 ${
                            p.status === 'online'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${p.status === 'online' ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
                            <span>{p.status}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-200">{p.cpuPct}%</td>
                        <td className="py-2 px-3 text-indigo-300 font-bold">{p.memoryMB} MB</td>
                        <td className="py-2 px-3 text-slate-400">{p.restarts}</td>
                        <td className="py-2 px-3 text-slate-300">{formatUptime(p.uptimeSeconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-2 px-3 text-slate-400">0</td>
                      <td className="py-2 px-3 font-bold text-white">trading-engine</td>
                      <td className="py-2 px-3 text-cyan-300">{node.pid}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                          online
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-200">{sys.cpuPct || 0}%</td>
                      <td className="py-2 px-3 text-indigo-300 font-bold">{node.memory?.rssMB || 0} MB</td>
                      <td className="py-2 px-3 text-slate-400">0</td>
                      <td className="py-2 px-3 text-slate-300">{formatUptime(node.uptimeSeconds)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Console Output Terminal */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  Live VPS Console Logs Terminal
                </span>
                <span className="text-[10px] text-slate-500">({filteredLogs.length} lines)</span>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={fetchLogs}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                >
                  Reload Logs
                </button>
              </div>
            </div>

            <div 
              ref={logContainerRef}
              className="p-3 bg-black/95 text-slate-300 font-mono text-[11px] max-h-52 overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-slate-600 italic py-4 text-center">
                  No log lines available or matching filter.
                </div>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div 
                    key={idx} 
                    className={`leading-relaxed break-all ${
                      log.type === 'stderr' 
                        ? 'text-rose-400 bg-rose-950/20 px-1 rounded' 
                        : log.text.includes('[Error]') || log.text.includes('error')
                        ? 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-600 select-none mr-2">[{idx + 1}]</span>
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>Arth Mantra VPS Performance Protocol • Connected via secure HTTPS reverse proxy</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
          >
            Close Manager
          </button>
        </div>

      </div>
    </div>
  );
};
