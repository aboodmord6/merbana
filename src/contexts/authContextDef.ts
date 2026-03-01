import { createContext } from 'react';
import type { StoreUser } from '../types/types';

export interface AuthContextType {
  activeUser: StoreUser | null;
  login: (user: StoreUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
