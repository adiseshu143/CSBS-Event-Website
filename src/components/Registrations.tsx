import { useState, useEffect, useCallback } from 'react';
import './Registrations.css';

/* ===== Types ===== */
interface Member {
  name: string;
  email: string;
  phone: string;
  branch: string;
  section: string;
  isLeader: boolean;
}

interface Registration {
  serialNo: number;
  timestamp: string;
  registrationId: string;
  ticketNumber: string;
  teamName: string;
  eventName: string;
  teamSize: number;
  members: Member[];
  registeredBy: string;
}

interface RegistrationsProps {
  onBack: () => void;
}

/* ===== Constants ===== */
const REFRESH_INTERVAL_MS = 30_000; // Auto-refresh every 30 seconds

/* ===== Helper ===== */
const getGASUrl = (): string => {
  const url =
    import.meta.env.VITE_ADMIN_AUTH_GAS_URL ||
    import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (!url) throw new Error('Google Apps Script URL not configured');
  return url;
};

/** Check whether a registration row contains meaningful data */
const hasData = (reg: Registration): boolean => {
  // Must have at least a registration ID or a member with a non‑empty name
  if (reg.registrationId?.trim()) return true;
  if (reg.ticketNumber?.trim()) return true;
  if (reg.members?.some((m) => m.name?.trim() || m.email?.trim())) return true;
  return false;
};

const fetchRegistrations = async (): Promise<Registration[]> => {
  const url = getGASUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'GET_REGISTRATIONS' }),
    redirect: 'follow',
  });
  const text = await response.text();
  const result = JSON.parse(text);

  if (result.status !== 'success') {
    throw new Error(result.message || 'Failed to fetch registrations');
  }
  const raw = Array.isArray(result.data) ? result.data : [];
  // Filter out rows that have no meaningful data (e.g. cleared spreadsheet rows)
  return raw.filter(hasData);
};

/* ===== Component ===== */
export default function Registrations({ onBack }: RegistrationsProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await fetchRegistrations();
      setRegistrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + auto-refresh polling
  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadData]);

  /* --- Back button header (always shown) --- */
  const headerBar = (
    <div className="reg-toolbar">
      <button className="reg-back-btn" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Dashboard
      </button>
      <div className="reg-toolbar-right">
        {refreshing && <span className="reg-refresh-indicator" />}
        <button
          className="reg-refresh-btn"
          onClick={() => loadData(true)}
          disabled={refreshing}
          title="Refresh registrations"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'reg-refresh-spinning' : ''}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  );

  /* --- Loading --- */
  if (loading) {
    return (
      <div className="reg-section">
        {headerBar}
        <div className="reg-loading">
          <span className="reg-spinner" />
          <p>Loading registrations...</p>
        </div>
      </div>
    );
  }

  /* --- Error --- */
  if (error) {
    return (
      <div className="reg-section">
        {headerBar}
        <div className="reg-error">
          <span className="reg-error-icon">⚠️</span>
          <p>{error}</p>
          <button className="reg-retry-btn" onClick={() => loadData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* --- Empty --- */
  if (registrations.length === 0) {
    return (
      <div className="reg-section">
        {headerBar}
        <div className="reg-empty">
          <span className="reg-empty-icon">📋</span>
          <p>No registrations yet</p>
          <span className="reg-empty-sub">
            Registrations will appear here once teams sign up.
          </span>
        </div>
      </div>
    );
  }

  /* --- Cards --- */
  return (
    <div className="reg-section">
      {headerBar}

      <div className="reg-section-header">
        <h2 className="reg-section-title">Registrations</h2>
        <span className="reg-count-badge">{registrations.length} Teams</span>
      </div>

      <div className="reg-grid">
        {registrations.map((reg) => (
          <div className="reg-card" key={reg.registrationId}>
            {/* --- Top section --- */}
            <div className="reg-card-top">
              <div className="reg-card-row">
                <h3 className="reg-team-name">
                  {reg.teamName || 'Solo Registration'}
                </h3>
                <span className="reg-size-badge">
                  {reg.teamSize} {reg.teamSize === 1 ? 'Member' : 'Members'}
                </span>
              </div>

              <span className="reg-event-name">{reg.eventName}</span>

              <div className="reg-meta">
                <div className="reg-meta-item">
                  <span className="reg-meta-label">Registration ID</span>
                  <span className="reg-meta-value reg-id-value">
                    {reg.registrationId}
                  </span>
                </div>
                <div className="reg-meta-item">
                  <span className="reg-meta-label">Ticket</span>
                  <span className="reg-meta-value reg-ticket-value">
                    {reg.ticketNumber}
                  </span>
                </div>
                <div className="reg-meta-item">
                  <span className="reg-meta-label">Registered</span>
                  <span className="reg-meta-value">{reg.timestamp}</span>
                </div>
              </div>
            </div>

            {/* --- Divider --- */}
            <div className="reg-card-divider" />

            {/* --- Members section --- */}
            <div className="reg-card-members">
              <h4 className="reg-members-title">Team Members</h4>
              <div className="reg-members-list">
                {reg.members.map((member, idx) => (
                  <div className="reg-member-row" key={idx}>
                    <div className="reg-member-num">
                      <span>{idx + 1}</span>
                    </div>
                    <div className="reg-member-info">
                      <div className="reg-member-name-line">
                        <span className="reg-member-name">{member.name}</span>
                        {member.isLeader && (
                          <span className="reg-leader-tag">Leader</span>
                        )}
                      </div>
                      <div className="reg-member-details">
                        <span className="reg-member-detail">
                          📧 {member.email}
                        </span>
                        {member.phone && (
                          <span className="reg-member-detail">
                            📱 {member.phone}
                          </span>
                        )}
                        {member.branch && (
                          <span className="reg-member-detail">
                            🎓 {member.branch}
                            {member.section ? ` - ${member.section}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
