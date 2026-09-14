import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { searchJobs, matchJob, generateCoverLetter, addApplication, getInterviewQuestions } from '../api';
import {
  Search, MapPin, Clock, DollarSign, Wifi, WifiOff,
  Zap, Send, BookmarkPlus, X, ChevronDown, ChevronUp, Lightbulb
} from 'lucide-react';

function ScoreRing({ score }) {
  const radius = 20;
  const circ = 2 * Math.PI * radius;
  const pct = (score || 0) / 100;
  const color = score >= 70 ? 'var(--success)' : score >= 45 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="score-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={radius} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="score-text" style={{ color }}>{score || '?'}</div>
    </div>
  );
}

function JobCard({ job, onMatchClick, onApplyClick, onInterviewClick, loadingMatch, loadingApply, selectedMatch }) {
  const [expanded, setExpanded] = useState(false);
  const match = selectedMatch;

  const salary = job.job_min_salary
    ? `$${Math.round(job.job_min_salary / 1000)}k–$${Math.round(job.job_max_salary / 1000)}k`
    : null;

  return (
    <div className={`job-card ${match ? 'selected' : ''}`}>
      <div className="job-card-header">
        <div className="company-logo">
          {job.employer_logo
            ? <img src={job.employer_logo} alt={job.employer_name} />
            : (job.employer_name?.[0] || '?')}
        </div>
        <div className="job-title-area">
          <div className="job-title">{job.job_title}</div>
          <div className="job-company">{job.employer_name}</div>
        </div>
        {match && <ScoreRing score={match.matchScore} />}
      </div>

      <div className="job-meta">
        <span className="job-meta-item"><MapPin size={14} />{job.job_city || 'Remote'}{job.job_state ? `, ${job.job_state}` : ''}</span>
        {job.job_employment_type && <span className="job-meta-item"><Clock size={14} />{job.job_employment_type}</span>}
        {salary && <span className="job-meta-item"><DollarSign size={14} />{salary}/yr</span>}
        {job.job_is_remote && <span className="tag tag-success" style={{ fontSize: '11px' }}>🌐 Remote</span>}
      </div>

      {match && (
        <div style={{ marginBottom: 12 }}>
          <div className="match-bar">
            <div
              className="match-bar-fill"
              style={{
                width: `${match.matchScore}%`,
                background: match.matchScore >= 70 ? 'var(--success)' : match.matchScore >= 45 ? 'var(--warning)' : 'var(--danger)',
              }}
            />
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' }}>
            {match.matchingSkills?.slice(0, 4).map(s => (
              <span key={s} className="skill-chip match">✓ {s}</span>
            ))}
            {match.missingSkills?.slice(0, 2).map(s => (
              <span key={s} className="skill-chip missing">✗ {s}</span>
            ))}
          </div>
          {match.recommendation && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
              💡 {match.recommendation}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          marginBottom: 12,
          padding: '12px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {job.job_description?.substring(0, 600)}...
        </div>
      )}

      <button
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 8, width: '100%' }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <><ChevronUp size={13} /> Hide Description</> : <><ChevronDown size={13} /> Show Description</>}
      </button>

      <div className="job-actions">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onMatchClick(job)}
          disabled={loadingMatch === job.job_id}
          style={{ flex: 1 }}
        >
          {loadingMatch === job.job_id ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Analyzing...</> : <><Zap size={13} /> AI Match</>}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onApplyClick(job)}
          disabled={loadingApply === job.job_id}
          style={{ flex: 1 }}
        >
          {loadingApply === job.job_id ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Generating...</> : <><Send size={13} /> Auto Apply</>}
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => onInterviewClick(job)}
          title="Prep interview questions"
        >
          <Lightbulb size={14} />
        </button>
      </div>
    </div>
  );
}

