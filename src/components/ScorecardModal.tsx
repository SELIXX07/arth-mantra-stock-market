import React from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, X, Download, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ScorecardModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderboard: LeaderboardEntry[];
  currentTeamId?: string;
}

export const ScorecardModal: React.FC<ScorecardModalProps> = ({
  isOpen,
  onClose,
  leaderboard,
  currentTeamId,
}) => {
  if (!isOpen) return null;

  const handleExportExcel = () => {
    const exportData = leaderboard.map((team) => ({
      Rank: team.rank,
      'Team Code': team.team_code,
      'Team Name': team.team_name,
      'Team Leader': team.leader_name,
      'Initial Allocated IC': 10000,
      'Cash Remaining (IC)': team.cash_balance,
      'Holdings Value (IC)': team.stock_value,
      'Total Net Worth (IC)': team.net_worth,
      'Net Profit / Loss (IC)': team.profit_loss,
      'Return (%)': `${team.return_pct}%`,
      'Total Trades': team.trades_count,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Market Scorecard');
    XLSX.writeFile(workbook, `ArthMantra_Trading_Scorecard_${Date.now()}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-mono text-white">
                Official Trading Scorecard & Leaderboard
              </h2>
              <p className="text-xs text-slate-400">
                Round 2: Asset Valuation, Portfolio Net Worth, and Realized P&L
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-emerald-900/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center">Rank</th>
                  <th className="py-3 px-3">Team & Leader</th>
                  <th className="py-3 px-3 text-right">Allocated IC</th>
                  <th className="py-3 px-3 text-right">Cash Left</th>
                  <th className="py-3 px-3 text-right">Stock Value</th>
                  <th className="py-3 px-3 text-right">Net Worth</th>
                  <th className="py-3 px-3 text-right">Net Profit / Loss</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {leaderboard.map((team) => {
                  const isCurrent = team.id === currentTeamId;
                  const isProfit = team.profit_loss >= 0;

                  return (
                    <tr
                      key={team.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-cyan-950/40 border-l-4 border-l-cyan-400'
                          : 'hover:bg-slate-900/50'
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                            team.rank === 1
                              ? 'bg-amber-400 text-black'
                              : team.rank === 2
                              ? 'bg-slate-300 text-black'
                              : team.rank === 3
                              ? 'bg-amber-700 text-white'
                              : 'text-slate-400'
                          }`}
                        >
                          {team.rank}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-white flex items-center space-x-1.5">
                          <span>{team.team_name}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1 rounded">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {team.team_code} • {team.leader_name}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right text-slate-400">
                        10,000 IC
                      </td>

                      <td className="py-3 px-3 text-right text-slate-200">
                        {team.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                      </td>

                      <td className="py-3 px-3 text-right text-cyan-400">
                        {team.stock_value.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-white">
                        {team.net_worth.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                      </td>

                      <td
                        className={`py-3 px-3 text-right font-bold ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        <div className="flex items-center justify-end space-x-1">
                          {isProfit ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isProfit ? '+' : ''}
                            {team.profit_loss.toFixed(2)} IC ({team.return_pct.toFixed(2)}%)
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            team.is_online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                          }`}
                          title={team.is_online ? 'Online Trading' : 'Offline'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
