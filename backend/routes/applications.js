const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('crypto');

const applicationsPath = path.join(__dirname, '../data/applications.json');

function getApplications() {
  try {
    return JSON.parse(fs.readFileSync(applicationsPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveApplications(apps) {
  fs.writeFileSync(applicationsPath, JSON.stringify(apps, null, 2));
}

// GET /api/applications
router.get('/', (req, res) => {
  try {
    const apps = getApplications();
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/applications - Add a new application
router.post('/', (req, res) => {
  try {
    const apps = getApplications();
    const newApp = {
      id: Date.now().toString(),
      ...req.body,
      status: 'Applied',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    apps.unshift(newApp);
    saveApplications(apps);
    res.json({ success: true, application: newApp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/applications/:id - Update application status
router.patch('/:id', (req, res) => {
  try {
    const apps = getApplications();
    const idx = apps.findIndex(a => a.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Application not found' });
    }
    apps[idx] = { ...apps[idx], ...req.body, updatedAt: new Date().toISOString() };
    saveApplications(apps);
    res.json({ success: true, application: apps[idx] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', (req, res) => {
  try {
    let apps = getApplications();
    apps = apps.filter(a => a.id !== req.params.id);
    saveApplications(apps);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
