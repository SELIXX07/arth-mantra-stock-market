import * as XLSX from 'xlsx';
import { api } from '../services/api';

export interface TeamExportData {
  team: {
    id: string;
    team_code: string;
    team_name: string;
    leader_name: string;
    leader_email?: string;
    cash_balance: number;
    initial_balance?: number;
    net_worth?: number;
    stock_value?: number;
    profit_loss?: number;
    return_pct?: number;
    rank?: number;
  };
  holdings?: any[];
  trades?: any[];
}

export async function downloadTeamTradingReport(
  teamInput: any,
  providedHoldings?: any[],
  providedTrades?: any[]
) {
  let holdings = providedHoldings || teamInput.holdings || [];
  let trades = providedTrades || teamInput.trades || [];
  let team = { ...teamInput };

  // If trades or holdings are missing, attempt portfolio fetch
  if (!trades || trades.length === 0 || !holdings || holdings.length === 0) {
    try {
      const portRes = await api.getPortfolio(team.id);
      if (portRes && portRes.team) {
        team = {
          ...team,
          ...portRes.team,
          stock_value: portRes.stock_portfolio_value ?? team.stock_value,
          net_worth: portRes.total_net_worth ?? team.net_worth,
          profit_loss: portRes.total_profit_loss ?? team.profit_loss,
          return_pct: portRes.total_return_pct ?? team.return_pct,
        };
        if (!holdings || holdings.length === 0) holdings = portRes.holdings || [];
        if (!trades || trades.length === 0) trades = portRes.trades || [];
      }
    } catch (_) {}
  }

  // Also query api.getAdminTrades for full trade surveillance records without limit
  try {
    const adminTradesRes = await api.getAdminTrades(team.id);
    if (adminTradesRes && adminTradesRes.trades && adminTradesRes.trades.length > 0) {
      trades = adminTradesRes.trades;
    }
  } catch (_) {}

  const initialBalance = Number(team.initial_balance || 10000);
  const cashBalance = Number(team.cash_balance || 0);
  const stockValue = Number(team.stock_value || 0);
  const netWorth = Number(team.net_worth || (cashBalance + stockValue));
  const profitLoss = Number(team.profit_loss !== undefined ? team.profit_loss : (netWorth - initialBalance));
  const returnPct = Number(
    team.return_pct !== undefined
      ? team.return_pct
      : initialBalance > 0
      ? (profitLoss / initialBalance) * 100
      : 0
  );

  const totalBuyTrades = trades.filter((t: any) => t.type === 'BUY').length;
  const totalSellTrades = trades.filter((t: any) => t.type === 'SELL').length;
  const totalVolumeIC = trades.reduce(
    (sum: number, t: any) => sum + Number(t.total_ic || t.totalIC || 0),
    0
  );

  // ── Sheet 1: Executive Summary & Balances
  const summaryRows = [
    { 'Arth Mantra Trading Audit': 'Parameter / Indicator', 'Details': '' },
    { 'Arth Mantra Trading Audit': 'Team Name', 'Details': team.team_name },
    { 'Arth Mantra Trading Audit': 'Team Code', 'Details': team.team_code },
    { 'Arth Mantra Trading Audit': 'Team Leader', 'Details': team.leader_name },
    { 'Arth Mantra Trading Audit': 'Leader Email', 'Details': team.leader_email || 'N/A' },
    { 'Arth Mantra Trading Audit': 'Simulation Round', 'Details': 'Round 3: Live Asset Valuation & Trading' },
    { 'Arth Mantra Trading Audit': 'Initial Allocated IC', 'Details': `${initialBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC` },
    { 'Arth Mantra Trading Audit': 'Final Liquid Cash Balance', 'Details': `${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC` },
    { 'Arth Mantra Trading Audit': 'Stock Holdings Portfolio Value', 'Details': `${stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC` },
    { 'Arth Mantra Trading Audit': 'Total Final Net Worth', 'Details': `${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC` },
    { 'Arth Mantra Trading Audit': 'Net Realized & Unrealized P&L', 'Details': `${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)} IC` },
    { 'Arth Mantra Trading Audit': 'Return on Capital (ROC %)', 'Details': `${returnPct.toFixed(2)}%` },
    { 'Arth Mantra Trading Audit': 'Total Executed Trades', 'Details': trades.length },
    { 'Arth Mantra Trading Audit': 'Total BUY Executions', 'Details': totalBuyTrades },
    { 'Arth Mantra Trading Audit': 'Total SELL Executions', 'Details': totalSellTrades },
    { 'Arth Mantra Trading Audit': 'Gross Trading Turnover', 'Details': `${totalVolumeIC.toFixed(2)} IC` },
    { 'Arth Mantra Trading Audit': 'Statement Generated At', 'Details': new Date().toLocaleString() }
  ];

  // ── Sheet 2: Current Portfolio Holdings
  const holdingsRows = (holdings && holdings.length > 0)
    ? holdings.map((h: any, idx: number) => ({
        '#': idx + 1,
        'Ticker Symbol': h.symbol,
        'Company Name': h.name || h.symbol,
        'Sector / Track': h.sector || 'Equities',
        'Shares Held': h.shares,
        'Average Buy Price (IC)': Number(h.avg_buy_price || 0).toFixed(2),
        'Closing Price (IC)': Number(h.current_price || h.price || 0).toFixed(2),
        'Cost Basis (IC)': Number(h.cost_basis || (h.shares * h.avg_buy_price) || 0).toFixed(2),
        'Current Market Value (IC)': Number(h.market_value || (h.shares * (h.current_price || h.price)) || 0).toFixed(2),
        'Unrealized P&L (IC)': Number(h.unrealized_pl !== undefined ? h.unrealized_pl : 0).toFixed(2),
        'Unrealized Return (%)': `${Number(h.unrealized_pl_pct !== undefined ? h.unrealized_pl_pct : 0).toFixed(2)}%`
      }))
    : [{
        '#': '1',
        'Ticker Symbol': 'NO_HOLDINGS',
        'Company Name': 'No equities currently held in portfolio',
        'Sector / Track': 'N/A',
        'Shares Held': 0,
        'Average Buy Price (IC)': '0.00',
        'Closing Price (IC)': '0.00',
        'Cost Basis (IC)': '0.00',
        'Current Market Value (IC)': '0.00',
        'Unrealized P&L (IC)': '0.00',
        'Unrealized Return (%)': '0.00%'
      }];

  // ── Sheet 3: Trade Execution History
  const tradeRows = (trades && trades.length > 0)
    ? trades.map((t: any, idx: number) => {
        const timeStr = t.timestamp
          ? (t.timestamp > 1e11
              ? new Date(t.timestamp).toLocaleString()
              : new Date(t.timestamp * 1000).toLocaleString())
          : 'N/A';
        const price = Number(t.price_per_share || t.executedPrice || 0);
        const total = Number(t.total_ic || t.totalIC || (t.shares * price) || 0);
        const cashImpact = t.type === 'BUY' ? `-${total.toFixed(2)} IC` : `+${total.toFixed(2)} IC`;

        return {
          'Trade #': idx + 1,
          'Timestamp': timeStr,
          'Action': t.type,
          'Ticker': t.symbol,
          'Company': t.stock_name || t.name || t.symbol,
          'Shares': t.shares,
          'Executed Price (IC)': price.toFixed(2),
          'Total Consideration (IC)': total.toFixed(2),
          'Cash Flow Impact': cashImpact
        };
      })
    : [{
        'Trade #': '1',
        'Timestamp': 'No trades recorded',
        'Action': 'NONE',
        'Ticker': '-',
        'Company': 'No executions during this session',
        'Shares': 0,
        'Executed Price (IC)': '0.00',
        'Total Consideration (IC)': '0.00',
        'Cash Flow Impact': '0.00 IC'
      }];

  const workbook = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsHoldings = XLSX.utils.json_to_sheet(holdingsRows);
  const wsTrades = XLSX.utils.json_to_sheet(tradeRows);

  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary & Balances');
  XLSX.utils.book_append_sheet(workbook, wsHoldings, 'Final Holdings');
  XLSX.utils.book_append_sheet(workbook, wsTrades, 'Trades History');

  const safeTeamCode = (team.team_code || 'TEAM').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeTeamCode}_Trading_Report_${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