export default function JobSearch() {
  const { profile, apiStatus } = useApp();
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [isAI, setIsAI] = useState(false);
  const [source, setSource] = useState(null);
  const [matches, setMatches] = useState({});
  const [loadingMatch, setLoadingMatch] = useState(null);
  const [loadingApply, setLoadingApply] = useState(null);

  // Modals
  const [coverLetterModal, setCoverLetterModal] = useState(null);
  const [interviewModal, setInterviewModal] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(false);

  // Auto-load jobs on mount using profile's preferred title
  React.useEffect(() => {
    if (profile?.currentTitle) {
      setQuery(profile.currentTitle);
      setLocation((profile.preferredLocations || [])[0] || 'India');
    }
  }, [profile]);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim()) {
      toast('Please enter a job title or keyword to search', 'error');
      return;
    }
    setLoading(true);
    setJobs([]);
    setMatches({});
    try {
      const res = await searchJobs({ query, location, remoteOnly });
      const data = res.data;
      setJobs(data.jobs || []);
      setIsMock(data.isMock || false);
      setIsAI(data.isAI || false);
      setSource(data.source || null);
      if (data.isAI) {
        toast(`✨ Gemini AI found ${data.jobs?.length || 0} jobs for "${query}"`, 'success');
      } else if (data.isMock) {
        toast('Showing fallback jobs — configure your API keys for live results', 'info');
      } else {
        toast(`Found ${data.jobs?.length || 0} live jobs`, 'success');
      }
    } catch (err) {
      toast('Failed to search jobs: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleMatch(job) {
    if (!profile?.setup) { toast('Please set up your profile first', 'error'); return; }
    if (!apiStatus.gemini) { toast('Gemini API key not configured', 'error'); return; }
    setLoadingMatch(job.job_id);
    try {
      const res = await matchJob(job);
      setMatches(prev => ({ ...prev, [job.job_id]: res.data }));
      toast(`Match score: ${res.data.matchScore}/100 (${res.data.matchLevel})`, 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Match failed', 'error');
    } finally {
      setLoadingMatch(null);
    }
  }

  async function handleApply(job) {
    if (!profile?.setup) { toast('Please set up your profile first', 'error'); return; }
    if (!apiStatus.gemini) { toast('Gemini API key not configured', 'error'); return; }
    setLoadingApply(job.job_id);
    try {
      const [letterRes] = await Promise.all([generateCoverLetter(job)]);
      const coverLetter = letterRes.data.coverLetter;
      await addApplication({ ...job, coverLetter, status: 'Applied' });
      setCoverLetterModal({ job, coverLetter });
      toast('✅ Cover letter generated & application saved!', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Apply failed', 'error');
    } finally {
      setLoadingApply(null);
    }
  }

  async function handleInterview(job) {
    if (!profile?.setup) { toast('Please set up your profile first', 'error'); return; }
    if (!apiStatus.gemini) { toast('Gemini API key not configured', 'error'); return; }
    setInterviewModal({ job, questions: null });
    setInterviewLoading(true);
    try {
      const res = await getInterviewQuestions(job);
      setInterviewModal({ job, questions: res.data.questions });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to generate questions', 'error');
      setInterviewModal(null);
    } finally {
      setInterviewLoading(false);
    }
  }

  const qTypeColors = {
    Technical: 'var(--accent-primary)',
    Behavioral: 'var(--warning)',
    'Role-Specific': 'var(--info)',
    Tough: 'var(--danger)',
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Find <span className="gradient-text">Jobs</span></h1>
        <p className="page-subtitle">Powered by Gemini AI — searches for jobs tailored to your profile</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="search-container">
        <div className="search-input-wrapper" style={{ flex: 2 }}>
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Job title, skills, or company..."
          />
        </div>
        <div className="search-input-wrapper">
          <MapPin size={16} />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (e.g., Bangalore, India)"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={e => setRemoteOnly(e.target.checked)}
            style={{ accentColor: 'var(--accent-primary)', width: 15, height: 15 }}
          />
          Remote only
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Searching...</> : <><Search size={14} /> Search</>}
        </button>
      </form>

      {isAI && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--accent-secondary)', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', marginBottom: 16 }}>
          🤖 <strong>Gemini AI Mode</strong> — jobs generated by AI based on your query & profile. Add a RapidAPI key to get live jobs from Naukri, LinkedIn & Indeed.
        </div>
      )}
      {isMock && !isAI && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', marginBottom: 16 }}>
          ⚠ Fallback mode — showing static demo jobs. Configure Gemini or RapidAPI keys in backend/.env for real results.
        </div>
      )}

      {/* Results */}
      {loading && (
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Search for jobs above</div>
          <div className="empty-state-text">Enter a job title, skill, or company to find matching opportunities</div>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Found <strong style={{ color: 'var(--text-primary)' }}>{jobs.length}</strong> jobs
          </div>
          <div className="jobs-grid">
            {jobs.map(job => (
              <JobCard
                key={job.job_id}
                job={job}
                onMatchClick={handleMatch}
                onApplyClick={handleApply}
                onInterviewClick={handleInterview}
                loadingMatch={loadingMatch}
                loadingApply={loadingApply}
                selectedMatch={matches[job.job_id]}
              />
            ))}
          </div>
        </>
      )}

      {/* Cover Letter Modal */}
      {coverLetterModal && (
        <div className="modal-overlay" onClick={() => setCoverLetterModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">✉ Cover Letter Generated</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {coverLetterModal.job.job_title} at {coverLetterModal.job.employer_name} · Application saved!
                </div>
              </div>
              <button className="modal-close" onClick={() => setCoverLetterModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="cover-letter-text">{coverLetterModal.coverLetter}</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                navigator.clipboard.writeText(coverLetterModal.coverLetter);
                toast('Copied to clipboard!', 'success');
              }}>
                📋 Copy
              </button>
              <button className="btn btn-primary" onClick={() => setCoverLetterModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Interview Questions Modal */}
      {interviewModal && (
        <div className="modal-overlay" onClick={() => setInterviewModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">🎯 Interview Prep</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {interviewModal.job.job_title} at {interviewModal.job.employer_name}
                </div>
              </div>
              <button className="modal-close" onClick={() => setInterviewModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {interviewLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
                </div>
              ) : (
                interviewModal.questions?.map((q, i) => (
                  <div key={i} className="question-card">
                    <div className="question-type" style={{ color: qTypeColors[q.type] || 'var(--accent-primary)' }}>
                      {q.type}
                    </div>
                    <div className="question-text">Q{i + 1}: {q.question}</div>
                    <div className="question-tip">💡 Tip: {q.tip}</div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setInterviewModal(null)}>Got it!</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
