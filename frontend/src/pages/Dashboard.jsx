import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getApplications } from '../api';
import { Briefcase, Search, CheckCircle, Clock, TrendingUp, Zap, ArrowRight, AlertCircle } from 'lucide-react';

const STATUS_COLORS = {
  Applied: 'var(--accent-primary)',
  Interview: 'var(--warning)',
  Offer: 'var(--success)',
  Rejected: 'var(--danger)',
  Saved: 'var(--text-secondary)',
};

export default function Dashboard() {
  const { profile, apiStatus } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      const res = await getApplications();
      setApplications(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const stats = {
    total: applications.length,
    applied: applications.filter(a => a.status === 'Applied').length,
    interviews: applications.filter(a => a.status === 'Interview').length,
    offers: applications.filter(a => a.status === 'Offer').length,
    responseRate: applications.length > 0
      ? Math.round(((applications.filter(a => ['Interview', 'Offer'].includes(a.status)).length) / applications.length) * 100)
      : 0,
  };

  const recent = applications.slice(0, 5);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          {profile?.setup
            ? <>Welcome back, <span className="gradient-text">{profile.name?.split(' ')[0]}</span> 👋</>
            : <>Job Agent AI <span className="gradient-text">Dashboard</span></>
          }
        </h1>
        <p className="page-subtitle">
          {profile?.setup
            ? `AI-powered job hunting at your fingertips`
            : 'Set up your profile to start your AI-powered job search'
          }
        </p>
      </div>

      {/* Setup Banner */}
      {!profile?.setup && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '32px' }}>🚀</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                Set up your profile to get started
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Add your resume and preferences so Gemini AI can match and apply to jobs for you
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/profile')}>
            Setup Profile <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* API Status Warning */}
      {apiStatus.connected && !apiStatus.gemini && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          color: 'var(--warning)',
        }}>
          <AlertCircle size={16} />
          <span>
            <strong>Gemini API key not configured.</strong> AI features (job matching, cover letters) won't work until you add it to <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4 }}>backend/.env</code>
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Total Applications', value: stats.total, icon: '📋', color: 'var(--accent-primary)', bg: 'rgba(99,102,241,0.1)' },
          { label: 'Applied', value: stats.applied, icon: '📤', color: 'var(--info)', bg: 'rgba(6,182,212,0.1)' },
          { label: 'Interviews', value: stats.interviews, icon: '🎯', color: 'var(--warning)', bg: 'var(--warning-bg)' },
          { label: 'Offers', value: stats.offers, icon: '🎉', color: 'var(--success)', bg: 'var(--success-bg)' },
          { label: 'Response Rate', value: `${stats.responseRate}%`, icon: '📈', color: 'var(--accent-secondary)', bg: 'rgba(139,92,246,0.1)' },
        ].map(({ label, value, icon, color, bg }) => (
          <div className="stat-card" key={label}>
            <div className="stat-icon" style={{ background: bg, color }}>
              <span style={{ fontSize: '20px' }}>{icon}</span>
            </div>
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Recent Applications */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Recent Applications</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/applications')}>View All</button>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-title">No applications yet</div>
              <div className="empty-state-text">Search for jobs and start applying!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recent.map(app => (
                <div key={app.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }} onClick={() => navigate('/applications')}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    {app.employer_name?.[0] || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">
                      {app.job_title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{app.employer_name}</div>
                  </div>
                  <span className="badge" style={{
                    background: STATUS_COLORS[app.status] + '20',
                    color: STATUS_COLORS[app.status],
                    border: `1px solid ${STATUS_COLORS[app.status]}40`,
                  }}>
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: 20 }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                icon: '🔍',
                title: 'Find Matching Jobs',
                desc: 'AI searches jobs that fit your profile',
                action: () => navigate('/jobs'),
                color: 'rgba(99,102,241,0.1)',
              },
              {
                icon: '📝',
                title: 'Update Profile',
                desc: 'Keep your skills and experience current',
                action: () => navigate('/profile'),
                color: 'rgba(139,92,246,0.1)',
              },
              {
                icon: '📊',
                title: 'Track Applications',
                desc: 'Manage your application pipeline',
                action: () => navigate('/applications'),
                color: 'rgba(6,182,212,0.1)',
              },
            ].map(({ icon, title, desc, action, color }) => (
              <button key={title} onClick={action} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px',
                background: color,
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                <span style={{ fontSize: '24px' }}>{icon}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{desc}</div>
                </div>
                <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
