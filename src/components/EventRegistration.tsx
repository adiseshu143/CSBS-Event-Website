import { useState, useCallback, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { submitFormToGAS, prepareFormData, fetchRegisteredSlots } from '../services';
import './EventRegistration.css';

/* ===== Configuration ===== */
const EVENT_CONFIG = {
  title: 'STRAT-A-THON 1.0',
  description:
    'STRAT-A-THON 1.0 is a 24-hour hackathon organized by the Techie-Blazers Club of Vishnu Institute of Technology, where strategy meets innovation. Scheduled for March 2\u20133 at C Block, the event challenges teams of four to brainstorm, build, and battle it out with impactful ideas.\nIt\u2019s a high-energy platform for smart minds to collaborate, compete, and turn bold strategies into real-world solutions.',
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

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="leaderName">
                  Full Name <span className="required">*</span>
                </label>
                <input
                  id="leaderName"
                  name="leaderName"
                  type="text"
                  className={`form-input ${errors.leaderName ? 'error' : ''}`}
                  placeholder="Enter your full name"
                  value={formData.leaderName}
                  onChange={handleChange}
                />
                <span className="field-error">{errors.leaderName ?? ''}</span>
              </div>
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label htmlFor="email">
                  Email <span className="required">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  placeholder="yourname@vishnu.edu.in"
                  value={formData.email}
                  onChange={handleChange}
                />
                <span className="field-error">{errors.email ?? ''}</span>
              </div>
              <div className="form-group">
                <label htmlFor="phone">
                  Phone <span className="required">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className={`form-input ${errors.phone ? 'error' : ''}`}
                  placeholder="10-digit number"
                  value={formData.phone}
                  onChange={handleChange}
                />
                <span className="field-error">{errors.phone ?? ''}</span>
              </div>
            </div>
          </div>

          {/* --- Academic Info --- */}
          <div className="form-section">
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
          </div>

          {/* --- Team Setup --- */}
          <div className="form-section">
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
          </div>

          {/* --- Submit --- */}
          <div className="submit-section">
            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting}
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
