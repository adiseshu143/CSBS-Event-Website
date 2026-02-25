/**
 * Admin Portal — OTP Authentication Page
 *
 * 2-step flow:
 *   Step 1: Enter email → SEND_OTP → OTP emailed
 *   Step 2: Enter OTP   → VERIFY_OTP → Login
 */
import { useState, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { sendOtp, verifyOtp } from '../../services/adminAuthService';
import './AdminAuth.css';

/* ===== Types ===== */
type AuthStep = 'send' | 'verify';

interface AlertState {
  type: 'success' | 'error';
  message: string;
}

/* ===== Component ===== */
export default function AdminAuth() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();

  const [step, setStep] = useState<AuthStep>('send');
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  // Step 1 — Email
  const [email, setEmail] = useState('');

  // Step 2 — OTP
  const [otp, setOtp] = useState('');

  /* --- Helpers --- */
  const clearAlert = () => setAlert(null);
  const isValidEmail = (e: string) => /^[^\s@]+@vishnu\.edu\.in$/i.test(e);

  /* ===== Step 1: Send OTP ===== */
  const handleSendOtp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      clearAlert();

      if (!email.trim()) {
        setAlert({ type: 'error', message: 'Please enter your email address.' });
        return;
      }
      if (!isValidEmail(email)) {
        setAlert({ type: 'error', message: 'Only @vishnu.edu.in email addresses are allowed.' });
        return;
      }

      setIsLoading(true);
      try {
        const response = await sendOtp(email);

        if (response.status === 'success') {
          setStep('verify');
          setAlert({
            type: 'success',
            message: response.message || 'Access code sent to your email. Check your inbox.',
          });
        } else {
          setAlert({
            type: 'error',
            message: response.message || 'Email not authorized. Contact admin.',
          });
        }
      } catch {
        setAlert({
          type: 'error',
          message: 'Failed to send OTP. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [email],
  );

  /* ===== Step 2: Verify OTP ===== */
  const handleVerifyOtp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      clearAlert();

      if (!otp.trim()) {
        setAlert({ type: 'error', message: 'Please enter the access code from your email.' });
        return;
      }

      setIsLoading(true);
      try {
        const response = await verifyOtp(email, otp);

        if (response.status === 'success') {
          login({
            email: response.data.email || email,
            name: response.data.name || 'Admin',
            role: response.data.role || 'admin',
            loginAt: Date.now(),
          });

          setAlert({ type: 'success', message: 'Login successful! Redirecting...' });
          setTimeout(() => navigate('/admin/dashboard'), 800);
        } else {
          setAlert({
            type: 'error',
            message: response.message || 'Invalid OTP. Please try again.',
          });
        }
      } catch {
        setAlert({
          type: 'error',
          message: 'Verification failed. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [email, otp, login, navigate],
  );

  /** Resend OTP (goes back to step 1 handler) */
  const handleResendOtp = useCallback(
    async () => {
      clearAlert();
      setOtp('');
      setIsLoading(true);
      try {
        const response = await sendOtp(email);
        if (response.status === 'success') {
          setAlert({ type: 'success', message: 'New access code sent to your email.' });
        } else {
          setAlert({ type: 'error', message: response.message || 'Failed to resend.' });
        }
      } catch {
        setAlert({ type: 'error', message: 'Failed to resend. Please try again.' });
      } finally {
        setIsLoading(false);
      }
    },
    [email],
  );

  /* --- Step indicator state --- */
  const verifyActive = step === 'verify';

  /* ===== Render ===== */
  return (
    <div className="admin-auth-page">
      {/* ===== Header ===== */}
      <header className="admin-header">
        <div className="admin-badge">
          <span className="pulse-dot" />
          Authorized Access
        </div>
        <h1>Admin Portal</h1>
        <p>Secure OTP authentication for event management personnel</p>
      </header>

      {/* ===== Step Banner ===== */}
      <div className="admin-steps-banner">
        <div className="admin-steps">
          <div className={`admin-step ${step === 'send' ? 'active' : ''} ${verifyActive ? 'done' : ''}`}>
            <span className="admin-step-number">
              {verifyActive ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                '1'
              )}
            </span>
            <span className="admin-step-label">Send OTP</span>
          </div>
          <div className="admin-step-line">
            <div className={`admin-step-line-fill ${verifyActive ? 'filled' : ''}`} />
          </div>
          <div className={`admin-step ${verifyActive ? 'active' : ''}`}>
            <span className="admin-step-number">2</span>
            <span className="admin-step-label">Verify</span>
          </div>
        </div>
      </div>

      {/* ===== Card ===== */}
      <div className="admin-auth-card">
        <h2 className="admin-card-title">
          {step === 'send' && '🛡️ Eligibility Check'}
          {step === 'verify' && '🔒 Verify Access Code'}
        </h2>
        <p className="admin-card-subtitle">
          {step === 'send' && 'Enter your admin email to receive an OTP access code.'}
          {step === 'verify' && (
            <>Enter the access code sent to <strong>{email}</strong></>
          )}
        </p>

        {/* Alert */}
        {alert && (
          <div className={`admin-alert admin-alert-${alert.type}`}>
            <span className="admin-alert-icon">
              {alert.type === 'success' ? '✅' : '⚠️'}
            </span>
            <span>{alert.message}</span>
          </div>
        )}

        {/* ===== Step 1: Send OTP ===== */}
        {step === 'send' && (
          <form onSubmit={handleSendOtp} className="admin-form" noValidate>
            <div className="admin-section-label">
              <span className="section-icon">📧</span>
              Email Verification
            </div>

            <div className="admin-field">
              <label htmlFor="admin-email">Email Address</label>
              <div className="admin-input-wrapper">
                <svg className="admin-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  id="admin-email"
                  type="email"
                  className="admin-input"
                  placeholder="yourname@vishnu.edu.in"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearAlert(); }}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="admin-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="admin-spinner" />
                  <span>Sending OTP...</span>
                </>
              ) : (
                <span>🔍 Send Access Code</span>
              )}
            </button>

            <button
              type="button"
              className="admin-link-btn"
              onClick={() => navigate('/')}
            >
              ← Back to Home
            </button>
          </form>
        )}

        {/* ===== Step 2: Verify OTP ===== */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="admin-form" noValidate>
            <div className="admin-section-label">
              <span className="section-icon">🔑</span>
              Enter Access Code
            </div>

            {/* Email (read-only) */}
            <div className="admin-field">
              <label htmlFor="admin-verify-email">Email</label>
              <div className="admin-input-wrapper">
                <svg className="admin-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  id="admin-verify-email"
                  type="email"
                  className="admin-input"
                  value={email}
                  readOnly
                />
              </div>
            </div>

            {/* OTP */}
            <div className="admin-field">
              <label htmlFor="admin-otp">Access Code</label>
              <div className="admin-input-wrapper">
                <svg className="admin-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/>
                  <path d="m21 2-9.6 9.6"/>
                  <circle cx="7.5" cy="15.5" r="5.5"/>
                </svg>
                <input
                  id="admin-otp"
                  type="text"
                  className="admin-input admin-input-code"
                  placeholder="CSBS-XXXX"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.toUpperCase()); clearAlert(); }}
                  disabled={isLoading}
                  maxLength={9}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="admin-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="admin-spinner" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>🛡️ Verify & Login</span>
              )}
            </button>

            <div className="admin-link-row">
              <button
                type="button"
                className="admin-link-btn"
                onClick={handleResendOtp}
                disabled={isLoading}
              >
                🔄 Resend Code
              </button>
              <button
                type="button"
                className="admin-link-btn"
                onClick={() => { setStep('send'); setOtp(''); clearAlert(); }}
              >
                ← Change Email
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ===== Footer ===== */}
      <footer className="admin-footer">
        CSBS Admin Portal • Authorized access only
      </footer>
    </div>
  );
}
