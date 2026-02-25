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
  login: (session: AdminSession) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);

  // On mount, check for existing session
  useEffect(() => {
    const existing = getSession();
    if (existing) {
      setSession(existing);
    }
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
