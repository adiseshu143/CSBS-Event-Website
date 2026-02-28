/**
 * Admin Dashboard — main admin page with section navigation.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { getRegistrationStatus, setRegistrationStatus } from '../../services';
import type { RegistrationStatus } from '../../services';
import Registrations from '../../components/Registrations';
import EventManagement from './EventManagement';
import './AdminDashboard.css';

type DashView = 'home' | 'registrations' | 'events';

export default function AdminDashboard() {
  const { session, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<DashView>('home');

  /* --- Registration status state --- */
  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(null);
  const [regStatusLoading, setRegStatusLoading] = useState(true);
  const [regToggling, setRegToggling] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const loadRegStatus = useCallback(async () => {
    try {
      setRegStatusLoading(true);
      const status = await getRegistrationStatus();
      setRegStatus(status);
    } catch (err) {
      console.error('Failed to load registration status:', err);
    } finally {
      setRegStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegStatus();
  }, [loadRegStatus]);

  const handleToggleRegistration = async () => {
    if (!regStatus || !session?.email) return;
    setShowConfirmDialog(false);
    setRegToggling(true);
    try {
      const newStatus = await setRegistrationStatus(
        !regStatus.registrationOpen,
        session.email,
      );
      setRegStatus(newStatus);
    } catch (err) {
      console.error('Failed to toggle registration status:', err);
    } finally {
      setRegToggling(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin');
  };

  return (
    <div className="admin-dash-page">
      <header className="admin-dash-header">
        <div className="admin-dash-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11.5 14.5 16 9.5"/>
          </svg>
          <span>Admin Dashboard</span>
        </div>
        <div className="admin-dash-user">
          <span className="admin-dash-name">{session?.name || 'Admin'}</span>
          <button className="admin-dash-logout" onClick={handleLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main className="admin-dash-content">
        {view === 'home' ? (
          <>
            <div className="admin-dash-welcome">
              <h1>Welcome, {session?.name || 'Admin'}!</h1>
              <p>You are logged in as <strong>{session?.email}</strong></p>
            </div>

            {/* --- Registration Status Control --- */}
            <div className="reg-status-control">
              <div className="reg-status-info">
                <div className="reg-status-header">
                  <span className="reg-status-icon">
                    {regStatusLoading ? '⏳' : regStatus?.registrationOpen ? '🟢' : '🔴'}
                  </span>
                  <div>
                    <h3 className="reg-status-title">Registration Status</h3>
                    <p className="reg-status-desc">
                      {regStatusLoading
                        ? 'Loading status...'
                        : regStatus?.registrationOpen
                          ? 'Registrations are currently OPEN — users can submit responses.'
                          : 'Registrations are currently CLOSED — no new responses will be accepted.'}
                    </p>
                    {regStatus?.changedBy && !regStatusLoading && (
                      <p className="reg-status-meta">
                        Last changed by <strong>{regStatus.changedBy}</strong>
                        {regStatus.changedAt && (
                          <> on {new Date(regStatus.changedAt).toLocaleString()}</>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  className={`reg-status-toggle-btn ${regStatus?.registrationOpen ? 'is-open' : 'is-closed'}`}
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={regStatusLoading || regToggling}
                >
                  {regToggling
                    ? 'Updating...'
                    : regStatusLoading
                      ? 'Loading...'
                      : regStatus?.registrationOpen
                        ? '⏸ Stop Registrations'
                        : '▶ Start Registrations'}
                </button>
              </div>
            </div>

            {/* --- Confirmation Dialog --- */}
            {showConfirmDialog && (
              <div className="reg-confirm-overlay" onClick={() => setShowConfirmDialog(false)}>
                <div className="reg-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                  <div className="reg-confirm-icon">
                    {regStatus?.registrationOpen ? '⏸️' : '▶️'}
                  </div>
                  <h3>
                    {regStatus?.registrationOpen
                      ? 'Stop Registrations?'
                      : 'Start Registrations?'}
                  </h3>
                  <p>
                    {regStatus?.registrationOpen
                      ? 'This will immediately close new registrations. Users will see a "Registrations Closed" message and no data will be stored in the spreadsheet.'
                      : 'This will re-open registrations. Users will be able to submit new responses again.'}
                  </p>
                  <div className="reg-confirm-actions">
                    <button
                      className="reg-confirm-cancel"
                      onClick={() => setShowConfirmDialog(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className={`reg-confirm-ok ${regStatus?.registrationOpen ? 'danger' : 'success'}`}
                      onClick={handleToggleRegistration}
                    >
                      {regStatus?.registrationOpen ? 'Yes, Stop' : 'Yes, Start'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="admin-dash-grid">
              <div className="admin-dash-card" onClick={() => setView('registrations')}>
                <div className="admin-dash-card-icon registrations-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3>Registrations</h3>
                <p>View and manage event registrations</p>
              </div>

          <div className="admin-dash-card" onClick={() => setView('events')}>
            <div className="admin-dash-card-icon events-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h3>Events</h3>
            <p>Create and manage events</p>
          </div>

          <div className="admin-dash-card">
            <div className="admin-dash-card-icon analytics-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10"/>
                <line x1="18" y1="20" x2="18" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="16"/>
              </svg>
            </div>
            <h3>Analytics</h3>
            <p>Registration stats and insights</p>
          </div>
            </div>
          </>
        ) : view === 'events' ? (
          <EventManagement onBack={() => setView('home')} />
        ) : (
          <Registrations onBack={() => setView('home')} />
        )}
      </main>
    </div>
  );
}
