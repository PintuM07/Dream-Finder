import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { getApplications, updateApplication, deleteApplication } from '../api';
import { Trash2, X, ChevronDown } from 'lucide-react';

const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected', 'Saved'];

const STATUS_CONFIG = {
  Applied:   { color: 'var(--accent-primary)', bg: 'rgba(99,102,241,0.1)', emoji: '📤' },
  Interview: { color: 'var(--warning)',         bg: 'var(--warning-bg)',    emoji: '🎯' },
  Offer:     { color: 'var(--success)',         bg: 'var(--success-bg)',   emoji: '🎉' },
  Rejected:  { color: 'var(--danger)',          bg: 'var(--danger-bg)',    emoji: '❌' },
  Saved:     { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)',  emoji: '🔖' },
};

function KanbanCard({ app, onStatusChange, onDelete, onView }) {
  const config = STATUS_CONFIG[app.status] || STATUS_CONFIG.Applied;
  const date = new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="kanban-card" onClick={() => onView(app)}>
      <div className="kanban-card-title">{app.job_title}</div>
      <div className="kanban-card-company">{app.employer_name}</div>
      {app.job_city && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          📍 {app.job_city}
        </div>
      )}
      <div className="kanban-card-date">Applied {date}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
        <select
          value={app.status}
          onChange={e => onStatusChange(app.id, e.target.value)}
          style={{
            flex: 1,
            background: config.bg,
            color: config.color,
            border: `1px solid ${config.color}30`,
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].emoji} {s}</option>)}
        </select>
        <button
          className="btn btn-danger btn-sm btn-icon"
          onClick={e => { e.stopPropagation(); onDelete(app.id); }}
          style={{ padding: '4px 8px' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default function Applications() {
  const { toast } = useToast();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewApp, setViewApp] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await getApplications();
      setApplications(res.data);
    } catch {
      toast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id, status) {
    try {
      await updateApplication(id, { status });
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      toast(`Status updated to ${status}`, 'success');
    } catch {
      toast('Failed to update status', 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this application?')) return;
    try {
      await deleteApplication(id);
      setApplications(prev => prev.filter(a => a.id !== id));
      if (viewApp?.id === id) setViewApp(null);
      toast('Application deleted', 'info');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  const grouped = STATUSES.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.status === s);
    return acc;
  }, {});

  const stats = {
    total: applications.length,
    applied: applications.filter(a => a.status === 'Applied').length,
    interviews: applications.filter(a => a.status === 'Interview').length,
    offers: applications.filter(a => a.status === 'Offer').length,
    responseRate: applications.length > 0
      ? Math.round((applications.filter(a => ['Interview', 'Offer'].includes(a.status)).length / applications.length) * 100)
      : 0,
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="skeleton" style={{ height: 40, width: 200, marginBottom: 32 }} />
        <div className="kanban-board">
          {STATUSES.map(s => (
            <div key={s} className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Application <span className="gradient-text">Tracker</span></h1>
        <p className="page-subtitle">Track all your job applications in one place</p>
      </div>

      {/* Mini Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
        {[
          { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Applied', value: stats.applied, color: 'var(--accent-primary)' },
          { label: 'Interviews', value: stats.interviews, color: 'var(--warning)' },
          { label: 'Offers', value: stats.offers, color: 'var(--success)' },
          { label: 'Response Rate', value: `${stats.responseRate}%`, color: 'var(--accent-secondary)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card" style={{ padding: '14px 16px' }}>
            <div className="stat-value" style={{ fontSize: 24, color }}>{value}</div>
            <div className="stat-label" style={{ fontSize: 11 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      {applications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No applications yet</div>
          <div className="empty-state-text">Go to "Find Jobs" and click "Auto Apply" to start tracking your applications</div>
        </div>
      ) : (
        <div className="kanban-board">
          {STATUSES.map(status => {
            const config = STATUS_CONFIG[status];
            const apps = grouped[status];
            return (
              <div key={status} className="kanban-column">
                <div className="kanban-column-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{config.emoji}</span>
                    <span
                      className="kanban-column-title"
                      style={{ color: config.color }}
                    >
                      {status}
                    </span>
                  </div>
                  <span className="kanban-count">{apps.length}</span>
                </div>
                {apps.map(app => (
                  <KanbanCard
                    key={app.id}
                    app={app}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onView={setViewApp}
                  />
                ))}
                {apps.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                    No applications
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View Application Modal */}
      {viewApp && (
        <div className="modal-overlay" onClick={() => setViewApp(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{viewApp.job_title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {viewApp.employer_name} · {viewApp.job_city || 'Remote'}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewApp(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {viewApp.job_employment_type && <span className="tag tag-default">{viewApp.job_employment_type}</span>}
                {viewApp.job_is_remote && <span className="tag tag-success">Remote</span>}
                <span className="badge" style={{
                  background: STATUS_CONFIG[viewApp.status]?.bg,
                  color: STATUS_CONFIG[viewApp.status]?.color,
                }}>
                  {STATUS_CONFIG[viewApp.status]?.emoji} {viewApp.status}
                </span>
              </div>

              {viewApp.coverLetter && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cover Letter
                  </div>
                  <div className="cover-letter-text" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {viewApp.coverLetter}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(viewApp.id)}>
                <Trash2 size={13} /> Delete
              </button>
              <div style={{ flex: 1 }} />
              <select
                value={viewApp.status}
                onChange={e => { handleStatusChange(viewApp.id, e.target.value); setViewApp(prev => ({ ...prev, status: e.target.value })); }}
                className="form-select"
                style={{ width: 160 }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].emoji} {s}</option>)}
              </select>
              <button className="btn btn-primary" onClick={() => setViewApp(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
