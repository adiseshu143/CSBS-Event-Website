/**
 * ProtectedRoute — redirects unauthenticated users to /admin login.
 * Waits for auth state to initialize before making redirect decisions.
 */
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { isLoggedIn, isLoading } = useAdminAuth();

  // Show a minimal loader while auth state initializes — prevents
  // a false redirect to /admin before localStorage is read.
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div
          style={{
            width: 36,
            height: 36,
            border: '3px solid #e8e8f0',
            borderTopColor: '#2e3190',
            borderRadius: '50%',
            animation: 'protectedSpin .7s linear infinite',
          }}
        />
        <style>{`@keyframes protectedSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return isLoggedIn ? <>{children}</> : <Navigate to="/admin" replace />;
}
