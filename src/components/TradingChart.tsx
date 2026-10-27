import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData } from 'lightweight-charts';
import { Candle, Stock } from '../types';
import { api } from '../services/api';
import { TrendingUp, BarChart2, Eye, EyeOff } from 'lucide-react';

interface TradingChartProps {
  stock: Stock;
  latestCandle?: Candle | null;
}

export const TradingChart: React.FC<TradingChartProps> = ({ stock, latestCandle }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [showSma, setShowSma] = useState<boolean>(true);
  const [latestVwap, setLatestVwap] = useState<number | null>(null);

  const [hoverData, setHoverData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: string;
  } | null>(null);

  // Dynamic Bid/Ask Spread calculation for Bloomberg header
  const halfSpread = Math.max(0.05, Math.round(stock.price * stock.volatility * 0.20 * 100) / 100);
  const bestBid = Math.max(0.5, Math.round((stock.price - halfSpread) * 100) / 100);
  const bestAsk = Math.round((stock.price + halfSpread) * 100) / 100;
  const spread = Math.round((bestAsk - bestBid) * 100) / 100;

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

    // 1. Candlestick Series (Neon Green & Vivid Red)
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

    // 2. Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#38BDF8',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay on the same scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 3. Technical Indicator: VWAP (Volume-Weighted Average Price) - Gold Line
    const vwapSeries = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 2,
      lineStyle: 0, // Solid line
      title: 'VWAP',
      priceLineVisible: false,
      visible: showVwap,
    });
    vwapSeriesRef.current = vwapSeries;

    // 4. Technical Indicator: SMA 20 (20-Period Simple Moving Average) - Cyan Line
    const smaSeries = chart.addLineSeries({
      color: '#06B6D4',
      lineWidth: 2,
      lineStyle: 2, // Dashed line
      title: 'SMA 20',
      priceLineVisible: false,
      visible: showSma,
    });
    smaSeriesRef.current = smaSeries;

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

    // Fetch historical candles and compute indicators
    api.getCandles(stock.id).then((res) => {
      if (res.candles && res.candles.length > 0) {
        const candles = res.candles;

        const formattedCandles: CandlestickData[] = candles.map((c: any) => ({
          time: c.timestamp as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const formattedVolumes: HistogramData[] = candles.map((c: any) => ({
          time: c.timestamp as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        }));

        // Calculate VWAP
        let cumVolume = 0;
        let cumTypicalVolume = 0;
        const vwapData: LineData[] = [];

        candles.forEach((c: any) => {
          const typicalPrice = (c.high + c.low + c.close) / 3;
          cumVolume += c.volume;
          cumTypicalVolume += typicalPrice * c.volume;
          const vwap = cumVolume > 0 ? cumTypicalVolume / cumVolume : c.close;
          vwapData.push({
            time: c.timestamp as any,
            value: Math.round(vwap * 100) / 100,
          });
        });

        if (vwapData.length > 0) {
          setLatestVwap(vwapData[vwapData.length - 1].value);
        }

        // Calculate SMA 20
        const smaData: LineData[] = [];
        const period = 20;
        for (let i = 0; i < candles.length; i++) {
          if (i >= period - 1) {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
              sum += candles[j].close;
            }
            smaData.push({
              time: candles[i].timestamp as any,
              value: Math.round((sum / period) * 100) / 100,
            });
          }
        }

        candleSeries.setData(formattedCandles);
        volumeSeries.setData(formattedVolumes);
        vwapSeries.setData(vwapData);
        smaSeries.setData(smaData);
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

  // Update Indicator Visibility on toggle
  useEffect(() => {
    if (vwapSeriesRef.current) {
      vwapSeriesRef.current.applyOptions({ visible: showVwap });
    }
  }, [showVwap]);

  useEffect(() => {
    if (smaSeriesRef.current) {
      smaSeriesRef.current.applyOptions({ visible: showSma });
    }
  }, [showSma]);

  // Real-time tick update into the candlestick & indicators
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

    // Update VWAP with latest candle
    if (vwapSeriesRef.current && latestVwap) {
      const typical = (latestCandle.high + latestCandle.low + latestCandle.close) / 3;
      const updatedVwap = Math.round(((latestVwap * 0.95) + (typical * 0.05)) * 100) / 100;
      vwapSeriesRef.current.update({
        time: latestCandle.timestamp as any,
        value: updatedVwap,
      });
      setLatestVwap(updatedVwap);
    }
  }, [latestCandle]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0B0F19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Bloomberg Terminal HUD Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md gap-2 font-mono">
        {/* Left: Ticker & Sector + Bid/Ask/Spread */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-black tracking-wider text-white">
              {stock.symbol}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-semibold uppercase">
              {stock.sector}
            </span>
          </div>

          {/* Bid / Ask / Spread HUD Pill */}
          <div className="hidden md:flex items-center space-x-2 text-xs bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span>Bid: <strong className="text-emerald-400">{bestBid.toFixed(2)}</strong></span>
            <span className="text-slate-600">|</span>
            <span>Ask: <strong className="text-rose-400">{bestAsk.toFixed(2)}</strong></span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-medium">Spr: {spread.toFixed(2)}</span>
          </div>
        </div>

        {/* Right: Technical Indicator Toggles + Live Price/OHLC */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Indicator Toggles */}
          <div className="flex items-center space-x-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 text-[11px]">
            <button
              onClick={() => setShowVwap(!showVwap)}
              className={`px-2 py-0.5 rounded font-bold transition-colors ${
                showVwap ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Volume-Weighted Average Price"
            >
              VWAP
            </button>
            <button
              onClick={() => setShowSma(!showSma)}
              className={`px-2 py-0.5 rounded font-bold transition-colors ${
                showSma ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="20-period Simple Moving Average"
            >
              SMA 20
            </button>
          </div>

          {/* OHLC Bar or Live Price */}
          {hoverData ? (
            <div className="hidden lg:flex items-center space-x-2 text-[11px]">
              <span className="text-slate-400">O: <strong className="text-slate-200">{hoverData.open.toFixed(2)}</strong></span>
              <span className="text-slate-400">H: <strong className="text-emerald-400">{hoverData.high.toFixed(2)}</strong></span>
              <span className="text-slate-400">L: <strong className="text-rose-400">{hoverData.low.toFixed(2)}</strong></span>
              <span className="text-slate-400">C: <strong className={hoverData.close >= hoverData.open ? 'text-emerald-400' : 'text-rose-400'}>{hoverData.close.toFixed(2)}</strong></span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold text-white">
                {stock.price.toFixed(2)} IC
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                  stock.change_pct >= 0
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
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
