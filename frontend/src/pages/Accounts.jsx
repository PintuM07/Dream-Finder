import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { getAccounts, saveAccount, deleteAccount, runAutomation } from '../api';
import { KeyRound, Plus, Trash2, Play, CheckCircle2, ShieldCheck, Globe, Zap } from 'lucide-react';

const PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', desc: 'Easy Apply automation for LinkedIn job listings' },
  { id: 'naukri', name: 'Naukri.com', icon: '🇮🇳', desc: 'One-Click apply automation for Indian job portal' },
  { id: 'indeed', name: 'Indeed', icon: '🌐', desc: 'Direct apply support for Indeed listings (coming soon)' }
];

export default function Accounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(null);

  const [form, setForm] = useState({
    platform: 'linkedin',
    label: '',
    username: '',
    password: ''
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const res = await getAccounts();
      setAccounts(res.data);
    } catch {
      toast('Failed to load authentication accounts', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast('Please provide username/email and password', 'error');
      return;
    }
    try {
      await saveAccount(form);
      toast(`✅ Credentials saved for ${form.platform.toUpperCase()}!`, 'success');
      setShowModal(false);
      setForm({ platform: 'linkedin', label: '', username: '', password: '' });
      loadAccounts();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save credentials', 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete these credentials?')) return;
    try {
      await deleteAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      toast('Credentials removed', 'info');
    } catch {
      toast('Failed to delete credentials', 'error');
    }
  }

  const [botStatus, setBotStatus] = useState({}); // { [platform]: 'idle'|'running'|'done'|'error' }
  const [botMessage, setBotMessage] = useState({});

  async function handleTrigger(platform) {
    setBotStatus(s => ({ ...s, [platform]: 'running' }));
    setBotMessage(s => ({ ...s, [platform]: 'Starting automation... this may take a few minutes.' }));
    try {
      const res = await runAutomation(platform);
      const msg = res.data?.message || 'Bot launched successfully!';
      setBotStatus(s => ({ ...s, [platform]: 'done' }));
      setBotMessage(s => ({ ...s, [platform]: msg }));
      toast(`🚀 Naukri auto-apply started! View results at Applications`, 'success');
    } catch (err) {
      setBotStatus(s => ({ ...s, [platform]: 'error' }));
      setBotMessage(s => ({ ...s, [platform]: err.response?.data?.error || 'Failed to launch bot' }));
      toast('Failed to launch automation bot', 'error');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Platform <span className="gradient-text">Authentications</span></h1>
        <p className="page-subtitle">Manage your login credentials for automatic job searching & auto-applying</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Platform Account
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🔑</div>
          <div className="empty-state-title">No credentials added yet</div>
          <div className="empty-state-text">
            Add your LinkedIn or Naukri accounts here so the application can automatically apply to matching jobs on your behalf.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add First Account
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {accounts.map(acc => {
            const platformInfo = PLATFORMS.find(p => p.id === acc.platform) || { name: acc.platform, icon: '🔑' };
            return (
              <div key={acc.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{platformInfo.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {platformInfo.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{acc.username}</div>
                    </div>
                  </div>
                  <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <CheckCircle2 size={12} style={{ marginRight: 4 }} /> Ready
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '10px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  🔒 Encrypted locally. Script will use these details to auto-log in & submit Easy Apply forms.
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn btn-sm ${botStatus[acc.platform] === 'running' ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ flex: 1 }}
                    onClick={() => handleTrigger(acc.platform)}
                    disabled={botStatus[acc.platform] === 'running'}
                  >
                    {botStatus[acc.platform] === 'running'
                      ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Applying to jobs...</>
                      : botStatus[acc.platform] === 'done'
                      ? <><CheckCircle2 size={13} /> Run Again</>
                      : <><Play size={13} /> 🚀 Auto-Apply Now</>
                    }
                  </button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(acc.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Status message after bot launch */}
                {botStatus[acc.platform] && botMessage[acc.platform] && (
                  <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    background: botStatus[acc.platform] === 'done'
                      ? 'var(--success-bg)'
                      : botStatus[acc.platform] === 'error'
                      ? 'var(--danger-bg)'
                      : 'rgba(168,85,247,0.08)',
                    color: botStatus[acc.platform] === 'done'
                      ? 'var(--success)'
                      : botStatus[acc.platform] === 'error'
                      ? 'var(--danger)'
                      : 'var(--accent-secondary)',
                    border: `1px solid ${botStatus[acc.platform] === 'done' ? 'rgba(16,185,129,0.3)' : botStatus[acc.platform] === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.25)'}`,
                  }}>
                    {botMessage[acc.platform]}
                    {botStatus[acc.platform] === 'done' && (
                      <a href="/applications" style={{ marginLeft: 8, color: 'var(--accent-tertiary)', textDecoration: 'underline' }}>
                        View Applications →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">🔑 Add Platform Credentials</div>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Platform</label>
                  <select
                    className="form-select"
                    value={form.platform}
                    onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  >
                    {PLATFORMS.map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Username / Email *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="your.email@example.com"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Credentials</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
