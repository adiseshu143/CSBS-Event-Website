/**
 * ProtectedRoute — redirects unauthenticated users to /admin login.
 */
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { isLoggedIn } = useAdminAuth();
  return isLoggedIn ? <>{children}</> : <Navigate to="/admin" replace />;
}
