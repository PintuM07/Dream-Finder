/**
 * linkedin-bot.js
 * 
 * Automates LinkedIn job search and Easy Apply.
 * 
 * Flow:
 *  1. Login with credentials
 *  2. Search jobs matching keywords + location
 *  3. For each job: score with Gemini AI
 *  4. If score >= MIN_MATCH_SCORE: fill Easy Apply form and submit
 *  5. Record application in dashboard tracker
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { chromium } = require('playwright');
const log = require('./logger');
const { getProfile, scoreJob, getCoverLetter, recordApplication } = require('./ai-matcher');
const { analyzeAndFillForm, attachCV } = require('./form-filler');

const CONFIG = {
  email:        process.env.LINKEDIN_EMAIL,
  password:     process.env.LINKEDIN_PASSWORD,
  keywords:     (process.env.JOB_KEYWORDS || 'Software Developer').split(',').map(k => k.trim()),
  location:     process.env.JOB_LOCATION || 'India',
  minScore:     parseInt(process.env.MIN_MATCH_SCORE || '50'),
  maxApply:     parseInt(process.env.MAX_APPLY_PER_RUN || '10'),
  headless:     process.env.HEADLESS !== 'false',
};

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await page.fill(selector, '');
  for (const char of text) {
    await page.type(selector, char, { delay: 40 + Math.random() * 60 });
  }
}

async function login(page) {
  log.info('Navigating to LinkedIn login...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  await delay(1500);

  await humanType(page, '#username', CONFIG.email);
  await humanType(page, '#password', CONFIG.password);
  await page.click('[type="submit"]');

  // Wait for redirect to feed or handle captcha
  try {
    await page.waitForURL('**/feed/**', { timeout: 15000 });
    log.success('LinkedIn login successful!');
    return true;
  } catch {
    // Check if we need OTP / captcha
    const url = page.url();
    if (url.includes('checkpoint') || url.includes('challenge')) {
      log.warn('LinkedIn requires verification (CAPTCHA / OTP). Please complete it manually in the browser window...');
      log.info('Waiting up to 60 seconds for you to complete the verification...');
      try {
        await page.waitForURL('**/feed/**', { timeout: 60000 });
        log.success('Verification completed! Continuing automation...');
        return true;
      } catch {
        log.error('Verification timed out. Skipping LinkedIn.');
        return false;
      }
    }
    log.error('LinkedIn login failed. Check your credentials in automation/.env');
    return false;
  }
}

async function searchJobs(page, keyword) {
  log.info(`Searching LinkedIn jobs: "${keyword}" in "${CONFIG.location}"`);
  
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(CONFIG.location)}&f_AL=true&f_WT=2%2C1`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await delay(2000);

  // Collect job cards
  const jobs = [];
  try {
    await page.waitForSelector('.jobs-search-results__list-item', { timeout: 8000 });
    const jobCards = await page.$$('.jobs-search-results__list-item');

    for (const card of jobCards.slice(0, 15)) {
      try {
        const title = await card.$eval('.job-card-list__title', el => el.innerText.trim()).catch(() => '');
        const company = await card.$eval('.job-card-container__primary-description', el => el.innerText.trim()).catch(() => '');
        const location = await card.$eval('.job-card-container__metadata-item', el => el.innerText.trim()).catch(() => '');
        const jobId = await card.getAttribute('data-job-id').catch(() => null) || Date.now().toString();
        const link = await card.$eval('a.job-card-list__title', el => el.href).catch(() => null);
        const easyApply = await card.$('.job-card-container__apply-method').then(el => el?.innerText()).catch(() => '');

        if (title && company) {
          jobs.push({
            job_id: `linkedin_${jobId}`,
            job_title: title,
            employer_name: company,
            job_city: location,
            job_country: 'IN',
            job_is_remote: location.toLowerCase().includes('remote'),
            job_employment_type: 'FULLTIME',
            job_description: '',
            _link: link,
            _easyApply: (easyApply || '').toLowerCase().includes('easy'),
          });
        }
      } catch { /* skip malformed card */ }
    }
  } catch {
    log.warn(`No job cards found for "${keyword}" on LinkedIn.`);
  }

  log.info(`Found ${jobs.length} LinkedIn jobs for "${keyword}"`);
  return jobs;
}

async function getJobDescription(page, jobLink) {
  try {
    await page.goto(jobLink, { waitUntil: 'domcontentloaded' });
    await delay(1500);
    const desc = await page.$eval('.jobs-description__content', el => el.innerText.trim()).catch(() => '');
    return desc.substring(0, 2000);
  } catch {
    return '';
  }
}

