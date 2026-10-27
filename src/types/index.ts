export interface Stock {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  total_float: number;
  available_float: number;
  price: number;
  prev_close: number;
  change_pct: number;
  day_high: number;
  day_low: number;
  volatility: number;
  description: string;
  ps_metrics: Record<string, string>;
  is_active: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Holding {
  id: number;
  stock_id: string;
  symbol: string;
  name: string;
  sector: string;
  shares: number;
  avg_buy_price: number;
  position_type?: 'LONG' | 'SHORT';
  collateral_ic?: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
}

export interface Trade {
  id: string;
  team_id: string;
  stock_id: string;
  symbol: string;
  name: string;
  type: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
  shares: number;
  price_per_share: number;
  total_ic: number;
  timestamp: number;
}

export interface OrderBookLevel {
  level: number;
  price: number;
  shares: number;
  total: number;
}

export interface OrderBook {
  stockId: string;
  symbol: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface RestingOrder {
  id: string;
  team_id: string;
  stock_id: string;
  symbol?: string;
  stock_name?: string;
  side: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
  order_type: 'LIMIT' | 'STOP_LOSS';
  target_price: number;
  shares: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  created_at: number;
  filled_at?: number;
}

export interface Portfolio {
  team: {
    id: string;
    team_code: string;
    team_name: string;
    leader_name: string;
    leader_email: string;
    cash_balance: number;
    initial_balance: number;
    is_leader_active: number;
  };
  holdings: Holding[];
  stock_portfolio_value: number;
  total_net_worth: number;
  total_profit_loss: number;
  total_return_pct: number;
  trades: Trade[];
}

export interface LeaderboardEntry {
  id: string;
  team_code: string;
  team_name: string;
  leader_name: string;
  cash_balance: number;
  stock_value: number;
  net_worth: number;
  profit_loss: number;
  return_pct: number;
  trades_count: number;
  is_online: boolean;
  rank: number;
}

export interface MarketState {
  id: number;
  status: 'OPEN' | 'PAUSED' | 'CLOSED';
  round_name: string;
  round_duration_secs: number;
  remaining_secs: number;
  credentials_released?: number | boolean;
  scheduled_open_at?: number | null;
  scheduled_close_at?: number | null;
  base_ic?: number;
  test_session_active?: number | boolean;
}

export interface NewsItem {
  id: string;
  headline: string;
  content: string;
  affected_symbols: string;
  price_impact_pct: number;
  timestamp: number;
}

export interface MarketAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'success' | 'critical';
  timestamp: number;
}
