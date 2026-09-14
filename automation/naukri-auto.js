/**
 * naukri-auto.js
 *
 * Zero-manual-work Naukri automation:
 *   1. Reads credentials & profile from the backend data store
 *   2. Logs into Naukri.com with saved account
 *   3. Refreshes the Naukri resume headline & summary (keeps profile fresh)
 *   4. Searches for jobs matching the candidate's title and skills
 *   5. AI-scores each job with Gemini
 *   6. Applies to all matching jobs (score >= threshold)
 *   7. Records every application in the dashboard tracker
 *
 * Triggered by: POST /api/accounts/run-automation
 * Can also be run standalone: node automation/naukri-auto.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const log  = require('./logger');
const { analyzeAndFillForm, attachCV } = require('./form-filler');

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:5000/api';
const MIN_SCORE    = parseInt(process.env.MIN_MATCH_SCORE  || '45');
const MAX_APPLY    = parseInt(process.env.MAX_APPLY_PER_RUN || '15');
const HEADLESS     = process.env.HEADLESS !== 'false';

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms + Math.random() * 500));

async function apiGet(path) {
  const r = await fetch(`${BACKEND_URL}${path}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ── Load saved Naukri credentials ─────────────────────────────────────────────
async function getNaukriAccount() {
  const accounts = await apiGet('/accounts');
  const acc = accounts.find(a => a.platform === 'naukri');
  if (!acc) throw new Error('No Naukri credentials found. Add them at http://localhost:3000/accounts');
  // We need the password — read directly from the data file (API strips it)
  const dataFile = path.join(__dirname, '../backend/data/accounts.json');
  const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  return raw.find(a => a.platform === 'naukri');
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page, email, password) {
  log.info(`Logging into Naukri as ${email}...`);
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // Dismiss cookies if present
  await page.$('button#cookieConsent, button:has-text("Accept")').then(b => b?.click()).catch(() => {});
  await sleep(500);

  // Fill credentials
  for (const [sel, val] of [
    ['input[placeholder*="Email"], #usernameField', email],
    ['input[type="password"], #passwordField', password],
  ]) {
    const el = await page.$(sel);
    if (el) { await el.click(); await el.fill(''); for (const ch of val) await page.keyboard.type(ch, { delay: 35 + Math.random() * 50 }); }
  }
  await sleep(400);
  await page.click('button[type="submit"], .loginButton, button:has-text("Login")').catch(() => {});

  // Wait for redirect
  try {
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
    log.success('Naukri login successful!');
    return true;
  } catch {
    const url = page.url();
    if (url.includes('otp') || url.includes('verify')) {
      log.warn('OTP verification required. Complete it in the browser window (60s)...');
      try {
        await page.waitForFunction(() => !window.location.href.includes('otp') && !window.location.href.includes('verify'), { timeout: 60000 });
        log.success('OTP completed, continuing...');
        return true;
      } catch { log.error('OTP timed out.'); return false; }
    }
    log.error('Login failed. Verify your credentials in Auth & Portals page.');
    return false;
  }
}

// ── Update Naukri Profile Headline (keeps resume fresh & visible) ─────────────
async function refreshNaukriProfile(page, profile) {
  try {
    log.info('Refreshing Naukri profile to boost visibility...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Edit headline if possible
    const editBtn = await page.$('[class*="editIcon"], [title*="edit" i], button:has-text("Edit")');
    if (editBtn) {
      await editBtn.click();
      await sleep(1000);
      const headlineInput = await page.$('input[placeholder*="headline" i], input[name*="headline" i], textarea[name*="headline" i]');
      if (headlineInput && profile.currentTitle) {
        await headlineInput.fill(profile.currentTitle);
        const saveBtn = await page.$('button:has-text("Save"), button[type="submit"]');
        if (saveBtn) await saveBtn.click();
        await sleep(1000);
        log.success('Profile headline refreshed!');
      }
    }
  } catch (e) {
    log.warn(`Profile refresh skipped: ${e.message}`);
  }
}

// ── Search and collect job listings ──────────────────────────────────────────
async function searchJobs(page, keyword, location) {
  const url = `https://www.naukri.com/${encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-'))}-jobs-in-${encodeURIComponent((location || 'india').toLowerCase().replace(/\s+/g, '-'))}`;
  log.info(`Searching: "${keyword}" in "${location || 'India'}"`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await page.waitForSelector('.srp-jobtuple-wrapper, .jobTuple', { timeout: 8000 }).catch(() => {});
  } catch {
    log.warn(`Search page load failed for "${keyword}"`);
    return [];
  }

  const jobs = [];
  const cards = await page.$$('.srp-jobtuple-wrapper, .jobTuple');

  for (const card of cards.slice(0, 20)) {
    try {
      const title    = await card.$eval('.title, .jobTitle, h2.title a', el => el.innerText.trim()).catch(() => '');
      const company  = await card.$eval('.subTitle, .companyName, .comp-name', el => el.innerText.trim()).catch(() => '');
      const location = await card.$eval('.locWdth, .location, .loc', el => el.innerText.trim()).catch(() => '');
      const desc     = await card.$eval('.job-description, .jd-desc', el => el.innerText.trim()).catch(() => '');
      const link     = await card.$eval('a.title, a.jobTitle, h2.title a', el => el.href).catch(() => null);
      const jobId    = link ? link.split('-').pop().split('?')[0] : `${Date.now()}`;

      if (title && company) {
        jobs.push({
          job_id: `naukri_${jobId}`,
          job_title: title,
          employer_name: company,
          job_city: location,
          job_country: 'IN',
          job_is_remote: location.toLowerCase().includes('remote') || location.toLowerCase().includes('work from home'),
          job_employment_type: 'FULLTIME',
          job_description: desc.substring(0, 2000),
          _link: link,
        });
      }
    } catch { /* skip malformed */ }
  }

  log.info(`Found ${jobs.length} jobs for "${keyword}"`);
  return jobs;
}

