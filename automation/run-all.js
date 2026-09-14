/**
 * run-all.js
 *
 * Unified runner for the Job Application Automation Suite.
 *
 * Usage:
 *   node automation/run-all.js                  → run once (both LinkedIn + Naukri)
 *   node automation/run-all.js --linkedin        → LinkedIn only
 *   node automation/run-all.js --naukri          → Naukri only
 *   node automation/run-all.js --schedule        → run every N hours automatically
 *   node automation/run-all.js --schedule --interval=6  → run every 6 hours
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const log = require('./logger');

const args = process.argv.slice(2);
const runLinkedIn = !args.includes('--naukri');
const runNaukri   = !args.includes('--linkedin');
const scheduled   = args.includes('--schedule');
const intervalArg = args.find(a => a.startsWith('--interval='));
const intervalHrs = intervalArg ? parseFloat(intervalArg.split('=')[1]) : 4;
const intervalMs  = intervalHrs * 60 * 60 * 1000;

async function runOnce() {
  const startTime = Date.now();
  const totalStats = { linkedin: null, naukri: null };

  log.section('🤖 Job Application Automation Suite');
  log.info(`Log file: ${log.logFile}`);
  log.info(`Platforms: ${[runLinkedIn && 'LinkedIn', runNaukri && 'Naukri'].filter(Boolean).join(' + ')}`);
  log.info(`Min AI match score: ${process.env.MIN_MATCH_SCORE || 50}`);
  log.info(`Keywords: ${process.env.JOB_KEYWORDS || 'Software Developer'}`);
  log.info(`Location: ${process.env.JOB_LOCATION || 'India'}`);
  log.info(`Max apply per platform: ${process.env.MAX_APPLY_PER_RUN || 10}`);
  console.log();

  // ── LinkedIn ─────────────────────────────────────────────────────
  if (runLinkedIn) {
    try {
      const { runLinkedInBot } = require('./linkedin-bot');
      totalStats.linkedin = await runLinkedInBot();
    } catch (err) {
      log.error(`LinkedIn bot failed to start: ${err.message}`);
      totalStats.linkedin = { applied: 0, skipped: 0, errors: 1 };
    }
  }

  // ── Naukri ───────────────────────────────────────────────────────
  if (runNaukri) {
    try {
      const { runNaukriBot } = require('./naukri-bot');
      totalStats.naukri = await runNaukriBot();
    } catch (err) {
      log.error(`Naukri bot failed to start: ${err.message}`);
      totalStats.naukri = { applied: 0, skipped: 0, errors: 1 };
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const totalApplied =
    (totalStats.linkedin?.applied || 0) +
    (totalStats.naukri?.applied || 0);

  log.section('📊 Run Summary');
  if (totalStats.linkedin) {
    log.info(`LinkedIn → Applied: ${totalStats.linkedin.applied} | Skipped: ${totalStats.linkedin.skipped} | Errors: ${totalStats.linkedin.errors}`);
  }
  if (totalStats.naukri) {
    log.info(`Naukri   → Applied: ${totalStats.naukri.applied}   | Skipped: ${totalStats.naukri.skipped}   | Errors: ${totalStats.naukri.errors}`);
  }
  log.success(`Total applications submitted this run: ${totalApplied}`);
  log.info(`Time taken: ${elapsed}s`);
  log.info(`View all applications: http://localhost:3000/applications`);

  return totalStats;
}

async function main() {
  if (scheduled) {
    log.section(`⏰ Scheduler Mode — Running every ${intervalHrs} hour(s)`);
    log.info('Press Ctrl+C to stop the scheduler.\n');

    // Run immediately, then on interval
    await runOnce();

    setInterval(async () => {
      log.section(`⏰ Scheduled run triggered`);
      await runOnce();
    }, intervalMs);

    // Keep process alive
    process.on('SIGINT', () => {
      log.info('\nScheduler stopped by user.');
      process.exit(0);
    });
  } else {
    await runOnce();
  }
}

main().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
