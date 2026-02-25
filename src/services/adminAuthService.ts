/**
 * Admin Authentication Service
 * Handles admin OTP-based auth via Google Apps Script backend.
 *
 * Flow:
 *   Step 1: SEND_OTP    — verify email + send OTP to inbox
 *   Step 2: VERIFY_OTP  — validate OTP → login
 */

/* ===== Types ===== */
export interface SendOtpResponse {
  status: 'success' | 'error';
  message: string;
  data: {
    email?: string;
    expiresIn?: string;
  };
  timestamp: string;
}

export interface VerifyOtpResponse {
  status: 'success' | 'error';
  message: string;
  data: {
    email?: string;
    name?: string;
    role?: string;
    verified?: boolean;
  };
  timestamp: string;
}

/* ===== Helper ===== */
const getAdminAuthUrl = (): string => {
  // Uses a SEPARATE Apps Script URL for admin auth (SEND_OTP / VERIFY_OTP)
  // Falls back to the shared URL if the dedicated one isn't set
  const url = import.meta.env.VITE_ADMIN_AUTH_GAS_URL || import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (!url) throw new Error('Admin Auth Google Apps Script URL not configured');
  return url;
};

/**
 * Generic POST to Apps Script.
 * GAS deployed as "Anyone" with redirect — use `redirect: 'follow'`.
 */
const postToGAS = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const url = getAdminAuthUrl();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  const text = await response.text();
  return JSON.parse(text) as T;
};

/* ===== Step 1: Send OTP ===== */
/**
 * Verify admin email & send OTP code to their inbox.
 */
export const sendOtp = async (email: string): Promise<SendOtpResponse> => {
  return postToGAS<SendOtpResponse>({
    action: 'SEND_OTP',
    email: email.trim().toLowerCase(),
  });
};

/* ===== Step 2: Verify OTP ===== */
/**
 * Verify the OTP entered by the admin.
 * On success the response includes admin name/role for the session.
 */
export const verifyOtp = async (
  email: string,
  otp: string,
): Promise<VerifyOtpResponse> => {
  return postToGAS<VerifyOtpResponse>({
    action: 'VERIFY_OTP',
    email: email.trim().toLowerCase(),
    otp: otp.trim().toUpperCase(),
  });
};

/* ===== Session Management ===== */
const SESSION_KEY = 'csbs_admin_session';

export interface AdminSession {
  email: string;
  name: string;
  role: string;
  loginAt: number;
}

/** Store admin session in localStorage */
export const saveSession = (session: AdminSession): void => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

/** Retrieve admin session (null if expired or missing) */
export const getSession = (): AdminSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    // Session expires after 24 hours
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - session.loginAt > oneDayMs) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
};

/** Clear admin session (logout) */
export const clearSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/** Check if admin is currently authenticated */
export const isAuthenticated = (): boolean => {
  return getSession() !== null;
};
