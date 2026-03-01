import { useContext } from 'react';
import { AuthContext } from '../contexts/authContextDef';
import type { AuthContextType } from '../contexts/authContextDef';

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
