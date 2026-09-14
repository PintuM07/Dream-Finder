import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard, Search, Briefcase, User, KeyRound,
  Zap, ChevronRight, Wifi, WifiOff
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/jobs', icon: Search, label: 'Find Jobs' },
  { path: '/applications', icon: Briefcase, label: 'Applications' },
  { path: '/accounts', icon: KeyRound, label: 'Auth & Portals' },
  { path: '/profile', icon: User, label: 'My Profile' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiStatus, profile } = useApp();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const getStatusInfo = () => {
    if (!apiStatus.connected) return { dot: 'offline', label: 'Backend offline' };
    if (apiStatus.gemini && apiStatus.rapidapi) return { dot: 'online', label: 'All systems online' };
    if (apiStatus.gemini || apiStatus.rapidapi) return { dot: 'partial', label: 'Partial setup' };
    return { dot: 'offline', label: 'API keys needed' };
  };

  const status = getStatusInfo();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">⚡</div>
          <div>
            <div className="logo-text">JobAgent AI</div>
            <div className="logo-sub">Powered by Gemini</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {navItems.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            className={`nav-item ${isActive(path) ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            <Icon size={18} />
            {label}
            {isActive(path) && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="api-status-badge">
          <div className={`status-dot ${status.dot}`} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>{status.label}</div>
            {profile?.setup && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                {profile.name || 'Profile ready'}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
