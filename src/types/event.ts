/**
 * Event configuration — stored server-side in Google Sheets
 * via Google Apps Script backend.
 */
export interface EventConfig {
  /** Unique identifier (e.g. evt_1708..._abc) */
  id: string;
  /** Display name for the event */
  eventName: string;
  /** Short description shown on the event page */
  eventDescription: string;
  /** Maximum number of registration slots */
  totalSlots: number;
  /** Team size (1 = solo). Form generates teamSize-1 extra member fields. */
  teamSize: number;
  /** ISO timestamp when the event was created */
  createdAt: string;
  /** Whether the event is publicly visible */
  isActive: boolean;
}
