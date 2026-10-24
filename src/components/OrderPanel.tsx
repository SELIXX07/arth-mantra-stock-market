import React, { useState } from 'react';
import { Stock, Portfolio } from '../types';
import { api } from '../services/api';
import { ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import confetti from 'canvas-confetti';

interface OrderPanelProps {
  stock: Stock;
  portfolio: Portfolio | null;
  marketStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  onOrderSuccess: (updatedPortfolio: Portfolio) => void;
}

export const OrderPanel: React.FC<OrderPanelProps> = ({
  stock,
  portfolio,
  marketStatus,
  onOrderSuccess,
}) => {
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [shares, setShares] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const cashBalance = portfolio?.team?.cash_balance ?? 0;
  const holding = portfolio?.holdings?.find((h) => h.stock_id === stock.id);
  const ownedShares = holding?.shares ?? 0;

  // Maximum shares allowed
  const maxBuyShares = Math.min(
    stock.available_float,
    Math.floor(cashBalance / Math.max(1, stock.price))
  );
  const maxSellShares = ownedShares;
  const currentMax = orderType === 'BUY' ? maxBuyShares : maxSellShares;

  const totalIC = Math.round((shares * stock.price) * 100) / 100;

  const handlePercentageSelect = (pct: number) => {
    const qty = Math.floor(currentMax * pct);
    setShares(Math.max(1, qty));
    setErrorMsg(null);
  };

  const handleExecuteTrade = async () => {
    if (!portfolio?.team?.id) {
      setErrorMsg('No active team session found.');
      return;
    }

    if (marketStatus !== 'OPEN') {
      setErrorMsg(`Market is ${marketStatus}. Trading halted.`);
      return;
    }

    if (shares <= 0) {
      setErrorMsg('Quantity must be at least 1 share.');
      return;
    }

    if (orderType === 'BUY' && totalIC > cashBalance) {
      setErrorMsg(`Insufficient IC. Need ${totalIC.toFixed(2)} IC but have ${cashBalance.toFixed(2)} IC.`);
      return;
    }

    if (orderType === 'BUY' && shares > stock.available_float) {
      setErrorMsg(`Only ${stock.available_float} shares available in float.`);
      return;
    }

    if (orderType === 'SELL' && shares > ownedShares) {
      setErrorMsg(`You only own ${ownedShares} shares.`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.executeOrder(portfolio.team.id, stock.id, orderType, shares);
      if (res.success) {
        setSuccessMsg(
          `Successfully ${orderType === 'BUY' ? 'bought' : 'sold'} ${shares} shares of ${stock.symbol} for ${totalIC.toFixed(2)} IC!`
        );
        onOrderSuccess(res.portfolio);

        if (orderType === 'BUY') {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.8 },
            colors: ['#10B981', '#00F2FE', '#3B82F6']
          });
        }
      } else {
        setErrorMsg(res.error || 'Trade execution failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during execution.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl flex flex-col justify-between">
      <div>
        {/* Header: Market Status Banner */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-white tracking-wide uppercase">
              Order Terminal
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              LEADER ONLY
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                marketStatus === 'OPEN'
                  ? 'bg-emerald-500 animate-pulse'
                  : marketStatus === 'PAUSED'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={`text-xs font-bold font-mono ${
                marketStatus === 'OPEN'
                  ? 'text-emerald-400'
                  : marketStatus === 'PAUSED'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {marketStatus}
            </span>
          </div>
        </div>

        {/* Buy / Sell Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setOrderType('BUY');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-md font-bold text-sm tracking-wide transition-all flex items-center justify-center space-x-1 ${
              orderType === 'BUY'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>BUY / LONG</span>
          </button>

          <button
            onClick={() => {
              setOrderType('SELL');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-md font-bold text-sm tracking-wide transition-all flex items-center justify-center space-x-1 ${
              orderType === 'SELL'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            <span>SELL / CLOSE</span>
          </button>
        </div>

        {/* Position Context Information */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 mb-4 text-xs font-mono space-y-1.5">
          <div className="flex justify-between text-slate-400">
            <span>Available Cash:</span>
            <strong className="text-emerald-400 font-semibold">{cashBalance.toLocaleString()} IC</strong>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>You Currently Own:</span>
            <strong className="text-white font-semibold">{ownedShares} shares</strong>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Float In Market:</span>
            <strong className="text-cyan-400">{stock.available_float} / {stock.total_float} shares</strong>
          </div>
        </div>

        {/* Share Quantity Input & Slider */}
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center text-xs">
            <label className="font-medium text-slate-300">Share Quantity</label>
            <span className="text-slate-400 font-mono">Max: {currentMax}</span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="1"
              max={currentMax || 1}
              value={shares}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 0;
                setShares(val);
                setErrorMsg(null);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3 text-white font-mono text-base focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono pointer-events-none">
              SHARES
            </span>
          </div>

          {/* Quick Percentage Presets */}
          <div className="grid grid-cols-4 gap-1.5">
            {[0.25, 0.5, 0.75, 1.0].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handlePercentageSelect(pct)}
                className="py-1 px-2 text-xs font-mono font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                {pct * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Trade Value Calculation Breakdown */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 mb-4 space-y-2 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Execution Price:</span>
            <span className="text-slate-200">{stock.price.toFixed(2)} IC</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Estimated Price Impact:</span>
            <span className={orderType === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
              {orderType === 'BUY' ? '+' : '-'}{Math.min(15, (shares / Math.max(1, stock.total_float)) * 25).toFixed(2)}%
            </span>
          </div>
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-semibold">
            <span className="text-slate-300">{orderType === 'BUY' ? 'Total Cost:' : 'Total Proceeds:'}</span>
            <span className={`text-base font-bold ${orderType === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalIC.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
            </span>
          </div>
        </div>

        {/* Notifications / Errors */}
        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Execution Button */}
      <button
        onClick={handleExecuteTrade}
        disabled={loading || marketStatus !== 'OPEN' || currentMax === 0}
        className={`w-full py-3.5 rounded-lg font-bold font-mono text-sm tracking-wider uppercase transition-all shadow-lg flex items-center justify-center space-x-2 ${
          marketStatus !== 'OPEN'
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            : orderType === 'BUY'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/50 active:scale-[0.99]'
            : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-900/50 active:scale-[0.99]'
        }`}
      >
        {loading ? (
          <span className="animate-pulse">PROCESSING ORDER...</span>
        ) : marketStatus !== 'OPEN' ? (
          <>
            <ShieldAlert className="w-4 h-4" />
            <span>TRADING HALTED ({marketStatus})</span>
          </>
        ) : (
          <span>CONFIRM {orderType} {shares} {stock.symbol}</span>
        )}
      </button>
    </div>
  );
};
