import React from 'react';
import { Stock, MarketState } from '../types';
import { Activity, Clock, ShieldAlert, Award, Monitor, LogOut, Terminal } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface NavbarProps {
  stocks: Stock[];
  marketState: MarketState | null;
  teamName?: string;
  onLogout?: () => void;
  onOpenScorecard?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  stocks,
  marketState,
  teamName,
  onLogout,
  onOpenScorecard,
}) => {
  const location = useLocation();

  const formatRemainingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const status = marketState?.status || 'CLOSED';
  const remaining = marketState?.remaining_secs || 0;

  return (
    <header className="sticky top-0 z-50 bg-[#070A11]/95 border-b border-slate-800 backdrop-blur-md">
      {/* 1. Scrolling Stock Ticker Tape */}
      <div className="bg-slate-950/80 border-b border-slate-900 py-1 overflow-hidden whitespace-nowrap text-xs font-mono">
        <div className="inline-block animate-ticker space-x-6">
          {stocks.concat(stocks).map((s, idx) => {
            const isUp = s.change_pct >= 0;
            return (
              <span key={idx} className="inline-flex items-center space-x-1.5 px-2">
                <span className="font-bold text-slate-200">{s.symbol}</span>
                <span className="text-slate-300">{s.price.toFixed(2)} IC</span>
                <span className={isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {isUp ? '▲' : '▼'}{isUp ? '+' : ''}{s.change_pct.toFixed(2)}%
                </span>
                <span className="text-slate-600">|</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold tracking-wider text-base font-mono text-white">
                ARTH MANTRA
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono uppercase">
                EXCHANGE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
              {marketState?.round_name || 'Round 2: Asset Valuation & Trading'}
            </p>
          </div>
        </div>

        {/* Synced Market State & Countdown Clock */}
        <div className="flex items-center space-x-4 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-lg font-mono">
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'OPEN'
                  ? 'bg-emerald-500 animate-pulse'
                  : status === 'PAUSED'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={`text-xs font-bold uppercase tracking-wide ${
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

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center space-x-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-white tracking-widest text-sm">
              {formatRemainingTime(remaining)}
            </span>
          </div>
        </div>

        {/* Right Navigation Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {onOpenScorecard && (
            <button
              onClick={onOpenScorecard}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Scorecard</span>
            </button>
          )}

          <Link
            to="/projector"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors"
            title="Open Auditorium Big Screen Display"
          >
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Projector</span>
          </Link>

          <Link
            to="/admin"
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors ${
              location.pathname === '/admin'
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Admin</span>
          </Link>

          {teamName && onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
              title="Logout session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
