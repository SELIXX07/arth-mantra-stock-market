import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ShieldCheck, Activity, KeyRound, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (team: any, sessionId: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [teamCode, setTeamCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmTakeover, setConfirmTakeover] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code') || params.get('team');
      const pin = params.get('pin');
      if (code) setTeamCode(code.trim().toUpperCase());
      if (pin) setPassword(pin.trim());
    }
  }, []);

  const handleLogin = async (forceTakeover = false) => {
    if (!teamCode || !password) {
      setErrorMsg('Please enter both Team Code and Trader PIN.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.login(teamCode, password, forceTakeover);

      if (res.requiresConfirmation) {
        setConfirmTakeover(true);
        setErrorMsg(res.message);
        setLoading(false);
        return;
      }

      if (res.success) {
        localStorage.removeItem('arth_admin_token');
        localStorage.setItem('arth_team', JSON.stringify(res.team));
        localStorage.setItem('arth_session_id', res.sessionId);
        window.dispatchEvent(new Event('storage'));
        onLoginSuccess(res.team, res.sessionId);
      } else {
        setErrorMsg(res.error || 'Login failed. Please check credentials.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error connecting to trading engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A11] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glow Accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Terminal Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-xl shadow-cyan-500/25 mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black font-mono tracking-wider text-white">
            ARTH MANTRA
          </h1>
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-mono mt-1">
            Artificial Stock Exchange • Round 3
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0B0F19]/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center space-x-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg mb-6">
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Team Leader Trading Authority:</strong> Only the designated team leader is authorized to place orders.
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin(confirmTakeover);
            }}
            className="space-y-4"
          >
            {/* Team Code */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Team Code (From Main Website)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. ARTH-1TNY or ARTH-101"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors uppercase tracking-wider"
                />
              </div>
            </div>

            {/* Password / PIN */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Trader PIN / Access Code
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter secret PIN"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div
                className={`p-3 rounded-lg text-xs flex items-start space-x-2 ${
                  confirmTakeover
                    ? 'bg-amber-950/80 border border-amber-800 text-amber-200'
                    : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>{errorMsg}</p>
                  {confirmTakeover && (
                    <button
                      type="button"
                      onClick={() => handleLogin(true)}
                      className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono rounded text-xs transition-colors"
                    >
                      Yes, Terminate Previous Session & Log In
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-950/50 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <span>AUTHENTICATING...</span>
              ) : (
                <>
                  <span>ENTER TRADING TERMINAL</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
