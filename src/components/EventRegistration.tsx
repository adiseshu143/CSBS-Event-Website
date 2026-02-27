import { useState, useCallback, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { submitFormToGAS, prepareFormData, fetchRegisteredSlots } from '../services';
import { signInWithGoogle, signOutUser, type VerifiedUser } from '../services/authService';
import './EventRegistration.css';

/* ===== Configuration ===== */
const EVENT_CONFIG = {
  title: 'STRAT-A-THON 1.0',
  description:
    'STRAT-A-THON 1.0 is a 24-hour hackathon organized by the Techie-Blazers Club of Vishnu Institute of Technology, where strategy meets innovation. Scheduled for March 4\u20135 at C Block, the event challenges teams of four to brainstorm, build, and battle it out with impactful ideas.\nIt\u2019s a high-energy platform for smart minds to collaborate, compete, and turn bold strategies into real-world solutions.',
  totalSlots: 250,
  maxTeamSize: 4,
};

const BRANCHES = [
  'CS & BS',
  'CSE',
  'IT',
  'ECE',
  'EEE',
  'ME',
  'CE',
  'AIML',
  'AIDS'
];

const SECTIONS = ['A', 'B', 'C', 'D'];

/* ===== Types ===== */
interface TeamMember {
  name: string;
  email: string;
  phone: string;
  branch: string;
  section: string;
}

interface FormData {
  leaderName: string;
  email: string;
  phone: string;
  branch: string;
  section: string;
  teamName: string;
  teamSize: number;
  teamMembers: TeamMember[];
}

interface TeamMemberError {
  name?: string;
  email?: string;
  phone?: string;
  branch?: string;
  section?: string;
}

interface FormErrors {
  leaderName?: string;
  email?: string;
  phone?: string;
  branch?: string;
  section?: string;
  teamName?: string;
  teamSize?: string;
  teamMembers?: TeamMemberError[];
  duplicateEmails?: string;
}

type AlertState = {
  type: 'success' | 'error';
  title: string;
  message: string;
  registrationData?: {
    registrationId: string;
    ticketNumber: string;
  };
} | null;

/* ===== Initial State ===== */
const initialFormData: FormData = {
  leaderName: '',
  email: '',
  phone: '',
  branch: '',
  section: '',
  teamName: '',
  teamSize: 1,
  teamMembers: [],
};

/* ===== Helpers ===== */
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@vishnu\.edu\.in$/i.test(email);

const isValidPhone = (phone: string): boolean =>
  /^\d{10}$/.test(phone.replace(/[\s\-()]/g, ''));

/* ===== Component ===== */
export default function EventRegistration() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [registeredSlots, setRegisteredSlots] = useState(0);
  const [slotsLoading, setSlotsLoading] = useState(true);

  /* --- Email verification state (Google Auth) --- */
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState<string | null>(null);
  const [verifiedUser, setVerifiedUser] = useState<VerifiedUser | null>(null);

  /* --- Fetch live slot count from backend --- */
  const loadSlots = useCallback(async () => {
    try {
      const count = await fetchRegisteredSlots();
      setRegisteredSlots(count);
    } catch {
      // Silently fail — keep last known value
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const remainingSlots = EVENT_CONFIG.totalSlots - registeredSlots;
  const slotsPercent =
    (registeredSlots / EVENT_CONFIG.totalSlots) * 100;

  /* --- Google Sign-In verification handler --- */
  const handleVerifyEmail = useCallback(async () => {
    setEmailVerifyError(null);
    setEmailVerifying(true);

    try {
      const user = await signInWithGoogle();

      // Auto-fill the form with Google account data
      setVerifiedUser(user);
      setFormData((prev) => ({
        ...prev,
        email: user.email,
        leaderName: user.displayName || prev.leaderName,
      }));
      setEmailVerified(true);
      setErrors((prev) => ({ ...prev, email: undefined, leaderName: undefined }));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      // Ignore popup-closed-by-user
      if (message.includes('popup-closed-by-user') || message.includes('cancelled')) {
        setEmailVerifyError(null);
      } else {
        setEmailVerifyError(message);
      }
    } finally {
      setEmailVerifying(false);
    }
  }, []);

  /* --- Reset verification (sign out & clear) --- */
  const handleResetVerification = useCallback(async () => {
    try { await signOutUser(); } catch { /* ignore */ }
    setEmailVerified(false);
    setVerifiedUser(null);
    setEmailVerifyError(null);
    setFormData((prev) => ({ ...prev, email: '', leaderName: '' }));
  }, []);

  /* --- Field change handler --- */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;

      setFormData((prev) => {
        const updated = { ...prev, [name]: value };

        // Dynamically resize team members array when team size changes
        if (name === 'teamSize') {
          const size = parseInt(value, 10) || 1;
          updated.teamSize = size;
          const additionalCount = Math.max(0, size - 1);
          const current = prev.teamMembers;

          if (additionalCount > current.length) {
            // Add new empty members
            updated.teamMembers = [
              ...current,
              ...Array.from({ length: additionalCount - current.length }, () => ({
                name: '',
                email: '',
                phone: '',
                branch: '',
                section: '',
              })),
            ];
          } else {
            // Trim excess members
            updated.teamMembers = current.slice(0, additionalCount);
          }
        }

        return updated;
      });

      // Clear field-level error on change
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    },
    [],
  );

  /* --- Team member field change --- */
  const handleMemberChange = useCallback(
    (index: number, field: keyof TeamMember, value: string) => {
      setFormData((prev) => {
        const members = [...prev.teamMembers];
        members[index] = { ...members[index], [field]: value };
        return { ...prev, teamMembers: members };
      });

      // Clear specific member error
      setErrors((prev) => {
        if (!prev.teamMembers) return prev;
        const memberErrors = [...prev.teamMembers];
        if (memberErrors[index]) {
          memberErrors[index] = { ...memberErrors[index], [field]: undefined };
        }
        return { ...prev, teamMembers: memberErrors };
      });
    },
    [],
  );

  /* --- Validation --- */
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    if (!formData.leaderName.trim()) {
      newErrors.leaderName = 'Team leader name is required';
      isValid = false;
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Only @vishnu.edu.in emails are allowed';
      isValid = false;
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
      isValid = false;
    } else if (!isValidPhone(formData.phone)) {
      newErrors.phone = 'Enter a valid 10-digit phone number';
      isValid = false;
    }
    if (!formData.branch) {
      newErrors.branch = 'Please select a branch';
      isValid = false;
    }
    if (!formData.section) {
      newErrors.section = 'Please select a section';
      isValid = false;
    }

    // Team name required when team size > 1
    if (formData.teamSize > 1 && !formData.teamName.trim()) {
      newErrors.teamName = 'Team name is required';
      isValid = false;
    }

    // Collect all emails for duplicate check
    const allEmails: string[] = [];
    if (formData.email.trim()) {
      allEmails.push(formData.email.trim().toLowerCase());
    }

    // Validate team members — ALL fields required
    const memberErrors: TeamMemberError[] = [];
    formData.teamMembers.forEach((member, idx) => {
      const mErr: TeamMemberError = {};
      if (!member.name.trim()) {
        mErr.name = `Member ${idx + 2} name is required`;
        isValid = false;
      }
      if (!member.email.trim()) {
        mErr.email = `Member ${idx + 2} email is required`;
        isValid = false;
      } else if (!isValidEmail(member.email)) {
        mErr.email = 'Only @vishnu.edu.in emails are allowed';
        isValid = false;
      } else {
        allEmails.push(member.email.trim().toLowerCase());
      }
      if (!member.phone.trim()) {
        mErr.phone = `Member ${idx + 2} phone is required`;
        isValid = false;
      } else if (!isValidPhone(member.phone)) {
        mErr.phone = 'Enter a valid 10-digit phone number';
        isValid = false;
      }
      if (!member.branch) {
        mErr.branch = `Please select a branch`;
        isValid = false;
      }
      if (!member.section) {
        mErr.section = `Please select a section`;
        isValid = false;
      }
      memberErrors.push(mErr);
    });

    if (memberErrors.some((e) => e.name || e.email || e.phone || e.branch || e.section)) {
      newErrors.teamMembers = memberErrors;
    }

    // Check for duplicate emails within the form
    const emailSet = new Set<string>();
    for (const email of allEmails) {
      if (emailSet.has(email)) {
        newErrors.duplicateEmails = `Duplicate email found: ${email}. Each person must use a unique email.`;
        isValid = false;
        break;
      }
      emailSet.add(email);
    }

    setErrors(newErrors);
    return isValid;
  }, [formData]);

  /* --- Submit --- */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setAlert(null);

      if (!validate()) {
        setAlert({
          type: 'error',
          title: 'Validation failed',
          message: 'Please correct the highlighted fields and try again.',
        });
        return;
      }

      setIsSubmitting(true);

      try {
        // Prepare form data
        const preparedData = prepareFormData(
          formData.leaderName,
          formData.email,
          formData.phone,
          formData.branch,
          formData.section,
          formData.teamName,
          formData.teamSize,
          formData.teamMembers,
          EVENT_CONFIG.title,
          EVENT_CONFIG.description,
        );

        // Submit to Google Apps Script
        const response = await submitFormToGAS(preparedData);

        setIsSubmitting(false);

        if (response.success) {
          setAlert({
            type: 'success',
            title: 'Registration successful!',
            message: response.message,
            registrationData: response.data?.registrationId ? {
              registrationId: response.data.registrationId,
              ticketNumber: response.data.ticketNumber,
            } : undefined,
          });

          // Reset form after successful submission
          setFormData(initialFormData);
          setErrors({});
          setEmailVerified(false);
          setEmailVerifyError(null);
          setVerifiedUser(null);
          try { await signOutUser(); } catch { /* ignore */ }

          // Refresh slot count after registration
          loadSlots();

          // Auto-dismiss success alert after 15 seconds
          setTimeout(() => setAlert(null), 15000);
        } else {
          setAlert({
            type: 'error',
            title: 'Submission failed',
            message: response.message,
          });
        }
      } catch (error) {
        setIsSubmitting(false);
        setAlert({
          type: 'error',
          title: 'Error',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred. Please try again.',
        });
      }
    },
    [validate, formData],
  );

  /* ===== Render ===== */
  return (
    <div className="registration-page">
      {/* --- Header --- */}
      <header className="event-header">
        <div className="event-badge">
          <span className="pulse-dot" />
          Registrations Open
        </div>
        <h1>{EVENT_CONFIG.title}</h1>
        <p style={{ whiteSpace: 'pre-line' }}>{EVENT_CONFIG.description}</p>
      </header>

      {/* --- Slots Banner --- */}
      <div className="slots-banner">
        <span className="slots-icon">🎟️</span>
        <span className="slots-text">
          {slotsLoading ? (
            <span>Loading slots...</span>
          ) : (
            <>
              <span className="slots-count">{remainingSlots}</span> slots remaining
              out of {EVENT_CONFIG.totalSlots}
            </>
          )}
        </span>
        <div className="slots-bar-track">
          <div
            className="slots-bar-fill"
            style={{ width: `${slotsPercent}%` }}
          />
        </div>
      </div>

      {/* --- Card --- */}
      <div className="registration-card">
        <h2 className="card-title">Register Your Team</h2>
        <p className="card-subtitle">Fill in the details below to secure your spot</p>

        {/* Alert Messages */}
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            <span className="alert-icon">
              {alert.type === 'success' ? '✅' : '⚠️'}
            </span>
            <div className="alert-content">
              <strong>{alert.title}</strong>
              {alert.message}
              {alert.type === 'success' && alert.registrationData && (
                <div className="registration-details">
                  <div className="reg-detail-row">
                    <span className="reg-detail-label">Registration ID</span>
                    <span className="reg-detail-value reg-id">{alert.registrationData.registrationId}</span>
                  </div>
                  <div className="reg-detail-row">
                    <span className="reg-detail-label">Ticket Number</span>
                    <span className="reg-detail-value ticket-no">{alert.registrationData.ticketNumber}</span>
                  </div>
                  <p className="reg-detail-note">📧 A confirmation email has been sent to your inbox. Please save these details for check-in at the venue.</p>
                </div>
              )}
            </div>
            <button
              className="alert-dismiss"
              onClick={() => setAlert(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* --- Leader Info --- */}
          <div className="form-section">
            <div className="section-label">
              <span className="section-icon">👤</span>
              Team Leader Info
            </div>

            {/* --- Google Sign-In Verification --- */}
            {!emailVerified ? (
              <div className="google-auth-section">
                <p className="auth-prompt">Sign in with your college Google account to verify your identity</p>
                <button
                  type="button"
                  className="google-signin-btn"
                  onClick={handleVerifyEmail}
                  disabled={emailVerifying}
                >
                  {emailVerifying ? (
                    <>
                      <span className="verify-spinner" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span>Sign in with Google</span>
                    </>
                  )}
                </button>
                {emailVerifyError && (
                  <span className="field-error" style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem' }}>{emailVerifyError}</span>
                )}
                <p className="auth-domain-note">Only <strong>@vishnu.edu.in</strong> accounts are accepted</p>
              </div>
            ) : (
              /* --- Verified leader section with phone --- */
              <div className="verified-leader-section">
                <div className="verified-user-card">
                  <div className="verified-user-info">
                    {verifiedUser?.photoURL && (
                      <img
                        src={verifiedUser.photoURL}
                        alt=""
                        className="verified-user-photo"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="verified-user-details">
                      <span className="verified-user-name">{formData.leaderName}</span>
                      <span className="verified-user-email">{formData.email}</span>
                    </div>
                    <span className="verified-badge-inline">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Verified
                    </span>
                  </div>
                  <button
                    type="button"
                    className="change-account-btn"
                    onClick={handleResetVerification}
                  >
                    Change account
                  </button>
                </div>

                {/* Phone number — required after verification */}
                <div className="verified-phone-section">
                  <div className="form-group">
                    <label htmlFor="phone">
                      📞 Phone Number <span className="required">*</span>
                    </label>
                    <div className="phone-input-wrapper">
                      <span className="phone-prefix">+91</span>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        className={`form-input ${errors.phone ? 'error' : ''}`}
                        placeholder="Enter 10-digit mobile number"
                        value={formData.phone}
                        onChange={handleChange}
                        maxLength={10}
                      />
                    </div>
                    <span className="field-error">{errors.phone ?? ''}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- Locked overlay when email not verified --- */}
          {!emailVerified && (
            <div className="form-locked-notice">
              <span className="lock-icon">🔒</span>
              <span>Please verify your email above to unlock the registration form</span>
            </div>
          )}

          {/* --- Academic Info --- */}
          <fieldset className="form-section" disabled={!emailVerified}>
            <div className="section-label">
              <span className="section-icon">🎓</span>
              Academic Details
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label htmlFor="branch">
                  Branch <span className="required">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="branch"
                    name="branch"
                    className={`form-select ${errors.branch ? 'error' : ''}`}
                    value={formData.branch}
                    onChange={handleChange}
                  >
                    <option value="">Select branch</option>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="field-error">{errors.branch ?? ''}</span>
              </div>
              <div className="form-group">
                <label htmlFor="section">
                  Section <span className="required">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="section"
                    name="section"
                    className={`form-select ${errors.section ? 'error' : ''}`}
                    value={formData.section}
                    onChange={handleChange}
                  >
                    <option value="">Select section</option>
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="field-error">{errors.section ?? ''}</span>
              </div>
            </div>
          </fieldset>

          {/* --- Team Setup --- */}
          <fieldset className="form-section" disabled={!emailVerified}>
            <div className="section-label">
              <span className="section-icon">👥</span>
              Team Setup
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label htmlFor="teamName">
                  Team Name {formData.teamSize > 1 && <span className="required">*</span>}
                </label>
                <input
                  id="teamName"
                  name="teamName"
                  type="text"
                  className={`form-input ${errors.teamName ? 'error' : ''}`}
                  placeholder="Enter your team name"
                  value={formData.teamName}
                  onChange={handleChange}
                />
                <span className="field-error">{errors.teamName ?? ''}</span>
              </div>
              <div className="form-group">
                <label htmlFor="teamSize">
                  Team Size <span className="required">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="teamSize"
                    name="teamSize"
                    className="form-select"
                    value={formData.teamSize}
                    onChange={handleChange}
                  >
                    {Array.from(
                      { length: EVENT_CONFIG.maxTeamSize },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? '(Solo)' : `Members`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Duplicate email warning */}
            {errors.duplicateEmails && (
              <div className="form-row">
                <div className="form-group">
                  <span className="field-error" style={{ display: 'block' }}>{errors.duplicateEmails}</span>
                </div>
              </div>
            )}

            {/* Dynamic team member fields */}
            {formData.teamMembers.length > 0 && (
              <div className="team-members-section">
                <div className="team-members-list">
                  {formData.teamMembers.map((member, idx) => (
                    <div
                      className="team-member-card"
                      key={idx}
                      style={{ animationDelay: `${idx * 0.08}s` }}
                    >
                      <div className="member-header">
                        <span className="member-number">{idx + 2}</span>
                        <span>Team Member {idx + 2}</span>
                      </div>
                      <div className="member-fields">
                        {/* Row 1: Name */}
                        <div className="form-row">
                          <div className="form-group">
                            <label htmlFor={`member-name-${idx}`}>
                              Full Name <span className="required">*</span>
                            </label>
                            <input
                              id={`member-name-${idx}`}
                              type="text"
                              className={`form-input ${
                                errors.teamMembers?.[idx]?.name ? 'error' : ''
                              }`}
                              placeholder={`Member ${idx + 2} full name`}
                              value={member.name}
                              onChange={(e) =>
                                handleMemberChange(idx, 'name', e.target.value)
                              }
                            />
                            <span className="field-error">
                              {errors.teamMembers?.[idx]?.name ?? ''}
                            </span>
                          </div>
                        </div>
                        {/* Row 2: Email + Phone */}
                        <div className="form-row two-col">
                          <div className="form-group">
                            <label htmlFor={`member-email-${idx}`}>
                              Email <span className="required">*</span>
                            </label>
                            <input
                              id={`member-email-${idx}`}
                              type="email"
                              className={`form-input ${
                                errors.teamMembers?.[idx]?.email ? 'error' : ''
                              }`}
                              placeholder="member@vishnu.edu.in"
                              value={member.email}
                              onChange={(e) =>
                                handleMemberChange(idx, 'email', e.target.value)
                              }
                            />
                            <span className="field-error">
                              {errors.teamMembers?.[idx]?.email ?? ''}
                            </span>
                          </div>
                          <div className="form-group">
                            <label htmlFor={`member-phone-${idx}`}>
                              Phone <span className="required">*</span>
                            </label>
                            <input
                              id={`member-phone-${idx}`}
                              type="tel"
                              className={`form-input ${
                                errors.teamMembers?.[idx]?.phone ? 'error' : ''
                              }`}
                              placeholder="10-digit number"
                              value={member.phone}
                              onChange={(e) =>
                                handleMemberChange(idx, 'phone', e.target.value)
                              }
                            />
                            <span className="field-error">
                              {errors.teamMembers?.[idx]?.phone ?? ''}
                            </span>
                          </div>
                        </div>
                        {/* Row 3: Branch + Section */}
                        <div className="form-row two-col">
                          <div className="form-group">
                            <label htmlFor={`member-branch-${idx}`}>
                              Branch <span className="required">*</span>
                            </label>
                            <div className="select-wrapper">
                              <select
                                id={`member-branch-${idx}`}
                                className={`form-select ${
                                  errors.teamMembers?.[idx]?.branch ? 'error' : ''
                                }`}
                                value={member.branch}
                                onChange={(e) =>
                                  handleMemberChange(idx, 'branch', e.target.value)
                                }
                              >
                                <option value="">Select branch</option>
                                {BRANCHES.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <span className="field-error">
                              {errors.teamMembers?.[idx]?.branch ?? ''}
                            </span>
                          </div>
                          <div className="form-group">
                            <label htmlFor={`member-section-${idx}`}>
                              Section <span className="required">*</span>
                            </label>
                            <div className="select-wrapper">
                              <select
                                id={`member-section-${idx}`}
                                className={`form-select ${
                                  errors.teamMembers?.[idx]?.section ? 'error' : ''
                                }`}
                                value={member.section}
                                onChange={(e) =>
                                  handleMemberChange(idx, 'section', e.target.value)
                                }
                              >
                                <option value="">Select section</option>
                                {SECTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <span className="field-error">
                              {errors.teamMembers?.[idx]?.section ?? ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </fieldset>

          {/* --- Submit --- */}
          <div className="submit-section">
            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting || !emailVerified}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" />
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Now</span>
              )}
            </button>
            <p className="submit-hint">
              By registering, you agree to the event rules and code of conduct.
            </p>
          </div>
        </form>
      </div>

      {/* --- Footer --- */}
      <footer className="registration-footer">
        <p>© 2026 CSBS Department · All Rights Reserved</p>
        <p className="registration-footer-query">
          For any queries, mail to{' '}
          <a href="mailto:csbs.vitb@gmail.com">csbs.vitb@gmail.com</a>
        </p>
      </footer>
    </div>
  );
}
