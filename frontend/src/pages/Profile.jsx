import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { parseResume } from '../api';
import { User, Zap, Plus, X, FileText } from 'lucide-react';

const SKILL_SUGGESTIONS = [
  'React', 'Node.js', 'Python', 'TypeScript', 'JavaScript', 'Java', 'Go',
  'AWS', 'Docker', 'Kubernetes', 'SQL', 'GraphQL', 'REST APIs', 'Git',
  'Machine Learning', 'TensorFlow', 'PyTorch', 'MongoDB', 'PostgreSQL',
  'CSS', 'HTML', 'Vue.js', 'Angular', 'Next.js', 'Express', 'FastAPI',
];

export default function Profile() {
  const { profile, saveProfile, apiStatus } = useApp();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    currentTitle: '',
    yearsOfExperience: '',
    skills: [],
    education: '',
    summary: '',
    preferredLocations: [],
    jobType: 'Any',
    expectedSalary: '',
    linkedinUrl: '',
    githubUrl: '',
    resumeText: '',
  });

  React.useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        email: profile.email || '',
        currentTitle: profile.currentTitle || '',
        yearsOfExperience: profile.yearsOfExperience || '',
        skills: profile.skills || [],
        education: profile.education || '',
        summary: profile.summary || '',
        preferredLocations: profile.preferredLocations || [],
        jobType: profile.jobType || 'Any',
        expectedSalary: profile.expectedSalary || '',
        linkedinUrl: profile.linkedinUrl || '',
        githubUrl: profile.githubUrl || '',
        resumeText: profile.resumeText || '',
      });
    }
  }, [profile]);

  const [skillInput, setSkillInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [showResumeParser, setShowResumeParser] = useState(false);
  const [resumeInput, setResumeInput] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function addSkill(skill) {
    if (skill && !form.skills.includes(skill)) {
      setForm(prev => ({ ...prev, skills: [...prev.skills, skill] }));
      setSkillInput('');
    }
  }

  function removeSkill(skill) {
    setForm(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }));
  }

  function addLocation(loc) {
    if (loc && !form.preferredLocations.includes(loc)) {
      setForm(prev => ({ ...prev, preferredLocations: [...prev.preferredLocations, loc] }));
      setLocationInput('');
    }
  }

  function removeLocation(loc) {
    setForm(prev => ({ ...prev, preferredLocations: prev.preferredLocations.filter(l => l !== loc) }));
  }

  async function handleParseResume() {
    if (!resumeInput.trim()) return;
    if (!apiStatus.gemini) {
      toast('Gemini API key not configured', 'error');
      return;
    }
    setParsing(true);
    try {
      const res = await parseResume(resumeInput);
      const parsed = res.data;
      setForm(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        currentTitle: parsed.currentTitle || prev.currentTitle,
        yearsOfExperience: parsed.yearsOfExperience || prev.yearsOfExperience,
        skills: [...new Set([...prev.skills, ...(parsed.skills || [])])],
        education: parsed.education || prev.education,
        summary: parsed.summary || prev.summary,
        resumeText: resumeInput,
      }));
      setShowResumeParser(false);
      setResumeInput('');
      toast('✨ Resume parsed successfully by Gemini AI!', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to parse resume', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Please enter your name', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveProfile(form);
      toast('Profile saved successfully! 🎉', 'success');
    } catch (err) {
      toast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Your professional information used for AI job matching and cover letter generation</p>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Basic Info */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={16} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Basic Information</h2>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowResumeParser(!showResumeParser)}
              >
                <FileText size={13} />
                {showResumeParser ? 'Hide Parser' : 'Parse Resume with AI'}
              </button>
            </div>

            {showResumeParser && (
              <div style={{
                background: 'rgba(99,102,241,0.05)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '20px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 8 }}>
                  ✨ Paste your resume text — Gemini will auto-fill your profile
                </div>
                <textarea
                  className="form-textarea"
                  value={resumeInput}
                  onChange={e => setResumeInput(e.target.value)}
                  placeholder="Paste your resume here..."
                  style={{ minHeight: 160, marginBottom: 12 }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleParseResume}
                  disabled={parsing || !resumeInput.trim()}
                >
                  {parsing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Parsing...</> : <><Zap size={13} /> Parse with Gemini</>}
                </button>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  name="name"
                  className="form-input"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  name="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Current / Target Job Title</label>
                <input
                  name="currentTitle"
                  className="form-input"
                  value={form.currentTitle}
                  onChange={handleChange}
                  placeholder="Senior Software Engineer"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Years of Experience</label>
                <input
                  name="yearsOfExperience"
                  type="number"
                  className="form-input"
                  value={form.yearsOfExperience}
                  onChange={handleChange}
                  placeholder="5"
                  min="0"
                  max="50"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Education</label>
                <input
                  name="education"
                  className="form-input"
                  value={form.education}
                  onChange={handleChange}
                  placeholder="B.S. Computer Science, MIT"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Salary (Annual)</label>
                <input
                  name="expectedSalary"
                  className="form-input"
                  value={form.expectedSalary}
                  onChange={handleChange}
                  placeholder="$120,000"
                />
              </div>
              <div className="form-group">
                <label className="form-label">LinkedIn URL</label>
                <input
                  name="linkedinUrl"
                  className="form-input"
                  value={form.linkedinUrl}
                  onChange={handleChange}
                  placeholder="https://linkedin.com/in/johndoe"
                />
              </div>
              <div className="form-group">
                <label className="form-label">GitHub URL</label>
                <input
                  name="githubUrl"
                  className="form-input"
                  value={form.githubUrl}
                  onChange={handleChange}
                  placeholder="https://github.com/johndoe"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Professional Summary</label>
              <textarea
                name="summary"
                className="form-textarea"
                value={form.summary}
                onChange={handleChange}
                placeholder="Write a 2-3 sentence summary of your experience, skills, and career goals..."
                style={{ minHeight: 100 }}
              />
            </div>
          </div>

          {/* Skills */}
          <div className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: 16 }}>Skills</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {form.skills.map(skill => (
                <div key={skill} className="tag tag-primary" style={{ gap: 6 }}>
                  {skill}
                  <button type="button" onClick={() => removeSkill(skill)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {form.skills.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No skills added yet</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="form-input"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                placeholder="Add a skill..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput.trim()); } }}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => addSkill(skillInput.trim())}>
                <Plus size={14} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SKILL_SUGGESTIONS.filter(s => !form.skills.includes(s)).slice(0, 12).map(s => (
                <button key={s} type="button" onClick={() => addSkill(s)} className="tag tag-default" style={{ cursor: 'pointer', border: '1px dashed var(--border-default)' }}>
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Preferences */}
          <div className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: 16 }}>Job Preferences</h2>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Job Type</label>
                <select name="jobType" className="form-select" value={form.jobType} onChange={handleChange}>
                  <option value="Any">Any</option>
                  <option value="FULLTIME">Full-time</option>
                  <option value="PARTTIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Internship</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Locations</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={locationInput}
                    onChange={e => setLocationInput(e.target.value)}
                    placeholder="Add location..."
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocation(locationInput.trim()); } }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => addLocation(locationInput.trim())}>
                    <Plus size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {form.preferredLocations.map(loc => (
                    <div key={loc} className="tag tag-default" style={{ gap: 6 }}>
                      {loc}
                      <button type="button" onClick={() => removeLocation(loc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Saving...</> : '💾 Save Profile'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
