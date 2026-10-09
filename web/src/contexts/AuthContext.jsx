import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'demo_v1.auth';

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.kind === 'admin' || parsed.kind === 'reader') && parsed.id) return parsed;
  } catch (_) {}
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStored());
  const [userList, setUserList] = useState({ admins: [], readers: [] });
  const [loadingList, setLoadingList] = useState(false);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await authApi.users();
      setUserList(data);
      // If no user chosen, default to first admin
      if (!user) {
        if (data.admins && data.admins.length) {
          const first = data.admins[0];
          setUser({ kind: 'admin', id: first.id, name: first.name, username: first.username });
        }
      }
    } catch (e) {
      console.warn('load users failed', e);
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  }, [user]);

  const switchToReader = useCallback((readerId) => {
    const r = userList.readers.find((x) => x.id === Number(readerId));
    if (!r) return;
    setUser({ kind: 'reader', id: r.id, name: r.name, card_no: r.card_no });
  }, [userList]);

  const switchToAdmin = useCallback((adminId) => {
    const a = userList.admins.find((x) => x.id === Number(adminId));
    if (!a) return;
    setUser({ kind: 'admin', id: a.id, name: a.name, username: a.username });
  }, [userList]);

  const isAdmin = user?.kind === 'admin';
  const isReader = user?.kind === 'reader';

  const value = useMemo(() => ({
    user,
    setUser,
    userList,
    loadingList,
    switchToReader,
    switchToAdmin,
    isAdmin,
    isReader,
    refreshList,
  }), [user, userList, loadingList, switchToReader, switchToAdmin, isAdmin, isReader, refreshList]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export default AuthContext;
