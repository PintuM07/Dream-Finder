import React, { createContext, useContext, useState, useEffect } from 'react';
import { getProfile, saveProfile as apiSaveProfile, checkHealth } from '../api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ gemini: false, rapidapi: false, connected: false });

  useEffect(() => {
    loadProfile();
    checkApiHealth();
  }, []);

  async function checkApiHealth() {
    try {
      const res = await checkHealth();
      setApiStatus({ ...res.data, connected: true });
    } catch {
      setApiStatus({ gemini: false, rapidapi: false, connected: false });
    }
  }

  async function loadProfile() {
    try {
      const res = await getProfile();
      setProfile(res.data);
    } catch {
      setProfile({ setup: false });
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile(data) {
    const res = await apiSaveProfile(data);
    setProfile(res.data.profile);
    return res.data;
  }

  return (
    <AppContext.Provider value={{ profile, profileLoading, saveProfile, loadProfile, apiStatus, checkApiHealth }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