async function fillEasyApply(page, profile, coverLetter, jobTitle) {
  try {
    // Click Easy Apply button
    const applyBtn = await page.$('button.jobs-apply-button:has-text("Easy Apply"), .jobs-apply-button');
    if (!applyBtn) {
      log.warn(`No Easy Apply button found for "${jobTitle}"`);
      return false;
    }
    await applyBtn.click();
    await delay(1500);

    // Handle multi-step Easy Apply modal
    let stepCount = 0;
    while (stepCount < 10) {
      stepCount++;
      await delay(1000);

      // Analyze page, attach CV, fill personal details & answer questions
      await attachCV(page, profile);
      await analyzeAndFillForm(page, profile, coverLetter);

      // Check for "Next", "Review", or "Submit" button
      const nextBtn = await page.$('button:has-text("Next"), button[aria-label*="Next"]');
      const reviewBtn = await page.$('button:has-text("Review"), button[aria-label*="Review"]');
      const submitBtn = await page.$('button:has-text("Submit application"), button[aria-label*="Submit"]');

      if (submitBtn) {
        await submitBtn.click();
        await delay(2000);
        // Dismiss confirmation modal
        const dismissBtn = await page.$('button:has-text("Done"), button[aria-label*="Dismiss"]');
        if (dismissBtn) await dismissBtn.click();
        log.apply(`Easy Apply SUBMITTED for "${jobTitle}"`);
        return true;
      } else if (reviewBtn) {
        await reviewBtn.click();
      } else if (nextBtn) {
        await nextBtn.click();
      } else {
        // No navigation button found — might be stuck, escape
        await page.keyboard.press('Escape');
        log.warn(`Easy Apply flow stuck at step ${stepCount} for "${jobTitle}"`);
        return false;
      }
    }

    return false;
  } catch (err) {
    log.error(`Easy Apply error: ${err.message}`);
    try { await page.keyboard.press('Escape'); } catch {}
    return false;
  }
}

async function runLinkedInBot() {
  log.section('LinkedIn Auto-Apply Bot Starting');

  if (!CONFIG.email || CONFIG.email.includes('your_')) {
    log.error('LinkedIn credentials not set in automation/.env — skipping LinkedIn.');
    return { applied: 0, skipped: 0, errors: 0 };
  }

  const profile = await getProfile().catch(() => null);
  if (!profile?.setup) {
    log.error('Profile not configured. Please save your profile at http://localhost:3000/profile first.');
    return { applied: 0, skipped: 0, errors: 0 };
  }

  log.info(`Candidate: ${profile.name} | ${profile.currentTitle} | ${profile.yearsOfExperience} yrs`);

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.headless ? 0 : 50,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  // Stealth context — hide automation fingerprints
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-IN',
  });

  const page = await context.newPage();

  // Remove webdriver flag
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

        // Fetch full description
        if (job._link) {
          job.job_description = await getJobDescription(page, job._link);
        }

        // Skip non-Easy Apply jobs on LinkedIn
        if (!job._easyApply) {
          log.skip(`Not Easy Apply — skipping "${job.job_title}"`);
          stats.skipped++;
          continue;
        }

        // Score with Gemini AI
        let matchResult;
        try {
          matchResult = await scoreJob(job);
          log.ai(`Match score: ${matchResult.matchScore}/100 (${matchResult.matchLevel}) — ${job.job_title}`);
        } catch (err) {
          log.warn(`AI scoring failed: ${err.message}`);
          matchResult = { matchScore: 60, matchLevel: 'Fair' };
        }

        if (matchResult.matchScore < CONFIG.minScore) {
          log.skip(`Score ${matchResult.matchScore} < threshold ${CONFIG.minScore} — skipping`);
          stats.skipped++;
          continue;
        }

        // Generate cover letter
        let coverLetter = '';
        try {
          coverLetter = await getCoverLetter(job);
          log.ai(`Cover letter generated (${coverLetter.length} chars)`);
        } catch (err) {
          log.warn(`Cover letter skipped: ${err.message}`);
        }

        // Navigate to job and apply
        if (job._link) await page.goto(job._link, { waitUntil: 'domcontentloaded' });
        await delay(2000);

        const applied = await fillEasyApply(page, profile, coverLetter, job.job_title);

        if (applied) {
          stats.applied++;
          await recordApplication(job, coverLetter, 'LinkedIn');
          log.success(`[${stats.applied}/${CONFIG.maxApply}] Applied: "${job.job_title}" @ ${job.employer_name}`);
        } else {
          stats.errors++;
        }

        // Human-like delay between applications (8–15 seconds)
        await delay(8000 + Math.random() * 7000);
      }
    }
  } catch (err) {
    log.error(`LinkedIn bot crashed: ${err.message}`);
  } finally {
    await browser.close();
  }

  log.section(`LinkedIn Done | Applied: ${stats.applied} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`);
  return stats;
}

module.exports = { runLinkedInBot };

// Run directly
if (require.main === module) {
  runLinkedInBot().catch(err => console.error(err));
}
