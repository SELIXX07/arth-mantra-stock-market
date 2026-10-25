import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { Candle, Stock } from '../types';
import { api } from '../services/api';

interface TradingChartProps {
  stock: Stock;
  latestCandle?: Candle | null;
}

export const TradingChart: React.FC<TradingChartProps> = ({ stock, latestCandle }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [hoverData, setHoverData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: string;
  } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create TradingView Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0B0F19' },
        textColor: '#94A3B8',
        fontSize: 12,
        fontFamily: 'Inter, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: '#38BDF8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0369A1',
        },
        horzLine: {
          color: '#38BDF8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0369A1',
        },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: true,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25, // Leaves room for volume histogram
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
    });

    chartRef.current = chart;

    // Candlestick Series (Neon Green & Vivid Red)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: true,
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candleSeries;

    // Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#38BDF8',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay on the same scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Crosshair tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(candleSeries)) {
        setHoverData(null);
        return;
      }

      const data = param.seriesData.get(candleSeries) as any;
      const volData = param.seriesData.get(volumeSeries) as any;

      if (data) {
        const timeStr = typeof param.time === 'number'
          ? new Date(param.time * 1000).toLocaleTimeString()
          : '';

        setHoverData({
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: volData ? volData.value : 0,
          time: timeStr,
        });
      }
    });

    // Fetch historical candles
    api.getCandles(stock.id).then((res) => {
      if (res.candles && res.candles.length > 0) {
        const formattedCandles: CandlestickData[] = res.candles.map((c: any) => ({
          time: c.timestamp as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const formattedVolumes: HistogramData[] = res.candles.map((c: any) => ({
          time: c.timestamp as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        }));

        candleSeries.setData(formattedCandles);
        volumeSeries.setData(formattedVolumes);
        chart.timeScale().fitContent();
      }
    });

    // Handle Window Resizing
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [stock.id]);

  // Real-time tick update into the candlestick
  useEffect(() => {
    if (!latestCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    candleSeriesRef.current.update({
      time: latestCandle.timestamp as any,
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: latestCandle.close,
    });

    volumeSeriesRef.current.update({
      time: latestCandle.timestamp as any,
      value: latestCandle.volume,
      color: latestCandle.close >= latestCandle.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    });
  }, [latestCandle]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0B0F19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Chart Top Header & HUD */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold font-mono tracking-wider text-white">
              {stock.symbol}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-medium">
              {stock.sector}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs font-mono text-slate-400">
            <span>Float: <strong className="text-slate-200">{stock.available_float}</strong> / {stock.total_float}</span>
          </div>
        </div>

        {/* OHLC Bar (Bloomberg / Binance style) */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          {hoverData ? (
            <>
              <span className="text-slate-400">O: <strong className="text-slate-200">{hoverData.open.toFixed(2)}</strong></span>
              <span className="text-slate-400">H: <strong className="text-emerald-400">{hoverData.high.toFixed(2)}</strong></span>
              <span className="text-slate-400">L: <strong className="text-rose-400">{hoverData.low.toFixed(2)}</strong></span>
              <span className="text-slate-400">C: <strong className={hoverData.close >= hoverData.open ? 'text-emerald-400' : 'text-rose-400'}>{hoverData.close.toFixed(2)}</strong></span>
              <span className="hidden md:inline text-slate-400">Vol: <strong className="text-sky-400">{hoverData.volume}</strong></span>
            </>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Price:</span>
              <span className="text-base font-bold text-white font-mono">
                {stock.price.toFixed(2)} IC
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${stock.change_pct >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div ref={chartContainerRef} className="flex-1 w-full min-h-[380px] relative" />
    </div>
  );
};
