const BACKEND_URL = 'http://localhost:5000/api';

async function autoApplyJobs(query = 'React Developer', location = 'Remote', limit = 5, minMatchScore = 40) {
  console.log(`🚀 Starting Auto-Apply Automation Script...`);
  console.log(`Criteria: Query="${query}", Location="${location}", Max=${limit}, MinScore=${minMatchScore}\n`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    const health = await healthRes.json();
    if (health.status !== 'ok') {
      console.error('❌ Backend service is offline.');
      return;
    }

    // 2. Check profile
    const profileRes = await fetch(`${BACKEND_URL}/profile`);
    const profile = await profileRes.json();
    if (!profile.setup) {
      console.log('⚠️ Profile not configured! Please complete profile setup at http://localhost:3000/profile');
      return;
    }
    console.log(`👤 Active Candidate Profile: ${profile.name} (${profile.currentTitle || 'N/A'})\n`);

    // 3. Search jobs
    console.log(`🔍 Searching jobs for "${query}"...`);
    const searchRes = await fetch(`${BACKEND_URL}/jobs/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`);
    const searchData = await searchRes.json();
    const jobs = searchData.jobs || [];
    console.log(`Found ${jobs.length} total jobs.\n`);

    let appliedCount = 0;

    // 4. Loop & apply automatically
    for (let i = 0; i < Math.min(limit, jobs.length); i++) {
      const job = jobs[i];
      console.log(`[${i + 1}/${Math.min(limit, jobs.length)}] Processing: "${job.job_title}" @ ${job.employer_name}`);

      // Evaluate AI Match (if Gemini enabled)
      let score = 100;
      try {
        const matchRes = await fetch(`${BACKEND_URL}/ai/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job })
        });
        const matchData = await matchRes.json();
        if (matchData.matchScore) {
          score = matchData.matchScore;
          console.log(`   📊 AI Match Score: ${score}/100 (${matchData.matchLevel})`);
        }
      } catch (err) {
        console.log(`   ℹ️ AI match evaluation skipped.`);
      }

      if (score < minMatchScore) {
        console.log(`   ⏩ Skipped: Match score below minimum threshold (${minMatchScore}).\n`);
        continue;
      }

      // Generate AI Cover Letter via Gemini
      console.log(`   ✍️ Generating personalized cover letter via Gemini...`);
      let coverLetter = '';
      try {
        const clRes = await fetch(`${BACKEND_URL}/ai/cover-letter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job })
        });
        const clData = await clRes.json();
        coverLetter = clData.coverLetter || '';
      } catch (err) {
        console.log(`   ⚠️ Default/fallback cover letter will be attached.`);
      }

      // Save application
      const applyRes = await fetch(`${BACKEND_URL}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...job,
          coverLetter,
          status: 'Applied'
        })
      });
      const applyData = await applyRes.json();

      if (applyData.success) {
        appliedCount++;
        console.log(`   🎉 SUCCESS: Job application submitted & recorded in dashboard!`);
      }

      console.log('--------------------------------------------------');
      // Delay 1.5 seconds between applications
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n✨ Automation complete! Successfully applied to ${appliedCount} jobs.`);
    console.log(`View all submitted applications in your tracker: http://localhost:3000/applications`);

  } catch (err) {
    console.error('❌ Automation Error:', err.message);
  }
}

// Run automation
autoApplyJobs('React Developer', 'Remote', 5, 40);
