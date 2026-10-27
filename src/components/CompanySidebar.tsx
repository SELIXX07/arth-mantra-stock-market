import React, { useState, useMemo } from 'react';
import { Stock } from '../types';
import { Search, X, TrendingUp, TrendingDown, Filter, Building2, ChevronDown, ChevronUp } from 'lucide-react';

interface CompanySidebarProps {
  stocks: Stock[];
  selectedStockId: string;
  onSelectStock: (stockId: string) => void;
}

export const CompanySidebar: React.FC<CompanySidebarProps> = ({
  stocks,
  selectedStockId,
  onSelectStock,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'symbol' | 'gainers' | 'losers' | 'price_high' | 'price_low'>('symbol');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Extract unique sectors dynamically from the stocks list
  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [stocks]);

  // Gainers / Losers count
  const gainersCount = useMemo(() => stocks.filter((s) => s.change_pct > 0).length, [stocks]);
  const losersCount = useMemo(() => stocks.filter((s) => s.change_pct < 0).length, [stocks]);

  // Filter and sort stocks
  const filteredStocks = useMemo(() => {
    return stocks
      .filter((s) => {
        // Search query filter (matches Symbol, Name, or Sector)
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q);

        // Sector filter
        const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;

        return matchesQuery && matchesSector;
      })
      .sort((a, b) => {
        if (sortBy === 'symbol') {
          return a.symbol.localeCompare(b.symbol);
        } else if (sortBy === 'gainers') {
          return b.change_pct - a.change_pct;
        } else if (sortBy === 'losers') {
          return a.change_pct - b.change_pct;
        } else if (sortBy === 'price_high') {
          return b.price - a.price;
        } else if (sortBy === 'price_low') {
          return a.price - b.price;
        }
        return 0;
      });
  }, [stocks, searchQuery, selectedSector, sortBy]);

  const selectedStock = stocks.find((s) => s.id === selectedStockId) || stocks[0];

  return (
    <aside className="w-full lg:w-72 xl:w-80 shrink-0 font-mono text-xs">
      {/* Mobile Toggle Bar */}
      <div className="lg:hidden mb-3">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-white shadow-lg"
        >
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span className="font-bold">Market Watch ({stocks.length} Companies)</span>
            {selectedStock && (
              <span className="text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 text-[11px]">
                {selectedStock.symbol} • {selectedStock.price.toFixed(2)} IC
              </span>
            )}
          </div>
          {isMobileOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </div>

      {/* Main Container (Always visible on desktop, toggleable on mobile) */}
      <div
        className={`${
          isMobileOpen ? 'block' : 'hidden lg:flex'
        } flex-col bg-[#0B0F19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl lg:h-[840px]`}
      >
        {/* Header: Market Watch Summary & Stats */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <h2 className="font-black text-white text-sm uppercase tracking-wide">
                Market Watch
              </h2>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
              {filteredStocks.length} / {stocks.length}
            </span>
          </div>

          {/* Quick Gainers vs Losers Pills */}
          <div className="flex items-center space-x-2 text-[10px]">
            <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/60">
              <TrendingUp className="w-3 h-3" />
              <span>{gainersCount} Gainers</span>
            </span>
            <span className="flex items-center space-x-1 text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/60">
              <TrendingDown className="w-3 h-3" />
              <span>{losersCount} Losers</span>
            </span>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search ticker, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort By & Sector Filter Row */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {/* Sector Selector */}
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-cyan-500 truncate"
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-cyan-500 truncate"
            >
              <option value="symbol">Sort: Ticker (A-Z)</option>
              <option value="gainers">Sort: Top Gainers</option>
              <option value="losers">Sort: Top Losers</option>
              <option value="price_high">Sort: Price (High-Low)</option>
              <option value="price_low">Sort: Price (Low-High)</option>
            </select>
          </div>
        </div>

        {/* Scrollable Company List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 max-h-[500px] lg:max-h-none scrollbar-thin scrollbar-thumb-slate-800">
          {filteredStocks.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              No matching companies found for "{searchQuery}".
            </div>
          ) : (
            filteredStocks.map((stock) => {
              const isSelected = stock.id === selectedStockId;
              const isUp = stock.change_pct >= 0;

              return (
                <div
                  key={stock.id}
                  onClick={() => {
                    onSelectStock(stock.id);
                    setIsMobileOpen(false);
                  }}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-all border-l-4 ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-950/50 to-slate-900/90 border-cyan-400 shadow-inner'
                      : 'border-transparent hover:bg-slate-900/60'
                  }`}
                >
                  {/* Left: Ticker & Name & Sector */}
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className={`font-black text-sm tracking-wide ${isSelected ? 'text-cyan-300' : 'text-white'}`}>
                        {stock.symbol}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal truncate max-w-[100px] hidden sm:inline">
                        • {stock.sector}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-[130px] sm:max-w-[150px]">
                      {stock.name}
                    </p>
                  </div>

                  {/* Right: Live Price & % Change */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-white text-xs">
                      {stock.price.toFixed(2)} IC
                    </div>
                    <div
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center space-x-0.5 mt-0.5 ${
                        isUp
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                          : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                      }`}
                    >
                      <span>{isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};
