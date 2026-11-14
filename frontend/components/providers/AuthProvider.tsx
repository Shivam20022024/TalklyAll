'use client';

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { getAuthToken, fetchApi, removeAuthToken, setAuthToken } from '@/lib/api';

export type Role = 'super_admin' | 'company_admin' | string;

export function normalizeRole(raw?: string): Role {
  const k = (raw || '').trim().toLowerCase();
  if (['super_admin', 'superadmin', 'super-admin'].includes(k)) return 'super_admin';
  if (['company_admin', 'companyadmin', 'company-admin'].includes(k)) return 'company_admin';
  return raw || 'company_admin';
}

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  company_id: string | null;
  company_name: string;
  industry?: string;
}

export interface CompanyContext {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSuperAdmin: boolean;
  companyContext: CompanyContext | null;
  setCompanyContext: (ctx: CompanyContext | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const CTX_KEY = 'sa_company_context';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isSuperAdmin: false,
  companyContext: null,
  setCompanyContext: () => {},
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyContext, setCompanyContextState] = useState<CompanyContext | null>(null);

  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const userData = await fetchApi('/api/v1/auth/me');
        setUser({ ...userData, role: normalizeRole(userData.role) });
      } catch (error) {
        console.error('Auth verification failed', error);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CTX_KEY);
      if (raw) setCompanyContextState(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const userData = await fetchApi('/api/v1/auth/me');
          setUser({ ...userData, role: normalizeRole(userData.role) });
        } catch (error: any) {
          console.error('Auth verification failed', error);
          // Only wipe session if the server explicitly rejected credentials (401/403)
          if (error?.message === 'Unauthorized' || error?.status === 401 || error?.status === 403) {
            removeAuthToken();
            setUser(null);
          }
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const setCompanyContext = useCallback((ctx: CompanyContext | null) => {
    setCompanyContextState((prev) => {
      if (prev?.id === ctx?.id && prev?.name === ctx?.name) return prev;
      return ctx;
    });
    try {
      if (ctx) localStorage.setItem(CTX_KEY, JSON.stringify(ctx));
      else localStorage.removeItem(CTX_KEY);
    } catch {}
  }, []);

  const login = (token: string, userData: User) => {
    setAuthToken(token);
    setUser({ ...userData, role: normalizeRole(userData.role) });
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
    setCompanyContext(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const isSuperAdmin = normalizeRole(user?.role) === 'super_admin';

  return (
    <AuthContext.Provider
      value={{ user, loading, isSuperAdmin, companyContext, setCompanyContext, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
