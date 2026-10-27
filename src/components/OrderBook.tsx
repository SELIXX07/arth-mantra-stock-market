import React, { useEffect, useState } from 'react';
import { OrderBook as OrderBookType } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface OrderBookProps {
  stockId: string;
  symbol: string;
  onPriceSelect?: (price: number) => void;
}

export const OrderBook: React.FC<OrderBookProps> = ({ stockId, symbol, onPriceSelect }) => {
  const [orderBook, setOrderBook] = useState<OrderBookType | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    api.getOrderBook(stockId).then((data) => {
      if (isMounted && data && !data.error) {
        setOrderBook(data);
      }
    });

    const socket = getSocket();

    const handleOrderBookUpdate = (data: OrderBookType) => {
      if (data && data.stockId === stockId) {
        setOrderBook(data);
      }
    };

    socket.on('orderbook:updated', handleOrderBookUpdate);

    // Also poll every 3 seconds as fallback
    const interval = setInterval(() => {
      api.getOrderBook(stockId).then((data) => {
        if (isMounted && data && !data.error) {
          setOrderBook(data);
        }
      });
    }, 3000);

    return () => {
      isMounted = false;
      socket.off('orderbook:updated', handleOrderBookUpdate);
      clearInterval(interval);
    };
  }, [stockId]);

  if (!orderBook) {
    return (
      <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-500 animate-pulse">
        Loading Level 2 Market Depth...
      </div>
    );
  }

  const maxTotal = Math.max(
    orderBook.asks[orderBook.asks.length - 1]?.total || 1,
    orderBook.bids[orderBook.bids.length - 1]?.total || 1
  );

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col font-mono text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-white tracking-wide uppercase text-[11px]">
            Level 2 Market Depth
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[10px]">
          <span className="text-slate-400">Spread:</span>
          <span className="font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
            {orderBook.spread.toFixed(2)} IC ({orderBook.spreadPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Table Columns Header */}
      <div className="grid grid-cols-3 text-[10px] text-slate-400 font-semibold pb-1.5 px-1 border-b border-slate-800/60">
        <span>PRICE (IC)</span>
        <span className="text-right">SIZE</span>
        <span className="text-right">TOTAL</span>
      </div>

      {/* Asks (Sell Orders - Red ladder displayed descending so lowest Ask is at bottom) */}
      <div className="space-y-0.5 py-1">
        {[...orderBook.asks].reverse().map((ask) => {
          const depthPct = Math.min(100, (ask.total / maxTotal) * 100);
          return (
            <div
              key={`ask-${ask.level}`}
              onClick={() => onPriceSelect && onPriceSelect(ask.price)}
              className="relative grid grid-cols-3 py-1 px-1 rounded hover:bg-rose-950/30 cursor-pointer transition-colors text-[11px]"
              title={`Click to set Limit Target to ${ask.price.toFixed(2)} IC`}
            >
              {/* Depth Bar Background */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-rose-500/15 pointer-events-none rounded-r"
                style={{ width: `${depthPct}%` }}
              />
              <span className="text-rose-400 font-bold relative z-10 flex items-center space-x-1">
                <span>{ask.price.toFixed(2)}</span>
              </span>
              <span className="text-right text-slate-300 relative z-10">{ask.shares}</span>
              <span className="text-right text-slate-400 relative z-10">{ask.total}</span>
            </div>
          );
        })}
      </div>

      {/* Mid Market Price Divider */}
      <div className="my-1.5 py-1 px-2.5 bg-slate-900/90 rounded border border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">Mid-Price:</span>
          <span className="font-bold text-white text-sm">
            {orderBook.currentPrice.toFixed(2)} IC
          </span>
        </div>
        <div className="flex items-center space-x-1 text-[10px] text-slate-400">
          <span>Bid: <strong className="text-emerald-400">{orderBook.bestBid.toFixed(2)}</strong></span>
          <span>•</span>
          <span>Ask: <strong className="text-rose-400">{orderBook.bestAsk.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Bids (Buy Orders - Green ladder displayed descending from highest Bid) */}
      <div className="space-y-0.5 py-1">
        {orderBook.bids.map((bid) => {
          const depthPct = Math.min(100, (bid.total / maxTotal) * 100);
          return (
            <div
              key={`bid-${bid.level}`}
              onClick={() => onPriceSelect && onPriceSelect(bid.price)}
              className="relative grid grid-cols-3 py-1 px-1 rounded hover:bg-emerald-950/30 cursor-pointer transition-colors text-[11px]"
              title={`Click to set Limit Target to ${bid.price.toFixed(2)} IC`}
            >
              {/* Depth Bar Background */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-emerald-500/15 pointer-events-none rounded-r"
                style={{ width: `${depthPct}%` }}
              />
              <span className="text-emerald-400 font-bold relative z-10 flex items-center space-x-1">
                <span>{bid.price.toFixed(2)}</span>
              </span>
              <span className="text-right text-slate-300 relative z-10">{bid.shares}</span>
              <span className="text-right text-slate-400 relative z-10">{bid.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
