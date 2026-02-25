/**
 * Event CRUD service — backed by Google Apps Script / Google Sheets.
 * Events persist server-side and survive page reloads, browser changes, etc.
 */
import type { EventConfig } from '../types/event';

/* ---- helper ---- */
const getGASUrl = (): string => {
  const url =
    import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    import.meta.env.VITE_ADMIN_AUTH_GAS_URL;
  if (!url) throw new Error('Google Apps Script URL not configured');
  return url;
};

const postToGAS = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const url = getGASUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await response.text();
  return JSON.parse(text) as T;
};

interface GASResponse<T> {
  status: 'success' | 'error';
  message: string;
  data: T;
}

/* ---- reads ---- */
export const getEvents = async (): Promise<EventConfig[]> => {
  const res = await postToGAS<GASResponse<EventConfig[]>>({
    action: 'GET_EVENTS',
  });
  if (res.status === 'success' && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
};

export const getActiveEvents = async (): Promise<EventConfig[]> => {
  const all = await getEvents();
  return all.filter((e) => e.isActive);
};

export const getEventById = async (
  id: string,
): Promise<EventConfig | null> => {
  try {
    const res = await postToGAS<GASResponse<EventConfig>>({
      action: 'GET_EVENTS',
      eventId: id,
    });
    if (res.status === 'success' && res.data && res.data.id) {
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
};

/* ---- writes ---- */
export const createEvent = async (data: {
  eventName: string;
  eventDescription: string;
  totalSlots: number;
  teamSize: number;
}): Promise<EventConfig | null> => {
  const res = await postToGAS<GASResponse<EventConfig>>({
    action: 'CREATE_EVENT',
    ...data,
  });
  if (res.status === 'success' && res.data) {
    return res.data;
  }
  throw new Error(res.message || 'Failed to create event');
};

export const updateEvent = async (
  id: string,
  updates: Partial<Omit<EventConfig, 'id' | 'createdAt'>>,
): Promise<EventConfig | null> => {
  const res = await postToGAS<GASResponse<EventConfig>>({
    action: 'UPDATE_EVENT',
    eventId: id,
    ...updates,
  });
  if (res.status === 'success' && res.data) {
    return res.data;
  }
  throw new Error(res.message || 'Failed to update event');
};

export const deleteEvent = async (id: string): Promise<boolean> => {
  const res = await postToGAS<GASResponse<{ id: string }>>({
    action: 'DELETE_EVENT',
    eventId: id,
  });
  return res.status === 'success';
};
