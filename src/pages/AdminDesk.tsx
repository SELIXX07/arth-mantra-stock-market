import React, { useState, useEffect } from 'react';
import { Stock, MarketState, LeaderboardEntry } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { 
  Play, Pause, Square, Flame, TrendingUp, TrendingDown, 
  Radio, Plus, ShieldCheck, RefreshCw, Users, Database, 
  DollarSign, Sliders, CheckCircle2, AlertTriangle, KeyRound,
  FileSpreadsheet, Search, Download, Eye, EyeOff, Clock, ArrowUpRight, ArrowDownRight, Layers, X,
  Trash2, Building2, UserCheck, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';

const toDateTimeLocal = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
};

export const AdminDesk: React.FC = () => {
  const [adminAuth, setAdminAuth] = useState(() => {
    return Boolean(localStorage.getItem('arth_admin_token'));
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [timedDuration, setTimedDuration] = useState<number>(60); // default 1 hour
  const [scheduleOpenMins, setScheduleOpenMins] = useState<number>(10);
  const [scheduleDurationMins, setScheduleDurationMins] = useState<number>(60);
  const [baseICAmount, setBaseICAmount] = useState<number>(10000);

  // Exact Clock Schedule States
  const [scheduleMode, setScheduleMode] = useState<'CLOCK' | 'RELATIVE'>('CLOCK');
  const [exactOpenTime, setExactOpenTime] = useState<string>(() => {
    return toDateTimeLocal(new Date(Date.now() + 10 * 60 * 1000));
  });
  const [exactCloseTime, setExactCloseTime] = useState<string>(() => {
    return toDateTimeLocal(new Date(Date.now() + 70 * 60 * 1000));
  });
  const [openMarketCloseTime, setOpenMarketCloseTime] = useState<string>(() => {
    return toDateTimeLocal(new Date(Date.now() + 30 * 60 * 1000));
  });

  // Induce / Withdraw state
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [floatAction, setFloatAction] = useState<'INDUCE' | 'WITHDRAW'>('INDUCE');
  const [floatShares, setFloatShares] = useState<number>(100);

  // News Broadcast state
  const [newsHeadline, setNewsHeadline] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsTarget, setNewsTarget] = useState('ALL');
  const [newsImpact, setNewsImpact] = useState<number>(15);

  // Stock Customizer state
  const [showStockModal, setShowStockModal] = useState(false);
  const [customStock, setCustomStock] = useState<any>({
    symbol: '',
    name: '',
    sector: '',
    total_float: 1000,
    price: 100,
    volatility: 0.02,
    description: '',
    costOfAcquisition: '85.00 IC',
    aum: '40.0M IC',
    strategicNotes: ''
  });

  // Balance Adjustment state
  const [adjustTeamId, setAdjustTeamId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(1000);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Trade Surveillance & Audit State
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [inspectedTeam, setInspectedTeam] = useState<any | null>(null);
  const [tradeSearchQuery, setTradeSearchQuery] = useState('');
  const [tradeFilterType, setTradeFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [tradeFilterTeam, setTradeFilterTeam] = useState<string>('ALL');

  // Synced Market Admins from Portal State
  const [syncedAdmins, setSyncedAdmins] = useState<any[]>([]);
  const [isPullingAdmins, setIsPullingAdmins] = useState(false);

  const notifySuccess = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  const loadData = () => {
    api.getMarketState().then((res) => {
      if (res.state) setMarketState(res.state);
      if (res.stocks) {
        setStocks(res.stocks);
        if (res.stocks.length > 0 && !selectedStockId) {
          setSelectedStockId(res.stocks[0].id);
        }
      }
    });

    api.getAdminTeams().then((res) => {
      if (res.teams) setTeams(res.teams);
    });

    api.getAdminTrades().then((res) => {
      if (res.trades) setAllTrades(res.trades);
    });

    api.getSyncedAdmins().then((res) => {
      if (res.admins) setSyncedAdmins(res.admins);
    }).catch(() => {});
  };

  useEffect(() => {
    if (adminAuth) {
      loadData();
      const socket = getSocket();
      socket.emit('join:admin');

      socket.on('market:status', (state: MarketState) => setMarketState(state));
      socket.on('market:timer', (data: { remaining_secs: number }) => {
        setMarketState((prev) => (prev ? { ...prev, remaining_secs: data.remaining_secs } : null));
      });
      socket.on('leaderboard:updated', () => {
        api.getAdminTeams().then((res) => {
          if (res.teams) setTeams(res.teams);
        });
      });
      socket.on('admin:trade_executed', (trade: any) => {
        setAllTrades((prev) => [trade, ...prev]);
        notifySuccess(`New trade executed: ${trade.team_name} ${trade.type} ${trade.shares} ${trade.symbol}`);
        api.getAdminTeams().then((res) => {
          if (res.teams) setTeams(res.teams);
        });
      });

      return () => {
        socket.off('market:status');
        socket.off('market:timer');
        socket.off('leaderboard:updated');
        socket.off('admin:trade_executed');
      };
    }
  }, [adminAuth]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.adminLogin(adminPassword, adminEmail);
    if (res.success) {
      setAdminAuth(true);
      setAuthError(null);
    } else {
      setAuthError(res.error || 'Invalid administrator credentials');
    }
  };

  // Market Controls
  const handleMarketStatusChange = async (status: 'OPEN' | 'PAUSED' | 'CLOSED', duration?: number) => {
    const res = await api.setMarketControl(status, duration);
    if (res.success) {
      setMarketState(res.state);
      notifySuccess(`Market status successfully updated to ${status}`);
    }
  };



  const handleScheduleTimes = async (openInMins: number, durationMins: number) => {
    const now = Math.floor(Date.now() / 1000);
    const openAt = now + (openInMins * 60);
    const closeAt = openAt + (durationMins * 60);
    const res = await api.scheduleTimes({ scheduled_open_at: openAt, scheduled_close_at: closeAt, durationMins });
    if (res.success) {
      setMarketState(res.state);
      notifySuccess(`Market scheduled to open in ${openInMins}m and close after ${durationMins}m!`);
    }
  };

  const handleCancelSchedule = async () => {
    const res = await api.scheduleTimes({ scheduled_open_at: undefined, scheduled_close_at: undefined });
    if (res.success) {
      setMarketState(res.state);
      notifySuccess('Pre-scheduled times cancelled.');
    }
  };

  const handleScheduleExactTimes = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!exactOpenTime) {
      alert('Please specify an Open Time.');
      return;
    }
    if (!exactCloseTime) {
      alert('Please specify a Close Time.');
      return;
    }

    const openTimestamp = Math.floor(new Date(exactOpenTime).getTime() / 1000);
    const closeTimestamp = Math.floor(new Date(exactCloseTime).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    if (closeTimestamp <= openTimestamp) {
      alert('Close time must be later than open time!');
      return;
    }
    if (closeTimestamp <= now) {
      alert('Close time must be in the future!');
      return;
    }

    const durationMins = Math.round((closeTimestamp - openTimestamp) / 60);

    const res = await api.scheduleTimes({
      scheduled_open_at: openTimestamp,
      scheduled_close_at: closeTimestamp,
      durationMins
    });

    if (res.success) {
      setMarketState(res.state);
      notifySuccess(`Market scheduled! Opens at ${new Date(openTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} and closes at ${new Date(closeTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${durationMins}m session).`);
    } else {
      alert('Failed to schedule: ' + (res.error || 'Server error'));
    }
  };

  const handleApplyPreset = (openDelayMins: number, durationMins: number) => {
    const openDate = new Date(Date.now() + openDelayMins * 60 * 1000);
    const closeDate = new Date(openDate.getTime() + durationMins * 60 * 1000);
    setExactOpenTime(toDateTimeLocal(openDate));
    setExactCloseTime(toDateTimeLocal(closeDate));
  };

  const handleSetClosingTimeForOpenMarket = async () => {
    if (!openMarketCloseTime) return;
    const closeTimestamp = Math.floor(new Date(openMarketCloseTime).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (closeTimestamp <= now) {
      alert('Closing time must be in the future!');
      return;
    }
    const res = await api.scheduleTimes({
      scheduled_open_at: undefined,
      scheduled_close_at: closeTimestamp
    });
    if (res.success) {
      setMarketState(res.state);
      notifySuccess(`Market scheduled to close at ${new Date(closeTimestamp * 1000).toLocaleTimeString()}!`);
    } else {
      alert('Failed to schedule close time: ' + (res.error || 'Server error'));
    }
  };

  const handleUpdateBaseIC = async () => {
    if (!baseICAmount || baseICAmount <= 0) {
      alert('Please enter a valid positive base IC amount.');
      return;
    }
    const res = await api.setBaseIC(baseICAmount, true);
    if (res.success) {
      setMarketState(res.state);
      notifySuccess(`Base IC successfully updated to ${baseICAmount.toLocaleString()} IC for all ${res.updatedTeamsCount} teams!`);
      loadData();
    } else {
      alert(res.error || 'Failed to update Base IC');
    }
  };

  // Float Controls
  const handleFloatExecution = async () => {
    if (!selectedStockId || floatShares <= 0) return;
    const res = await api.induceWithdraw(selectedStockId, floatAction, floatShares);
    if (res.success) {
      notifySuccess(`Successfully executed ${floatAction} of ${floatShares} shares!`);
      loadData();
    } else {
      alert(res.error || 'Float operation failed');
    }
  };

  // News Broadcast
  const handleBroadcastNews = async () => {
    if (!newsHeadline) return;
    const res = await api.broadcastNews(
      newsHeadline,
      newsContent,
      newsTarget === 'ALL' ? ['ALL'] : [newsTarget],
      newsImpact
    );
    if (res.success) {
      notifySuccess(`News alert broadcasted with ${newsImpact}% price shock!`);
      setNewsHeadline('');
      setNewsContent('');
      loadData();
    }
  };

  // Save / Customize Stock
  const handleSaveCustomStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...customStock,
      ps_metrics: {
        "Cost of Acquisition": customStock.costOfAcquisition,
        "AUM / Capitalization": customStock.aum,
        "Strategic Notes": customStock.strategicNotes
      }
    };

    const res = await api.saveStock(payload);
    if (res.success) {
      setShowStockModal(false);
      notifySuccess(`Stock ${customStock.symbol} successfully saved to market!`);
      loadData();
    }
  };

  const handleOpenAddStock = () => {
    setCustomStock({
      id: '',
      symbol: '',
      name: '',
      sector: 'Technology',
      total_float: 1000,
      price: 100,
      volatility: 0.02,
      description: '',
      costOfAcquisition: '80.00 IC',
      aum: '25.0M IC',
      strategicNotes: ''
    });
    setShowStockModal(true);
  };

  const handleEditStock = (stock: Stock) => {
    setCustomStock({
      id: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      total_float: stock.total_float,
      price: stock.price,
      volatility: stock.volatility || 0.02,
      description: stock.description || '',
      costOfAcquisition: stock.ps_metrics?.['Cost of Acquisition'] || '',
      aum: stock.ps_metrics?.['AUM / Capitalization'] || '',
      strategicNotes: stock.ps_metrics?.['Strategic Notes'] || ''
    });
    setShowStockModal(true);
  };

  const handleDeleteStock = async (stockId: string, symbol: string) => {
    if (!window.confirm(`Are you sure you want to delist and remove ${symbol} from active exchange trading? This will immediately halt trading for this company.`)) {
      return;
    }
    try {
      const res = await api.deleteStock(stockId);
      if (res.success) {
        notifySuccess(`Company ${symbol} has been delisted and removed from the active market.`);
        loadData();
      } else {
        alert('Failed to delist stock: ' + (res.error || 'Server error'));
      }
    } catch (err: any) {
      alert('Error delisting company: ' + err.message);
    }
  };

  const handlePullMarketAdmins = async () => {
    setIsPullingAdmins(true);
    try {
      const res = await api.pullMarketAdmins();
      if (res.success) {
        setSyncedAdmins(res.admins || []);
        notifySuccess(`Successfully synced ${res.count} market admins & superadmins from portal!`);
      } else {
        alert('Could not pull admins: ' + (res.error || 'Server error'));
      }
    } catch (err: any) {
      alert('Failed to connect to portal: ' + err.message);
    } finally {
      setIsPullingAdmins(false);
    }
  };

  // Adjust IC balance
  const handleAdjustBalance = async () => {
    if (!adjustTeamId) return;
    const res = await api.adjustBalance(adjustTeamId, adjustAmount, 'Admin Adjustment');
    if (res.success) {
      notifySuccess(`Adjusted balance by ${adjustAmount} IC`);
      setAdjustTeamId(null);
      loadData();
    }
  };

  // Sync teams directly from Arth Mantra Supabase
  const handleDirectSupabaseSync = async () => {
    try {
      const url = 'https://hxfzxbkegkvdxdortkox.supabase.co';
      const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Znp4YmtlZ2t2ZHhkb3J0a294Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5Mjc1ODMzNywiZXhwIjoyMTA4MzM0MzM3fQ.R-CPG9cya2okMG-pIBfUigseJVAEdv74Q5EXkgp7YNE';
      
      const res = await fetch(`${url}/rest/v1/team_registrations?select=*`, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const teamsToSync = data.map((d: any) => ({
          id: d.id,
          team_code: `ARTH-${d.id.slice(-4).toUpperCase()}`,
          team_name: d.team_name,
          password: d.utr_reference ? d.utr_reference.slice(-4) : '1234',
          leader_name: d.leader_email ? d.leader_email.split('@')[0] : 'Leader',
          leader_email: d.leader_email
        }));

        const syncRes = await api.syncTeams(teamsToSync);
        notifySuccess(`Synced ${syncRes.syncedCount} approved teams from Arth Mantra Supabase!`);
        loadData();
      } else {
        notifySuccess('Supabase queried successfully (no approved teams found in database).');
      }
    } catch (err: any) {
      alert('Error syncing from Supabase: ' + err.message);
    }
  };

  // If not authenticated as Admin
  if (!adminAuth) {
    return (
      <div className="min-h-screen bg-[#070A11] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0B0F19] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-mono text-white">Admin Command Center</h1>
              <p className="text-xs text-slate-400">Arth Mantra Market Puppeteer Access</p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                Admin / Market Admin Email
              </label>
              <input
                type="email"
                placeholder="e.g. admin@arthmantra.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono focus:outline-none focus:border-cyan-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                Password / Master Key
              </label>
              <input
                type="password"
                placeholder="Enter master admin password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3.5 text-white font-mono focus:outline-none focus:border-cyan-500 text-sm"
                required
              />
            </div>

            <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-900/60 text-[11px] font-mono text-indigo-300 space-y-1">
              <p className="font-bold text-white flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Admin Authorization Modes:</span>
              </p>
              <p>• <strong>Master Key:</strong> Enter configured master administrator password.</p>
              <p>• <strong>Main Portal Admins:</strong> Portal admins & market admins can sign in using their registered email and account password.</p>
            </div>

            {authError && (
              <p className="text-xs text-rose-400 font-mono">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-900/40"
            >
              Access Admin Terminal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold font-mono text-white">
              ADMIN PUPPET-MASTER DESK
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
              GOD MODE
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Full market control: Share floats, breaking news, timed rounds, and live trade surveillance
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePullMarketAdmins}
            disabled={isPullingAdmins}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Sync authorized market admins from main hackathon portal"
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isPullingAdmins ? 'Pulling...' : 'Pull Market Admins'}</span>
          </button>

          <button
            onClick={handleDirectSupabaseSync}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Sync Supabase Teams</span>
          </button>

          <button
            onClick={() => {
              localStorage.removeItem('arth_admin_token');
              setAdminAuth(false);
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <span>Log Out Admin</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-mono flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successBanner}</span>
        </div>
      )}



      {/* SEPARATE CARD: Base IC Allocation Controller */}
      <div className="bg-[#0B0F19] border border-emerald-500/30 rounded-xl p-5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border bg-emerald-950/80 border-emerald-600 text-emerald-400">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                Uniform Base Capital (Initial IC Allocation)
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase bg-emerald-950 text-emerald-400 border-emerald-700">
                CURRENT: {(marketState?.base_ic || 10000).toLocaleString()} IC / TEAM
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              The starting Innovation Credit capital is identical across all teams. Configure and apply to all registered teams at once.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative">
            <input
              type="number"
              min="1000"
              step="500"
              value={baseICAmount}
              onChange={(e) => setBaseICAmount(parseFloat(e.target.value) || 10000)}
              className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-500 font-bold pointer-events-none">
              IC
            </span>
          </div>

          <button
            onClick={handleUpdateBaseIC}
            className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-900/30 whitespace-nowrap"
          >
            Apply Base IC to All Teams
          </button>
        </div>
      </div>

      {/* SEPARATE CARD: Market Admins & Role Synchronization */}
      <div className="bg-[#0B0F19] border border-indigo-500/30 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border bg-indigo-950/80 border-indigo-600 text-indigo-400">
              <UserCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Authorized Market Admins & Portal Sync
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase bg-indigo-950 text-indigo-300 border-indigo-800">
                  {syncedAdmins.length} AUTHORIZED ACCOUNTS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Users with admin, superadmin, or market_admin roles on the main portal are permitted to administer the mock stock market desk.
              </p>
            </div>
          </div>

          <button
            onClick={handlePullMarketAdmins}
            disabled={isPullingAdmins}
            className="py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer shadow-lg shadow-indigo-900/30 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPullingAdmins ? 'animate-spin' : ''}`} />
            <span>{isPullingAdmins ? 'Pulling Admins...' : 'Pull Market Admins from Portal'}</span>
          </button>
        </div>

        {syncedAdmins.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-2">
            {syncedAdmins.map((adm, i) => (
              <span
                key={i}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-semibold text-white">{adm.email}</span>
                <span className="text-[10px] uppercase font-bold text-cyan-400 px-1 py-0.5 rounded bg-cyan-950 border border-cyan-800">
                  {adm.role}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SEPARATE CARD: Company Management (Add & Delist Companies at will) */}
      <div className="bg-[#0B0F19] border border-cyan-500/30 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Stock Exchange Listed Companies ({stocks.length} Active Listings)
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase bg-cyan-950 text-cyan-400 border-cyan-700">
                  LIVE TRADING ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Add new companies/IPOs or delist and remove companies from live participant trading at will.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAddStock}
            className="py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-900/30 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Company (IPO)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Ticker</th>
                <th className="py-2.5 px-3">Company Name</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3 text-right">Current Price</th>
                <th className="py-2.5 px-3 text-right">Available / Total Float</th>
                <th className="py-2.5 px-3 text-center">Company Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stocks.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-3 font-bold text-cyan-300">
                    <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80">
                      {s.symbol}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-white">{s.name}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-xs">{s.description || 'No description'}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{s.sector}</td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400 text-sm">
                    {s.price.toFixed(2)} IC
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    <span className="font-bold text-white">{s.available_float.toLocaleString()}</span> / {s.total_float.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEditStock(s)}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono border border-slate-700 transition-colors flex items-center space-x-1 cursor-pointer"
                        title="Edit company metrics and parameters"
                      >
                        <Sliders className="w-3 h-3 text-cyan-400" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteStock(s.id, s.symbol)}
                        className="px-2.5 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-[11px] font-mono border border-rose-800 transition-colors flex items-center space-x-1 cursor-pointer"
                        title="Delist and remove this company from exchange trading"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Delist / Remove</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: 3 Main Control Units */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: Market Bell & Timed Rounds */}
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Play className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              1. Market Bell & Round Timer
            </h2>
          </div>

          <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800 font-mono text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">State</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-xs ${
                  marketState?.status === 'OPEN'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : marketState?.status === 'PAUSED'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {marketState?.status}
              </span>
            </div>
            {marketState?.remaining_secs !== undefined && marketState.remaining_secs > 0 && (
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase">Time Remaining</span>
                <span className="font-mono font-bold text-cyan-400 text-sm">
                  {Math.floor(marketState.remaining_secs / 60)}:
                  {(marketState.remaining_secs % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </div>

          {/* Sub-section A: Instant Manual Controls */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono text-slate-400 block uppercase font-semibold">
              Instant Manual Bell:
            </span>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              <button
                onClick={() => handleMarketStatusChange('OPEN')}
                className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center space-x-1 transition-all shadow-md shadow-emerald-900/30"
              >
                <Play className="w-3 h-3" />
                <span>OPEN</span>
              </button>

              <button
                onClick={() => handleMarketStatusChange('PAUSED')}
                className="py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center justify-center space-x-1 transition-all shadow-md shadow-amber-900/30"
              >
                <Pause className="w-3 h-3" />
                <span>FREEZE</span>
              </button>

              <button
                onClick={() => handleMarketStatusChange('CLOSED')}
                className="py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center space-x-1 transition-all shadow-md shadow-rose-900/30"
              >
                <Square className="w-3 h-3" />
                <span>CLOSE</span>
              </button>
            </div>
          </div>

          {/* Sub-section B: Timed Market Duration (e.g. 1 Hour) */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-semibold uppercase">Timed Market:</span>
              <span className="text-cyan-400 font-bold">
                {timedDuration === 60 ? '1 Hour (Full Round)' : `${timedDuration} mins`}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1 font-mono text-xs">
              {[15, 30, 45, 60, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setTimedDuration(mins)}
                  className={`py-1.5 rounded border transition-colors ${
                    timedDuration === mins
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {mins === 60 ? '1h' : mins === 120 ? '2h' : `${mins}m`}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="number"
                min="1"
                max="300"
                value={timedDuration}
                onChange={(e) => setTimedDuration(parseInt(e.target.value, 10) || 60)}
                placeholder="Mins"
                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleMarketStatusChange('OPEN', timedDuration)}
                className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs uppercase flex items-center justify-center space-x-1 transition-all shadow-md"
              >
                <Clock className="w-3 h-3" />
                <span>START TIMED ({timedDuration}m)</span>
              </button>
            </div>
          </div>

          {/* Sub-section C: Pre-Scheduled Open & Close Times */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-semibold uppercase flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pre-Scheduled Market Window</span>
              </span>
              {marketState?.scheduled_open_at && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse">
                  OPEN SCHEDULED
                </span>
              )}
              {marketState?.status === 'OPEN' && marketState?.scheduled_close_at && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700 animate-pulse">
                  AUTO-CLOSE SET
                </span>
              )}
            </div>

            {/* Active Pre-Schedule Status */}
            {marketState?.scheduled_open_at ? (
              <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/70 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Scheduled Open:</span>
                  <span className="text-cyan-300 font-bold">
                    {new Date(marketState.scheduled_open_at * 1000).toLocaleString([], { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                    })}
                  </span>
                </div>
                {marketState.scheduled_close_at && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Scheduled Close:</span>
                    <span className="text-rose-300 font-bold">
                      {new Date(marketState.scheduled_close_at * 1000).toLocaleString([], { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                      })}
                    </span>
                  </div>
                )}
                {marketState.scheduled_close_at && marketState.scheduled_open_at && (
                  <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-cyan-900/60">
                    <span>Session Length:</span>
                    <span className="text-slate-200">
                      {Math.round((marketState.scheduled_close_at - marketState.scheduled_open_at) / 60)} minutes
                    </span>
                  </div>
                )}
                <button
                  onClick={handleCancelSchedule}
                  className="w-full mt-2 py-1.5 rounded bg-rose-950/80 border border-rose-700 hover:bg-rose-900 text-rose-300 font-bold text-xs transition-all cursor-pointer shadow-md"
                >
                  Cancel Pre-Scheduled Times
                </button>
              </div>
            ) : marketState?.status === 'OPEN' ? (
              /* When Market is Already Open: Allow setting specific close time */
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-rose-400">Set Exact Closing Time:</span>
                  {marketState?.scheduled_close_at && (
                    <span className="text-[10px] text-rose-300">
                      Closes {new Date(marketState.scheduled_close_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={openMarketCloseTime}
                  onChange={(e) => setOpenMarketCloseTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-rose-500"
                />
                <div className="flex space-x-1.5">
                  <button
                    onClick={handleSetClosingTimeForOpenMarket}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs uppercase cursor-pointer transition-all"
                  >
                    Set Close Time
                  </button>
                  {marketState?.scheduled_close_at && (
                    <button
                      onClick={handleCancelSchedule}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-xs cursor-pointer"
                      title="Clear scheduled close time"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Schedule Future Opening & Closing */
              <div className="space-y-2">
                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('CLOCK')}
                    className={`py-1 rounded font-bold transition-all ${
                      scheduleMode === 'CLOCK'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Exact Clock Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('RELATIVE')}
                    className={`py-1 rounded font-bold transition-all ${
                      scheduleMode === 'RELATIVE'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Relative Timer (Mins)
                  </button>
                </div>

                {scheduleMode === 'CLOCK' ? (
                  <form onSubmit={handleScheduleExactTimes} className="space-y-2 font-mono text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                          Exact Open Time:
                        </label>
                        <button
                          type="button"
                          onClick={() => setExactOpenTime(toDateTimeLocal(new Date(Date.now() + 2 * 60 * 1000)))}
                          className="text-[9px] text-cyan-400 hover:underline"
                        >
                          Open in 2m
                        </button>
                      </div>
                      <input
                        type="datetime-local"
                        value={exactOpenTime}
                        onChange={(e) => setExactOpenTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                          Exact Close Time:
                        </label>
                        <div className="flex items-center space-x-1 text-[9px] text-cyan-400">
                          <button
                            type="button"
                            onClick={() => {
                              const base = exactOpenTime ? new Date(exactOpenTime).getTime() : Date.now();
                              setExactCloseTime(toDateTimeLocal(new Date(base + 30 * 60 * 1000)));
                            }}
                            className="hover:underline"
                          >
                            +30m
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => {
                              const base = exactOpenTime ? new Date(exactOpenTime).getTime() : Date.now();
                              setExactCloseTime(toDateTimeLocal(new Date(base + 60 * 60 * 1000)));
                            }}
                            className="hover:underline"
                          >
                            +1h
                          </button>
                        </div>
                      </div>
                      <input
                        type="datetime-local"
                        value={exactCloseTime}
                        onChange={(e) => setExactCloseTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-rose-500"
                        required
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(5, 30)}
                        className="py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                      >
                        In 5m (30m)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(10, 60)}
                        className="py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                      >
                        In 10m (1h)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(15, 60)}
                        className="py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                      >
                        In 15m (1h)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(30, 90)}
                        className="py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                      >
                        In 30m (1.5h)
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-900/40 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Set Exact Open & Close Times</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Open In (Mins):</label>
                        <input
                          type="number"
                          min="1"
                          value={scheduleOpenMins}
                          onChange={(e) => setScheduleOpenMins(parseInt(e.target.value, 10) || 10)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Stay Open (Mins):</label>
                        <input
                          type="number"
                          min="1"
                          value={scheduleDurationMins}
                          onChange={(e) => setScheduleDurationMins(parseInt(e.target.value, 10) || 60)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleScheduleTimes(scheduleOpenMins, scheduleDurationMins)}
                      className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase flex items-center justify-center space-x-1 transition-all cursor-pointer shadow-md"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Schedule (In {scheduleOpenMins}m for {scheduleDurationMins}m)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Stock Induction & Withdrawal (Requirement #8) */}
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Flame className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              2. Share Induction & Withdrawal
            </h2>
          </div>

          <div>
            <label className="text-xs font-mono text-slate-400 block mb-1">Target Stock</label>
            <select
              value={selectedStockId}
              onChange={(e) => setSelectedStockId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol} — {s.name} (Float: {s.available_float}/{s.total_float})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <button
              onClick={() => setFloatAction('INDUCE')}
              className={`py-2 rounded-lg border font-bold flex items-center justify-center space-x-1 ${
                floatAction === 'INDUCE'
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span>+ INDUCE SHARES</span>
            </button>

            <button
              onClick={() => setFloatAction('WITHDRAW')}
              className={`py-2 rounded-lg border font-bold flex items-center justify-center space-x-1 ${
                floatAction === 'WITHDRAW'
                  ? 'bg-rose-950 border-rose-500 text-rose-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span>- WITHDRAW FLOAT</span>
            </button>
          </div>

          <div>
            <label className="text-xs font-mono text-slate-400 block mb-1">Shares to Modify</label>
            <input
              type="number"
              min="1"
              value={floatShares}
              onChange={(e) => setFloatShares(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            onClick={handleFloatExecution}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all"
          >
            EXECUTE {floatAction} ({floatShares} Shares)
          </button>
        </div>

        {/* Panel 3: Breaking News & Market Shocks */}
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Radio className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              3. Breaking News & Catalyst Shock
            </h2>
          </div>

          <div>
            <label className="text-xs font-mono text-slate-400 block mb-1">Headline</label>
            <input
              type="text"
              placeholder="e.g. Clean Energy Subsidy Passes Parliament"
              value={newsHeadline}
              onChange={(e) => setNewsHeadline(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-mono text-slate-400 block mb-1">Affected Symbol</label>
              <select
                value={newsTarget}
                onChange={(e) => setNewsTarget(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">ALL (Macro Shock)</option>
                {stocks.map((s) => (
                  <option key={s.id} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-slate-400 block mb-1">Price Shock %</label>
              <input
                type="number"
                placeholder="+15 or -20"
                value={newsImpact}
                onChange={(e) => setNewsImpact(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <button
            onClick={handleBroadcastNews}
            className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-900/30"
          >
            BROADCAST BREAKING NEWS & APPLY SHOCK
          </button>
        </div>
      </div>

      {/* Live Team Operations Monitor Table */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              Live Team Operations Monitor ({teams.length} Teams)
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Team Code</th>
                <th className="py-2.5 px-3">Team Name & Leader</th>
                <th className="py-2.5 px-3">Trader PIN</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Cash Balance</th>
                <th className="py-2.5 px-3 text-right">Stock Value</th>
                <th className="py-2.5 px-3 text-right">Net Worth</th>
                <th className="py-2.5 px-3 text-right">Net P&L</th>
                <th className="py-2.5 px-3 text-center">Team Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {teams.map((t) => {
                const isProfit = (t.profit_loss || 0) >= 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-3 font-bold text-cyan-400">{t.team_code}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white">{t.team_name}</div>
                      <div className="text-[11px] text-slate-400">{t.leader_name} ({t.leader_email || 'No email'})</div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-mono">{t.password}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.is_leader_active
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${t.is_leader_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span>{t.is_leader_active ? 'ONLINE' : 'OFFLINE'}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400">
                      {t.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-400">
                      {(t.stock_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-white">
                      {(t.net_worth || t.cash_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                    </td>
                    <td className={`py-3 px-3 text-right font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '+' : ''}{(t.profit_loss || 0).toFixed(2)} IC
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => setInspectedTeam(t)}
                          className="px-2 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-[11px] font-mono border border-cyan-800 transition-colors flex items-center space-x-1 cursor-pointer"
                          title="Inspect all trades and holdings for this team"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => setAdjustTeamId(t.id)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono border border-slate-700 transition-colors cursor-pointer"
                        >
                          +/- IC
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MASTER TRADE SURVEILLANCE & AUDIT LOG (ALL TRADES ACROSS ALL TEAMS) ── */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Live Trade Surveillance & Audit Trail
                </h2>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Tracking every single execution across all {teams.length} teams in real time ({allTrades.length} Total Trades)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const exportData = allTrades.map((t, idx) => ({
                  '#': idx + 1,
                  'Timestamp': new Date(t.timestamp * 1000).toLocaleString(),
                  'Team Code': t.team_code,
                  'Team Name': t.team_name,
                  'Team Leader': t.leader_name,
                  'Asset': t.symbol,
                  'Action': t.type,
                  'Shares': t.shares,
                  'Executed Price (IC)': (t.price_per_share || t.executedPrice || 0).toFixed(2),
                  'Total Value (IC)': (t.total_ic || t.totalIC || 0).toFixed(2),
                }));
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'All Trades Audit');
                XLSX.writeFile(wb, `ArthMantra_All_Trades_${Date.now()}.xlsx`);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-emerald-900/30 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export All Trades (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search team, code, or ticker..."
              value={tradeSearchQuery}
              onChange={(e) => setTradeSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <select
              value={tradeFilterType}
              onChange={(e: any) => setTradeFilterType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Order Types (BUY & SELL)</option>
              <option value="BUY">BUY Orders Only</option>
              <option value="SELL">SELL Orders Only</option>
            </select>
          </div>

          <div>
            <select
              value={tradeFilterTeam}
              onChange={(e) => setTradeFilterTeam(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Teams ({teams.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.team_code} - {t.team_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trades Table */}
        <div className="overflow-x-auto max-h-96 overflow-y-auto pr-1">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3">Leader</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3 text-right">Shares</th>
                <th className="py-2.5 px-3 text-right">Execution Price</th>
                <th className="py-2.5 px-3 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {allTrades
                .filter((t) => {
                  const q = tradeSearchQuery.toLowerCase();
                  const matchesSearch =
                    !q ||
                    t.team_name?.toLowerCase().includes(q) ||
                    t.team_code?.toLowerCase().includes(q) ||
                    t.symbol?.toLowerCase().includes(q) ||
                    t.leader_name?.toLowerCase().includes(q);
                  const matchesType = tradeFilterType === 'ALL' || t.type === tradeFilterType;
                  const matchesTeam = tradeFilterTeam === 'ALL' || t.team_id === tradeFilterTeam || t.team_code === tradeFilterTeam;
                  return matchesSearch && matchesType && matchesTeam;
                })
                .map((t, idx) => {
                  const isBuy = t.type === 'BUY';
                  const timeStr = t.timestamp
                    ? new Date(t.timestamp * 1000).toLocaleTimeString()
                    : 'Just now';
                  const price = t.price_per_share || t.executedPrice || 0;
                  const total = t.total_ic || t.totalIC || 0;

                  return (
                    <tr key={t.id || idx} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">{timeStr}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-white">{t.team_name}</span>
                        <span className="text-slate-500 ml-1.5">[{t.team_code}]</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{t.leader_name}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-cyan-300">{t.symbol}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{t.shares}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{price.toFixed(2)} IC</td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">{total.toFixed(2)} IC</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Team Modal */}
      {inspectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-6 max-w-3xl w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-mono text-white">
                    {inspectedTeam.team_name} ({inspectedTeam.team_code})
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Leader: {inspectedTeam.leader_name} • PIN: {inspectedTeam.password}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedTeam(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-3 gap-3 font-mono text-xs">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Available Cash</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {inspectedTeam.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Stock Holdings Value</span>
                <span className="text-cyan-400 font-bold text-sm">
                  {(inspectedTeam.stock_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Total Net Worth</span>
                <span className="text-white font-bold text-sm">
                  {(inspectedTeam.net_worth || inspectedTeam.cash_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                </span>
              </div>
            </div>

            {/* Current Holdings */}
            <div>
              <h4 className="text-xs font-bold font-mono uppercase text-slate-300 mb-2">
                Current Stock Holdings ({inspectedTeam.holdings?.length || 0})
              </h4>
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Asset</th>
                      <th className="py-2 px-3">Shares</th>
                      <th className="py-2 px-3">Avg Buy Price</th>
                      <th className="py-2 px-3">Current Price</th>
                      <th className="py-2 px-3 text-right">Market Value</th>
                      <th className="py-2 px-3 text-right">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {inspectedTeam.holdings && inspectedTeam.holdings.length > 0 ? (
                      inspectedTeam.holdings.map((h: any) => (
                        <tr key={h.id}>
                          <td className="py-2 px-3 font-bold text-white">{h.symbol}</td>
                          <td className="py-2 px-3 text-slate-300">{h.shares}</td>
                          <td className="py-2 px-3 text-slate-400">{h.avg_buy_price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-slate-300">{h.current_price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-slate-200">{h.market_value.toFixed(2)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${h.unrealized_pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.unrealized_pl >= 0 ? '+' : ''}{h.unrealized_pl.toFixed(2)} IC
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500">
                          No stock holdings currently held.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trade Log */}
            <div>
              <h4 className="text-xs font-bold font-mono uppercase text-slate-300 mb-2">
                All Executed Trades by this Team ({inspectedTeam.trades?.length || 0})
              </h4>
              <div className="border border-slate-800 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3">Asset</th>
                      <th className="py-2 px-3 text-right">Shares</th>
                      <th className="py-2 px-3 text-right">Executed Price</th>
                      <th className="py-2 px-3 text-right">Total IC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {inspectedTeam.trades && inspectedTeam.trades.length > 0 ? (
                      inspectedTeam.trades.map((t: any) => (
                        <tr key={t.id}>
                          <td className="py-2 px-3 text-slate-400">
                            {new Date(t.timestamp * 1000).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                t.type === 'BUY'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-white">{t.symbol}</td>
                          <td className="py-2 px-3 text-right text-slate-300">{t.shares}</td>
                          <td className="py-2 px-3 text-right text-slate-300">{t.price_per_share.toFixed(2)} IC</td>
                          <td className="py-2 px-3 text-right font-bold text-white">{t.total_ic.toFixed(2)} IC</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500">
                          No trades executed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustTeamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-bold font-mono text-white">Adjust Team Balance</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Amount IC (Positive to add, negative to deduct)</label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-sm"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleAdjustBalance}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-bold font-mono text-xs text-white cursor-pointer"
              >
                Confirm Adjust
              </button>
              <button
                onClick={() => setAdjustTeamId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded font-mono text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Company Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold font-mono text-white">
              {customStock.id ? `Edit Company Parameters (${customStock.symbol})` : 'Induct New Company to Exchange (IPO)'}
            </h3>
            <form onSubmit={handleSaveCustomStock} className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Ticker Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g. SOLR"
                    value={customStock.symbol}
                    onChange={(e) => setCustomStock({ ...customStock, symbol: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Total Float (Shares)</label>
                  <input
                    type="number"
                    value={customStock.total_float}
                    onChange={(e) => setCustomStock({ ...customStock, total_float: parseInt(e.target.value, 10) || 1000 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. SolarEdge Holdings"
                  value={customStock.name}
                  onChange={(e) => setCustomStock({ ...customStock, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Sector / Industry</label>
                  <input
                    type="text"
                    placeholder="e.g. Clean Energy"
                    value={customStock.sector}
                    onChange={(e) => setCustomStock({ ...customStock, sector: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Initial Price (IC)</label>
                  <input
                    type="number"
                    value={customStock.price}
                    onChange={(e) => setCustomStock({ ...customStock, price: parseFloat(e.target.value) || 100 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    required
                  />
                </div>
              </div>

              {/* Problem statement metrics */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-cyan-400 block">Problem Statement Specifics:</span>
                <div>
                  <label className="text-slate-400 block mb-0.5">Cost of Acquisition</label>
                  <input
                    type="text"
                    placeholder="e.g. 72.50 IC"
                    value={customStock.costOfAcquisition}
                    onChange={(e) => setCustomStock({ ...customStock, costOfAcquisition: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-0.5">AUM / Order Book</label>
                  <input
                    type="text"
                    placeholder="e.g. 35M IC"
                    value={customStock.aum}
                    onChange={(e) => setCustomStock({ ...customStock, aum: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-0.5">Strategic Scenario Briefing</label>
                  <textarea
                    rows={3}
                    placeholder="Brief background story and valuation catalyst from the Problem Statement..."
                    value={customStock.strategicNotes}
                    onChange={(e) => setCustomStock({ ...customStock, strategicNotes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-3">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded font-bold text-white text-xs cursor-pointer shadow-lg shadow-cyan-900/30"
                >
                  {customStock.id ? 'Update Company Parameters' : 'List Company on Exchange'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
