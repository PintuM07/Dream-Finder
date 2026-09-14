const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
const profilePath = path.join(dataDir, 'profile.json');
const applicationsPath = path.join(dataDir, 'applications.json');

if (!fs.existsSync(profilePath)) {
  fs.writeFileSync(profilePath, JSON.stringify({ setup: false }));
}
if (!fs.existsSync(applicationsPath)) {
  fs.writeFileSync(applicationsPath, JSON.stringify([]));
}

// Routes
const jobsRouter = require('./routes/jobs');
const aiRouter = require('./routes/ai');
const profileRouter = require('./routes/profile');
const applicationsRouter = require('./routes/applications');
const accountsRouter = require('./routes/accounts');

app.use('/api/jobs', jobsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/profile', profileRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/accounts', accountsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here',
    groq: !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here',
    rapidapi: !!process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'your_rapidapi_key_here'
  });
});

// Global error handler — prevents server crashes on unhandled route errors
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: err.message });
});

// Catch unhandled promise rejections so server never crashes
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err.message);
});

app.listen(PORT, () => {
  console.log(`🚀 Job Agent API running on http://localhost:${PORT}`);
  console.log(`   Gemini AI: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   RapidAPI:  ${process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'your_rapidapi_key_here' ? '✅ Configured' : '⚠️  Using mock jobs'}`);
});
