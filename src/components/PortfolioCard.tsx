import React, { useState, useEffect } from 'react';
import { Portfolio, RestingOrder } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { TrendingUp, TrendingDown, Clock, ShieldCheck, Download, Layers, ListOrdered, XCircle } from 'lucide-react';
import { downloadTeamTradingReport } from '../utils/exportTeamReport';

interface PortfolioCardProps {
  portfolio: Portfolio | null;
  onSelectStock: (symbol: string) => void;
}

export const PortfolioCard: React.FC<PortfolioCardProps> = ({ portfolio, onSelectStock }) => {
  const [activeTab, setActiveTab] = useState<'holdings' | 'orders' | 'trades'>('holdings');
  const [orders, setOrders] = useState<RestingOrder[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Load team orders
  const refreshOrders = () => {
    if (portfolio?.team?.id) {
      api.getTeamOrders(portfolio.team.id).then((res) => {
        if (res && res.orders) {
          setOrders(res.orders);
        }
      });
    }
  };

  useEffect(() => {
    refreshOrders();

    const socket = getSocket();
    const handleOrderEvent = () => {
      refreshOrders();
    };

    socket.on('order:placed', handleOrderEvent);
    socket.on('order:filled', handleOrderEvent);
    socket.on('order:cancelled', handleOrderEvent);
    socket.on('order:rejected', handleOrderEvent);

    return () => {
      socket.off('order:placed', handleOrderEvent);
      socket.off('order:filled', handleOrderEvent);
      socket.off('order:cancelled', handleOrderEvent);
      socket.off('order:rejected', handleOrderEvent);
    };
  }, [portfolio?.team?.id]);

  if (!portfolio) {
    return (
      <div className="bg-[#0B0F19]/90 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-400 font-mono animate-pulse">
        Synchronizing real-time portfolio data...
      </div>
    );
  }

  const { team, holdings, stock_portfolio_value, total_net_worth, total_profit_loss, total_return_pct, trades } = portfolio;
  const isProfitable = total_profit_loss >= 0;
  const pendingOrders = orders.filter((o) => o.status === 'PENDING');

  const handleDownload = () => {
    downloadTeamTradingReport(team, holdings, trades);
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      setCancellingId(orderId);
      await api.cancelOrder(team.id, orderId);
      refreshOrders();
    } catch (err) {
      console.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
    }
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
            title="Download full session report (.xlsx)"
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
          <span className="text-[11px] text-slate-400 block uppercase tracking-wider">Holdings Equity</span>
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

      {/* Tabs Header: Active Holdings vs Open Orders vs Trades */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 text-xs font-mono">
        <button
          onClick={() => setActiveTab('holdings')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
            activeTab === 'holdings'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/80 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Active Holdings ({holdings.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('orders');
            refreshOrders();
          }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
            activeTab === 'orders'
              ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>Open Orders ({pendingOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
            activeTab === 'trades'
              ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Trade History</span>
        </button>
      </div>

      {/* Tab 1: Active Holdings Table */}
      {activeTab === 'holdings' && (
        <div>
          {holdings.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 font-mono">
              No stock holdings currently held. Select a ticker above to place an order.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/30">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Asset</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Shares</th>
                    <th className="py-2.5 px-3 font-semibold">Avg Price</th>
                    <th className="py-2.5 px-3 font-semibold">Current</th>
                    <th className="py-2.5 px-3 font-semibold">Equity Val</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {holdings.map((h) => {
                    const isHProfitable = h.unrealized_pl >= 0;
                    const isShort = h.position_type === 'SHORT';
                    return (
                      <tr
                        key={h.id}
                        onClick={() => onSelectStock(h.symbol)}
                        className="hover:bg-cyan-950/20 cursor-pointer transition-colors group"
                        title="Click to select stock"
                      >
                        <td className="py-2.5 px-3 font-bold text-white group-hover:text-cyan-400 transition-colors">
                          <span>{h.symbol}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isShort
                                ? 'bg-purple-950 text-purple-400 border border-purple-800'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {h.position_type || 'LONG'}
                          </span>
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
      )}

      {/* Tab 2: Open Resting Orders (Limit & Stop-Loss) */}
      {activeTab === 'orders' && (
        <div>
          {pendingOrders.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 font-mono">
              No resting Limit or Stop-Loss orders pending. Use the Order Terminal to place a target order.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/30">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Asset</th>
                    <th className="py-2.5 px-3 font-semibold">Side</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Target Price</th>
                    <th className="py-2.5 px-3 font-semibold">Shares</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pendingOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 font-bold text-white">{ord.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ord.side === 'BUY'
                              ? 'text-emerald-400 bg-emerald-950 border border-emerald-800'
                              : ord.side === 'SHORT'
                              ? 'text-purple-400 bg-purple-950 border border-purple-800'
                              : ord.side === 'COVER'
                              ? 'text-teal-400 bg-teal-950 border border-teal-800'
                              : 'text-rose-400 bg-rose-950 border border-rose-800'
                          }`}
                        >
                          {ord.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-semibold">{ord.order_type}</td>
                      <td className="py-2.5 px-3 text-cyan-400 font-bold">{ord.target_price.toFixed(2)} IC</td>
                      <td className="py-2.5 px-3 text-slate-200">{ord.shares}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] bg-amber-950/80 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded animate-pulse">
                          PENDING
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleCancelOrder(ord.id)}
                          disabled={cancellingId === ord.id}
                          className="px-2 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px] font-bold transition-colors inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>{cancellingId === ord.id ? 'Cancelling...' : 'Cancel'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Trade Execution History */}
      {activeTab === 'trades' && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {trades && trades.length > 0 ? (
            trades.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-900 px-3 py-2 rounded-xl border border-slate-800/80 text-xs font-mono transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                      t.type === 'BUY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : t.type === 'SHORT'
                        ? 'bg-purple-950 text-purple-400 border border-purple-800'
                        : t.type === 'COVER'
                        ? 'bg-teal-950 text-teal-400 border border-teal-800'
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
            ))
          ) : (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 font-mono">
              No executions yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
