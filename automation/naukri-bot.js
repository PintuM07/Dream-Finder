/**
 * naukri-bot.js
 *
 * Automates Naukri.com job search and one-click apply.
 *
 * Flow:
 *  1. Login with credentials
 *  2. Search jobs matching keywords + location
 *  3. For each job: score with Gemini AI
 *  4. If score >= MIN_MATCH_SCORE: apply and optionally attach cover letter
 *  5. Record application in dashboard tracker
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { chromium } = require('playwright');
const log = require('./logger');
const { getProfile, scoreJob, getCoverLetter, recordApplication } = require('./ai-matcher');

const CONFIG = {
  email:    process.env.NAUKRI_EMAIL,
  password: process.env.NAUKRI_PASSWORD,
  keywords: (process.env.JOB_KEYWORDS || 'Software Developer').split(',').map(k => k.trim()),
  location: process.env.JOB_LOCATION || 'India',
  minScore: parseInt(process.env.MIN_MATCH_SCORE || '50'),
  maxApply: parseInt(process.env.MAX_APPLY_PER_RUN || '10'),
  headless: process.env.HEADLESS !== 'false',
};

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 500));
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await page.fill(selector, '');
  for (const char of text) {
    await page.type(selector, char, { delay: 40 + Math.random() * 70 });
  }
}

async function login(page) {
  log.info('Navigating to Naukri login...');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });
  await delay(2000);

  try {
    // Accept cookies if prompted
    const cookieBtn = await page.$('button#cookieConsent, button:has-text("Accept")');
    if (cookieBtn) await cookieBtn.click();
  } catch {}

  await humanType(page, 'input[placeholder*="Email"], input[name*="email"], #usernameField', CONFIG.email);
  await delay(500);
  await humanType(page, 'input[placeholder*="Password"], input[type="password"], #passwordField', CONFIG.password);
  await delay(500);

  await page.click('button[type="submit"], .loginButton, button:has-text("Login")');

  try {
    await page.waitForURL('**/naukri.com/**', { timeout: 15000 });
    await delay(2000);

    // Check we're not still on login page
    const url = page.url();
    if (url.includes('login')) {
      log.error('Naukri login failed. Check your credentials in automation/.env');
      return false;
    }

    log.success('Naukri login successful!');
    return true;
  } catch {
    // Handle OTP / captcha
    log.warn('Naukri may require OTP verification. Please complete it in the browser window...');
    try {
      await page.waitForFunction(() => !window.location.href.includes('login'), { timeout: 60000 });
      log.success('Verification done! Continuing...');
      return true;
    } catch {
      log.error('Naukri login timed out.');
      return false;
    }
  }
}

async function searchJobs(page, keyword) {
  log.info(`Searching Naukri: "${keyword}" in "${CONFIG.location}"`);

  const searchUrl = `https://www.naukri.com/${encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-'))}-jobs-in-${encodeURIComponent(CONFIG.location.toLowerCase().replace(/\s+/g, '-'))}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await delay(2500);

  const jobs = [];

  try {
    await page.waitForSelector('.srp-jobtuple-wrapper, .jobTuple, article.jobTupleHeader', { timeout: 8000 });

    const cards = await page.$$('.srp-jobtuple-wrapper, .jobTuple');
    for (const card of cards.slice(0, 20)) {
      try {
        const title = await card.$eval('.title, .jobTitle, h2.title a', el => el.innerText.trim()).catch(() => '');
        const company = await card.$eval('.subTitle, .companyName, .comp-name', el => el.innerText.trim()).catch(() => '');
        const location = await card.$eval('.locWdth, .location, .loc', el => el.innerText.trim()).catch(() => '');
        const desc = await card.$eval('.job-description, .jd-desc, .job-desc', el => el.innerText.trim()).catch(() => '');
        const link = await card.$eval('a.title, a.jobTitle, h2.title a', el => el.href).catch(() => null);
        const jobId = link ? link.split('-').pop().split('?')[0] : Date.now().toString();
        const exp = await card.$eval('.expwdth, .experience', el => el.innerText.trim()).catch(() => '');

        if (title && company) {
          jobs.push({
            job_id: `naukri_${jobId}`,
            job_title: title,
            employer_name: company,
            job_city: location,
            job_country: 'IN',
            job_is_remote: location.toLowerCase().includes('remote') || location.toLowerCase().includes('work from home'),
            job_employment_type: 'FULLTIME',
            job_description: desc,
            _link: link,
            _exp: exp,
          });
        }
      } catch { /* skip */ }
    }
  } catch {
    log.warn(`No job cards found for "${keyword}" on Naukri.`);
  }

  log.info(`Found ${jobs.length} Naukri jobs for "${keyword}"`);
  return jobs;
}

async function getFullDescription(page, jobLink) {
  try {
    const jobPage = await page.context().newPage();
    await jobPage.goto(jobLink, { waitUntil: 'domcontentloaded' });
    await delay(1500);
    const desc = await jobPage.$eval('.job-desc, .jd-desc, #job_description', el => el.innerText.trim()).catch(() => '');
    await jobPage.close();
    return desc.substring(0, 2000);
  } catch {
    return '';
  }
}

