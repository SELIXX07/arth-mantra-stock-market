import React, { useState, useEffect } from 'react';
import { Stock, Portfolio } from '../types';
import { api } from '../services/api';
import { ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2, ShieldAlert, Sliders, Target, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

interface OrderPanelProps {
  stock: Stock;
  portfolio: Portfolio | null;
  marketStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  selectedTargetPrice?: number | null;
  onOrderSuccess: (updatedPortfolio: Portfolio) => void;
  onRefreshOrders?: () => void;
}

export const OrderPanel: React.FC<OrderPanelProps> = ({
  stock,
  portfolio,
  marketStatus,
  selectedTargetPrice,
  onOrderSuccess,
  onRefreshOrders,
}) => {
  const [orderMode, setOrderMode] = useState<'MARKET' | 'LIMIT' | 'STOP_LOSS'>('MARKET');
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [shares, setShares] = useState<number>(10);
  const [targetPrice, setTargetPrice] = useState<number>(stock.price);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync external price click from Order Book
  useEffect(() => {
    if (selectedTargetPrice && selectedTargetPrice > 0) {
      setTargetPrice(selectedTargetPrice);
      if (orderMode === 'MARKET') {
        setOrderMode('LIMIT');
      }
    }
  }, [selectedTargetPrice]);

  useEffect(() => {
    if (orderMode === 'MARKET') {
      setTargetPrice(stock.price);
    }
  }, [stock.price, orderMode]);

  const cashBalance = portfolio?.team?.cash_balance ?? 0;
  const holding = portfolio?.holdings?.find((h) => h.stock_id === stock.id);
  const positionType = holding?.position_type || 'LONG';
  const ownedShares = holding?.shares ?? 0;

  // Half-spread estimation for display
  const halfSpread = Math.max(0.05, Math.round(stock.price * stock.volatility * 0.20 * 100) / 100);
  const isBuyingSide = side === 'BUY' || side === 'COVER';
  const estimatedExecutionPrice = isBuyingSide
    ? Math.round((stock.price + halfSpread) * 100) / 100
    : Math.max(0.5, Math.round((stock.price - halfSpread) * 100) / 100);

  const effectivePrice = orderMode === 'MARKET' ? estimatedExecutionPrice : (targetPrice || stock.price);
  const totalIC = Math.round((shares * effectivePrice) * 100) / 100;

  // Maximum shares allowed based on side & balance
  let currentMax = 0;
  if (side === 'BUY') {
    currentMax = Math.min(
      stock.available_float,
      Math.floor(cashBalance / Math.max(1, effectivePrice))
    );
  } else if (side === 'SELL') {
    currentMax = positionType === 'LONG' ? ownedShares : 0;
  } else if (side === 'SHORT') {
    currentMax = Math.min(
      stock.available_float,
      Math.floor(cashBalance / Math.max(1, effectivePrice))
    );
  } else if (side === 'COVER') {
    currentMax = positionType === 'SHORT' ? ownedShares : 0;
  }

  const handlePercentageSelect = (pct: number) => {
    const qty = Math.floor(currentMax * pct);
    setShares(Math.max(1, qty));
    setErrorMsg(null);
  };

  const handleExecute = async () => {
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

    if (side === 'BUY') {
      if (holding && positionType === 'SHORT') {
        setErrorMsg("You have an active SHORT position. Use 'COVER' to buy back borrowed shares.");
        return;
      }
      if (totalIC > cashBalance) {
        setErrorMsg(`Insufficient IC. Need ${totalIC.toFixed(2)} IC but have ${cashBalance.toFixed(2)} IC.`);
        return;
      }
      if (shares > stock.available_float) {
        setErrorMsg(`Only ${stock.available_float} shares available in float.`);
        return;
      }
    } else if (side === 'SELL') {
      if (!holding || positionType !== 'LONG' || shares > ownedShares) {
        setErrorMsg(`Insufficient long shares. You currently own ${positionType === 'LONG' ? ownedShares : 0} shares.`);
        return;
      }
    } else if (side === 'SHORT') {
      if (holding && positionType === 'LONG') {
        setErrorMsg('You have an active LONG position. Please SELL your long shares before shorting.');
        return;
      }
      if (totalIC > cashBalance) {
        setErrorMsg(`Insufficient cash for 100% margin collateral. Required: ${totalIC.toFixed(2)} IC, Cash: ${cashBalance.toFixed(2)} IC.`);
        return;
      }
      if (shares > stock.available_float) {
        setErrorMsg(`Only ${stock.available_float} shares available in float to borrow.`);
        return;
      }
    } else if (side === 'COVER') {
      if (!holding || positionType !== 'SHORT' || shares > ownedShares) {
        setErrorMsg(`No active SHORT position to cover. You currently short ${positionType === 'SHORT' ? ownedShares : 0} shares.`);
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (orderMode === 'MARKET') {
        // Immediate Market Order
        const res = await api.executeOrder(portfolio.team.id, stock.id, side, shares);
        if (res.success) {
          setSuccessMsg(
            `Successfully executed ${side} ${shares} shares of ${stock.symbol} @ ${res.trade.executedPrice.toFixed(2)} IC!`
          );
          onOrderSuccess(res.portfolio);
          if (side === 'BUY' || side === 'COVER') {
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
      } else {
        // Resting Limit or Stop-Loss Order
        const res = await api.placeRestingOrder(
          portfolio.team.id,
          stock.id,
          side,
          orderMode,
          targetPrice,
          shares
        );
        if (res.success) {
          setSuccessMsg(
            `Resting ${orderMode} order placed for ${side} ${shares} ${stock.symbol} @ target ${targetPrice.toFixed(2)} IC!`
          );
          if (onRefreshOrders) onRefreshOrders();
        } else {
          setErrorMsg(res.error || 'Failed to place resting order.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during execution.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between">
      <div>
        {/* Header: Market Status Banner & Leader Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-white tracking-wide uppercase font-mono">
              Advanced Order Terminal
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              LEVEL 2 ENGINE
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

        {/* 1. Order Type Mode: MARKET / LIMIT / STOP-LOSS */}
        <div className="grid grid-cols-3 gap-1.5 mb-3 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setOrderMode('MARKET');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded-md font-bold transition-all ${
              orderMode === 'MARKET'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MARKET
          </button>
          <button
            type="button"
            onClick={() => {
              setOrderMode('LIMIT');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded-md font-bold transition-all ${
              orderMode === 'LIMIT'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            LIMIT
          </button>
          <button
            type="button"
            onClick={() => {
              setOrderMode('STOP_LOSS');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded-md font-bold transition-all ${
              orderMode === 'STOP_LOSS'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            STOP-LOSS
          </button>
        </div>

        {/* 2. Order Side: BUY (Long), SELL (Close), SHORT (Margin), COVER (Buyback) */}
        <div className="grid grid-cols-4 gap-1 mb-4 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-[11px] font-mono font-bold">
          <button
            type="button"
            onClick={() => {
              setSide('BUY');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded transition-all text-center ${
              side === 'BUY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('SELL');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded transition-all text-center ${
              side === 'SELL'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SELL
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('SHORT');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded transition-all text-center ${
              side === 'SHORT'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SHORT
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('COVER');
              setErrorMsg(null);
            }}
            className={`py-1.5 rounded transition-all text-center ${
              side === 'COVER'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            COVER
          </button>
        </div>

        {/* Position Context Information */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 mb-3 text-xs font-mono space-y-1.5">
          <div className="flex justify-between text-slate-400">
            <span>Available Cash:</span>
            <strong className="text-emerald-400 font-semibold">{cashBalance.toLocaleString()} IC</strong>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Your Position:</span>
            <strong className={positionType === 'SHORT' ? 'text-purple-400' : 'text-cyan-400'}>
              {ownedShares > 0 ? `${ownedShares} shares (${positionType})` : 'None (0 shares)'}
            </strong>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Float In Market:</span>
            <strong className="text-slate-300">{stock.available_float} / {stock.total_float} shares</strong>
          </div>
        </div>

        {/* Limit / Stop-Loss Target Price Input */}
        {orderMode !== 'MARKET' && (
          <div className="space-y-1.5 mb-3">
            <div className="flex justify-between items-center text-xs font-mono">
              <label className="font-semibold text-slate-300 flex items-center space-x-1">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>{orderMode === 'LIMIT' ? 'Target Limit Price' : 'Stop Trigger Price'}</span>
              </label>
              <span className="text-slate-400 text-[10px]">Current: {stock.price.toFixed(2)} IC</span>
            </div>

            <div className="relative">
              <input
                type="number"
                step="0.05"
                min="0.5"
                value={targetPrice}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setTargetPrice(val);
                  setErrorMsg(null);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono pointer-events-none">
                IC
              </span>
            </div>
          </div>
        )}

        {/* Share Quantity Input & Percentage Presets */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <label className="font-semibold text-slate-300">Share Quantity</label>
            <span className="text-slate-400">Max: {currentMax}</span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="1"
              max={currentMax || 500}
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

        {/* Value Breakdown & Slippage Estimation */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 mb-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>
              {orderMode === 'MARKET' ? 'Est. Slippage Execution:' : 'Target Price:'}
            </span>
            <span className="text-slate-200 font-semibold">{effectivePrice.toFixed(2)} IC</span>
          </div>

          {orderMode === 'MARKET' && (
            <div className="flex justify-between text-slate-400">
              <span>Spread & Depth Impact:</span>
              <span className={isBuyingSide ? 'text-emerald-400' : 'text-rose-400'}>
                {isBuyingSide ? '+' : '-'}{Math.min(15, (shares / Math.max(1, stock.total_float)) * 25).toFixed(2)}%
              </span>
            </div>
          )}

          {side === 'SHORT' && (
            <div className="flex justify-between text-purple-400">
              <span>100% Margin Collateral:</span>
              <span className="font-semibold">{totalIC.toFixed(2)} IC</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-semibold">
            <span className="text-slate-300">
              {side === 'BUY'
                ? 'Total Cost:'
                : side === 'SHORT'
                ? 'Collateral Locked:'
                : side === 'COVER'
                ? 'Estimated Buyback:'
                : 'Est. Proceeds:'}
            </span>
            <span
              className={`text-base font-bold ${
                side === 'BUY'
                  ? 'text-emerald-400'
                  : side === 'SHORT'
                  ? 'text-purple-400'
                  : side === 'COVER'
                  ? 'text-teal-400'
                  : 'text-rose-400'
              }`}
            >
              {totalIC.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
            </span>
          </div>
        </div>

        {/* Notifications / Errors */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <button
        onClick={handleExecute}
        disabled={loading || marketStatus !== 'OPEN' || currentMax === 0}
        className={`w-full py-3.5 rounded-lg font-bold font-mono text-sm tracking-wider uppercase transition-all shadow-lg flex items-center justify-center space-x-2 ${
          marketStatus !== 'OPEN'
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            : side === 'BUY'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/50 active:scale-[0.99]'
            : side === 'SELL'
            ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-900/50 active:scale-[0.99]'
            : side === 'SHORT'
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/50 active:scale-[0.99]'
            : 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-cyan-900/50 active:scale-[0.99]'
        }`}
      >
        {loading ? (
          <span className="animate-pulse">ROUTING ORDER...</span>
        ) : marketStatus !== 'OPEN' ? (
          <>
            <ShieldAlert className="w-4 h-4" />
            <span>MARKET {marketStatus}</span>
          </>
        ) : (
          <span>
            CONFIRM {orderMode} {side} {shares} {stock.symbol}
          </span>
        )}
      </button>
    </div>
  );
};
