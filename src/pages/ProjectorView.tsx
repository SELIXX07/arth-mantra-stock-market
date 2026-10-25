import React, { useEffect, useState } from 'react';
import { Stock, MarketState, LeaderboardEntry, NewsItem, Candle } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { TradingChart } from '../components/TradingChart';
import { Activity, Trophy, Clock, Radio, TrendingUp, TrendingDown } from 'lucide-react';

export const ProjectorView: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [latestCandles, setLatestCandles] = useState<Record<string, Candle>>({});
  const [breakingNews, setBreakingNews] = useState<NewsItem | null>(null);

  const selectedStock = stocks.find((s) => s.id === selectedStockId) || stocks[0];

  useEffect(() => {
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

    return () => {
      socket.off('market:tick');
      socket.off('market:status');
      socket.off('market:timer');
      socket.off('leaderboard:updated');
      socket.off('breaking:news');
    };
  }, []);

  // Cycle through stocks on the projector every 15 seconds automatically!
  useEffect(() => {
    if (stocks.length <= 1) return;
    const interval = setInterval(() => {
      setSelectedStockId((curr) => {
        const idx = stocks.findIndex((s) => s.id === curr);
        const nextIdx = (idx + 1) % stocks.length;
        return stocks[nextIdx].id;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [stocks]);

  const formatRemainingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const status = marketState?.status || 'CLOSED';
  const remaining = marketState?.remaining_secs || 0;

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col p-6 space-y-6 overflow-hidden">
      {/* Top Banner for Auditorium */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/25">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black font-mono tracking-wider text-white">
              ARTH MANTRA EXCHANGE
            </h1>
            <p className="text-sm font-mono text-cyan-400 uppercase tracking-widest">
              Live Stage Trading Floor • Round 2 Simulation
            </p>
          </div>
        </div>

        {/* Huge Synced Timer HUD */}
        <div className="flex items-center space-x-6 bg-slate-900/90 border border-slate-700/80 px-6 py-3 rounded-2xl font-mono shadow-2xl">
          <div className="flex items-center space-x-3">
            <span
              className={`w-4 h-4 rounded-full ${
                status === 'OPEN'
                  ? 'bg-emerald-500 animate-pulse'
                  : status === 'PAUSED'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={`text-xl font-bold uppercase tracking-wider ${
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

          <div className="h-8 w-px bg-slate-700" />

          {status !== 'OPEN' && marketState?.scheduled_open_at ? (
            <div className="flex items-center space-x-2 text-2xl font-extrabold text-cyan-300 tracking-wide animate-pulse">
              <Clock className="w-6 h-6 text-cyan-400" />
              <span>OPENS {new Date(marketState.scheduled_open_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-3xl font-extrabold text-white tracking-widest">
              <Clock className="w-6 h-6 text-slate-400" />
              <span>{formatRemainingTime(remaining)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Ticker Tape */}
      <div className="bg-slate-950 border border-slate-800 py-2.5 px-4 rounded-xl overflow-hidden whitespace-nowrap text-sm font-mono">
        <div className="inline-block animate-ticker space-x-8">
          {stocks.concat(stocks).map((s, idx) => {
            const isUp = s.change_pct >= 0;
            return (
              <span key={idx} className="inline-flex items-center space-x-2">
                <span className="font-bold text-white text-base">{s.symbol}</span>
                <span className="text-slate-300">{s.price.toFixed(2)} IC</span>
                <span className={isUp ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {isUp ? '▲' : '▼'}{isUp ? '+' : ''}{s.change_pct.toFixed(2)}%
                </span>
                <span className="text-slate-500">|</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Main Screen: Split between Real-time Chart and Live Leaderboard */}
      <div className="flex-1 grid grid-cols-12 gap-6">
        {/* Left 7 Columns: Active Candlestick Chart */}
        <div className="col-span-7 flex flex-col space-y-4">
          <div className="flex-1 min-h-[480px]">
            {selectedStock && (
              <TradingChart
                stock={selectedStock}
                latestCandle={latestCandles[selectedStock.id]}
              />
            )}
          </div>
        </div>

        {/* Right 5 Columns: Stage Leaderboard */}
        <div className="col-span-5 bg-[#0B0F19] border border-slate-800 rounded-2xl p-5 flex flex-col shadow-2xl">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800 mb-3">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold font-mono text-white uppercase tracking-wider">
              Live Team Rankings & Return %
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono">
            {leaderboard.slice(0, 8).map((team) => {
              const isProfit = team.profit_loss >= 0;
              return (
                <div
                  key={team.id}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                    team.rank === 1
                      ? 'bg-amber-950/30 border-amber-500/60 shadow-lg shadow-amber-950/20'
                      : team.rank === 2
                      ? 'bg-slate-800/40 border-slate-600'
                      : team.rank === 3
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : 'bg-slate-900/50 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
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
                      <div className="font-bold text-white text-sm">{team.team_name}</div>
                      <div className="text-[11px] text-slate-400">{team.team_code}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-base font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '▲ +' : '▼ '}{team.return_pct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Portfolio Return
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Big Stage Breaking News Takeover Popup */}
      {breakingNews && (
        <div className="fixed inset-x-8 bottom-8 z-50 p-6 bg-slate-950/95 border-2 border-cyan-400 rounded-2xl shadow-2xl backdrop-blur-2xl animate-bounce-short">
          <div className="flex items-center space-x-3 text-cyan-400 mb-2">
            <Radio className="w-6 h-6 animate-ping" />
            <span className="text-sm font-bold uppercase tracking-widest font-mono">
              STAGE ANNOUNCEMENT: BREAKING FINANCIAL NEWS
            </span>
          </div>

          <h3 className="text-2xl font-black font-mono text-white leading-tight">
            {breakingNews.headline}
          </h3>

          {breakingNews.content && (
            <p className="text-base text-slate-300 mt-2 font-sans">
              {breakingNews.content}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800 text-sm font-mono">
            <span className="text-slate-400">
              Impacted Assets: <strong className="text-white">{breakingNews.affected_symbols}</strong>
            </span>
            {breakingNews.price_impact_pct !== 0 && (
              <span
                className={`font-bold text-base ${
                  breakingNews.price_impact_pct > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                Immediate Market Shock: {breakingNews.price_impact_pct > 0 ? '+' : ''}
                {breakingNews.price_impact_pct}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