// ── Apply to a single job ────────────────────────────────────────────────────
async function applyToJob(page, job, profile, coverLetter) {
  if (!job._link) return false;

  try {
    // Listen for new tab / popup window if apply button opens target="_blank"
    let targetPage = page;
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null),
      page.goto(job._link, { waitUntil: 'domcontentloaded' }).catch(() => {}),
    ]);

    if (popup) targetPage = popup;
    await sleep(2000);

    const applyBtn = await targetPage.$('button:has-text("Apply"), a:has-text("Apply Now"), .apply-button, #apply-button');
    if (!applyBtn) {
      // Check if already applied
      const done = await targetPage.$('span:has-text("Applied"), .applied-label');
      if (done) { log.skip(`Already applied to "${job.job_title}"`); return false; }
      log.warn(`No apply button found for "${job.job_title}"`);
      return false;
    }

    await applyBtn.click();
    await sleep(2000);

    // Analyze page, attach CV & auto-fill form details
    await attachCV(targetPage, profile);
    await analyzeAndFillForm(targetPage, profile, coverLetter);

    // Handle any confirmation modals
    const confirmBtn = await targetPage.$('button:has-text("Apply"), .applyBtn, button:has-text("Submit")').catch(() => null);
    if (confirmBtn) { await confirmBtn.click(); await sleep(1500); }

    // Dismiss success modal
    const closeBtn = await targetPage.$('button:has-text("Close"), .crossIcon, .modal-close').catch(() => null);
    if (closeBtn) await closeBtn.click();

    log.apply(`Applied: "${job.job_title}" @ ${job.employer_name}`);
    if (popup && !popup.isClosed()) await popup.close().catch(() => {});
    return true;
  } catch (e) {
    log.error(`Apply error for "${job.job_title}": ${e.message}`);
    try { await page.keyboard.press('Escape'); } catch {}
    return false;
  }
}

