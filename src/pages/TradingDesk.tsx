import React, { useEffect, useState } from 'react';
import { Stock, MarketState, Portfolio, Candle, NewsItem, MarketAlert, LeaderboardEntry } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { Navbar } from '../components/Navbar';
import { TradingChart } from '../components/TradingChart';
import { OrderPanel } from '../components/OrderPanel';
import { CompanyDossier } from '../components/CompanyDossier';
import { PortfolioCard } from '../components/PortfolioCard';
import { BreakingNewsBanner } from '../components/BreakingNewsBanner';
import { ScorecardModal } from '../components/ScorecardModal';
import { BarChart3, FileSpreadsheet, Layers, ShieldCheck } from 'lucide-react';

interface TradingDeskProps {
  initialTeam: any;
  onLogout: () => void;
}

export const TradingDesk: React.FC<TradingDeskProps> = ({ initialTeam, onLogout }) => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [latestCandles, setLatestCandles] = useState<Record<string, Candle>>({});
  const [activeTab, setActiveTab] = useState<'chart' | 'dossier' | 'portfolio'>('chart');
  const [breakingNews, setBreakingNews] = useState<NewsItem | null>(null);
  const [marketAlert, setMarketAlert] = useState<MarketAlert | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isScorecardOpen, setIsScorecardOpen] = useState<boolean>(false);

  const selectedStock = stocks.find((s) => s.id === selectedStockId) || stocks[0];

  // 1. Initial State Fetch
  useEffect(() => {
    api.getMarketState().then((res) => {
      if (res.state) setMarketState(res.state);
      if (res.stocks && res.stocks.length > 0) {
        setStocks(res.stocks);
        setSelectedStockId(res.stocks[0].id);
      }
    });

    if (initialTeam?.id) {
      api.getPortfolio(initialTeam.id).then((res) => {
        setPortfolio(res);
      });
    }

    api.getLeaderboard().then((res) => {
      if (res.leaderboard) setLeaderboard(res.leaderboard);
    });
  }, [initialTeam?.id]);

  // 2. Real-Time WebSockets Engine Listener
  useEffect(() => {
    const socket = getSocket();

    if (initialTeam?.id) {
      socket.emit('join:team', { teamId: initialTeam.id });
    }

    // Real-time server-authoritative ticks
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

      // Update latest candle map
      const candleMap: Record<string, Candle> = {};
      data.ticks.forEach((t) => {
        candleMap[t.stockId] = t.candle;
      });
      setLatestCandles((prev) => ({ ...prev, ...candleMap }));
    });

    socket.on('market:status', (state: MarketState) => {
      setMarketState(state);
    });

    socket.on('market:timer', (timerData: { remaining_secs: number; status: any }) => {
      setMarketState((prev) => (prev ? { ...prev, remaining_secs: timerData.remaining_secs } : null));
    });

    socket.on('market:alert', (alert: MarketAlert) => {
      setMarketAlert(alert);
    });

    socket.on('breaking:news', (news: NewsItem) => {
      setBreakingNews(news);
    });

    socket.on('stock:updated', (updatedStock: Stock) => {
      setStocks((prev) =>
        prev.map((s) => (s.id === updatedStock.id ? updatedStock : s))
      );
    });

    socket.on('portfolio:updated', (updatedPortfolio: Portfolio) => {
      setPortfolio(updatedPortfolio);
    });

    socket.on('leaderboard:updated', (updatedLeaderboard: LeaderboardEntry[]) => {
      setLeaderboard(updatedLeaderboard);
    });

    return () => {
      socket.off('market:tick');
      socket.off('market:status');
      socket.off('market:timer');
      socket.off('market:alert');
      socket.off('breaking:news');
      socket.off('stock:updated');
      socket.off('portfolio:updated');
      socket.off('leaderboard:updated');
    };
  }, [initialTeam?.id]);

  return (
    <div className="min-h-screen bg-[#070A11] flex flex-col text-slate-100">
      {/* Universal Synced Navbar & Ticker */}
      <Navbar
        stocks={stocks}
        marketState={marketState}
        teamName={initialTeam?.team_name}
        onLogout={onLogout}
        onOpenScorecard={() => setIsScorecardOpen(true)}
      />

      {/* Main Terminal Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
        {/* Stock Selector Pill Strip */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {stocks.map((s) => {
            const isSelected = s.id === selectedStockId;
            const isUp = s.change_pct >= 0;

            return (
              <button
                key={s.id}
                onClick={() => setSelectedStockId(s.id)}
                className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl border font-mono text-xs transition-all whitespace-nowrap shadow-md ${
                  isSelected
                    ? 'bg-slate-800 border-cyan-500/80 text-white shadow-cyan-950/40'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold flex items-center space-x-1.5">
                    <span>{s.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                      ({s.sector})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Float: <strong className="text-slate-200">{s.available_float}</strong>
                  </div>
                </div>

                <div className="text-right pl-2 border-l border-slate-700/60">
                  <div className="font-bold text-slate-100">
                    {s.price.toFixed(2)} IC
                  </div>
                  <div className={`font-semibold text-[11px] ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? '+' : ''}{s.change_pct.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Core Trading Arena Layout (3 Columns on Large Screens) */}
        {selectedStock && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 8 Columns: Live Chart & Problem Statement Dossier Tabs */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              {/* Tab Selector Header */}
              <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-xl">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setActiveTab('chart')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors ${
                      activeTab === 'chart'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Real-Time Chart</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('dossier')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors ${
                      activeTab === 'dossier'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Problem Statement Dossier</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('portfolio')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors lg:hidden ${
                      activeTab === 'portfolio'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>My Portfolio</span>
                  </button>
                </div>

                <div className="text-xs font-mono text-slate-400 hidden sm:block">
                  Synced Server Tick Interval: <span className="text-cyan-400">1.5s</span>
                </div>
              </div>

              {/* Tab 1: Live Interactive Candlestick Chart */}
              {activeTab === 'chart' && (
                <div className="h-[460px]">
                  <TradingChart
                    stock={selectedStock}
                    latestCandle={latestCandles[selectedStock.id]}
                  />
                </div>
              )}

              {/* Tab 2: Problem Statement Dossier */}
              {activeTab === 'dossier' && (
                <CompanyDossier stock={selectedStock} />
              )}

              {/* Tab 3: Mobile View Portfolio */}
              {activeTab === 'portfolio' && (
                <div className="lg:hidden">
                  <PortfolioCard
                    portfolio={portfolio}
                    onSelectStock={(sym) => {
                      const found = stocks.find((s) => s.symbol === sym);
                      if (found) {
                        setSelectedStockId(found.id);
                        setActiveTab('chart');
                      }
                    }}
                  />
                </div>
              )}

              {/* Desktop Portfolio View (Always visible below chart) */}
              <div className="hidden lg:block">
                <PortfolioCard
                  portfolio={portfolio}
                  onSelectStock={(sym) => {
                    const found = stocks.find((s) => s.symbol === sym);
                    if (found) setSelectedStockId(found.id);
                  }}
                />
              </div>
            </div>

            {/* Right 4 Columns: Order Execution Terminal */}
            <div className="lg:col-span-4 flex flex-col space-y-4">
              <OrderPanel
                stock={selectedStock}
                portfolio={portfolio}
                marketStatus={marketState?.status || 'CLOSED'}
                onOrderSuccess={(updatedPort) => setPortfolio(updatedPort)}
              />

              {/* Mini Problem Statement Quick Metrics Widget */}
              <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 text-xs font-mono space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Quick PS Metrics: {selectedStock.symbol}
                </span>

                {Object.entries(selectedStock.ps_metrics || {})
                  .slice(0, 3)
                  .map(([key, val]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400 truncate max-w-[150px]">{key}:</span>
                      <strong className="text-cyan-300">{val}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Breaking News Flash & System Alerts */}
      <BreakingNewsBanner
        news={breakingNews}
        alert={marketAlert}
        onDismissNews={() => setBreakingNews(null)}
        onDismissAlert={() => setMarketAlert(null)}
      />

      {/* Official Scorecard Modal */}
      <ScorecardModal
        isOpen={isScorecardOpen}
        onClose={() => setIsScorecardOpen(false)}
        leaderboard={leaderboard}
        currentTeamId={initialTeam?.id}
      />
    </div>
  );
};
