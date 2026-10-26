const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:4000/api' : '/api';

const getAdminHeaders = () => {
  const token = localStorage.getItem('arth_admin_token') || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const getTeamHeaders = () => {
  const session = localStorage.getItem('arth_session_id') || '';
  return {
    'Content-Type': 'application/json',
    ...(session ? { 'Authorization': `Bearer ${session}` } : {})
  };
};

export const api = {
  getMarketState: async () => {
    const res = await fetch(`${API_BASE}/market/state`);
    return res.json();
  },

  getCandles: async (stockId: string) => {
    const res = await fetch(`${API_BASE}/market/candles/${stockId}`);
    return res.json();
  },

  login: async (team_code: string, password: string, force_takeover = false) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_code, password, force_takeover })
    });
    return res.json();
  },

  logout: async (teamId: string) => {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId })
    });
    return res.json();
  },

  adminLogin: async (password: string, email?: string) => {
    const res = await fetch(`${API_BASE}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, email })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('arth_admin_token', data.token);
    }
    return data;
  },

  verifyAdmin: async () => {
    try {
      const token = localStorage.getItem('arth_admin_token');
      if (!token) return { valid: false };
      const res = await fetch(`${API_BASE}/auth/verify-admin`, {
        headers: getAdminHeaders()
      });
      if (res.status === 200) {
        const data = await res.json();
        return { valid: Boolean(data.valid) };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  },

  executeOrder: async (teamId: string, stockId: string, type: 'BUY' | 'SELL', shares: number) => {
    const sessionId = localStorage.getItem('arth_session_id') || '';
    const res = await fetch(`${API_BASE}/trade/order`, {
      method: 'POST',
      headers: getTeamHeaders(),
      body: JSON.stringify({ teamId, sessionId, stockId, type, shares })
    });
    return res.json();
  },

  getPortfolio: async (teamId: string) => {
    const res = await fetch(`${API_BASE}/team/portfolio/${teamId}`);
    return res.json();
  },

  getLeaderboard: async () => {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      headers: getAdminHeaders()
    });
    return res.json();
  },

  // Admin Actions (All protected with Admin Bearer Token)
  setMarketControl: async (status: 'OPEN' | 'PAUSED' | 'CLOSED', durationMins?: number) => {
    const res = await fetch(`${API_BASE}/admin/market-control`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ status, durationMins })
    });
    return res.json();
  },

  toggleCredentials: async (released: boolean) => {
    const res = await fetch(`${API_BASE}/admin/toggle-credentials`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ released })
    });
    return res.json();
  },

  scheduleTimes: async (data: { scheduled_open_at?: number; scheduled_close_at?: number; durationMins?: number }) => {
    const res = await fetch(`${API_BASE}/admin/schedule-times`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  setBaseIC: async (base_ic: number, applyToAllTeams: boolean = true) => {
    const res = await fetch(`${API_BASE}/admin/set-base-ic`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ base_ic, applyToAllTeams })
    });
    return res.json();
  },

  induceWithdraw: async (stockId: string, action: 'INDUCE' | 'WITHDRAW', shares: number) => {
    const res = await fetch(`${API_BASE}/admin/induce-withdraw`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ stockId, action, shares })
    });
    return res.json();
  },

  broadcastNews: async (headline: string, content: string, affectedSymbols: string[], priceImpactPct: number) => {
    const res = await fetch(`${API_BASE}/admin/news`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ headline, content, affectedSymbols, priceImpactPct })
    });
    return res.json();
  },

  saveStock: async (stockData: any) => {
    const res = await fetch(`${API_BASE}/admin/stock`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(stockData)
    });
    return res.json();
  },

  deleteStock: async (stockId: string) => {
    const res = await fetch(`${API_BASE}/admin/stock/${stockId}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    return res.json();
  },

  pullMarketAdmins: async () => {
    const res = await fetch(`${API_BASE}/admin/pull-market-admins`, {
      method: 'POST',
      headers: getAdminHeaders()
    });
    return res.json();
  },

  getSyncedAdmins: async () => {
    const res = await fetch(`${API_BASE}/admin/synced-admins`, {
      headers: getAdminHeaders()
    });
    return res.json();
  },

  getAdminTeams: async () => {
    const res = await fetch(`${API_BASE}/admin/teams`, {
      headers: getAdminHeaders()
    });
    return res.json();
  },

  getAdminTrades: async (teamId?: string, stockId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (teamId) params.append('teamId', teamId);
    if (stockId) params.append('stockId', stockId);
    if (limit) params.append('limit', limit.toString());
    const res = await fetch(`${API_BASE}/admin/trades?${params.toString()}`, {
      headers: getAdminHeaders()
    });
    return res.json();
  },

  adjustBalance: async (teamId: string, amountIC: number, reason: string) => {
    const res = await fetch(`${API_BASE}/admin/adjust-balance`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ teamId, amountIC, reason })
    });
    return res.json();
  },

  syncTeams: async (teams: any[]) => {
    const res = await fetch(`${API_BASE}/admin/sync-teams`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ teams })
    });
    return res.json();
  },

  // Redundancy & Disaster Recovery
  getBackupStatus: async () => {
    const res = await fetch(`${API_BASE}/admin/backup-status`, {
      headers: getAdminHeaders()
    });
    return res.json();
  },

  snapshotNow: async () => {
    const res = await fetch(`${API_BASE}/admin/snapshot-now`, {
      method: 'POST',
      headers: getAdminHeaders()
    });
    return res.json();
  },

  downloadBackup: async () => {
    const res = await fetch(`${API_BASE}/admin/backup`, {
      headers: getAdminHeaders()
    });
    if (!res.ok) throw new Error('Failed to download database backup');
    return res.json();
  },

  restoreBackup: async (backupData: any) => {
    const res = await fetch(`${API_BASE}/admin/restore`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(backupData)
    });
    return res.json();
  }
};