// ── Main Runner ───────────────────────────────────────────────────────────────
async function runNaukriAuto() {
  log.section('🚀 Naukri Auto-Apply Starting (Zero Manual Work)');

  // Load saved data
  let account, profile;
  try {
    account = await getNaukriAccount();
    log.info(`Account: ${account.username}`);
  } catch (e) {
    log.error(e.message);
    return { applied: 0, skipped: 0, errors: 1 };
  }

  try {
    profile = await apiGet('/profile');
    if (!profile?.setup) throw new Error('Profile not set up');
    log.info(`Candidate: ${profile.name} | ${profile.currentTitle} | ${profile.yearsOfExperience} yrs`);
  } catch (e) {
    log.error(`Profile not ready: ${e.message}. Configure at http://localhost:3000/profile`);
    return { applied: 0, skipped: 0, errors: 1 };
  }

  // Build search keywords from profile
  const keywords = [
    profile.currentTitle,
    ...(profile.skills || []).slice(0, 2).map(s => `${s} Developer`),
  ].filter(Boolean).slice(0, 3);

  const locations = profile.preferredLocations?.length
    ? profile.preferredLocations
    : ['India'];

  log.info(`Keywords: ${keywords.join(', ')}`);
  log.info(`Locations: ${locations.join(', ')}`);

  // Launch browser
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 30,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));

  const stats = { applied: 0, skipped: 0, errors: 0, total: 0 };

  try {
    const loggedIn = await login(page, account.username, account.password);
    if (!loggedIn) { await browser.close(); return stats; }

    // Refresh profile to boost resume visibility
    await refreshNaukriProfile(page, profile);

    // Search and apply
    for (const keyword of keywords) {
      for (const location of locations) {
        if (stats.applied >= MAX_APPLY) break;

        const jobs = await searchJobs(page, keyword, location);
        stats.total += jobs.length;

        for (const job of jobs) {
          if (stats.applied >= MAX_APPLY) break;
          log.info(`Evaluating: "${job.job_title}" @ ${job.employer_name}`);

          // AI Match Score
          let score = 55;
          try {
            const matchResult = await apiPost('/ai/match', { job });
            score = matchResult.matchScore || 55;
            log.ai(`Match: ${score}/100 (${matchResult.matchLevel}) — ${job.job_title}`);
          } catch {
            log.warn('AI scoring unavailable, using default score 55');
          }

          if (score < MIN_SCORE) {
            log.skip(`Score ${score} < threshold ${MIN_SCORE} — skipping`);
            stats.skipped++;
            continue;
          }

          // Generate cover letter
          let coverLetter = '';
          try {
            const clRes = await apiPost('/ai/cover-letter', { job });
            coverLetter = clRes.coverLetter || '';
          } catch { /* optional */ }

          const applied = await applyToJob(page, job, profile, coverLetter);

          if (applied) {
            stats.applied++;
            await apiPost('/applications', {
              id: job.job_id,
              jobId: job.job_id,
              job_title: job.job_title,
              title: job.job_title,
              employer_name: job.employer_name,
              company: job.employer_name,
              job_city: job.job_city,
              location: job.job_city,
              platform: 'Naukri',
              status: 'Applied',
              coverLetter,
              matchScore: score,
              appliedAt: new Date().toISOString(),
            }).catch(err => log.warn(`Failed to sync application to dashboard API: ${err.message}`));
            log.success(`[${stats.applied}/${MAX_APPLY}] Applied: "${job.job_title}" @ ${job.employer_name}`);
          } else {
            stats.errors++;
          }

          // Human-like delay between applications
          await sleep(5000 + Math.random() * 6000);
        }
        if (stats.applied >= MAX_APPLY) break;
      }
    }
  } catch (err) {
    log.error(`Automation crashed: ${err.message}`);
    stats.errors++;
  } finally {
    await browser.close();
  }

  log.section(`✅ Done | Applied: ${stats.applied} | Skipped: ${stats.skipped} | Errors: ${stats.errors} | Scanned: ${stats.total}`);
  log.info('View results at: http://localhost:3000/applications');

  return stats;
}

module.exports = { runNaukriAuto };

// Standalone run
if (require.main === module) {
  runNaukriAuto().catch(e => { console.error(e.message); process.exit(1); });
}
