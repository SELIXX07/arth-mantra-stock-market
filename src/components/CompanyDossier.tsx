import React from 'react';
import { Stock } from '../types';
import { FileText, Building2, TrendingUp, DollarSign, Layers } from 'lucide-react';

interface CompanyDossierProps {
  stock: Stock;
}

export const CompanyDossier: React.FC<CompanyDossierProps> = ({ stock }) => {
  const metrics = stock.ps_metrics || {};

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              {stock.name}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Industry Sector: <span className="text-cyan-400 font-medium">{stock.sector}</span>
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 block font-mono">Market Valuation</span>
          <span className="text-base font-bold font-mono text-white">
            {(stock.price * stock.total_float).toLocaleString()} IC
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
        {stock.description}
      </div>

      {/* Problem Statement Fundamental Metrics Grid */}
      <div>
        <div className="flex items-center space-x-1.5 mb-2.5">
          <FileText className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Problem Statement Key Metrics & Trends
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {Object.entries(metrics).map(([key, val]) => {
            if (key === 'Strategic Notes' || key === 'briefing') return null;
            return (
              <div
                key={key}
                className="bg-slate-900/90 border border-slate-800/80 rounded-lg p-2.5 hover:border-slate-700 transition-colors"
              >
                <div className="text-[11px] text-slate-400 font-medium truncate">
                  {key}
                </div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                  {val}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategic Scenario Analysis / PS Briefing */}
      {(metrics['Strategic Notes'] || metrics['briefing']) && (
        <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-lg p-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-300 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Valuation & Catalyst Intel</span>
          </div>
          <p className="text-xs text-cyan-100/90 leading-relaxed">
            {metrics['Strategic Notes'] || metrics['briefing']}
          </p>
        </div>
      )}

      {/* Quick Capitalization Breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center font-mono text-xs">
        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/50">
          <span className="text-[10px] text-slate-400 block">Total Float</span>
          <span className="text-slate-200 font-bold">{stock.total_float}</span>
        </div>
        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/50">
          <span className="text-[10px] text-slate-400 block">Available Float</span>
          <span className="text-cyan-400 font-bold">{stock.available_float}</span>
        </div>
        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/50">
          <span className="text-[10px] text-slate-400 block">Day Volatility</span>
          <span className="text-amber-400 font-bold">{(stock.volatility * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};
