import React, { useState } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, X, Download, TrendingUp, TrendingDown, Search, FileSpreadsheet, Sparkles, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { downloadTeamTradingReport } from '../utils/exportTeamReport';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingTeamId, setDownloadingTeamId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportAllExcel = () => {
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
    XLSX.writeFile(workbook, `ArthMantra_All_Teams_Scorecard_${Date.now()}.xlsx`);
  };

  const handleDownloadSingleTeam = async (team: LeaderboardEntry) => {
    try {
      setDownloadingTeamId(team.id);
      await downloadTeamTradingReport(team);
    } catch (err) {
      console.error('Failed to download individual team report:', err);
    } finally {
      setDownloadingTeamId(null);
    }
  };

  const filteredTeams = leaderboard.filter((team) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      team.team_name.toLowerCase().includes(q) ||
      team.team_code.toLowerCase().includes(q) ||
      team.leader_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="bg-gradient-to-br from-[#0c1324] via-[#0b101e] to-[#070b15] border border-slate-700/80 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_0_60px_rgba(0,210,255,0.18)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/25 to-orange-500/15 border border-amber-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-black font-mono tracking-tight text-white">
                  Official Trading Scorecard & Leaderboard
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Round 3: Asset Valuation, Portfolio Net Worth & Individual Team Statements
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-end sm:self-auto">
            <button
              onClick={handleExportAllExcel}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-mono font-bold flex items-center space-x-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
              title="Download Master Sheet containing all teams"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export All Teams (.xlsx)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Subtitle Controls */}
        <div className="px-6 py-3 border-b border-slate-800/60 bg-[#080d19]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by team name, code, or leader..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-colors"
            />
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Showing <strong className="text-cyan-400">{filteredTeams.length}</strong> of {leaderboard.length} teams • Click <strong className="text-emerald-400">Export</strong> on any row for individual audit statement
          </span>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="border border-slate-800/80 rounded-2xl overflow-hidden bg-slate-950/40 shadow-inner">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center">Rank</th>
                  <th className="py-3 px-3">Team & Leader</th>
                  <th className="py-3 px-3 text-right">Cash Left</th>
                  <th className="py-3 px-3 text-right">Stock Value</th>
                  <th className="py-3 px-3 text-right">Net Worth</th>
                  <th className="py-3 px-3 text-right">P&L (IC)</th>
                  <th className="py-3 px-3 text-center">Trades</th>
                  <th className="py-3 px-3 text-center">Individual Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTeams.map((team) => {
                  const isCurrent = team.id === currentTeamId;
                  const isProfit = team.profit_loss >= 0;
                  const isTop1 = team.rank === 1;
                  const isTop2 = team.rank === 2;
                  const isTop3 = team.rank === 3;

                  return (
                    <tr
                      key={team.id}
                      className={`transition-all hover:bg-slate-800/40 ${
                        isCurrent
                          ? 'bg-cyan-950/30 border-l-4 border-l-cyan-400'
                          : isTop1
                          ? 'bg-amber-950/15'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-black text-xs shadow-sm ${
                            isTop1
                              ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                              : isTop2
                              ? 'bg-gradient-to-tr from-slate-200 to-slate-400 text-black'
                              : isTop3
                              ? 'bg-gradient-to-tr from-amber-700 to-orange-600 text-white'
                              : 'text-slate-400 bg-slate-900/80 border border-slate-800'
                          }`}
                        >
                          {team.rank}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-white flex items-center space-x-1.5">
                          <span className="hover:text-cyan-400 transition-colors">{team.team_name}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded font-mono">
                              YOU
                            </span>
                          )}
                          {isTop1 && (
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          <span className="text-cyan-400 font-semibold">{team.team_code}</span> • {team.leader_name}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right text-slate-300">
                        {team.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                      </td>

                      <td className="py-3 px-3 text-right text-cyan-400 font-semibold">
                        {team.stock_value.toLocaleString(undefined, { minimumFractionDigits: 2 })} IC
                      </td>

                      <td className="py-3 px-3 text-right font-black text-white text-sm">
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

                      <td className="py-3 px-3 text-center text-slate-400">
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px]">
                          {team.trades_count || 0}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDownloadSingleTeam(team)}
                          disabled={downloadingTeamId === team.id}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950 border border-slate-700/80 hover:border-emerald-600 text-slate-300 hover:text-emerald-300 text-[11px] font-mono font-bold transition-all shadow-sm hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                          title={`Download individual session statement (.xlsx) for ${team.team_name}`}
                        >
                          <Download className={`w-3.5 h-3.5 ${downloadingTeamId === team.id ? 'animate-bounce text-emerald-400' : ''}`} />
                          <span className="hidden sm:inline">
                            {downloadingTeamId === team.id ? 'Exporting...' : 'Export (.xlsx)'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredTeams.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                      No matching squads found for &quot;{searchQuery}&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
