const express = require('express');
const router = express.Router();
const { searchJobs } = require('../services/jobSearch');

// GET /api/jobs/search
router.get('/search', async (req, res) => {
  try {
    const { query, location, remoteOnly, employmentType, page } = req.query;
    
    const result = await searchJobs({
      query,
      location,
      remoteOnly: remoteOnly === 'true',
      employmentType,
      page: parseInt(page) || 1,
    });

    res.json(result);
  } catch (error) {
    console.error('[GET /api/jobs/search]', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
