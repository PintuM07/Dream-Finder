const axios = require('axios');
const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, '../data/profile.json');

// ── In-memory result cache (10 minutes TTL) ─────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCacheKey(query, location, remoteOnly) {
  return `${(query || '').toLowerCase()}|${(location || '').toLowerCase()}|${!!remoteOnly}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { cache.delete(key); return null; }
  console.log('[JobSearch] Cache hit for:', key);
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function getProfile() {
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch {
    return { setup: false };
  }
}

// Emergency static fallback (only used if both RapidAPI and Gemini fail)
const STATIC_FALLBACK = [
  {
    job_id: 'fallback_1',
    job_title: 'Software Developer',
    employer_name: 'TCS',
    employer_logo: null,
    job_city: 'Bangalore',
    job_state: 'Karnataka',
    job_country: 'IN',
    job_employment_type: 'FULLTIME',
    job_is_remote: false,
    job_description: 'TCS is hiring Software Developers across all experience levels. Join one of India\'s largest IT companies to work on enterprise software projects. Skills required: Java or JavaScript, SQL, REST APIs, Git. CTC: ₹8–18 LPA.',
    job_apply_link: 'https://ibegin.tcs.com/iBegin/',
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_min_salary: 800000,
    job_max_salary: 1800000,
    job_salary_period: 'YEAR',
  },
  {
    job_id: 'fallback_2',
    job_title: 'React Frontend Developer',
    employer_name: 'Infosys',
    employer_logo: null,
    job_city: 'Hyderabad',
    job_state: 'Telangana',
    job_country: 'IN',
    job_employment_type: 'FULLTIME',
    job_is_remote: true,
    job_description: 'Infosys BPM is looking for React Frontend Developers to build modern UIs for banking and finance clients. 2+ years React experience required. CTC: ₹10–22 LPA.',
    job_apply_link: 'https://infosys.com/careers/',
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_min_salary: 1000000,
    job_max_salary: 2200000,
    job_salary_period: 'YEAR',
  },
];

async function searchJobs({ query, location, remoteOnly, employmentType, page = 1 }) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasRapidApi = rapidApiKey && rapidApiKey !== 'your_rapidapi_key_here';
  const hasGemini = geminiKey && geminiKey !== 'your_gemini_api_key_here';

  // ── 0. Check cache ──────────────────────────────────────────────────
  const cacheKey = getCacheKey(query, location, remoteOnly);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // ── 1. Try RapidAPI / JSearch (real live jobs) ─────────────────────
  if (hasRapidApi) {
    try {
      console.log('[JobSearch] Using JSearch (RapidAPI)');
      const params = {
        query: query || 'software developer',
        num_pages: 1,
        page,
      };
      if (location) params.location = location;
      if (remoteOnly) params.remote_jobs_only = 'true';
      if (employmentType) params.employment_types = employmentType;

      const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params,
        headers: {
          'x-rapidapi-host': 'jsearch.p.rapidapi.com',
          'x-rapidapi-key': rapidApiKey,
        },
        timeout: 10000,
      });

      const result = {
        jobs: response.data.data || [],
        total: response.data.data?.length || 0,
        source: 'live',
        isMock: false,
      };
      setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[JobSearch] JSearch API error:', error.message, '— falling back to Gemini AI');
    }
  }

  // ── 2. Use Gemini AI to generate smart, query-aware job listings ────
  if (hasGemini) {
    try {
      console.log('[JobSearch] Using Gemini AI to generate job listings for:', query);
      const { searchJobsWithAI } = require('./gemini');
      const profile = getProfile();

      const jobs = await searchJobsWithAI({ query, location, remoteOnly, employmentType, profile });

      console.log(`[JobSearch] Gemini generated ${jobs.length} jobs`);
      const result = {
        jobs,
        total: jobs.length,
        source: 'gemini-ai',
        isMock: false,
        isAI: true,
      };
      setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[JobSearch] Gemini AI job search failed:', error.message.substring(0, 200), '— using static fallback');
    }
  }

  // ── 3. Static fallback (last resort — no API keys at all) ──────────
  console.log('[JobSearch] Using static fallback data (no API keys configured)');
  let filtered = STATIC_FALLBACK;
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(j =>
      j.job_title.toLowerCase().includes(q) ||
      j.job_description.toLowerCase().includes(q) ||
      j.employer_name.toLowerCase().includes(q)
    );
    if (filtered.length === 0) filtered = STATIC_FALLBACK; // always return something
  }
  if (remoteOnly) filtered = filtered.filter(j => j.job_is_remote);

  return { jobs: filtered, total: filtered.length, source: 'fallback', isMock: true };
}

module.exports = { searchJobs };
