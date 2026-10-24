import React, { useEffect, useState } from 'react';
import { NewsItem, MarketAlert } from '../types';
import { Radio, Bell, X, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface BreakingNewsBannerProps {
  news: NewsItem | null;
  alert: MarketAlert | null;
  onDismissNews: () => void;
  onDismissAlert: () => void;
}

export const BreakingNewsBanner: React.FC<BreakingNewsBannerProps> = ({
  news,
  alert,
  onDismissNews,
  onDismissAlert,
}) => {
  // Auto-dismiss timers
  useEffect(() => {
    if (news) {
      const t = setTimeout(onDismissNews, 14000);
      return () => clearTimeout(t);
    }
  }, [news]);

  useEffect(() => {
    if (alert) {
      const t = setTimeout(onDismissAlert, 10000);
      return () => clearTimeout(t);
    }
  }, [alert]);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-3 max-w-md w-full px-4 sm:px-0">
      {/* 1. Market Round System Alert (e.g. "Market Closes in 5 mins") */}
      {alert && (
        <div
          className={`p-4 rounded-xl shadow-2xl border backdrop-blur-xl animate-bounce-short transition-all ${
            alert.severity === 'danger' || alert.severity === 'critical'
              ? 'bg-rose-950/95 border-rose-600 text-white'
              : alert.severity === 'warning'
              ? 'bg-amber-950/95 border-amber-600 text-amber-100'
              : 'bg-emerald-950/95 border-emerald-600 text-emerald-100'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 shrink-0 animate-pulse" />
              <span className="font-bold text-sm uppercase tracking-wide font-mono">
                {alert.title}
              </span>
            </div>
            <button
              onClick={onDismissAlert}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs mt-1.5 leading-relaxed font-sans opacity-90">
            {alert.message}
          </p>
        </div>
      )}

      {/* 2. Breaking Financial News & Catalyst Alert */}
      {news && (
        <div className="p-4 rounded-xl shadow-2xl border border-cyan-500/80 bg-slate-950/95 text-white backdrop-blur-xl transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Radio className="w-4 h-4 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">
                BREAKING MARKET NEWS
              </span>
            </div>
            <button
              onClick={onDismissNews}
              className="text-slate-400 hover:text-white p-0.5 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h4 className="text-sm font-bold mt-2 font-mono text-cyan-100 leading-snug">
            {news.headline}
          </h4>

          {news.content && (
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {news.content}
            </p>
          )}

          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400">
              Target: <strong className="text-white">{news.affected_symbols}</strong>
            </span>

            {news.price_impact_pct !== 0 && (
              <span
                className={`font-bold flex items-center space-x-1 ${
                  news.price_impact_pct > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {news.price_impact_pct > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span>
                  Price Impact: {news.price_impact_pct > 0 ? '+' : ''}
                  {news.price_impact_pct}%
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
