import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import JobSearch from './pages/JobSearch';
import Applications from './pages/Applications';
import Accounts from './pages/Accounts';
import Profile from './pages/Profile';

export default function App() {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobSearch />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
