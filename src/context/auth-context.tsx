
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { User, Role, Branch } from '@prisma/client';
import Cookies from 'js-cookie';
import { navItems } from '@/components/main-nav';

interface UserWithRole extends User {
  role: Role & { permissions?: string[] };
  branch?: Branch | null;
  isGuest?: boolean;
}

interface AuthContextType {
  user: UserWithRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  login: (data: any) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function ensureCsrfToken() {
  if (!Cookies.get('csrf_token') || !Cookies.get('csrf_secret')) {
    try {
      await api.get('/api/csrf-token');
    } catch (error) {
      console.error('[ensureCsrfToken] Failed to obtain CSRF token:', error);
      throw error;
    }
  }
}

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const logout = useCallback(async (options: { reason?: string; silent?: boolean } = {}) => {
    const { reason, silent = false } = options;
    const wasAuthenticated = !!user;
    
    setUser(null);

    try {
        await api.post('/api/auth/logout');
    } catch (error) {
        console.error("Logout API call failed, but user is logged out on client.", error);
    } finally {
        if (wasAuthenticated && !silent) {
            toast({ title: 'Logged Out', description: reason || 'You have been successfully logged out.' });
            window.location.href = '/login';
        } else if (wasAuthenticated) {
            window.location.href = '/login';
        }
    }
   
  }, [toast, user]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      logout({ reason: 'Your session has expired due to inactivity.' });
    }, IDLE_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    if (user && !isLoading) {
      const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
      
      const handleActivity = () => {
        resetIdleTimer();
      };
      
      activityEvents.forEach(event => {
        window.addEventListener(event, handleActivity);
      });
      
      resetIdleTimer();

      return () => {
        activityEvents.forEach(event => {
          window.removeEventListener(event, handleActivity);
        });
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
      };
    }
  }, [user, isLoading, resetIdleTimer]);
  
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      if (!data.user) {
        throw new Error('No user data in response');
      }
      setUser(data.user);
    } catch (error) {
      setUser(null);
    }
  }, []);


  useEffect(() => {
    async function initializeAuth() {
        try {
            await api.post('/api/auth/refresh');
            await refreshUser();
        } catch (error) {
            // This is expected if there's no valid refresh token.
            // Silently fail and set user to null.
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }
    initializeAuth();
  }, [refreshUser]);


  const login = async (data: any): Promise<boolean> => {
    setIsLoading(true);
    try {
      await api.post('/api/auth/login', {
        phoneNumber: data.phoneNumber,
        password: data.password,
      });

      // After successful login, refresh the user state from the server
      await refreshUser();

      // Ensure loading state is cleared so consumers (AuthGuard) can
      // immediately recognise the authenticated state without requiring
      // a manual page refresh.
      setIsLoading(false);
      
      toast({ title: 'Login Successful', description: 'Redirecting...' });

      // After refreshing, the `user` state will be updated, so we can check it
      // in the AuthGuard. The router.push will trigger the guard.
      // A small delay can help ensure the state is propagated.
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh(); // This might still be useful to reload server components
      }, 100);

      return true;

    } catch (error: any) {
      const serverMessage = error.response?.data?.message || 'An unknown error occurred during login.';
      toast({ variant: 'destructive', title: 'Login Failed', description: serverMessage });
      console.error('Login error:', serverMessage, error);
      setIsLoading(false); // Make sure to stop loading on error
      return false;
    } finally {
        // isLoading will be set to false in the initializeAuth effect after refresh
    }
  };
  
  const hasPermission = (permission: string) => {
    if (!user || !user.role || !user.role.permissions) return false;
    if (user.role.name === 'Admin') return true;

    try {
      const userPermissions = Array.isArray(user.role.permissions) ? user.role.permissions : JSON.parse(user.role.permissions);
      return Array.isArray(userPermissions) && userPermissions.includes(permission);
    } catch (error) {
      console.error('Failed to check permissions:', user.role.permissions, error);
      return false;
    }
  };

  const isAuthenticated = !isLoading && !!user;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, hasPermission, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
