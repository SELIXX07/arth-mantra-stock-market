import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Stock, MarketState, LeaderboardEntry, NewsItem, Candle } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { TradingChart } from '../components/TradingChart';
import { 
  Activity, Trophy, Clock, Radio, TrendingUp, TrendingDown, 
  ArrowUpRight, ArrowDownRight, Eye, EyeOff, Layers, Zap
} from 'lucide-react';

interface ActiveTrade {
  id: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price_per_share: number;
  total_ic: number;
  timestamp: number;
  symbol: string;
  team_name: string;
  leader_name?: string;
}

const formatCleanLeaderName = (name?: string): string => {
  if (!name || name.toLowerCase() === 'leader' || name.toLowerCase() === 'team leader') return 'Squad Leader';
  if (name.includes('@')) {
    const raw = name.split('@')[0].replace(/[._0-9]/g, ' ').trim();
    return raw.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Squad Leader';
  }
  if (/\d/.test(name) && !name.includes(' ')) {
    const raw = name.replace(/[._0-9]/g, ' ').trim();
    if (raw) {
      return raw.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }
  return name;
};

export const ProjectorView: React.FC = () => {
  const isParticipant = Boolean(localStorage.getItem('arth_team') || localStorage.getItem('arth_session_id'));

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [latestCandles, setLatestCandles] = useState<Record<string, Candle>>({});
  const [breakingNews, setBreakingNews] = useState<NewsItem | null>(null);

  // Active Live Trades Stream
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [showActiveTrades, setShowActiveTrades] = useState<boolean>(() => {
    return localStorage.getItem('arth_proj_show_trades') !== 'false';
  });

  // Stock Rotation Countdown in Seconds (cycles every 10s)
  const [rotationTimer, setRotationTimer] = useState<number>(10);

  const selectedStock = stocks.find((s) => s.id === selectedStockId) || stocks[0];

  useEffect(() => {
    // 1. Initial State Fetch
    api.getMarketState().then((res) => {
      if (res.state) setMarketState(res.state);
      if (res.stocks && res.stocks.length > 0) {
        setStocks(res.stocks);
        setSelectedStockId(res.stocks[0].id);
      }
    });

    api.getLeaderboard().then((res) => {
      if (res.leaderboard) setLeaderboard(res.leaderboard);
    });

    // 2. Fetch Recent Trades for Live Stream
    api.getProjectorRecentTrades().then((res) => {
      if (res.trades) {
        setActiveTrades(res.trades);
      }
    }).catch(() => {});

    // 3. Socket Event Listeners
    const socket = getSocket();

    socket.on('market:tick', (data: { timestamp: number; ticks: any[] }) => {
      setStocks((prevStocks) =>
        prevStocks.map((stock) => {
          const tick = data.ticks.find((t) => t.stockId === stock.id);
          if (tick) {
            return {
              ...stock,
              price: tick.price,
              change_pct: tick.change_pct,
            };
          }
          return stock;
        })
      );

      const candleMap: Record<string, Candle> = {};
      data.ticks.forEach((t) => {
        candleMap[t.stockId] = t.candle;
      });
      setLatestCandles((prev) => ({ ...prev, ...candleMap }));
    });

    socket.on('market:status', (state: MarketState) => setMarketState(state));
    socket.on('market:timer', (data: { remaining_secs: number }) => {
      setMarketState((prev) => (prev ? { ...prev, remaining_secs: data.remaining_secs } : null));
    });
    socket.on('leaderboard:updated', (data: LeaderboardEntry[]) => setLeaderboard(data));
    socket.on('breaking:news', (news: NewsItem) => setBreakingNews(news));

    // Live Trade Stream Event (Broadcast to Projector)
    socket.on('trade:executed_global', (trade: any) => {
      setActiveTrades((prev) => [
        {
          id: trade.tradeId || trade.id || `tr-${Date.now()}`,
          type: trade.type,
          shares: trade.shares,
          price_per_share: trade.executedPrice || trade.price_per_share,
          total_ic: trade.totalIC || trade.total_ic,
          timestamp: trade.timestamp || Math.floor(Date.now() / 1000),
          symbol: trade.symbol,
          team_name: trade.team_name || 'Squad Trader',
          leader_name: trade.leader_name
        },
        ...prev.slice(0, 14)
      ]);
    });

    // Remote Admin Toggle for Trades Feed Visibility
    socket.on('projector:trades_visibility', (data: { visible: boolean }) => {
      setShowActiveTrades(data.visible);
      localStorage.setItem('arth_proj_show_trades', String(data.visible));
    });

    return () => {
      socket.off('market:tick');
      socket.off('market:status');
      socket.off('market:timer');
      socket.off('leaderboard:updated');
      socket.off('breaking:news');
      socket.off('trade:executed_global');
      socket.off('projector:trades_visibility');
    };
  }, []);

  // Smoothly cycle through different company charts every 10 seconds automatically
  useEffect(() => {
    if (stocks.length <= 1) return;

    const interval = setInterval(() => {
      setRotationTimer((prev) => {
        if (prev <= 1) {
          // Switch to next company chart
          setSelectedStockId((curr) => {
            const idx = stocks.findIndex((s) => s.id === curr);
            const nextIdx = (idx + 1) % stocks.length;
            return stocks[nextIdx].id;
          });
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stocks]);

  const toggleTradesVisibility = () => {
    const nextVal = !showActiveTrades;
    setShowActiveTrades(nextVal);
    localStorage.setItem('arth_proj_show_trades', String(nextVal));
    const socket = getSocket();
    socket.emit('admin:toggle_projector_trades', { visible: nextVal });
  };

  const formatRemainingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTradeTime = (timestamp: number) => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, nowSecs - timestamp);
    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const status = marketState?.status || 'CLOSED';
  const remaining = marketState?.remaining_secs || 0;

  if (isParticipant) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col p-5 space-y-4 overflow-hidden">
      {/* Top Banner for Auditorium */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-black font-mono tracking-wider text-white">
                ARTH MANTRA EXCHANGE
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-widest">
                STAGE PROJECTOR
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
              Live Stage Trading Floor • Round 3 Simulation
            </p>
          </div>
        </div>

        {/* Right Header Controls: Admin Trades Toggle & Synced Timer */}
        <div className="flex items-center space-x-3">
          {/* Admin Toggle Button for Active Trades Feed */}
          <button
            onClick={toggleTradesVisibility}
            className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md ${
              showActiveTrades
                ? 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-700/80 text-emerald-300 shadow-emerald-950/40'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Toggle live trade feed visibility on projector display"
          >
            {showActiveTrades ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Trades Feed: {showActiveTrades ? 'ON' : 'OFF'}</span>
          </button>

          {/* Huge Synced Timer HUD */}
          <div className="flex items-center space-x-4 bg-slate-900/90 border border-slate-700/80 px-4 py-2 rounded-xl font-mono shadow-2xl">
            <div className="flex items-center space-x-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  status === 'OPEN'
                    ? 'bg-emerald-500 animate-pulse'
                    : status === 'PAUSED'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
              <span
                className={`text-sm font-bold uppercase tracking-wider ${
                  status === 'OPEN'
                    ? 'text-emerald-400'
                    : status === 'PAUSED'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {status}
              </span>
            </div>

            <div className="h-6 w-px bg-slate-700" />

            {status !== 'OPEN' && marketState?.scheduled_open_at ? (
              <div className="flex items-center space-x-1.5 text-lg font-extrabold text-cyan-300 tracking-wide animate-pulse">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>OPENS {new Date(marketState.scheduled_open_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-2xl font-black text-white tracking-widest">
                <Clock className="w-5 h-5 text-slate-400" />
                <span>{formatRemainingTime(remaining)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rotating Stock Switcher Bar with Auto-Switch Countdown Indicator */}
      <div className="bg-[#0A0E1A] border border-slate-800/80 p-2 rounded-xl flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center space-x-1 text-slate-400 font-mono text-xs uppercase px-2 py-1 bg-slate-900 rounded-lg border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="font-bold text-cyan-300">AUTO-ROTATING:</span>
            <span className="text-white font-bold">{rotationTimer}s</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-1 overflow-x-auto no-scrollbar">
          {stocks.map((stock) => {
            const isSelected = stock.id === selectedStockId;
            const isUp = stock.change_pct >= 0;
            return (
              <button
                key={stock.id}
                onClick={() => {
                  setSelectedStockId(stock.id);
                  setRotationTimer(10);
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap border ${
                  isSelected
                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                }`}
              >
                <span>{stock.symbol}</span>
                <span className="text-white">{stock.price.toFixed(2)}</span>
                <span className={`text-[10px] ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Screen: Split between Real-time Chart and Stage Right Column */}
      <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
        {/* Left Columns: Active Candlestick Chart */}
        <div className={`${showActiveTrades ? 'col-span-7' : 'col-span-8'} flex flex-col space-y-3 transition-all duration-300`}>
          <div className="flex-1 min-h-[460px]">
            {selectedStock && (
              <TradingChart
                stock={selectedStock}
                latestCandle={latestCandles[selectedStock.id]}
              />
            )}
          </div>
        </div>

        {/* Right Columns: Stage Leaderboard & Active Trades Stream */}
        <div className={`${showActiveTrades ? 'col-span-5' : 'col-span-4'} flex flex-col space-y-4 min-h-0 transition-all duration-300`}>
          {/* Top Panel: Live Team Rankings */}
          <div className={`${showActiveTrades ? 'flex-1 max-h-[300px]' : 'flex-1'} bg-[#0B0F19] border border-slate-800 rounded-2xl p-4 flex flex-col shadow-2xl overflow-hidden`}>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-2">
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                  Live Standings
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {leaderboard.length} Squads
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono no-scrollbar">
              {leaderboard.slice(0, showActiveTrades ? 5 : 8).map((team) => {
                const isProfit = team.profit_loss >= 0;
                return (
                  <div
                    key={team.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      team.rank === 1
                        ? 'bg-amber-950/30 border-amber-500/60'
                        : team.rank === 2
                        ? 'bg-slate-800/40 border-slate-600'
                        : team.rank === 3
                        ? 'bg-amber-950/20 border-amber-800/40'
                        : 'bg-slate-900/50 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          team.rank === 1
                            ? 'bg-amber-400 text-black'
                            : team.rank === 2
                            ? 'bg-slate-300 text-black'
                            : team.rank === 3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {team.rank}
                      </span>

                      <div>
                        <div className="font-bold text-white text-xs truncate max-w-[150px]">{team.team_name}</div>
                        <div className="text-[10px] text-slate-400">{formatCleanLeaderName(team.leader_name)}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xs font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '▲ +' : '▼ '}{team.return_pct.toFixed(2)}%
                      </div>
                      <div className="text-[9px] text-slate-500 uppercase">
                        Return
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Panel: Live Active Trades Stream (Collapsible via Admin Toggle) */}
          {showActiveTrades && (
            <div className="flex-1 max-h-[300px] bg-[#0B0F19] border border-cyan-500/30 rounded-2xl p-4 flex flex-col shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-2">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <h2 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                    Active Executed Trades
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-cyan-400/80 uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                  Live Feed
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono no-scrollbar">
                {activeTrades.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs font-mono">
                    Awaiting opening bell trades...
                  </div>
                ) : (
                  activeTrades.slice(0, 7).map((tr) => {
                    const isBuy = tr.type === 'BUY';
                    return (
                      <div
                        key={tr.id}
                        className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between transition-all hover:border-slate-700"
                      >
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                              isBuy
                                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                                : 'bg-rose-950/90 text-rose-300 border-rose-700'
                            }`}
                          >
                            {tr.type}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-white truncate max-w-[120px]">
                              {tr.team_name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {tr.shares} shs • {tr.symbol}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-white font-mono">
                            {tr.price_per_share.toFixed(2)} IC
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {formatTradeTime(tr.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stage Breaking News Takeover Popup */}
      {breakingNews && (
        <div className="fixed inset-x-8 bottom-6 z-50 p-5 bg-slate-950/95 border-2 border-cyan-400 rounded-2xl shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center space-x-2 text-cyan-400 mb-1.5">
            <Radio className="w-5 h-5 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">
              STAGE ANNOUNCEMENT: BREAKING FINANCIAL NEWS
            </span>
          </div>

          <h3 className="text-xl font-black font-mono text-white leading-tight">
            {breakingNews.headline}
          </h3>

          {breakingNews.content && (
            <p className="text-sm text-slate-300 mt-1 font-sans">
              {breakingNews.content}
            </p>
          )}

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800 text-xs font-mono">
            <span className="text-slate-400">
              Impacted: <strong className="text-white">{breakingNews.affected_symbols}</strong>
            </span>
            {breakingNews.price_impact_pct !== 0 && (
              <span
                className={`font-bold ${
                  breakingNews.price_impact_pct > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                Shock: {breakingNews.price_impact_pct > 0 ? '+' : ''}{breakingNews.price_impact_pct}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
