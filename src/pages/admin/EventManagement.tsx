/**
 * Admin — Event Management (Create / Edit / Delete / Toggle).
 * Events are persisted server-side via Google Apps Script → Google Sheets.
 */
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../../services/eventService';
import type { EventConfig } from '../../types/event';
import './EventManagement.css';

interface Props {
  onBack: () => void;
}

export default function EventManagement({ onBack }: Props) {
  const [events, setEvents] = useState<EventConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /* form fields */
  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [totalSlots, setTotalSlots] = useState(50);
  const [teamSize, setTeamSize] = useState(1);

  /* feedback */
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshEvents = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getEvents();
      setEvents(list);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  /* --- form helpers --- */
  const resetForm = () => {
    setEventName('');
    setEventDescription('');
    setTotalSlots(50);
    setTeamSize(1);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!eventName.trim()) {
      setFormError('Event name is required');
      return;
    }
    if (!eventDescription.trim()) {
      setFormError('Event description is required');
      return;
    }
    if (totalSlots < 1) {
      setFormError('Total slots must be at least 1');
      return;
    }
    if (teamSize < 1 || teamSize > 10) {
      setFormError('Team size must be between 1 and 10');
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await updateEvent(editingId, {
          eventName: eventName.trim(),
          eventDescription: eventDescription.trim(),
          totalSlots,
          teamSize,
        });
        setSuccessMsg('Event updated successfully!');
      } else {
        await createEvent({
          eventName: eventName.trim(),
          eventDescription: eventDescription.trim(),
          totalSlots,
          teamSize,
        });
        setSuccessMsg('Event created successfully!');
      }
      resetForm();
      await refreshEvents();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Something went wrong',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (evt: EventConfig) => {
    setEditingId(evt.id);
    setEventName(evt.eventName);
    setEventDescription(evt.eventDescription);
    setTotalSlots(evt.totalSlots);
    setTeamSize(evt.teamSize);
    setFormError('');
    setSuccessMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      setSaving(true);
      await deleteEvent(id);
      if (editingId === id) resetForm();
      await refreshEvents();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      setSaving(true);
      await updateEvent(id, { isActive: !isActive });
      await refreshEvents();
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = (id: string) => {
    const link = `${window.location.origin}/event/${id}`;
    navigator.clipboard.writeText(link).catch(() => {
      /* ignore clipboard errors */
    });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ===== Render ===== */
  return (
    <div className="evt-mgmt">
      {/* Toolbar */}
      <div className="evt-mgmt-toolbar">
        <button className="evt-mgmt-back" onClick={onBack}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </button>
      </div>

      {/* ── Create / Edit form ────────────────────────────── */}
      <div className="evt-mgmt-form-card">
        <h2 className="evt-mgmt-form-title">
          {editingId ? '✏️ Edit Event' : '➕ Create New Event'}
        </h2>

        {formError && (
          <div className="evt-mgmt-form-error">{formError}</div>
        )}
        {successMsg && (
          <div className="evt-mgmt-form-success">{successMsg}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="evt-mgmt-field">
            <label>
              Event Name <span className="evt-required">*</span>
            </label>
            <input
              type="text"
              className="evt-mgmt-input"
              placeholder="e.g., AI Hackathon 2026"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
          </div>

          <div className="evt-mgmt-field">
            <label>
              Event Description <span className="evt-required">*</span>
            </label>
            <textarea
              className="evt-mgmt-textarea"
              placeholder="Describe the event, rules, prizes..."
              rows={3}
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
            />
          </div>

          <div className="evt-mgmt-row">
            <div className="evt-mgmt-field">
              <label>
                Total Slots <span className="evt-required">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                className="evt-mgmt-input"
                value={totalSlots}
                onChange={(e) =>
                  setTotalSlots(parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
            <div className="evt-mgmt-field">
              <label>
                Team Size <span className="evt-required">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="10"
                className="evt-mgmt-input"
                value={teamSize}
                onChange={(e) =>
                  setTeamSize(parseInt(e.target.value, 10) || 1)
                }
              />
              <span className="evt-mgmt-hint">
                {teamSize === 1
                  ? 'Solo event'
                  : `${teamSize} members per team`}
              </span>
            </div>
          </div>

          <div className="evt-mgmt-form-actions">
            <button type="submit" className="evt-mgmt-submit" disabled={saving}>
              {saving
                ? 'Saving...'
                : editingId
                  ? 'Update Event'
                  : 'Create Event'}
            </button>
            {editingId && (
              <button
                type="button"
                className="evt-mgmt-cancel"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Events list ───────────────────────────────────── */}
      <div className="evt-mgmt-list-section">
        <div className="evt-mgmt-list-header">
          <h2>Your Events</h2>
          <span className="evt-mgmt-count-badge">
            {events.length} Event{events.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="evt-mgmt-empty">
            <span>⏳</span>
            <p>Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="evt-mgmt-empty">
            <span>📅</span>
            <p>No events created yet</p>
            <span className="evt-mgmt-empty-sub">
              Create your first event above to get started.
            </span>
          </div>
        ) : (
          <div className="evt-mgmt-grid">
            {events.map((evt) => (
              <div
                className={`evt-mgmt-card${
                  !evt.isActive ? ' evt-mgmt-card-inactive' : ''
                }`}
                key={evt.id}
              >
                <div className="evt-mgmt-card-top">
                  <div className="evt-mgmt-card-status">
                    <span
                      className={`evt-mgmt-status-badge ${
                        evt.isActive ? 'active' : 'inactive'
                      }`}
                    >
                      {evt.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>

                  <h3 className="evt-mgmt-card-name">{evt.eventName}</h3>
                  <p className="evt-mgmt-card-desc">
                    {evt.eventDescription}
                  </p>

                  <div className="evt-mgmt-card-meta">
                    <span>🎟️ {evt.totalSlots} Slots</span>
                    <span>
                      👥{' '}
                      {evt.teamSize === 1
                        ? 'Solo'
                        : `${evt.teamSize} Members`}
                    </span>
                    <span>
                      📅{' '}
                      {new Date(evt.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="evt-mgmt-card-actions">
                  <button
                    className="evt-mgmt-action-btn evt-copy"
                    onClick={() => copyLink(evt.id)}
                    title="Copy event link"
                  >
                    {copiedId === evt.id ? '✓ Copied!' : '📋 Copy Link'}
                  </button>
                  <button
                    className="evt-mgmt-action-btn evt-toggle"
                    onClick={() => handleToggle(evt.id, evt.isActive)}
                    title={evt.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {evt.isActive ? '⏸️ Deactivate' : '▶️ Activate'}
                  </button>
                  <button
                    className="evt-mgmt-action-btn evt-edit"
                    onClick={() => handleEdit(evt)}
                    title="Edit event"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="evt-mgmt-action-btn evt-delete"
                    onClick={() => handleDelete(evt.id)}
                    title="Delete event"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
