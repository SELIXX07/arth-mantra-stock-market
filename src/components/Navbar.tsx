import React, { useState, useEffect } from 'react';
import { Stock, MarketState } from '../types';
import { Activity, Clock, Award, Monitor, LogOut, Terminal, Sparkles } from 'lucide-react';
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

  const isParticipant = Boolean(teamName || localStorage.getItem('arth_team') || localStorage.getItem('arth_session_id'));

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    if (localStorage.getItem('arth_team')) return false;
    return Boolean(localStorage.getItem('arth_admin_token'));
  });

  useEffect(() => {
    const checkAdmin = () => {
      if (teamName || localStorage.getItem('arth_team') || localStorage.getItem('arth_session_id')) {
        setIsAdminLoggedIn(false);
      } else {
        setIsAdminLoggedIn(Boolean(localStorage.getItem('arth_admin_token')));
      }
    };
    checkAdmin();
    window.addEventListener('storage', checkAdmin);
    return () => window.removeEventListener('storage', checkAdmin);
  }, [teamName]);

  const formatRemainingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const status = marketState?.status || 'CLOSED';
  const remaining = marketState?.remaining_secs || 0;

  return (
    <header className="sticky top-0 z-50 bg-[#070A11]/90 border-b border-slate-800/80 backdrop-blur-xl shadow-lg">
      {/* 1. Scrolling Stock Ticker Tape */}
      <div className="bg-slate-950/90 border-b border-slate-900/90 py-1.5 overflow-hidden whitespace-nowrap text-xs font-mono">
        <div className="inline-block animate-ticker space-x-6">
          {stocks.concat(stocks).map((s, idx) => {
            const isUp = s.change_pct >= 0;
            return (
              <span key={idx} className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-md hover:bg-slate-900/50 transition-colors">
                <span className="font-bold text-slate-200">{s.symbol}</span>
                <span className="text-slate-300 font-semibold">{s.price.toFixed(2)} IC</span>
                <span className={`font-bold flex items-center ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '▲' : '▼'}{isUp ? '+' : ''}{s.change_pct.toFixed(2)}%
                </span>
                <span className="text-slate-700">|</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-transform hover:scale-105">
            <Activity className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black tracking-wider text-base font-mono text-white">
                ARTH MANTRA
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 font-mono font-bold tracking-widest uppercase">
                EXCHANGE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
              {marketState?.round_name || 'Round 3: Asset Valuation & Trading'}
            </p>
          </div>
        </div>

        {/* Synced Market State & Countdown Clock */}
        <div className="flex items-center space-x-3.5 bg-gradient-to-r from-slate-900/90 to-slate-950/90 border border-slate-800/90 px-4 py-1.5 rounded-2xl font-mono shadow-inner">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'OPEN'
                  ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse'
                  : status === 'PAUSED'
                  ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                  : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]'
              }`}
            />
            <span
              className={`text-xs font-black uppercase tracking-wider ${
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

          <div className="h-4 w-px bg-slate-800" />

          {status !== 'OPEN' && marketState?.scheduled_open_at ? (
            <div className="flex items-center space-x-1.5 text-xs text-cyan-300" title={`Market is scheduled to open at ${new Date(marketState.scheduled_open_at * 1000).toLocaleTimeString()}`}>
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="font-bold">
                OPENS {new Date(marketState.scheduled_open_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-black text-white tracking-widest text-sm">
                {formatRemainingTime(remaining)}
              </span>
            </div>
          )}
        </div>

        {/* Right Navigation Actions */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          {/* Admin-only Navigation: Scorecard, Projector, and Admin Desk (NEVER rendered for participants) */}
          {!isParticipant && isAdminLoggedIn && (
            <>
              {onOpenScorecard && (
                <button
                  onClick={onOpenScorecard}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer"
                  title="Open Official Scorecard & Download Team Statements"
                >
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Scorecard</span>
                </button>
              )}

              <Link
                to="/projector"
                target="_blank"
                className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-mono font-medium flex items-center space-x-1.5 transition-all hover:border-slate-700"
                title="Open Auditorium Big Screen Display"
              >
                <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline">Projector</span>
              </Link>

              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center space-x-1.5 transition-all ${
                  location.pathname === '/admin'
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-800 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Admin</span>
              </Link>
            </>
          )}

          {teamName && onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer"
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
