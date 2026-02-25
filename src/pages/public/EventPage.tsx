/**
 * Public Event Page — dynamic event display + registration form.
 *
 * Reads event config from localStorage (via eventService).
 * Uses the EXACT same submission logic & payload structure as
 * EventRegistration — no backend changes.
 */
import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { useParams, Link } from 'react-router-dom';
import { submitFormToGAS, prepareFormData } from '../../services';
import { getEventById } from '../../services/eventService';
import type { EventConfig } from '../../types/event';
import './EventPage.css';

/* ===== Constants (same as EventRegistration) ===== */
const BRANCHES = [
  'CS & BS',
  'CSE',
  'IT',
  'ECE',
  'EEE',
  'ME',
  'CE',
  'AIML',
  'AIDS',
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

/* ===== Helpers ===== */
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@vishnu\.edu\.in$/i.test(email);

const isValidPhone = (phone: string): boolean =>
  /^\d{10}$/.test(phone.replace(/[\s\-()]/g, ''));

const getGASUrl = (): string => {
  const url = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (!url) throw new Error('Google Apps Script URL not configured');
  return url;
};

const buildEmptyForm = (): FormData => ({
  leaderName: '',
  email: '',
  phone: '',
  branch: '',
  section: '',
  teamName: '',
  teamSize: 1,
  teamMembers: [],
});

/* ===== Component ===== */
export default function EventPage() {
  const { id } = useParams<{ id: string }>();

  /* event state */
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(true);

  /* form state */
  const [formData, setFormData] = useState<FormData | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  /* ── Load event from backend ────────────────────────── */
  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    const loadEvent = async () => {
      try {
        const evt = await getEventById(id);
        if (cancelled) return;
        if (!evt || !evt.isActive) {
          setNotFound(true);
          return;
        }
        setEvent(evt);
        setFormData(buildEmptyForm());
      } catch {
        if (!cancelled) setNotFound(true);
      }
    };
    loadEvent();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Fetch total registrations for slot count ──────── */
  useEffect(() => {
    if (!event) return;
    const fetchCount = async () => {
      try {
        setLoadingCount(true);
        const url = getGASUrl();
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'GET_REGISTRATIONS' }),
          redirect: 'follow',
        });
        const text = await response.text();
        const result = JSON.parse(text);
        if (result.status === 'success' && Array.isArray(result.data)) {
          // Sum team sizes to count total members, not just registrations
          const totalMembers = result.data.reduce(
            (sum: number, reg: { teamSize?: number }) =>
              sum + (reg.teamSize || 1),
            0,
          );
          setRegisteredCount(totalMembers);
        }
      } catch (err) {
        console.error('Failed to fetch registration count:', err);
      } finally {
        setLoadingCount(false);
      }
    };
    fetchCount();
  }, [event]);

  /* ── Change handlers ───────────────────────────────── */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;

      setFormData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, [name]: value };

        // Dynamically resize team members when teamSize changes
        if (name === 'teamSize') {
          const size = parseInt(value, 10) || 1;
          updated.teamSize = size;
          const additionalCount = Math.max(0, size - 1);
          const current = prev.teamMembers;

          if (additionalCount > current.length) {
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
            updated.teamMembers = current.slice(0, additionalCount);
          }
        }

        return updated;
      });

      setErrors((prev) => ({ ...prev, [name]: undefined }));
    },
    [],
  );

  const handleMemberChange = useCallback(
    (index: number, field: keyof TeamMember, value: string) => {
      setFormData((prev) => {
        if (!prev) return prev;
        const members = [...prev.teamMembers];
        members[index] = { ...members[index], [field]: value };
        return { ...prev, teamMembers: members };
      });
      setErrors((prev) => {
        if (!prev.teamMembers) return prev;
        const memberErrors = [...prev.teamMembers];
        if (memberErrors[index]) {
          memberErrors[index] = {
            ...memberErrors[index],
            [field]: undefined,
          };
        }
        return { ...prev, teamMembers: memberErrors };
      });
    },
    [],
  );

  /* ── Validation ────────────────────────────────────── */
  const validate = useCallback((): boolean => {
    if (!formData || !event) return false;
    const newErrors: FormErrors = {};
    let isValid = true;

    /* leader fields */
    if (!formData.leaderName.trim()) {
      newErrors.leaderName = 'Full name is required';
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

    /* team name */
    if (formData.teamSize > 1 && !formData.teamName.trim()) {
      newErrors.teamName = 'Team name is required';
      isValid = false;
    }

    /* emails for duplicate check */
    const allEmails: string[] = [];
    if (formData.email.trim()) {
      allEmails.push(formData.email.trim().toLowerCase());
    }

    /* member validation */
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
        mErr.branch = 'Please select a branch';
        isValid = false;
      }
      if (!member.section) {
        mErr.section = 'Please select a section';
        isValid = false;
      }
      memberErrors.push(mErr);
    });

    if (
      memberErrors.some(
        (e) => e.name || e.email || e.phone || e.branch || e.section,
      )
    ) {
      newErrors.teamMembers = memberErrors;
    }

    /* duplicate email check */
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
  }, [formData, event]);

  /* ── Submit — same payload & endpoint ──────────────── */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!formData || !event) return;
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
        const preparedData = prepareFormData(
          formData.leaderName,
          formData.email,
          formData.phone,
          formData.branch,
          formData.section,
          formData.teamName,
          formData.teamSize,
          formData.teamMembers,
          event.eventName,
          event.eventDescription,
        );

        const response = await submitFormToGAS(preparedData);
        setIsSubmitting(false);

        if (response.success) {
          setAlert({
            type: 'success',
            title: 'Registration successful!',
            message: response.message,
            registrationData: response.data?.registrationId
              ? {
                  registrationId: response.data.registrationId,
                  ticketNumber: response.data.ticketNumber,
                }
              : undefined,
          });

          setFormData(buildEmptyForm());
          setErrors({});
          setRegisteredCount((prev) => prev + formData.teamSize); // optimistic: add actual team size
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
    [validate, formData, event],
  );

  /* ===== Render — Not Found ===== */
  if (notFound) {
    return (
      <div className="ep-page">
        <div className="ep-not-found">
          <span className="ep-not-found-icon">🔍</span>
          <h2>Event Not Found</h2>
          <p>This event doesn't exist or is no longer active.</p>
          <Link to="/" className="ep-home-link">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  /* ===== Render — Loading ===== */
  if (!event || !formData) {
    return (
      <div className="ep-page">
        <div className="ep-loading">
          <span className="ep-spinner" />
          <p>Loading event...</p>
        </div>
      </div>
    );
  }

  /* ===== Derived values ===== */
  const remainingSlots = Math.max(0, event.totalSlots - registeredCount);
  const isClosed = remainingSlots <= 0;
  const slotsPercent = Math.min(
    100,
    (registeredCount / event.totalSlots) * 100,
  );

  /* ===== Render — Full Page ===== */
  return (
    <div className="ep-page">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="ep-header">
        <div
          className={`ep-badge ${isClosed ? 'ep-badge-closed' : 'ep-badge-open'}`}
        >
          <span className="ep-badge-dot" />
          {isClosed ? 'Registrations Closed' : 'Registrations Open'}
        </div>
        <h1 className="ep-title">{event.eventName}</h1>
        <p className="ep-description">{event.eventDescription}</p>
      </header>

      {/* ── Slots Remaining Card ───────────────────────── */}
      <div
        className={`ep-slots-card${isClosed ? ' ep-slots-closed' : ''}`}
      >
        <span className="ep-slots-icon">🎟️</span>
        <div className="ep-slots-info">
          <span className="ep-slots-text">
            {loadingCount ? (
              'Loading slots...'
            ) : (
              <>
                <span className="ep-slots-count">{remainingSlots}</span>{' '}
                slots remaining out of{' '}
                <span className="ep-slots-total">{event.totalSlots}</span>
              </>
            )}
          </span>
          <div className="ep-slots-bar-track">
            <div
              className="ep-slots-bar-fill"
              style={{ width: `${slotsPercent}%` }}
            />
          </div>
        </div>
        {event.teamSize > 1 && (
          <span className="ep-team-badge">
            👥 Teams of {event.teamSize}
          </span>
        )}
      </div>

      {/* ── Registration Form Card ─────────────────────── */}
      <div className="ep-form-card">
        <h2 className="ep-form-title">
          {event.teamSize > 1 ? 'Register Your Team' : 'Register Now'}
        </h2>
        <p className="ep-form-hint">
          {event.teamSize > 1
            ? `You can register solo or as a team of up to ${event.teamSize} members.`
            : ''}
        </p>
        <p className="ep-form-subtitle">
          Fill in the details below to secure your spot
        </p>

        {/* Alert */}
        {alert && (
          <div className={`ep-alert ep-alert-${alert.type}`}>
            <span className="ep-alert-icon">
              {alert.type === 'success' ? '✅' : '⚠️'}
            </span>
            <div className="ep-alert-content">
              <strong>{alert.title}</strong>
              <span>{alert.message}</span>
              {alert.type === 'success' && alert.registrationData && (
                <div className="ep-reg-details">
                  <div className="ep-reg-row">
                    <span className="ep-reg-label">Registration ID</span>
                    <span className="ep-reg-value ep-reg-id">
                      {alert.registrationData.registrationId}
                    </span>
                  </div>
                  <div className="ep-reg-row">
                    <span className="ep-reg-label">Ticket Number</span>
                    <span className="ep-reg-value ep-ticket">
                      {alert.registrationData.ticketNumber}
                    </span>
                  </div>
                  <p className="ep-reg-note">
                    📧 A confirmation email has been sent to your inbox.
                    Please save these details for check-in at the venue.
                  </p>
                </div>
              )}
            </div>
            <button
              className="ep-alert-dismiss"
              onClick={() => setAlert(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {isClosed ? (
          <div className="ep-closed-msg">
            <span>🚫</span>
            <p>
              Registration for this event is now <strong>closed</strong>. All
              slots have been filled.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* ── Leader Info ──────────────────────────── */}
            <div className="ep-form-section">
              <div className="ep-section-label">
                <span className="ep-section-icon">👤</span>
                {event.teamSize > 1 ? 'Team Leader Info' : 'Your Info'}
              </div>

              <div className="ep-form-row">
                <div className="ep-form-group">
                  <label htmlFor="ep-leaderName">
                    Full Name <span className="ep-required">*</span>
                  </label>
                  <input
                    id="ep-leaderName"
                    name="leaderName"
                    type="text"
                    className={`ep-input${errors.leaderName ? ' ep-input-error' : ''}`}
                    placeholder="Enter your full name"
                    value={formData.leaderName}
                    onChange={handleChange}
                  />
                  {errors.leaderName && (
                    <span className="ep-field-error">
                      {errors.leaderName}
                    </span>
                  )}
                </div>
              </div>

              <div className="ep-form-row ep-two-col">
                <div className="ep-form-group">
                  <label htmlFor="ep-email">
                    Email <span className="ep-required">*</span>
                  </label>
                  <input
                    id="ep-email"
                    name="email"
                    type="email"
                    className={`ep-input${errors.email ? ' ep-input-error' : ''}`}
                    placeholder="yourname@vishnu.edu.in"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  {errors.email && (
                    <span className="ep-field-error">{errors.email}</span>
                  )}
                </div>
                <div className="ep-form-group">
                  <label htmlFor="ep-phone">
                    Phone <span className="ep-required">*</span>
                  </label>
                  <input
                    id="ep-phone"
                    name="phone"
                    type="tel"
                    className={`ep-input${errors.phone ? ' ep-input-error' : ''}`}
                    placeholder="10-digit number"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                  {errors.phone && (
                    <span className="ep-field-error">{errors.phone}</span>
                  )}
                </div>
              </div>

              {/* Academic details */}
              <div className="ep-form-row ep-two-col">
                <div className="ep-form-group">
                  <label htmlFor="ep-branch">
                    Branch <span className="ep-required">*</span>
                  </label>
                  <div className="ep-select-wrapper">
                    <select
                      id="ep-branch"
                      name="branch"
                      className={`ep-select${errors.branch ? ' ep-input-error' : ''}`}
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
                  {errors.branch && (
                    <span className="ep-field-error">{errors.branch}</span>
                  )}
                </div>
                <div className="ep-form-group">
                  <label htmlFor="ep-section">
                    Section <span className="ep-required">*</span>
                  </label>
                  <div className="ep-select-wrapper">
                    <select
                      id="ep-section"
                      name="section"
                      className={`ep-select${errors.section ? ' ep-input-error' : ''}`}
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
                  {errors.section && (
                    <span className="ep-field-error">{errors.section}</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Team Setup (teamSize > 1 only) ──────── */}
            {event.teamSize > 1 && (
              <div className="ep-form-section">
                <div className="ep-section-label">
                  <span className="ep-section-icon">👥</span>
                  Team Setup
                </div>

                <div className="ep-form-row ep-two-col">
                  <div className="ep-form-group">
                    <label htmlFor="ep-teamName">
                      Team Name {formData.teamSize > 1 && <span className="ep-required">*</span>}
                    </label>
                    <input
                      id="ep-teamName"
                      name="teamName"
                      type="text"
                      className={`ep-input${errors.teamName ? ' ep-input-error' : ''}`}
                      placeholder="Enter your team name"
                      value={formData.teamName}
                      onChange={handleChange}
                    />
                    {errors.teamName && (
                      <span className="ep-field-error">
                        {errors.teamName}
                      </span>
                    )}
                  </div>
                  <div className="ep-form-group">
                    <label htmlFor="ep-teamSize">
                      Team Size <span className="ep-required">*</span>
                    </label>
                    <div className="ep-select-wrapper">
                      <select
                        id="ep-teamSize"
                        name="teamSize"
                        className="ep-select"
                        value={formData.teamSize}
                        onChange={handleChange}
                      >
                        {Array.from(
                          { length: event.teamSize },
                          (_, i) => i + 1,
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? '(Solo)' : 'Members'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Duplicate email warning */}
                {errors.duplicateEmails && (
                  <div className="ep-form-row">
                    <span className="ep-field-error ep-duplicate-error">
                      {errors.duplicateEmails}
                    </span>
                  </div>
                )}

                {/* Dynamic team member cards */}
                <div className="ep-members-section">
                  {formData.teamMembers.map((member, idx) => (
                    <div
                      className="ep-member-card"
                      key={idx}
                      style={{ animationDelay: `${idx * 0.08}s` }}
                    >
                      <div className="ep-member-header">
                        <span className="ep-member-number">{idx + 2}</span>
                        <span>Team Member {idx + 2}</span>
                      </div>
                      <div className="ep-member-fields">
                        {/* Name */}
                        <div className="ep-form-row">
                          <div className="ep-form-group">
                            <label htmlFor={`ep-m-name-${idx}`}>
                              Full Name{' '}
                              <span className="ep-required">*</span>
                            </label>
                            <input
                              id={`ep-m-name-${idx}`}
                              type="text"
                              className={`ep-input${errors.teamMembers?.[idx]?.name ? ' ep-input-error' : ''}`}
                              placeholder={`Member ${idx + 2} full name`}
                              value={member.name}
                              onChange={(e) =>
                                handleMemberChange(
                                  idx,
                                  'name',
                                  e.target.value,
                                )
                              }
                            />
                            {errors.teamMembers?.[idx]?.name && (
                              <span className="ep-field-error">
                                {errors.teamMembers[idx].name}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Email + Phone */}
                        <div className="ep-form-row ep-two-col">
                          <div className="ep-form-group">
                            <label htmlFor={`ep-m-email-${idx}`}>
                              Email{' '}
                              <span className="ep-required">*</span>
                            </label>
                            <input
                              id={`ep-m-email-${idx}`}
                              type="email"
                              className={`ep-input${errors.teamMembers?.[idx]?.email ? ' ep-input-error' : ''}`}
                              placeholder="member@vishnu.edu.in"
                              value={member.email}
                              onChange={(e) =>
                                handleMemberChange(
                                  idx,
                                  'email',
                                  e.target.value,
                                )
                              }
                            />
                            {errors.teamMembers?.[idx]?.email && (
                              <span className="ep-field-error">
                                {errors.teamMembers[idx].email}
                              </span>
                            )}
                          </div>
                          <div className="ep-form-group">
                            <label htmlFor={`ep-m-phone-${idx}`}>
                              Phone{' '}
                              <span className="ep-required">*</span>
                            </label>
                            <input
                              id={`ep-m-phone-${idx}`}
                              type="tel"
                              className={`ep-input${errors.teamMembers?.[idx]?.phone ? ' ep-input-error' : ''}`}
                              placeholder="10-digit number"
                              value={member.phone}
                              onChange={(e) =>
                                handleMemberChange(
                                  idx,
                                  'phone',
                                  e.target.value,
                                )
                              }
                            />
                            {errors.teamMembers?.[idx]?.phone && (
                              <span className="ep-field-error">
                                {errors.teamMembers[idx].phone}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Branch + Section */}
                        <div className="ep-form-row ep-two-col">
                          <div className="ep-form-group">
                            <label htmlFor={`ep-m-branch-${idx}`}>
                              Branch{' '}
                              <span className="ep-required">*</span>
                            </label>
                            <div className="ep-select-wrapper">
                              <select
                                id={`ep-m-branch-${idx}`}
                                className={`ep-select${errors.teamMembers?.[idx]?.branch ? ' ep-input-error' : ''}`}
                                value={member.branch}
                                onChange={(e) =>
                                  handleMemberChange(
                                    idx,
                                    'branch',
                                    e.target.value,
                                  )
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
                            {errors.teamMembers?.[idx]?.branch && (
                              <span className="ep-field-error">
                                {errors.teamMembers[idx].branch}
                              </span>
                            )}
                          </div>
                          <div className="ep-form-group">
                            <label htmlFor={`ep-m-section-${idx}`}>
                              Section{' '}
                              <span className="ep-required">*</span>
                            </label>
                            <div className="ep-select-wrapper">
                              <select
                                id={`ep-m-section-${idx}`}
                                className={`ep-select${errors.teamMembers?.[idx]?.section ? ' ep-input-error' : ''}`}
                                value={member.section}
                                onChange={(e) =>
                                  handleMemberChange(
                                    idx,
                                    'section',
                                    e.target.value,
                                  )
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
                            {errors.teamMembers?.[idx]?.section && (
                              <span className="ep-field-error">
                                {errors.teamMembers[idx].section}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate email warning for solo (teamSize=1) */}
            {formData.teamSize <= 1 && errors.duplicateEmails && (
              <div className="ep-form-row">
                <span className="ep-field-error ep-duplicate-error">
                  {errors.duplicateEmails}
                </span>
              </div>
            )}

            {/* ── Submit ──────────────────────────────── */}
            <div className="ep-submit-section">
              <button
                type="submit"
                className="ep-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="ep-spinner-btn" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <span>🚀 Register Now</span>
                )}
              </button>
              <p className="ep-submit-hint">
                By registering, you agree to the event rules and code of
                conduct.
              </p>
            </div>
          </form>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="ep-footer">
        <p>© 2026 CSBS Department · All Rights Reserved</p>
        <p className="ep-footer-query">
          For any queries, mail to{' '}
          <a href="mailto:csbs.vitb@gmail.com">csbs.vitb@gmail.com</a>
        </p>
      </footer>
    </div>
  );
}
