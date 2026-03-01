import { useState, useEffect, type ReactNode } from 'react';
import type { StoreUser } from '../types/types';
import { logActivity } from '../services/database';
import { AuthContext } from './authContextDef';

const SESSION_KEY = 'merbana_active_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUser] = useState<StoreUser | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (activeUser) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(activeUser));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [activeUser]);

  function login(user: StoreUser) {
    setActiveUser(user);
    logActivity(user.id, user.name, 'تسجيل دخول');
  }

  function logout() {
    if (activeUser) {
      logActivity(activeUser.id, activeUser.name, 'تسجيل خروج');
    }
    setActiveUser(null);
  }

  return (
    <AuthContext.Provider value={{ activeUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
