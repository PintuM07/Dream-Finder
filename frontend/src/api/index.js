import axios from 'axios';

const BASE_URL = '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60s — Gemini AI job search can take 10-20s
});

// Health check
export const checkHealth = () => api.get('/health');

// Profile
export const getProfile = () => api.get('/profile');
export const saveProfile = (data) => api.post('/profile', data);

// Jobs
export const searchJobs = (params) => api.get('/jobs/search', { params });

// AI
export const matchJob = (job) => api.post('/ai/match', { job });
export const generateCoverLetter = (job) => api.post('/ai/cover-letter', { job });
export const parseResume = (resumeText) => api.post('/ai/parse-resume', { resumeText });
export const getInterviewQuestions = (job) => api.post('/ai/interview-questions', { job });

// Applications
export const getApplications = () => api.get('/applications');
export const addApplication = (data) => api.post('/applications', data);
export const updateApplication = (id, data) => api.patch(`/applications/${id}`, data);
export const deleteApplication = (id) => api.delete(`/applications/${id}`);

// Accounts / Platform Credentials
export const getAccounts = () => api.get('/accounts');
export const saveAccount = (data) => api.post('/accounts', data);
export const deleteAccount = (id) => api.delete(`/accounts/${id}`);
export const runAutomation = (platform) => api.post('/accounts/run-automation', { platform });

export default api;
