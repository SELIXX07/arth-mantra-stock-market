import React, { useEffect, useState } from 'react';
import { Stock, MarketState, Portfolio, Candle, NewsItem, MarketAlert, LeaderboardEntry } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { Navbar } from '../components/Navbar';
import { TradingChart } from '../components/TradingChart';
import { OrderPanel } from '../components/OrderPanel';
import { OrderBook } from '../components/OrderBook';
import { PortfolioCard } from '../components/PortfolioCard';
import { CompanySidebar } from '../components/CompanySidebar';
import { BreakingNewsBanner } from '../components/BreakingNewsBanner';
import { BarChart3, Layers, ShieldCheck } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'chart' | 'portfolio'>('chart');
  const [marketAlert, setMarketAlert] = useState<MarketAlert | null>(null);
  const [selectedLimitPrice, setSelectedLimitPrice] = useState<number | null>(null);

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

    socket.on('stock:updated', (updatedStock: Stock) => {
      setStocks((prev) =>
        prev.map((s) => (s.id === updatedStock.id ? updatedStock : s))
      );
    });

    socket.on('portfolio:updated', (updatedPortfolio: Portfolio) => {
      setPortfolio(updatedPortfolio);
    });

    return () => {
      socket.off('market:tick');
      socket.off('market:status');
      socket.off('market:timer');
      socket.off('market:alert');
      socket.off('stock:updated');
      socket.off('portfolio:updated');
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
      />

      {/* Main Terminal Grid: 3-Column Institutional Architecture */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-4">
        {selectedStock && (
          <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
            {/* Left Column: Market Watch Company Menu (Supports 40+ Companies with Search & Sector Filter) */}
            <CompanySidebar
              stocks={stocks}
              selectedStockId={selectedStockId}
              onSelectStock={(id) => setSelectedStockId(id)}
            />

            {/* Center Column: Live Candlestick Chart & Active Portfolio */}
            <div className="flex-1 min-w-0 w-full flex flex-col space-y-4">
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
                <div className="h-[480px]">
                  <TradingChart
                    stock={selectedStock}
                    latestCandle={latestCandles[selectedStock.id]}
                  />
                </div>
              )}

              {/* Tab 2: Mobile View Portfolio */}
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

            {/* Right Column: Order Execution Terminal & Level 2 Depth Order Book */}
            <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col space-y-4">
              <OrderPanel
                stock={selectedStock}
                portfolio={portfolio}
                marketStatus={marketState?.status || 'CLOSED'}
                selectedTargetPrice={selectedLimitPrice}
                onOrderSuccess={(updatedPort) => setPortfolio(updatedPort)}
              />

              {/* Level 2 Depth Order Book */}
              <OrderBook
                stockId={selectedStock.id}
                symbol={selectedStock.symbol}
                onPriceSelect={(price) => setSelectedLimitPrice(price)}
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

      {/* System Status Alerts Only (Silent price shocks - zero participant notifications) */}
      <BreakingNewsBanner
        news={null}
        alert={marketAlert}
        onDismissNews={() => {}}
        onDismissAlert={() => setMarketAlert(null)}
      />
    </div>
  );
};
