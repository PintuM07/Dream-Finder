const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, '../data/profile.json');

// GET /api/profile
router.get('/', (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    res.json(profile);
  } catch {
    res.json({ setup: false });
  }
});

// POST /api/profile - Save/update profile
router.post('/', (req, res) => {
  try {
    const profile = { ...req.body, setup: true, updatedAt: new Date().toISOString() };
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
