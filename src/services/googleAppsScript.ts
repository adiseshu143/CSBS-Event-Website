// Google Apps Script Service
interface FormSubmissionData {
  leaderName: string;
  email: string;
  phone: string;
  branch: string;
  section: string;
  teamName: string;
  teamSize: number;
  teamMembers: Array<{
    name: string;
    email: string;
    phone: string;
    branch: string;
    section: string;
  }>;
  timestamp?: string;
  /** Optional — sent from dynamic event pages for email personalisation */
  eventName?: string;
  eventDescription?: string;
}

interface SubmissionResponse {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Get the Google Apps Script URL from environment variables
 */
const getGASUrl = (): string => {
  const url = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (!url) {
    throw new Error('Google Apps Script URL not configured');
  }
  return url;
};

/**
 * Submit form data to Google Apps Script
 * @param formData - Form data to submit
 * @returns Promise with submission response
 */
export const submitFormToGAS = async (
  formData: FormSubmissionData
): Promise<SubmissionResponse> => {
  try {
    const url = getGASUrl();
    
    // Add action + timestamp to the data
    const dataToSend = {
      action: 'REGISTER',
      ...formData,
      timestamp: new Date().toISOString(),
    };

    // POST with text/plain content-type to avoid CORS preflight
    // and redirect: follow so we get the real JSON response back
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(dataToSend),
      redirect: 'follow',
    });

    const text = await response.text();
    const result = JSON.parse(text);

    return {
      success: result.status === 'success' || result.success === true,
      message: result.message || 'Registration submitted successfully!',
      data: result.data,
    };
  } catch (error) {
    console.error('Error submitting form to Google Apps Script:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to submit registration. Please try again.',
    };
  }
};

/**
 * Fetch registered slot count from the backend (GET_SLOTS)
 * Returns the total number of members registered.
 */
export const fetchRegisteredSlots = async (): Promise<number> => {
  const url = getGASUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'GET_SLOTS' }),
    redirect: 'follow',
  });
  const text = await response.text();
  const result = JSON.parse(text);
  if (result.status === 'success' && result.data) {
    return result.data.totalRegistered ?? 0;
  }
  return 0;
};

/**
 * Prepare form data for submission
 * Ensures all required fields are properly formatted
 */
export const prepareFormData = (
  leaderName: string,
  email: string,
  phone: string,
  branch: string,
  section: string,
  teamName: string,
  teamSize: number,
  teamMembers: Array<{ name: string; email: string; phone: string; branch: string; section: string }>,
  eventName?: string,
  eventDescription?: string,
): FormSubmissionData => {
  const data: FormSubmissionData = {
    leaderName: leaderName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.replace(/[\s\-()]/g, ''),
    branch,
    section,
    teamName: teamName.trim(),
    teamSize,
    teamMembers: teamMembers.map((member) => ({
      name: member.name.trim(),
      email: member.email.trim().toLowerCase(),
      phone: member.phone.replace(/[\s\-()]/g, ''),
      branch: member.branch,
      section: member.section,
    })),
  };
  if (eventName) data.eventName = eventName;
  if (eventDescription) data.eventDescription = eventDescription;
  return data;
};