async function applyToJob(page, job, coverLetter) {
  try {
    if (!job._link) return false;

    await page.goto(job._link, { waitUntil: 'domcontentloaded' });
    await delay(2000);

    // Click Apply button
    const applyBtn = await page.$(
      'button:has-text("Apply"), a:has-text("Apply Now"), .apply-button, #apply-button, button.apply'
    );
    if (!applyBtn) {
      log.warn(`No Apply button found on Naukri for "${job.job_title}"`);
      return false;
    }

    await applyBtn.click();
    await delay(2000);

    // Handle modal / redirect apply flow
    // Some jobs open in a modal, others redirect
    const modalApplyBtn = await page.$('button:has-text("Apply"), .applyBtn').catch(() => null);
    if (modalApplyBtn) await modalApplyBtn.click();
    await delay(1500);

    // If a cover letter / message field appears
    const msgField = await page.$('textarea[placeholder*="cover"], textarea[name*="message"], textarea[id*="cover"]').catch(() => null);
    if (msgField && coverLetter) {
      await msgField.fill(coverLetter.substring(0, 1500));
      await delay(500);
    }

    // Submit
    const submitBtn = await page.$('button:has-text("Submit"), button:has-text("Send Application"), button.submit').catch(() => null);
    if (submitBtn) {
      await submitBtn.click();
      await delay(2000);
      log.apply(`Applied on Naukri: "${job.job_title}" @ ${job.employer_name}`);
      return true;
    }

    // If already applied notice
    const alreadyApplied = await page.$('.already-applied, span:has-text("Already Applied")').catch(() => null);
    if (alreadyApplied) {
      log.skip(`Already applied to "${job.job_title}" on Naukri`);
      return false;
    }

    // Dismiss any open modals
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  } catch (err) {
    log.error(`Naukri apply error: ${err.message}`);
    return false;
  }
}

async function runNaukriBot() {
  log.section('Naukri Auto-Apply Bot Starting');

  if (!CONFIG.email || CONFIG.email.includes('your_')) {
    log.error('Naukri credentials not set in automation/.env — skipping Naukri.');
    return { applied: 0, skipped: 0, errors: 0 };
  }

  const profile = await getProfile().catch(() => null);
  if (!profile?.setup) {
    log.error('Profile not configured. Please save your profile at http://localhost:3000/profile first.');
    return { applied: 0, skipped: 0, errors: 0 };
  }

  log.info(`Candidate: ${profile.name} | ${profile.currentTitle} | ${profile.yearsOfExperience} yrs exp`);
  log.info(`Keywords: ${CONFIG.keywords.join(', ')} | Location: ${CONFIG.location}`);

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.headless ? 0 : 50,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const stats = { applied: 0, skipped: 0, errors: 0 };

  try {
    const loggedIn = await login(page);
    if (!loggedIn) return stats;

    for (const keyword of CONFIG.keywords) {
      if (stats.applied >= CONFIG.maxApply) break;

      const jobs = await searchJobs(page, keyword);

      for (const job of jobs) {
        if (stats.applied >= CONFIG.maxApply) break;

        log.info(`Evaluating: "${job.job_title}" @ ${job.employer_name}`);

        // Get full description if missing
        if (!job.job_description && job._link) {
          job.job_description = await getFullDescription(page, job._link);
        }

        // AI match score
        let matchResult;
        try {
          matchResult = await scoreJob(job);
          log.ai(`Match: ${matchResult.matchScore}/100 (${matchResult.matchLevel}) — ${job.job_title}`);
        } catch (err) {
          log.warn(`AI scoring skipped: ${err.message}`);
          matchResult = { matchScore: 60, matchLevel: 'Fair' };
        }

        if (matchResult.matchScore < CONFIG.minScore) {
          log.skip(`Score ${matchResult.matchScore} < ${CONFIG.minScore} threshold — skipping`);
          stats.skipped++;
          continue;
        }

        // Generate cover letter
        let coverLetter = '';
        try {
          coverLetter = await getCoverLetter(job);
          log.ai(`Cover letter generated`);
        } catch (err) {
          log.warn(`Cover letter skipped: ${err.message}`);
        }

        // Apply
        const applied = await applyToJob(page, job, coverLetter);

        if (applied) {
          stats.applied++;
          await recordApplication(job, coverLetter, 'Naukri');
          log.success(`[${stats.applied}/${CONFIG.maxApply}] Saved: "${job.job_title}" @ ${job.employer_name}`);
        } else {
          stats.errors++;
        }

        // Human-like pause between applications
        await delay(6000 + Math.random() * 8000);
      }
    }
  } catch (err) {
    log.error(`Naukri bot crashed: ${err.message}`);
  } finally {
    await browser.close();
  }

  log.section(`Naukri Done | Applied: ${stats.applied} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`);
  return stats;
}

module.exports = { runNaukriBot };

if (require.main === module) {
  runNaukriBot().catch(err => console.error(err));
}
