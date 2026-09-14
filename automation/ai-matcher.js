/**
 * ai-matcher.js
 * Calls the Job Agent backend to score a job against the user's profile
 * and generate a tailored cover letter via Gemini AI.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000/api';

async function getProfile() {
  const res = await fetch(`${BACKEND_URL}/profile`);
  if (!res.ok) throw new Error('Could not load profile from backend');
  return res.json();
}

async function scoreJob(jobData) {
  /**
   * jobData shape (normalised from any platform):
   * {
   *   job_id, job_title, employer_name, job_description,
   *   job_city, job_is_remote, job_employment_type
   * }
   */
  const res = await fetch(`${BACKEND_URL}/ai/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job: jobData }),
  });
  if (!res.ok) throw new Error(`AI match failed: ${await res.text()}`);
  return res.json(); // { matchScore, matchLevel, matchingSkills, missingSkills, recommendation }
}

async function getCoverLetter(jobData) {
  const res = await fetch(`${BACKEND_URL}/ai/cover-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job: jobData }),
  });
  if (!res.ok) throw new Error(`Cover letter failed: ${await res.text()}`);
  const data = await res.json();
  return data.coverLetter;
}

async function recordApplication(jobData, coverLetter, platform, status = 'Applied') {
  const res = await fetch(`${BACKEND_URL}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...jobData, coverLetter, platform, status }),
  });
  return res.json();
}

module.exports = { getProfile, scoreJob, getCoverLetter, recordApplication };
