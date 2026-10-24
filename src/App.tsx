import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { TradingDesk } from './pages/TradingDesk';
import { AdminDesk } from './pages/AdminDesk';
import { ProjectorView } from './pages/ProjectorView';
import { api } from './services/api';

export const App: React.FC = () => {
  const [team, setTeam] = useState<any>(() => {
    const saved = localStorage.getItem('arth_team');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogout = () => {
    if (team?.id) {
      api.logout(team.id);
    }
    localStorage.removeItem('arth_team');
    localStorage.removeItem('arth_session_id');
    setTeam(null);
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            team ? (
              <TradingDesk initialTeam={team} onLogout={handleLogout} />
            ) : (
              <LoginPage onLoginSuccess={(t) => setTeam(t)} />
            )
          }
        />
        <Route
          path="/terminal"
          element={
            team ? (
              <TradingDesk initialTeam={team} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="/admin" element={<AdminDesk />} />
        <Route path="/projector" element={<ProjectorView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
