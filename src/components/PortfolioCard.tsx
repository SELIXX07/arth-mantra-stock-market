import React from 'react';
import { Portfolio } from '../types';
import { TrendingUp, TrendingDown, Clock, ShieldCheck, Download, Sparkles, Layers } from 'lucide-react';
import { downloadTeamTradingReport } from '../utils/exportTeamReport';

interface PortfolioCardProps {
  portfolio: Portfolio | null;
  onSelectStock: (symbol: string) => void;
}

export const PortfolioCard: React.FC<PortfolioCardProps> = ({ portfolio, onSelectStock }) => {
  if (!portfolio) {
    return (
      <div className="bg-[#0B0F19]/90 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-400 font-mono animate-pulse">
        Synchronizing real-time portfolio data...
      </div>
    );
  }

  const { team, holdings, stock_portfolio_value, total_net_worth, total_profit_loss, total_return_pct, trades } = portfolio;
  const isProfitable = total_profit_loss >= 0;

  const handleDownload = () => {
    downloadTeamTradingReport(team, holdings, trades);
  };

  return (
    <div className="bg-gradient-to-br from-[#0c1427]/90 via-[#0a101f]/90 to-[#070b16]/95 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-[0_0_35px_rgba(0,210,255,0.08)] space-y-5 backdrop-blur-xl">
      {/* Top Banner: Team Identity & Total Net Worth */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-base font-black text-white tracking-wide uppercase font-mono">
              {team.team_name}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1.5 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Leader: <strong className="text-slate-200">{team.leader_name}</strong></span>
          </p>
        </div>

        {/* Big Net Worth Display + Individual Download Button */}
        <div className="flex flex-col sm:items-end gap-2">
          <div className="text-left sm:text-right">
            <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase tracking-wider">
              Total Squad Net Worth
            </span>
            <div className="flex items-center sm:justify-end space-x-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300">
                {total_net_worth.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-lg font-bold font-mono flex items-center space-x-1 border shadow-sm ${
                  isProfitable
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                }`}
              >
                {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>
                  {isProfitable ? '+' : ''}
                  {total_profit_loss.toFixed(2)} IC ({total_return_pct.toFixed(2)}%)
                </span>
              </span>
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-mono font-bold text-xs flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 cursor-pointer"
            title="Download full session report containing balances, holdings, and all executed trades (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Session Statement (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Balance Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
        <div className="bg-slate-900/70 border border-slate-800/90 p-3.5 rounded-xl transition-all hover:border-slate-700">
          <span className="text-[11px] text-slate-400 block uppercase tracking-wider">Available Cash</span>
          <span className="text-lg font-black text-emerald-400">
            {team.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
          </span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/90 p-3.5 rounded-xl transition-all hover:border-slate-700">
          <span className="text-[11px] text-slate-400 block uppercase tracking-wider">Holdings Value</span>
          <span className="text-lg font-black text-cyan-400">
            {stock_portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
          </span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/90 p-3.5 rounded-xl col-span-2 sm:col-span-1 transition-all hover:border-slate-700">
          <span className="text-[11px] text-slate-400 block uppercase tracking-wider">Initial Capital</span>
          <span className="text-lg font-black text-slate-300">
            {team.initial_balance.toLocaleString()} IC
          </span>
        </div>
      </div>

      {/* Active Stock Holdings Table */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Active Holdings Portfolio ({holdings.length})</span>
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">Click ticker to load into Order Terminal</span>
        </div>

        {holdings.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 font-mono">
            No stock holdings currently held. Select a company on the left to deploy capital.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/30">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Asset</th>
                  <th className="py-2.5 px-3 font-semibold">Shares</th>
                  <th className="py-2.5 px-3 font-semibold">Avg Buy</th>
                  <th className="py-2.5 px-3 font-semibold">Current</th>
                  <th className="py-2.5 px-3 font-semibold">Market Val</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {holdings.map((h) => {
                  const isHProfitable = h.unrealized_pl >= 0;
                  return (
                    <tr
                      key={h.id}
                      onClick={() => onSelectStock(h.symbol)}
                      className="hover:bg-cyan-950/20 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-bold text-white group-hover:text-cyan-400 transition-colors">
                        <span>{h.symbol}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{h.shares}</td>
                      <td className="py-2.5 px-3 text-slate-400">{h.avg_buy_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-200">{h.current_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-200 font-bold">{h.market_value.toFixed(2)}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isHProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isHProfitable ? '+' : ''}{h.unrealized_pl.toFixed(2)} ({h.unrealized_pl_pct.toFixed(1)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade Execution History */}
      {trades && trades.length > 0 && (
        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
            <div className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold uppercase tracking-wider text-slate-300">Recent Executions</span>
            </div>
            <span className="text-[10px] text-slate-500">Last {Math.min(trades.length, 5)} trades</span>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {trades.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-900 px-3 py-2 rounded-xl border border-slate-800/80 text-xs font-mono transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                      t.type === 'BUY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {t.type}
                  </span>
                  <span className="text-slate-200 font-bold">{t.shares} {t.symbol}</span>
                  <span className="text-slate-500 text-[11px]">@ {t.price_per_share.toFixed(2)} IC</span>
                </div>
                <div className="text-slate-300 font-bold">
                  {t.total_ic.toFixed(2)} IC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
