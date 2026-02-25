import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import ProtectedRoute from './components/ProtectedRoute';

/* ── Lazy-loaded route components (code-splitting) ─── */
const EventRegistration = lazy(() => import('./components/EventRegistration'));
const EventPage = lazy(() => import('./pages/public/EventPage'));
const AdminAuth = lazy(() => import('./pages/admin/AdminAuth'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

/* Minimal spinner shown while chunks load */
const RouteLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
    <div
      style={{
        width: 36,
        height: 36,
        border: '3px solid #e8e8f0',
        borderTopColor: '#2e3190',
        borderRadius: '50%',
        animation: 'routeSpin .7s linear infinite',
      }}
    />
    <style>{`@keyframes routeSpin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<EventRegistration />} />
          <Route path="/event/:id" element={<EventPage />} />

          {/* Admin Auth */}
          <Route path="/admin" element={<AdminAuth />} />

          {/* Protected Admin Dashboard */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
        </Suspense>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}

export default App;
