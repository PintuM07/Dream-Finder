const express = require('express');
const router = express.Router();
const { matchJobToProfile, generateCoverLetter, parseResumeText, generateInterviewQuestions } = require('../services/gemini');
const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, '../data/profile.json');

function getProfile() {
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch {
    return { setup: false };
  }
}

// POST /api/ai/match - Match a job against the user's profile
router.post('/match', async (req, res) => {
  try {
    const { job } = req.body;
    const profile = getProfile();

    if (!profile.setup) {
      return res.status(400).json({ error: 'Profile not set up yet. Please complete your profile first.' });
    }

    const matchData = await matchJobToProfile(job, profile);
    res.json(matchData);
  } catch (error) {
    console.error('[POST /api/ai/match]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/cover-letter - Generate a cover letter
router.post('/cover-letter', async (req, res) => {
  try {
    const { job } = req.body;
    const profile = getProfile();

    if (!profile.setup) {
      return res.status(400).json({ error: 'Profile not set up yet.' });
    }

    const coverLetter = await generateCoverLetter(job, profile);
    res.json({ coverLetter });
  } catch (error) {
    console.error('[POST /api/ai/cover-letter]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/parse-resume - Parse resume text
router.post('/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText) {
      return res.status(400).json({ error: 'resumeText is required' });
    }

    const parsed = await parseResumeText(resumeText);
    res.json(parsed);
  } catch (error) {
    console.error('[POST /api/ai/parse-resume]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/interview-questions - Generate interview questions for a job
router.post('/interview-questions', async (req, res) => {
  try {
    const { job } = req.body;
    const profile = getProfile();

    if (!profile.setup) {
      return res.status(400).json({ error: 'Profile not set up yet.' });
    }

    const questions = await generateInterviewQuestions(job, profile);
    res.json({ questions });
  } catch (error) {
    console.error('[POST /api/ai/interview-questions]', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
