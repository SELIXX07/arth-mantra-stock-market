import React from 'react';
import { Portfolio, Stock } from '../types';
import { Wallet, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';

interface PortfolioCardProps {
  portfolio: Portfolio | null;
  onSelectStock: (symbol: string) => void;
}

export const PortfolioCard: React.FC<PortfolioCardProps> = ({ portfolio, onSelectStock }) => {
  if (!portfolio) {
    return (
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-6 text-center text-slate-400">
        Loading portfolio data...
      </div>
    );
  }

  const { team, holdings, stock_portfolio_value, total_net_worth, total_profit_loss, total_return_pct, trades } = portfolio;
  const isProfitable = total_profit_loss >= 0;

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-5">
      {/* Top Banner: Team Identity & Total Net Worth */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-white tracking-wide uppercase">
              {team.team_name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
              {team.team_code}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Leader: <strong className="text-slate-200">{team.leader_name}</strong></span>
          </p>
        </div>

        {/* Big Net Worth Card */}
        <div className="text-left sm:text-right">
          <span className="text-xs font-mono text-slate-400 block uppercase">Total Net Worth</span>
          <div className="flex items-center sm:justify-end space-x-2">
            <span className="text-2xl font-bold font-mono text-white">
              {total_net_worth.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-bold font-mono flex items-center space-x-1 ${
                isProfitable
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}
            >
              {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{isProfitable ? '+' : ''}{total_profit_loss.toFixed(2)} IC ({total_return_pct.toFixed(2)}%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Balance Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg">
          <span className="text-xs text-slate-400 block">Available Cash</span>
          <span className="text-lg font-bold text-emerald-400">
            {team.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg">
          <span className="text-xs text-slate-400 block">Holdings Value</span>
          <span className="text-lg font-bold text-cyan-400">
            {stock_portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-400 block">Initial Allocation</span>
          <span className="text-lg font-bold text-slate-300">
            {team.initial_balance.toLocaleString()} IC
          </span>
        </div>
      </div>

      {/* Active Stock Holdings Table */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Active Holdings Portfolio ({holdings.length})
          </h3>
        </div>

        {holdings.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-lg p-5 text-center text-xs text-slate-400">
            No stock holdings yet. Use the Order Terminal to invest your starting capital.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Asset</th>
                  <th className="pb-2 font-medium">Shares</th>
                  <th className="pb-2 font-medium">Avg Buy</th>
                  <th className="pb-2 font-medium">Current</th>
                  <th className="pb-2 font-medium">Market Val</th>
                  <th className="pb-2 font-medium text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {holdings.map((h) => {
                  const isHProfitable = h.unrealized_pl >= 0;
                  return (
                    <tr
                      key={h.id}
                      onClick={() => onSelectStock(h.symbol)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 font-bold text-white">
                        <span className="hover:text-cyan-400">{h.symbol}</span>
                      </td>
                      <td className="py-2.5 text-slate-200">{h.shares}</td>
                      <td className="py-2.5 text-slate-400">{h.avg_buy_price.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-200">{h.current_price.toFixed(2)}</td>
                      <td className="py-2.5 text-slate-200">{h.market_value.toFixed(2)}</td>
                      <td className={`py-2.5 text-right font-semibold ${isHProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
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
        <div className="pt-3 border-t border-slate-800">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-2">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider">Recent Executions</span>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {trades.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800/80 text-xs font-mono"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      t.type === 'BUY' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                    }`}
                  >
                    {t.type}
                  </span>
                  <span className="text-slate-200 font-bold">{t.shares} {t.symbol}</span>
                  <span className="text-slate-500 text-[11px]">@ {t.price_per_share.toFixed(2)} IC</span>
                </div>
                <div className="text-slate-300">
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
