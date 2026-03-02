/**
 * Admin Auth Context
 * Provides authentication state and actions to the entire admin section.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  getSession,
  saveSession,
  clearSession,
  type AdminSession,
} from '../services/adminAuthService';

interface AdminAuthContextType {
  session: AdminSession | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (session: AdminSession) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  // Synchronous initializer — reads localStorage before first render
  // so ProtectedRoute sees the real auth state immediately.
  const [session, setSession] = useState<AdminSession | null>(() => getSession());
  const [isLoading, setIsLoading] = useState(true);

  // Mark loading complete after first render
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const login = useCallback((newSession: AdminSession) => {
    saveSession(newSession);
    setSession(newSession);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        isLoggedIn: session !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
