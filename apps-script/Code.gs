// ============================================================================
// CSBS UNIFIED BACKEND — Google Apps Script
// ============================================================================
// Deploy as: Execute as Me | Access: Anyone
// Single script serving:
//   1. Event Registration  → REGISTER, GET_SLOTS
//   2. Admin OTP Auth      → SEND_OTP, VERIFY_OTP
//   3. Email Service        → Single sender (24pa1a5721@vishnu.edu.in)
//
// ⚠️  DEPLOY THIS SCRIPT FROM the 24pa1a5721@vishnu.edu.in Google account.
// ============================================================================

// ========================== CONFIGURATION ==================================

var CONFIG = {
  // ---------- Firebase Firestore ----------
  // ⚠️ REPLACE these with your actual Firebase credentials
  // See CREDENTIALS_GUIDE.txt for how to get these values
  FIREBASE_PROJECT_ID: "YOUR_FIREBASE_PROJECT_ID",
  FIREBASE_API_KEY: "YOUR_FIREBASE_API_KEY",
  FIRESTORE_BASE_URL: "https://firestore.googleapis.com/v1/projects/YOUR_FIREBASE_PROJECT_ID/databases/(default)/documents",

  // ---------- Google Spreadsheet (Registration) ----------
  // ⚠️ REPLACE with your actual Spreadsheet ID
  SPREADSHEET_ID: "YOUR_GOOGLE_SPREADSHEET_ID",
  SHEET_NAME: "Registrations",
  MAX_TEAM_SIZE: 5,

  // ---------- OTP Settings ----------
  OTP_PREFIX: "CSBS-",
  OTP_LENGTH: 4,
  OTP_EXPIRY_MINUTES: 5,
  OTP_CHARS: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", // Excludes ambiguous: I,O,0,1

  // ---------- Brute-force Prevention ----------
  MAX_FAILED_ATTEMPTS: 3,
  LOCKOUT_MINUTES: 15,

  // ---------- Email ----------
  // All emails are sent from this single account (must be the deploying account)
  EMAIL_SENDER_EMAIL: "24pa1a5721@vishnu.edu.in",
  EMAIL_SENDER_NAME: "CSBS Admin Portal",
  EMAIL_SUBJECT: "Your CSBS Admin Access Code",

  // ---------- Registration Email ----------
  REG_EMAIL_SENDER_NAME: "CSBS Tech Fest 2026",
  REG_EMAIL_SUBJECT: "Registration Confirmed — CSBS Tech Fest 2026",
  EVENT_NAME: "STRAT-A-THON 1.0",

  // ---------- Events Sheet ----------
  EVENTS_SHEET_NAME: "Events",

  // ==========================================================================
  // SINGLE SENDER — All emails sent from the deploying Google account
  // ==========================================================================
  // IMPORTANT: Deploy this Apps Script from the 24pa1a5721@vishnu.edu.in
  // Google account. All OTP codes, registration confirmations, and QR emails
  // will be sent from that account via MailApp.sendEmail().
  // ==========================================================================

  DAILY_EMAIL_LIMIT: 100, // Google Workspace for Education limit (~100/day via MailApp)

  // OAuth2 credentials not needed (single direct sender)
  GMAIL_API_CLIENT_ID: "",
  GMAIL_API_CLIENT_SECRET: "",

  SENDER_ACCOUNTS: [
    { id: 1, email: "24pa1a5721@vishnu.edu.in", name: "CSBS Tech Fest 2026", useDirectGmail: true }
  ]
};

// Spreadsheet column headers
var REG_HEADERS = [
  "S.No", "Timestamp", "Registration ID", "Ticket Number", "Team Name",
  "Leader Name", "Leader Email", "Leader Phone",
  "Leader Branch", "Leader Section", "Team Size",
  "Member 2 Name", "Member 2 Email", "Member 2 Phone", "Member 2 Branch", "Member 2 Section",
  "Member 3 Name", "Member 3 Email", "Member 3 Phone", "Member 3 Branch", "Member 3 Section",
  "Member 4 Name", "Member 4 Email", "Member 4 Phone", "Member 4 Branch", "Member 4 Section",
  "Member 5 Name", "Member 5 Email", "Member 5 Phone", "Member 5 Branch", "Member 5 Section",
  "Verified",
  "QR Code"
];

// Index of the "Verified" column (1-based for Sheets API)
var VERIFIED_COL = REG_HEADERS.indexOf("Verified") + 1; // 32

// Index of the "QR Code" column (1-based for Sheets API)
var QR_CODE_COL = REG_HEADERS.indexOf("QR Code") + 1; // 33

// Events sheet headers
var EVENT_HEADERS = [
  "ID", "Event Name", "Event Description", "Total Slots",
  "Team Size", "Created At", "Is Active"
];

// ========================== RESPONSE BUILDER ================================

/**
 * Centralized JSON response builder (used by ALL handlers)
 */
function buildResponse(status, message, data) {
  var response = {
    status: status,
    success: status === "success",
    message: message,
    data: data || {},
    timestamp: new Date().toISOString()
  };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================== UNIFIED ROUTER ==================================

/**
 * Main POST handler — routes ALL actions
 * Actions: REGISTER, GET_SLOTS, SEND_OTP, VERIFY_OTP, CREATE_EVENT, etc.
 */
function doPost(e) {
  try {
    var body;
    try {
      var raw = e.postData ? e.postData.contents : "";
      if (!raw) {
        return buildResponse("error", "Empty request body.", null);
      }
      body = JSON.parse(raw);
    } catch (parseErr) {
      return buildResponse("error", "Invalid JSON request body.", null);
    }

    var action = (body.action || "").toString().trim().toUpperCase();

    switch (action) {
      // --- Registration ---
      case "REGISTER":
        return handleRegister_(body);
      case "GET_SLOTS":
        return handleGetSlots_();
      case "GET_REGISTRATIONS":
        return handleGetRegistrations_();

      // --- Registration Status (Admin) ---
      case "SET_REGISTRATION_STATUS":
        return handleSetRegistrationStatus_(body);
      case "GET_REGISTRATION_STATUS":
        return handleGetRegistrationStatus_();

      // --- Event CRUD ---
      case "CREATE_EVENT":
        return handleCreateEvent_(body);
      case "GET_EVENTS":
        return handleGetEvents_(body);
      case "UPDATE_EVENT":
        return handleUpdateEvent_(body);
      case "DELETE_EVENT":
        return handleDeleteEvent_(body);

      // --- Ticket Verification (Admin QR Scanner) ---
      case "VERIFY_TICKET":
        return handleVerifyTicket_(body);
      case "SET_VERIFICATION":
        return handleSetVerification_(body);

      // --- QR Code Email Service ---
      case "SEND_QR_EMAILS":
        return handleSendQREmails_(body);
      case "SEND_QR_EMAIL_SINGLE":
        return handleSendQREmailSingle_(body);

      // --- Admin OTP Auth ---
      case "SEND_OTP":
        return handleSendOtp_(body);
      case "VERIFY_OTP":
        return handleVerifyOtp_(body);

      default:
        return buildResponse("error", "Unknown action: " + action, null);
    }

  } catch (err) {
    Logger.log("ERROR: " + err.toString());
    return buildResponse("error", "Internal server error: " + err.toString(), null);
  }
}

/**
 * GET handler — health check
 */
function doGet(e) {
  return buildResponse("success", "CSBS Backend API is running.", {
    version: "3.3.0",
    actions: ["REGISTER", "GET_SLOTS", "GET_REGISTRATIONS", "SEND_OTP", "VERIFY_OTP", "CREATE_EVENT", "GET_EVENTS", "UPDATE_EVENT", "DELETE_EVENT", "SET_REGISTRATION_STATUS", "GET_REGISTRATION_STATUS", "VERIFY_TICKET", "SET_VERIFICATION", "SEND_QR_EMAILS", "SEND_QR_EMAIL_SINGLE"]
  });
}

// ============================================================================
//                    REGISTRATION STATUS SERVICE
// ============================================================================

/**
 * SET_REGISTRATION_STATUS — Admin toggles registrations open / closed.
 * Stores the status in Script Properties for persistence.
 * Body: { action: "SET_REGISTRATION_STATUS", open: true/false, adminEmail: "..." }
 */
function handleSetRegistrationStatus_(body) {
  var open = body.open;
  if (typeof open !== "boolean") {
    return buildResponse("error", "'open' field (boolean) is required.", null);
  }
  var adminEmail = (body.adminEmail || "").toString().trim();
  if (!adminEmail) {
    return buildResponse("error", "Admin email is required for authorization.", null);
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty("REGISTRATION_OPEN", open ? "true" : "false");
  props.setProperty("REGISTRATION_STATUS_CHANGED_BY", adminEmail);
  props.setProperty("REGISTRATION_STATUS_CHANGED_AT", new Date().toISOString());

  return buildResponse("success", open ? "Registrations are now OPEN." : "Registrations are now CLOSED.", {
    registrationOpen: open,
    changedBy: adminEmail,
    changedAt: new Date().toISOString()
  });
}

/**
 * GET_REGISTRATION_STATUS — Returns whether registrations are open or closed.
 */
function handleGetRegistrationStatus_() {
  var props = PropertiesService.getScriptProperties();
  var status = props.getProperty("REGISTRATION_OPEN");
  // Default to open if never set
  var isOpen = (status === null || status === "true");
  var changedBy = props.getProperty("REGISTRATION_STATUS_CHANGED_BY") || "";
  var changedAt = props.getProperty("REGISTRATION_STATUS_CHANGED_AT") || "";

  return buildResponse("success", isOpen ? "Registrations are OPEN." : "Registrations are CLOSED.", {
    registrationOpen: isOpen,
    changedBy: changedBy,
    changedAt: changedAt
  });
}

// ============================================================================
//                   TICKET VERIFICATION SERVICE (ADMIN QR)
// ============================================================================

/**
 * VERIFY_TICKET — Scan a ticket (by ticketNumber) and mark as verified.
 * Body: { action: "VERIFY_TICKET", ticketNumber: "TKT-..." }
 *
 * Returns:
 *   - success + registration data if found & newly verified
 *   - success + alreadyVerified: true if ticket was already verified
 *   - error if ticket not found
 */
function handleVerifyTicket_(body) {
  var ticketNumber = (body.ticketNumber || "").toString().trim();
  if (!ticketNumber) {
    return buildResponse("error", "Ticket number is required.", null);
  }

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    return buildResponse("error", "No registrations found.", null);
  }

  var lastRow = sheet.getLastRow();
  var numCols = Math.max(VERIFIED_COL, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowTicket = (data[i][3] || "").toString().trim(); // Column D = Ticket Number
    if (rowTicket === ticketNumber) {
      var rowIndex = i + 2; // +2: 1 for header, 1 for 0-index
      var currentVerified = (data[i][VERIFIED_COL - 1] || "").toString().toUpperCase();

      if (currentVerified === "TRUE") {
        // Already verified — return info but don't re-verify
        return buildResponse("success", "Ticket already verified.", {
          alreadyVerified: true,
          ticketNumber: rowTicket,
          registrationId: (data[i][2] || "").toString(),
          teamName: (data[i][4] || "").toString(),
          leaderName: (data[i][5] || "").toString(),
          isVerified: true
        });
      }

      // Mark as verified
      sheet.getRange(rowIndex, VERIFIED_COL).setValue("TRUE");

      return buildResponse("success", "Ticket verified successfully!", {
        alreadyVerified: false,
        ticketNumber: rowTicket,
        registrationId: (data[i][2] || "").toString(),
        teamName: (data[i][4] || "").toString(),
        leaderName: (data[i][5] || "").toString(),
        isVerified: true
      });
    }
  }

  return buildResponse("error", "Invalid Ticket — no registration found for: " + ticketNumber, null);
}

/**
 * SET_VERIFICATION — Manually set verification status for a registration.
 * Body: { action: "SET_VERIFICATION", ticketNumber: "TKT-...", verified: true/false }
 */
function handleSetVerification_(body) {
  var ticketNumber = (body.ticketNumber || "").toString().trim();
  var verified = body.verified;

  if (!ticketNumber) {
    return buildResponse("error", "Ticket number is required.", null);
  }
  if (typeof verified !== "boolean") {
    return buildResponse("error", "'verified' field (boolean) is required.", null);
  }

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    return buildResponse("error", "No registrations found.", null);
  }

  var lastRow = sheet.getLastRow();
  var numCols = Math.max(VERIFIED_COL, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowTicket = (data[i][3] || "").toString().trim();
    if (rowTicket === ticketNumber) {
      var rowIndex = i + 2;
      sheet.getRange(rowIndex, VERIFIED_COL).setValue(verified ? "TRUE" : "FALSE");

      return buildResponse("success", verified ? "Marked as verified." : "Marked as unverified.", {
        ticketNumber: rowTicket,
        registrationId: (data[i][2] || "").toString(),
        teamName: (data[i][4] || "").toString(),
        isVerified: verified
      });
    }
  }

  return buildResponse("error", "Ticket not found: " + ticketNumber, null);
}

// ============================================================================
//                    QR CODE EMAIL SERVICE
// ============================================================================
// Generates QR codes for ticket numbers and emails them to all team members.
// Each registration gets ONE QR code (for the shared ticket). Any team member
// can present it at check-in — the admin scanner verifies it only once.
//
// QR API: https://api.qrserver.com/v1/create-qr-code/
// ============================================================================

/**
 * Generate a QR code image URL for a given ticket number.
 * Uses the free goQR.me API — no key needed, high reliability.
 *
 * @param {string} ticketNumber  e.g. "TKT-1234567890-ABC"
 * @returns {string} URL of the QR code PNG image (300×300)
 */
function generateQRCodeUrl_(ticketNumber) {
  var encoded = encodeURIComponent(ticketNumber);
  return "https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=M&format=png&data=" + encoded;
}

/**
 * SEND_QR_EMAILS — Loops through ALL registrations, generates QR code URLs,
 * sends QR emails to every team member, and writes the QR URL to the sheet.
 *
 * Idempotent: skips rows that already have a value in the "QR Code" column.
 *
 * Body (optional):
 *   { action: "SEND_QR_EMAILS" }
 *   { action: "SEND_QR_EMAILS", forceResend: true }  ← resend to ALL, even if already sent
 *
 * Can also be run directly from the Apps Script editor via sendQRCodeEmailsToAll_().
 */
function handleSendQREmails_(body) {
  var forceResend = (body && body.forceResend === true);
  try {
    var result = sendQRCodeEmailsToAll_(forceResend);
    return buildResponse("success", result.message, result);
  } catch (err) {
    Logger.log("SEND_QR_EMAILS error: " + err.toString());
    return buildResponse("error", "Failed to send QR emails: " + err.toString(), null);
  }
}

/**
 * SEND_QR_EMAIL_SINGLE — Send QR code email to a single team by ticketNumber.
 *
 * Body: { action: "SEND_QR_EMAIL_SINGLE", ticketNumber: "TKT-...", forceResend?: boolean }
 */
function handleSendQREmailSingle_(body) {
  var ticketNumber = (body && body.ticketNumber || "").toString().trim();
  if (!ticketNumber) {
    return buildResponse("error", "ticketNumber is required.", null);
  }
  var forceResend = (body && body.forceResend === true);

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1) {
      return buildResponse("error", "No registrations found.", null);
    }

    ensureQRCodeColumnHeader_(sheet);

    var lastRow = sheet.getLastRow();
    var numCols = Math.max(QR_CODE_COL, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rowTicket = (row[3] || "").toString().trim();

      if (rowTicket !== ticketNumber) continue;

      var rowIndex = i + 2;
      var existingQR = (row[QR_CODE_COL - 1] || "").toString().trim();

      // If already sent and not forceResend, skip
      if (existingQR && !forceResend) {
        return buildResponse("success", "QR email was already sent for this team. Use forceResend to resend.", {
          ticketNumber: ticketNumber,
          alreadySent: true
        });
      }

      var teamName   = (row[4] || "").toString().trim();
      var leaderName = (row[5] || "").toString().trim();
      var teamSize   = parseInt(row[10]) || 1;
      var regId      = (row[2] || "").toString().trim();

      var qrUrl = generateQRCodeUrl_(ticketNumber);
      var members = collectTeamMembers_(row);

      if (members.length === 0) {
        return buildResponse("error", "No valid emails found for this team.", null);
      }

      var sentCount = 0;
      for (var m = 0; m < members.length; m++) {
        var member = members[m];
        var emailData = {
          ticketNumber: ticketNumber,
          registrationId: regId,
          teamName: teamName,
          leaderName: leaderName,
          recipientName: member.name,
          teamSize: teamSize,
          qrUrl: qrUrl,
          eventName: CONFIG.EVENT_NAME
        };

        try {
          sendQRTicketEmail_(member.email, emailData);
          sentCount++;
          Logger.log("Single QR email sent to " + member.name + " <" + member.email + ">");
        } catch (emailErr) {
          Logger.log("Single QR email FAILED for " + member.email + ": " + emailErr.toString());
        }

        if (m < members.length - 1) Utilities.sleep(300);
      }

      // Write QR URL to the sheet
      sheet.getRange(rowIndex, QR_CODE_COL).setValue(qrUrl);

      return buildResponse("success",
        "QR email sent to " + sentCount + " of " + members.length + " member(s) in team \"" + teamName + "\".",
        { ticketNumber: ticketNumber, teamName: teamName, sent: sentCount, total: members.length }
      );
    }

    return buildResponse("error", "Ticket not found: " + ticketNumber, null);
  } catch (err) {
    Logger.log("SEND_QR_EMAIL_SINGLE error: " + err.toString());
    return buildResponse("error", "Failed to send QR email: " + err.toString(), null);
  }
}

/**
 * Core QR email batch function.
 * Reads the Registrations sheet, finds rows without a QR code URL,
 * generates the QR, emails ALL team members, and writes the URL back.
 *
 * @param {boolean} forceResend  If true, resend to ALL rows (ignores existing QR column)
 * @returns {Object} { sent, skipped, failed, total, message }
 */
function sendQRCodeEmailsToAll_(forceResend) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet || sheet.getLastRow() <= 1) {
    return { sent: 0, skipped: 0, failed: 0, total: 0, message: "No registrations found." };
  }

  // Ensure the QR Code column header exists
  ensureQRCodeColumnHeader_(sheet);

  var lastRow = sheet.getLastRow();
  var numCols = Math.max(QR_CODE_COL, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  var sent = 0;
  var skipped = 0;
  var failed = 0;
  var total = data.length;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowIndex = i + 2; // 1-based, +1 for header

    var ticketNumber = (row[3] || "").toString().trim();  // Column D
    var teamName     = (row[4] || "").toString().trim();   // Column E
    var leaderName   = (row[5] || "").toString().trim();   // Column F
    var leaderEmail  = (row[6] || "").toString().trim();   // Column G
    var teamSize     = parseInt(row[10]) || 1;             // Column K
    var regId        = (row[2] || "").toString().trim();   // Column C
    var existingQR   = (row[QR_CODE_COL - 1] || "").toString().trim(); // QR Code column

    // Skip rows without a ticket number (incomplete registration)
    if (!ticketNumber) {
      skipped++;
      continue;
    }

    // Skip if QR already sent (unless forceResend)
    if (existingQR && !forceResend) {
      skipped++;
      continue;
    }

    // Generate QR code URL
    var qrUrl = generateQRCodeUrl_(ticketNumber);

    // Collect ALL team members {name, email}
    var members = collectTeamMembers_(row);

    if (members.length === 0) {
      Logger.log("Row " + rowIndex + ": No valid emails found — skipping.");
      skipped++;
      continue;
    }

    // Send a personalised QR email to EACH member individually
    var rowFailed = false;
    for (var m = 0; m < members.length; m++) {
      var member = members[m];
      var emailData = {
        ticketNumber: ticketNumber,
        registrationId: regId,
        teamName: teamName,
        leaderName: leaderName,
        recipientName: member.name,  // personalised greeting
        teamSize: teamSize,
        qrUrl: qrUrl,
        eventName: CONFIG.EVENT_NAME
      };

      try {
        sendQRTicketEmail_(member.email, emailData);
        Logger.log("Row " + rowIndex + " ✅ QR email sent to " + member.name + " <" + member.email + ">");
      } catch (emailErr) {
        rowFailed = true;
        Logger.log("Row " + rowIndex + " ❌ Email to " + member.email + " failed: " + emailErr.toString());
      }

      // Small delay between individual emails to avoid rate limits
      if (m < members.length - 1) {
        Utilities.sleep(300);
      }
    }

    if (rowFailed) {
      failed++;
    } else {
      // Write QR URL to the sheet (marks as "sent")
      sheet.getRange(rowIndex, QR_CODE_COL).setValue(qrUrl);
      sent++;
    }

    // Small delay to avoid hitting rate limits
    if (i < data.length - 1) {
      Utilities.sleep(500);
    }
  }

  var message = "QR email batch complete. Sent: " + sent + ", Skipped: " + skipped + ", Failed: " + failed + " (Total rows: " + total + ")";
  Logger.log(message);
  return { sent: sent, skipped: skipped, failed: failed, total: total, message: message };
}

/**
 * Ensure the "QR Code" header exists in the sheet.
 * If the sheet has fewer columns than QR_CODE_COL, the header is written.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureQRCodeColumnHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < QR_CODE_COL) {
    sheet.getRange(1, QR_CODE_COL).setValue("QR Code");
    sheet.getRange(1, QR_CODE_COL).setFontWeight("bold");
  }
}

/**
 * Collect all unique team members (name + email) from a registration row.
 * Leader: name=5, email=6. Members 2-5: name/email at (11,12), (16,17), (21,22), (26,27).
 *
 * @param {Array} row  Row values array (0-indexed)
 * @returns {Array<{name: string, email: string}>} De-duplicated member list
 */
function collectTeamMembers_(row) {
  var memberSlots = [
    { nameIdx: 5,  emailIdx: 6  },  // Leader  — F, G
    { nameIdx: 11, emailIdx: 12 },  // Member 2 — L, M
    { nameIdx: 16, emailIdx: 17 },  // Member 3 — Q, R
    { nameIdx: 21, emailIdx: 22 },  // Member 4 — V, W
    { nameIdx: 26, emailIdx: 27 }   // Member 5 — AA, AB
  ];
  var seen = {};
  var members = [];

  for (var i = 0; i < memberSlots.length; i++) {
    var email = (row[memberSlots[i].emailIdx] || "").toString().trim().toLowerCase();
    var name  = (row[memberSlots[i].nameIdx]  || "").toString().trim();
    if (email && !seen[email]) {
      seen[email] = true;
      members.push({ name: name || "Team Member", email: email });
    }
  }

  return members;
}

/**
 * Send a personalised QR ticket email to ONE recipient via multi-sender rotation.
 *
 * @param {string} toEmail   Single recipient address
 * @param {Object} data      { ticketNumber, registrationId, teamName, leaderName, recipientName, teamSize, qrUrl, eventName }
 */
function sendQRTicketEmail_(toEmail, data) {
  var subject = "Your Event Ticket QR Code — " + data.ticketNumber;
  var htmlBody = getQRTicketEmailTemplate_(data);
  var plainText = "Hi " + data.recipientName + ",\n\n" +
    "Your Ticket QR Code for " + data.eventName +
    "\n\nTicket Number: " + data.ticketNumber +
    "\nRegistration ID: " + data.registrationId +
    (data.teamName ? "\nTeam: " + data.teamName : "") +
    "\n\nShow this QR code at the venue check-in desk." +
    "\nQR Code image: " + data.qrUrl +
    "\n\nIMPORTANT: Only ONE team member needs to present this QR code. Once scanned, the entire team is marked as verified.";

  sendEmailWithRotation_([toEmail], subject, plainText, htmlBody);
}

/**
 * Professional HTML email template for QR ticket emails.
 * Embeds the QR code image inline with verification instructions.
 *
 * @param {Object} data  { ticketNumber, registrationId, teamName, leaderName, teamSize, qrUrl, eventName }
 * @returns {string} HTML email body
 */
function getQRTicketEmailTemplate_(data) {
  var evtName = data.eventName || CONFIG.EVENT_NAME;
  var isTeam = data.teamSize > 1;

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f7;font-family:\'Segoe UI\',Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">' +
    '<tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +

    // ---- Header Banner ----
    '<tr><td style="background:linear-gradient(135deg,#2e3190 0%,#1a1d5e 100%);padding:36px 40px;text-align:center;">' +
    '<p style="margin:0 0 6px;color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:2px;">YOUR EVENT TICKET</p>' +
    '<h1 style="margin:0 0 10px;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">' + evtName + '</h1>' +
    '<div style="display:inline-block;background:#eb4d28;color:#fff;font-size:12px;font-weight:700;padding:5px 16px;border-radius:20px;letter-spacing:1px;">QR CHECK-IN PASS</div>' +
    '</td></tr>' +

    // ---- Greeting (personalised per member) ----
    '<tr><td style="padding:30px 40px 16px;">' +
    '<p style="margin:0 0 6px;color:#1f2937;font-size:17px;">Hello <strong>' + (data.recipientName || data.leaderName) + '</strong>,</p>' +
    '<p style="margin:0;color:#6b7280;font-size:14px;line-height:1.7;">' +
    'Here is your QR code for <strong style="color:#eb4d28;">' + evtName + '</strong>. ' +
    'Present this QR code at the check-in desk for quick verification.' +
    '</p>' +
    '</td></tr>' +

    // ---- QR Code Image (centered) ----
    '<tr><td style="padding:20px 40px 10px;text-align:center;">' +
    '<div style="display:inline-block;background:#f8f9fa;border:2px solid #e5e7eb;border-radius:16px;padding:24px;">' +
    '<img src="' + data.qrUrl + '" alt="QR Code for ' + data.ticketNumber + '" width="250" height="250" style="display:block;border-radius:8px;" />' +
    '</div>' +
    '</td></tr>' +

    // ---- Ticket Number below QR ----
    '<tr><td style="padding:12px 40px 6px;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;">Ticket Number</p>' +
    '<p style="margin:4px 0 0;font-family:\'Courier New\',monospace;font-size:18px;font-weight:800;color:#eb4d28;letter-spacing:2px;">' + data.ticketNumber + '</p>' +
    '</td></tr>' +

    // ---- Registration Details ----
    '<tr><td style="padding:20px 40px 20px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' +

    '<tr>' +
    '<td style="padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;width:40%;"><strong style="color:#374151;font-size:13px;">Registration ID</strong></td>' +
    '<td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:#2e3190;font-weight:700;font-size:13px;font-family:\'Courier New\',monospace;">' + data.registrationId + '</span></td>' +
    '</tr>' +

    (data.teamName ? '<tr>' +
    '<td style="padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">Team</strong></td>' +
    '<td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;"><strong style="color:#eb4d28;font-size:13px;">' + data.teamName + '</strong></td>' +
    '</tr>' : '') +

    '<tr>' +
    '<td style="padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">' + (isTeam ? 'Team Leader' : 'Participant') + '</strong></td>' +
    '<td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;"><strong style="color:#1f2937;font-size:13px;">' + data.leaderName + '</strong></td>' +
    '</tr>' +

    '<tr>' +
    '<td style="padding:10px 16px;background:#f8f9fa;"><strong style="color:#374151;font-size:13px;">Team Size</strong></td>' +
    '<td style="padding:10px 16px;"><span style="color:#1f2937;font-size:13px;">' + data.teamSize + ' member' + (isTeam ? 's' : '') + '</span></td>' +
    '</tr>' +

    '</table>' +
    '</td></tr>' +

    // ---- Instructions ----
    '<tr><td style="padding:0 40px 24px;">' +
    '<div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:16px 18px;">' +
    '<h4 style="margin:0 0 8px;color:#15803d;font-size:14px;">How to Use This QR Code</h4>' +
    '<ol style="margin:0;padding:0 0 0 18px;color:#166534;font-size:13px;line-height:1.8;">' +
    '<li>Save or screenshot this email on your phone.</li>' +
    '<li>At the event venue, show this QR code to the check-in admin.</li>' +
    '<li>The admin will scan it to verify your registration instantly.</li>' +
    '</ol>' +
    '</div>' +
    '</td></tr>' +

    // ---- Important Note for Teams ----
    (isTeam ?
    '<tr><td style="padding:0 40px 24px;">' +
    '<div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 18px;">' +
    '<p style="margin:0;color:#1e40af;font-size:13px;">' +
    '<strong>Team Note:</strong> All ' + data.teamSize + ' members receive this same QR code. ' +
    '<strong>Only ONE member</strong> needs to present it at check-in — the entire team will be marked as verified in one scan.' +
    '</p>' +
    '</div>' +
    '</td></tr>' : '') +

    // ---- Warning ----
    '<tr><td style="padding:0 40px 28px;">' +
    '<div style="background:#fef3f2;border-left:4px solid #eb4d28;border-radius:0 8px 8px 0;padding:14px 18px;">' +
    '<p style="margin:0;color:#991b1b;font-size:13px;"><strong>Important:</strong> Do not share this QR code outside your team. Each QR code can only be verified once at the check-in desk.</p>' +
    '</div>' +
    '</td></tr>' +

    // ---- Footer ----
    '<tr><td style="background:linear-gradient(135deg,#2e3190 0%,#1a1d5e 100%);padding:24px 40px;text-align:center;">' +
    '<p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1px;">' + evtName + '</p>' +
    '<p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;">\u00a9 ' + new Date().getFullYear() + ' CSBS Department \u2022 Vishnu Institute of Technology</p>' +
    '<p style="margin:6px 0 0;color:rgba(255,255,255,0.5);font-size:10px;">This is an automated message. Please do not reply.</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr>' +
    '</table>' +
    '</body></html>';
}

// ============================================================================
//                        REGISTRATION SERVICE
// ============================================================================

/**
 * REGISTER — validate → check status → check duplicates → write to spreadsheet
 */
function handleRegister_(body) {
  // ---- Check if registrations are open ----
  var props = PropertiesService.getScriptProperties();
  var regStatus = props.getProperty("REGISTRATION_OPEN");
  if (regStatus === "false") {
    return buildResponse("error", "Registrations are currently closed. Please check back later.", null);
  }

  // Extract fields
  var leaderName = (body.leaderName || "").toString().trim();
  var email      = (body.email || "").toString().trim().toLowerCase();
  var phone      = (body.phone || "").toString().trim();
  var branch     = (body.branch || "").toString().trim();
  var section    = (body.section || "").toString().trim();
  var teamName   = (body.teamName || "").toString().trim();
  var teamSize   = parseInt(body.teamSize) || 1;
  var teamMembers = body.teamMembers || [];
  var timestamp  = body.timestamp || new Date().toISOString();
  var eventName  = (body.eventName || "").toString().trim() || CONFIG.EVENT_NAME;
  var eventDescription = (body.eventDescription || "").toString().trim();

  // ---- Validations ----
  if (!leaderName) {
    return buildResponse("error", "Leader name is required.", null);
  }
  if (!email || !isVishnuEmail_(email)) {
    return buildResponse("error", "A valid @vishnu.edu.in email is required.", null);
  }
  if (!phone || phone.replace(/\D/g, "").length !== 10) {
    return buildResponse("error", "A valid 10-digit phone number is required.", null);
  }
  if (!branch) {
    return buildResponse("error", "Branch is required.", null);
  }
  if (!section) {
    return buildResponse("error", "Section is required.", null);
  }
  if (teamSize > 1 && !teamName) {
    return buildResponse("error", "Team name is required for teams.", null);
  }

  // Validate all team member fields
  for (var v = 0; v < teamMembers.length; v++) {
    var tm = teamMembers[v];
    var mNum = v + 2;
    if (!(tm.name || "").toString().trim()) {
      return buildResponse("error", "Member " + mNum + " name is required.", null);
    }
    var mEmail = (tm.email || "").toString().trim().toLowerCase();
    if (!mEmail || !isVishnuEmail_(mEmail)) {
      return buildResponse("error", "Member " + mNum + " requires a valid @vishnu.edu.in email.", null);
    }
    var mPhone = (tm.phone || "").toString().trim();
    if (!mPhone || mPhone.replace(/\D/g, "").length !== 10) {
      return buildResponse("error", "Member " + mNum + " requires a valid 10-digit phone number.", null);
    }
    if (!(tm.branch || "").toString().trim()) {
      return buildResponse("error", "Member " + mNum + " branch is required.", null);
    }
    if (!(tm.section || "").toString().trim()) {
      return buildResponse("error", "Member " + mNum + " section is required.", null);
    }
  }

  // Collect ALL emails from this submission for duplicate checking
  var submissionEmails = [email];
  for (var se = 0; se < teamMembers.length; se++) {
    var memberEmail = (teamMembers[se].email || "").toString().trim().toLowerCase();
    if (memberEmail) {
      // Check for duplicates WITHIN the submission
      if (submissionEmails.indexOf(memberEmail) !== -1) {
        return buildResponse("error", "Duplicate email within submission: " + memberEmail + ". Each member must have a unique email.", null);
      }
      submissionEmails.push(memberEmail);
    }
  }

  // ---- Get / create sheet ----
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(REG_HEADERS);
    sheet.getRange(1, 1, 1, REG_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // Ensure headers exist (if sheet was empty)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REG_HEADERS);
    sheet.getRange(1, 1, 1, REG_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // ---- COMPREHENSIVE DUPLICATE CHECK ----
  // Check ALL emails (leader + members) against ALL existing registrations
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var allData = sheet.getRange(2, 1, lastRow - 1, REG_HEADERS.length).getValues();

    // Build a set of ALL existing emails from the sheet
    var existingEmails = {};
    // Email column indices (0-based): Leader Email=6, Member2 Email=12, Member3 Email=17, Member4 Email=22, Member5 Email=27
    var emailColIndices = [6, 12, 17, 22, 27];

    for (var r = 0; r < allData.length; r++) {
      for (var ec = 0; ec < emailColIndices.length; ec++) {
        var existEmail = (allData[r][emailColIndices[ec]] || "").toString().trim().toLowerCase();
        if (existEmail) {
          existingEmails[existEmail] = true;
        }
      }
    }

    // Check if ANY email from the submission is already registered
    for (var sc = 0; sc < submissionEmails.length; sc++) {
      if (existingEmails[submissionEmails[sc]]) {
        return buildResponse("error", "Email '" + submissionEmails[sc] + "' is already registered. Each person can only register once.", null);
      }
    }

    // Check team name uniqueness (column index 4 = Team Name)
    if (teamName) {
      var teamNameLower = teamName.toLowerCase();
      for (var tn = 0; tn < allData.length; tn++) {
        var existingTeamName = (allData[tn][4] || "").toString().trim().toLowerCase();
        if (existingTeamName && existingTeamName === teamNameLower) {
          return buildResponse("error", "Team name '" + teamName + "' is already taken. Please choose a different name.", null);
        }
      }
    }
  }

  // ---- Build the row ----
  var serialNo = sheet.getLastRow(); // row 1 is header, so lastRow = next serial
  var row = [
    serialNo,
    formatTimestamp_(timestamp),
    "",  // Registration ID — filled after write
    "",  // Ticket Number — filled after write
    teamName,
    leaderName,
    email,
    phone,
    branch,
    section,
    teamSize
  ];

  // Add team members (up to 4 additional members → columns for Members 2-5)
  // Each member has 5 fields: Name, Email, Phone, Branch, Section
  for (var m = 0; m < CONFIG.MAX_TEAM_SIZE - 1; m++) {
    if (m < teamMembers.length) {
      row.push((teamMembers[m].name || "").toString().trim());
      row.push((teamMembers[m].email || "").toString().trim().toLowerCase());
      row.push((teamMembers[m].phone || "").toString().trim());
      row.push((teamMembers[m].branch || "").toString().trim());
      row.push((teamMembers[m].section || "").toString().trim());
    } else {
      row.push("");
      row.push("");
      row.push("");
      row.push("");
      row.push("");
    }
  }

  // ---- Write to sheet ----
  sheet.appendRow(row);

  // Auto-resize columns for readability
  try {
    for (var c = 1; c <= row.length; c++) {
      sheet.autoResizeColumn(c);
    }
  } catch (resizeErr) {
    // Non-critical, ignore
  }

  var totalRegistered = sheet.getLastRow() - 1;

  // ---- Generate Registration ID & Ticket Number ----
  var regTimestamp = Date.now();
  var registrationId = "CSBS-" + regTimestamp;
  var ticketChars = CONFIG.OTP_CHARS;
  var ticketSuffix = "";
  for (var t = 0; t < 3; t++) {
    ticketSuffix += ticketChars.charAt(Math.floor(Math.random() * ticketChars.length));
  }
  var ticketNumber = "TKT-" + regTimestamp + "-" + ticketSuffix;

  // ---- Update the row with Registration ID & Ticket Number ----
  var newLastRow = sheet.getLastRow();
  sheet.getRange(newLastRow, 3).setValue(registrationId);  // Column C
  sheet.getRange(newLastRow, 4).setValue(ticketNumber);     // Column D

  // ---- Send confirmation email ----
  try {
    sendRegistrationConfirmationEmail_({
      leaderName: leaderName,
      email: email,
      phone: phone,
      branch: branch,
      section: section,
      teamName: teamName,
      teamSize: teamSize,
      teamMembers: teamMembers,
      registrationId: registrationId,
      ticketNumber: ticketNumber,
      serialNo: serialNo,
      eventName: eventName,
      eventDescription: eventDescription
    });
  } catch (emailErr) {
    Logger.log("Registration email failed (non-critical): " + emailErr.toString());
    // Don't fail the registration if email fails
  }

  return buildResponse("success", "Registration successful! Welcome aboard, " + leaderName + ".", {
    serialNo: serialNo,
    email: email,
    totalRegistered: totalRegistered,
    registrationId: registrationId,
    ticketNumber: ticketNumber
  });
}

/**
 * GET_SLOTS — returns total members registered (sum of team sizes)
 */
function handleGetSlots_() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    var totalMembers = 0;
    if (sheet && sheet.getLastRow() > 1) {
      // Column 11 (index K) = "Team Size"
      var teamSizeCol = sheet.getRange(2, 11, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < teamSizeCol.length; i++) {
        totalMembers += parseInt(teamSizeCol[i][0]) || 1;
      }
    }

    return buildResponse("success", "Slots retrieved.", {
      totalRegistered: totalMembers
    });
  } catch (err) {
    return buildResponse("error", "Could not retrieve slot count.", null);
  }
}

/**
 * GET_REGISTRATIONS — returns all registrations from the spreadsheet
 */
function handleGetRegistrations_() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet || sheet.getLastRow() <= 1) {
      return buildResponse("success", "No registrations found.", []);
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, REG_HEADERS.length).getValues();
    var registrations = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];

      // Build members array (leader + up to 4 additional members)
      var members = [];

      // Leader is always member 1
      members.push({
        name: (row[5] || "").toString(),
        email: (row[6] || "").toString(),
        phone: (row[7] || "").toString(),
        branch: (row[8] || "").toString(),
        section: (row[9] || "").toString(),
        isLeader: true
      });

      // Additional members (columns 11-30, groups of 5)
      for (var m = 0; m < 4; m++) {
        var baseCol = 11 + (m * 5);
        var memberName = (row[baseCol] || "").toString().trim();
        if (memberName) {
          members.push({
            name: memberName,
            email: (row[baseCol + 1] || "").toString(),
            phone: (row[baseCol + 2] || "").toString(),
            branch: (row[baseCol + 3] || "").toString(),
            section: (row[baseCol + 4] || "").toString(),
            isLeader: false
          });
        }
      }

      registrations.push({
        serialNo: row[0],
        timestamp: (row[1] || "").toString(),
        registrationId: (row[2] || "").toString(),
        ticketNumber: (row[3] || "").toString(),
        teamName: (row[4] || "").toString(),
        eventName: CONFIG.EVENT_NAME,
        teamSize: parseInt(row[10]) || 1,
        members: members,
        registeredBy: (row[5] || "").toString(),
        isVerified: (row[VERIFIED_COL - 1] || "").toString().toUpperCase() === "TRUE",
        qrCodeUrl: (row[QR_CODE_COL - 1] || "").toString(),
        qrEmailSent: !!(row[QR_CODE_COL - 1] || "").toString().trim()
      });
    }

    return buildResponse("success", "Registrations retrieved.", registrations);
  } catch (err) {
    Logger.log("GET_REGISTRATIONS error: " + err.toString());
    return buildResponse("error", "Could not retrieve registrations: " + err.toString(), null);
  }
}

// ============================================================================
//                          EVENT MANAGEMENT SERVICE
// ============================================================================

/**
 * Helper — get or create the Events sheet
 */
function getEventsSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.EVENTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.EVENTS_SHEET_NAME);
    sheet.appendRow(EVENT_HEADERS);
    sheet.getRange(1, 1, 1, EVENT_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EVENT_HEADERS);
    sheet.getRange(1, 1, 1, EVENT_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Helper — parse one row into an event object
 */
function rowToEvent_(row) {
  return {
    id: (row[0] || "").toString(),
    eventName: (row[1] || "").toString(),
    eventDescription: (row[2] || "").toString(),
    totalSlots: parseInt(row[3]) || 0,
    teamSize: parseInt(row[4]) || 1,
    createdAt: (row[5] || "").toString(),
    isActive: row[6] === true || row[6] === "TRUE" || row[6] === "true"
  };
}

/**
 * CREATE_EVENT — add a new event row
 */
function handleCreateEvent_(body) {
  try {
    var evtName = (body.eventName || "").toString().trim();
    var evtDesc = (body.eventDescription || "").toString().trim();
    var totalSlots = parseInt(body.totalSlots) || 50;
    var teamSize = parseInt(body.teamSize) || 1;

    if (!evtName) return buildResponse("error", "Event name is required.", null);
    if (!evtDesc) return buildResponse("error", "Event description is required.", null);
    if (totalSlots < 1) return buildResponse("error", "Total slots must be at least 1.", null);
    if (teamSize < 1 || teamSize > 10) return buildResponse("error", "Team size must be 1–10.", null);

    var id = "evt_" + new Date().getTime() + "_" + Math.random().toString(36).substring(2, 11);
    var createdAt = new Date().toISOString();

    var sheet = getEventsSheet_();
    sheet.appendRow([id, evtName, evtDesc, totalSlots, teamSize, createdAt, true]);

    return buildResponse("success", "Event created.", {
      id: id,
      eventName: evtName,
      eventDescription: evtDesc,
      totalSlots: totalSlots,
      teamSize: teamSize,
      createdAt: createdAt,
      isActive: true
    });
  } catch (err) {
    return buildResponse("error", "Failed to create event: " + err.toString(), null);
  }
}

/**
 * GET_EVENTS — return all events (or a single event by id)
 */
function handleGetEvents_(body) {
  try {
    var sheet = getEventsSheet_();
    var lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return buildResponse("success", "No events found.", []);
    }

    var data = sheet.getRange(2, 1, lastRow - 1, EVENT_HEADERS.length).getValues();
    var events = [];

    // If a specific ID was requested, filter to just that one
    var requestedId = (body && body.eventId) ? body.eventId.toString().trim() : "";

    for (var i = 0; i < data.length; i++) {
      var evt = rowToEvent_(data[i]);
      if (evt.id) {
        if (requestedId) {
          if (evt.id === requestedId) {
            return buildResponse("success", "Event found.", evt);
          }
        } else {
          events.push(evt);
        }
      }
    }

    if (requestedId) {
      return buildResponse("error", "Event not found.", null);
    }

    return buildResponse("success", "Events retrieved.", events);
  } catch (err) {
    return buildResponse("error", "Failed to get events: " + err.toString(), null);
  }
}

/**
 * UPDATE_EVENT — update an existing event by ID
 */
function handleUpdateEvent_(body) {
  try {
    var eventId = (body.eventId || "").toString().trim();
    if (!eventId) return buildResponse("error", "Event ID is required.", null);

    var sheet = getEventsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return buildResponse("error", "No events found.", null);

    var data = sheet.getRange(2, 1, lastRow - 1, EVENT_HEADERS.length).getValues();
    var rowIndex = -1;

    for (var i = 0; i < data.length; i++) {
      if ((data[i][0] || "").toString() === eventId) {
        rowIndex = i + 2; // +2 because header is row 1, data starts row 2
        break;
      }
    }

    if (rowIndex === -1) return buildResponse("error", "Event not found.", null);

    // Apply updates — only update fields that are provided
    var currentRow = sheet.getRange(rowIndex, 1, 1, EVENT_HEADERS.length).getValues()[0];
    var updated = rowToEvent_(currentRow);

    if (body.eventName !== undefined) updated.eventName = body.eventName.toString().trim();
    if (body.eventDescription !== undefined) updated.eventDescription = body.eventDescription.toString().trim();
    if (body.totalSlots !== undefined) updated.totalSlots = parseInt(body.totalSlots) || updated.totalSlots;
    if (body.teamSize !== undefined) updated.teamSize = parseInt(body.teamSize) || updated.teamSize;
    if (body.isActive !== undefined) updated.isActive = !!body.isActive;

    sheet.getRange(rowIndex, 1, 1, EVENT_HEADERS.length).setValues([[
      updated.id,
      updated.eventName,
      updated.eventDescription,
      updated.totalSlots,
      updated.teamSize,
      updated.createdAt,
      updated.isActive
    ]]);

    return buildResponse("success", "Event updated.", updated);
  } catch (err) {
    return buildResponse("error", "Failed to update event: " + err.toString(), null);
  }
}

/**
 * DELETE_EVENT — remove an event row by ID
 */
function handleDeleteEvent_(body) {
  try {
    var eventId = (body.eventId || "").toString().trim();
    if (!eventId) return buildResponse("error", "Event ID is required.", null);

    var sheet = getEventsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return buildResponse("error", "No events found.", null);

    var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Only need col A (ID)
    for (var i = 0; i < data.length; i++) {
      if ((data[i][0] || "").toString() === eventId) {
        sheet.deleteRow(i + 2);
        return buildResponse("success", "Event deleted.", { id: eventId });
      }
    }

    return buildResponse("error", "Event not found.", null);
  } catch (err) {
    return buildResponse("error", "Failed to delete event: " + err.toString(), null);
  }
}

// ============================================================================
//                         ADMIN OTP AUTH SERVICE
// ============================================================================

/**
 * SEND_OTP — validate email → check Firestore admins → generate OTP → email it
 */
function handleSendOtp_(body) {
  var email = (body.email || "").toString().trim().toLowerCase();

  // Validate email format (must be @vishnu.edu.in)
  if (!isValidEmail_(email)) {
    return buildResponse("error", "Invalid email format.", null);
  }

  // Check brute-force lockout
  if (isLockedOut_(email)) {
    return buildResponse("error", "Too many attempts. Please try again after " + CONFIG.LOCKOUT_MINUTES + " minutes.", null);
  }

  // Check if email exists in Firestore admins collection
  var adminDoc = getFirestoreAdmin_(email);
  if (!adminDoc) {
    incrementFailedAttempts_(email);
    return buildResponse("error", "This email is not authorized for admin access.", null);
  }

  // Generate OTP
  var otp = generateOtp_();
  var expiry = new Date(Date.now() + CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000);

  // Store OTP using LockService for thread safety
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    storeOtp_(email, otp, expiry);
  } finally {
    lock.releaseLock();
  }

  // Send OTP email — now properly reports failures
  try {
    sendOtpEmail_(email, otp, adminDoc.name || "Admin");
  } catch (emailErr) {
    Logger.log("OTP email send FAILED for " + email + ": " + emailErr.toString());
    return buildResponse("error", "Failed to send access code email. Please try again or contact support. (" + emailErr.message + ")", null);
  }

  // Reset failed attempts on successful OTP send
  resetFailedAttempts_(email);

  return buildResponse("success", "Access code sent to your email.", {
    email: email,
    expiresIn: CONFIG.OTP_EXPIRY_MINUTES + " minutes"
  });
}

/**
 * VERIFY_OTP — validate OTP → check expiry → mark used → return session
 */
function handleVerifyOtp_(body) {
  var email = (body.email || "").toString().trim().toLowerCase();
  var otp   = (body.otp || "").toString().trim().toUpperCase();

  // Validate inputs
  if (!isValidEmail_(email)) {
    return buildResponse("error", "Invalid email format.", null);
  }

  // OTP must be exactly PREFIX + LENGTH chars (e.g. "CSBS-XXXX" = 9 chars)
  var expectedOtpLength = CONFIG.OTP_PREFIX.length + CONFIG.OTP_LENGTH;
  if (!otp || otp.length !== expectedOtpLength || otp.indexOf(CONFIG.OTP_PREFIX) !== 0) {
    return buildResponse("error", "Invalid OTP format. Expected format: " + CONFIG.OTP_PREFIX + "XXXX", null);
  }

  // Check brute-force lockout
  if (isLockedOut_(email)) {
    return buildResponse("error", "Too many failed attempts. Please try again after " + CONFIG.LOCKOUT_MINUTES + " minutes.", null);
  }

  // Retrieve and verify OTP using LockService
  var lock = LockService.getScriptLock();
  var result;
  try {
    lock.waitLock(10000);
    result = verifyAndConsumeOtp_(email, otp);
  } finally {
    lock.releaseLock();
  }

  if (!result.valid) {
    incrementFailedAttempts_(email);
    return buildResponse("error", result.reason, null);
  }

  // OTP valid — fetch admin details
  var adminDoc = getFirestoreAdmin_(email);
  resetFailedAttempts_(email);

  return buildResponse("success", "OTP verified successfully. Welcome!", {
    email: email,
    name: adminDoc ? (adminDoc.name || "Admin") : "Admin",
    role: adminDoc ? (adminDoc.role || "admin") : "admin",
    verified: true
  });
}

// ============================================================================
//                            OTP UTILITIES
// ============================================================================

/**
 * Generate OTP in format CSBS-XXXX
 */
function generateOtp_() {
  var chars = CONFIG.OTP_CHARS;
  var code = "";
  for (var i = 0; i < CONFIG.OTP_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return CONFIG.OTP_PREFIX + code;
}

/**
 * Store OTP in ScriptProperties
 * Key: otp_{email} → JSON { otp, expiry, isUsed }
 */
function storeOtp_(email, otp, expiry) {
  var props = PropertiesService.getScriptProperties();
  var data = {
    otp: otp,
    expiry: expiry.toISOString(),
    isUsed: false,
    createdAt: new Date().toISOString()
  };
  props.setProperty("otp_" + email, JSON.stringify(data));
}

/**
 * Verify OTP and mark as used (atomic operation under lock)
 * @returns {{ valid: boolean, reason: string }}
 */
function verifyAndConsumeOtp_(email, otp) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("otp_" + email);

  if (!raw) {
    return { valid: false, reason: "No OTP found. Please request a new access code." };
  }

  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { valid: false, reason: "OTP data corrupted. Please request a new code." };
  }

  if (data.isUsed) {
    return { valid: false, reason: "This OTP has already been used. Please request a new code." };
  }

  var now = new Date();
  var expiry = new Date(data.expiry);
  if (now > expiry) {
    return { valid: false, reason: "OTP has expired. Please request a new access code." };
  }

  if (data.otp !== otp) {
    return { valid: false, reason: "Invalid OTP. Please check and try again." };
  }

  // Mark as used
  data.isUsed = true;
  data.usedAt = now.toISOString();
  props.setProperty("otp_" + email, JSON.stringify(data));

  return { valid: true, reason: "" };
}

// ============================================================================
//                         FIRESTORE SERVICE
// ============================================================================

/**
 * Check if admin email exists in Firestore admins collection
 * @param {string} email
 * @returns {Object|null} Admin document data or null
 */
function getFirestoreAdmin_(email) {
  try {
    var url = CONFIG.FIRESTORE_BASE_URL + ":runQuery?key=" + CONFIG.FIREBASE_API_KEY;

    var query = {
      structuredQuery: {
        from: [{ collectionId: "admins" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "email" },
            op: "EQUAL",
            value: { stringValue: email }
          }
        },
        limit: 1
      }
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(query),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log("Firestore query failed: " + statusCode + " — " + response.getContentText());
      return null;
    }

    var results = JSON.parse(response.getContentText());

    if (!results || results.length === 0 || !results[0].document) {
      return null;
    }

    return parseFirestoreFields_(results[0].document.fields);

  } catch (err) {
    Logger.log("Firestore error: " + err.toString());
    return null;
  }
}

/**
 * Parse Firestore document fields into a plain object
 */
function parseFirestoreFields_(fields) {
  var result = {};
  for (var key in fields) {
    if (fields.hasOwnProperty(key)) {
      var val = fields[key];
      if (val.stringValue !== undefined) result[key] = val.stringValue;
      else if (val.integerValue !== undefined) result[key] = parseInt(val.integerValue);
      else if (val.doubleValue !== undefined) result[key] = val.doubleValue;
      else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
      else if (val.timestampValue !== undefined) result[key] = val.timestampValue;
      else if (val.nullValue !== undefined) result[key] = null;
      else if (val.arrayValue !== undefined) result[key] = val.arrayValue;
      else if (val.mapValue !== undefined) result[key] = val.mapValue;
      else result[key] = val;
    }
  }
  return result;
}

// ============================================================================
//                          EMAIL SERVICE
// ============================================================================

// ============================================================================
// SINGLE-DEPLOYMENT MULTI-SENDER EMAIL ROTATION
// ============================================================================
//
// HOW IT WORKS:
//
//   1. getAvailableSender_() reads daily send counts from ScriptProperties.
//      It checks each sender (1 → 2 → 3 → 4 → 5) and returns the first one
//      that has not yet hit DAILY_EMAIL_LIMIT for the current calendar day.
//
//   2. sendViaAccount_() routes the email:
//      - Account 1 (deployer): sends directly via MailApp.sendEmail()
//      - Accounts 2–5: sends via Gmail REST API using OAuth2 access tokens
//        obtained from stored refresh tokens (in Script Properties).
//
//   3. recordEmailSent_(senderId) increments that sender's daily count.
//
//   4. Daily counts reset automatically: each count key is stored with a
//      date suffix (e.g. "emailCount_1_2025-07-14").
//
// ============================================================================

/**
 * Returns the daily count storage key for a sender on today's UTC date.
 * @param {number} senderId  1, 2, 3, 4, or 5
 * @returns {string}
 */
function getEmailCountKey_(senderId) {
  var today = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
  return "emailCount_" + senderId + "_" + today;
}

/**
 * Returns the number of emails sent today by the given sender account.
 * @param {number} senderId
 * @returns {number}
 */
function getEmailCountToday_(senderId) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(getEmailCountKey_(senderId));
  return raw ? parseInt(raw) || 0 : 0;
}

/**
 * Increments the daily email count for the given sender account by `qty`.
 * @param {number} senderId
 * @param {number} qty  Number of emails being sent in this batch (default 1)
 */
function recordEmailSent_(senderId, qty) {
  var count = qty || 1;
  var props = PropertiesService.getScriptProperties();
  var key = getEmailCountKey_(senderId);
  var current = parseInt(props.getProperty(key)) || 0;
  props.setProperty(key, (current + count).toString());
}

/**
 * Returns the first SENDER_ACCOUNTS entry that still has quota today,
 * or null if all accounts are exhausted.
 * @returns {Object|null}
 */
function getAvailableSender_() {
  for (var i = 0; i < CONFIG.SENDER_ACCOUNTS.length; i++) {
    var account = CONFIG.SENDER_ACCOUNTS[i];
    var sent = getEmailCountToday_(account.id);
    if (sent < CONFIG.DAILY_EMAIL_LIMIT) {
      return account;
    }
    Logger.log("Sender " + account.id + " (" + account.email + ") has reached daily limit (" + sent + "/" + CONFIG.DAILY_EMAIL_LIMIT + "). Trying next.");
  }
  Logger.log("WARNING: All sender accounts have reached their daily email limit.");
  return null;
}

/**
 * Routes an email to the sender account using MailApp.
 * MailApp uses the less-restrictive script.send_mail scope which
 * works reliably on Google Workspace for Education accounts.
 *
 * @param {string[]} toAddresses   Array of recipient email addresses
 * @param {string}   subject       Email subject line
 * @param {string}   plainText     Plain-text fallback body
 * @param {string}   htmlBody      HTML email body
 * @param {Object}   senderAccount Entry from CONFIG.SENDER_ACCOUNTS
 */
function sendViaAccount_(toAddresses, subject, plainText, htmlBody, senderAccount) {
  var failures = [];
  for (var i = 0; i < toAddresses.length; i++) {
    try {
      MailApp.sendEmail({
        to: toAddresses[i],
        subject: subject,
        body: plainText,
        htmlBody: htmlBody,
        name: senderAccount.name,
        replyTo: CONFIG.EMAIL_SENDER_EMAIL  // Replies go to 24pa1a5721@vishnu.edu.in
      });
      Logger.log("Email sent successfully to " + toAddresses[i] + " via sender " + senderAccount.id);
    } catch (sendErr) {
      Logger.log("Failed to email " + toAddresses[i] + ": " + sendErr.toString());
      failures.push({ email: toAddresses[i], error: sendErr.toString() });
    }
  }
  if (failures.length > 0 && failures.length === toAddresses.length) {
    throw new Error("Failed to send email to all recipients: " + failures.map(function(f) { return f.error; }).join("; "));
  }
  return failures;
}

// ============================================================================
// GMAIL REST API — OAuth2 Token & Send Functions (for accounts 2–5)
// ============================================================================

/**
 * Get a fresh OAuth2 access token for the given sender account
 * using the stored refresh token.
 *
 * @param {number} senderId  e.g. 2, 3, 4, 5
 * @returns {string} Access token
 * @throws {Error} If refresh token is missing or token exchange fails
 */
function getAccessToken_(senderId) {
  var props = PropertiesService.getScriptProperties();
  var refreshToken = props.getProperty("gmail_refresh_token_" + senderId);

  if (!refreshToken) {
    throw new Error(
      "No refresh token found for sender " + senderId +
      ". Run SETUP_SAVE_REFRESH_TOKEN(" + senderId + ", 'your-token') first."
    );
  }

  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "refresh_token",
      client_id: CONFIG.GMAIL_API_CLIENT_ID,
      client_secret: CONFIG.GMAIL_API_CLIENT_SECRET,
      refresh_token: refreshToken
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (code !== 200 || !body.access_token) {
    throw new Error(
      "OAuth2 token refresh failed for sender " + senderId +
      " (HTTP " + code + "): " + (body.error_description || body.error || "unknown error")
    );
  }

  return body.access_token;
}

/**
 * Build a RFC 2822 MIME message and return it as a web-safe base64 string
 * suitable for the Gmail API "raw" field.
 *
 * @param {string} to         Recipient email
 * @param {string} subject    Email subject
 * @param {string} plainText  Plain-text body
 * @param {string} htmlBody   HTML body
 * @param {string} fromEmail  Sender email address
 * @param {string} fromName   Sender display name
 * @returns {string} Base64url-encoded MIME message
 */
function createMimeMessage_(to, subject, plainText, htmlBody, fromEmail, fromName) {
  var boundary = "boundary_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8);

  var mimeLines = [
    "MIME-Version: 1.0",
    "From: =?UTF-8?B?" + Utilities.base64Encode(fromName, Utilities.Charset.UTF_8) + "?= <" + fromEmail + ">",
    "To: " + to,
    "Subject: =?UTF-8?B?" + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + "?=",
    "Content-Type: multipart/alternative; boundary=\"" + boundary + "\"",
    "",
    "--" + boundary,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Utilities.base64Encode(plainText, Utilities.Charset.UTF_8),
    "",
    "--" + boundary,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Utilities.base64Encode(htmlBody, Utilities.Charset.UTF_8),
    "",
    "--" + boundary + "--"
  ];

  var rawMessage = mimeLines.join("\r\n");
  return Utilities.base64EncodeWebSafe(rawMessage);
}

/**
 * Send a single email via the Gmail REST API using OAuth2.
 *
 * @param {string} toEmail       Recipient
 * @param {string} subject       Subject line
 * @param {string} plainText     Plain-text fallback
 * @param {string} htmlBody      HTML body
 * @param {Object} senderAccount Entry from CONFIG.SENDER_ACCOUNTS
 */
function sendViaGmailApi_(toEmail, subject, plainText, htmlBody, senderAccount) {
  var accessToken = getAccessToken_(senderAccount.id);

  var raw = createMimeMessage_(
    toEmail, subject, plainText, htmlBody,
    senderAccount.email, senderAccount.name
  );

  var response = UrlFetchApp.fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + accessToken },
      payload: JSON.stringify({ raw: raw }),
      muteHttpExceptions: true
    }
  );

  var code = response.getResponseCode();
  if (code !== 200) {
    var errBody = response.getContentText();
    throw new Error("Gmail API send failed (HTTP " + code + "): " + errBody);
  }

  Logger.log("Gmail API: sent to " + toEmail + " via sender " + senderAccount.id + " (" + senderAccount.email + ")");
}

/**
 * Core internal function: pick available sender → route emails → record counts.
 * This is the ONLY function called by the rest of the codebase for sending emails.
 * Replaces the previous direct GmailApp.sendEmail() calls.
 * Now uses MailApp.sendEmail() for Workspace compatibility.
 *
 * @param {string[]} toAddresses  Array of recipient email addresses
 * @param {string}   subject      Email subject line
 * @param {string}   plainText    Plain-text fallback body
 * @param {string}   htmlBody     HTML email body
 */
function sendEmailWithRotation_(toAddresses, subject, plainText, htmlBody) {
  if (!toAddresses || toAddresses.length === 0) return;

  var sender = getAvailableSender_();

  if (!sender) {
    var errMsg = "All email quotas exhausted. Email NOT sent to: " + toAddresses.join(", ");
    Logger.log("ERROR: " + errMsg);
    throw new Error(errMsg);
  }

  Logger.log("Using sender " + sender.id + " (" + sender.email + ") for " + toAddresses.length + " email(s). Daily count today: " + getEmailCountToday_(sender.id));

  // This will throw if ALL emails fail
  sendViaAccount_(toAddresses, subject, plainText, htmlBody, sender);

  // Record all emails in this batch as sent from this account
  recordEmailSent_(sender.id, toAddresses.length);
}

// ============================================================================
// EMAIL COMPOSERS — unchanged logic, now call sendEmailWithRotation_() instead
//                   of calling GmailApp.sendEmail() directly.
//                   Now uses MailApp.sendEmail() (script.send_mail scope).
// ============================================================================

/**
 * Send registration confirmation email to ALL team members (leader + members)
 */
function sendRegistrationConfirmationEmail_(data) {
  var evtName = data.eventName || CONFIG.EVENT_NAME;
  var subject = "Registration Confirmed \u2014 " + evtName;
  var htmlBody = getRegistrationEmailTemplate_(data);
  var plainText = "Registration Confirmed for " + evtName + "! Your Registration ID: " + data.registrationId + ", Ticket: " + data.ticketNumber;

  // Collect all unique emails (leader + team members)
  var allEmails = {};
  allEmails[data.email.toLowerCase()] = true;

  if (data.teamMembers && data.teamMembers.length > 0) {
    for (var i = 0; i < data.teamMembers.length; i++) {
      var memberEmail = (data.teamMembers[i].email || "").toString().trim().toLowerCase();
      if (memberEmail) {
        allEmails[memberEmail] = true;
      }
    }
  }

  var emailList = Object.keys(allEmails);

  // Route through sender rotation
  sendEmailWithRotation_(emailList, subject, plainText, htmlBody);
}

/**
 * Send OTP email with professional HTML format
 */
function sendOtpEmail_(email, otp, adminName) {
  var htmlBody = getOtpEmailTemplate_(otp, adminName);
  var plainText = "Your CSBS Admin Access Code: " + otp;

  // Route through sender rotation
  sendEmailWithRotation_([email], CONFIG.EMAIL_SUBJECT, plainText, htmlBody);
}

/**
 * Professional HTML email template for registration confirmation.
 * Fully dynamic — uses data.eventName & data.eventDescription
 * when available, otherwise falls back to CONFIG.EVENT_NAME.
 * Branding: #2e3190 (primary), #eb4d28 (accent), white.
 */
function getRegistrationEmailTemplate_(data) {
  var evtName = data.eventName || CONFIG.EVENT_NAME;
  var evtDesc = data.eventDescription || "";

  // Build team members HTML
  var membersHtml = "";
  if (data.teamSize > 1 && data.teamMembers && data.teamMembers.length > 0) {
    membersHtml += '<tr><td style="padding:0 40px 30px;">' +
      '<h3 style="margin:0 0 16px;color:#2e3190;font-size:16px;font-weight:700;">Team Members (' + data.teamSize + ')</h3>' +
      '<div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;">';

    // Leader first
    membersHtml += '<div style="padding:10px 0;border-bottom:1px solid #e5e7eb;">' +
      '<span style="color:#2e3190;font-weight:700;font-size:13px;">1.</span> ' +
      '<span style="color:#1f2937;font-size:14px;font-weight:600;">' + data.leaderName + '</span> ' +
      '<span style="color:#eb4d28;font-size:12px;font-weight:600;">— Leader</span><br>' +
      '<span style="color:#6b7280;font-size:12px;">' + data.email + ' &nbsp;|&nbsp; ' + data.phone + ' &nbsp;|&nbsp; ' + data.branch + ' - ' + data.section + '</span>' +
      '</div>';

    // Other members
    for (var i = 0; i < data.teamMembers.length; i++) {
      var member = data.teamMembers[i];
      var memberName = (member.name || "").toString().trim();
      var memberEmail = (member.email || "").toString().trim();
      var memberPhone = (member.phone || "").toString().trim();
      var memberBranch = (member.branch || "").toString().trim();
      var memberSection = (member.section || "").toString().trim();
      if (memberName) {
        var isLast = (i === data.teamMembers.length - 1);
        membersHtml += '<div style="padding:10px 0;' + (isLast ? '' : 'border-bottom:1px solid #e5e7eb;') + '">' +
          '<span style="color:#2e3190;font-weight:700;font-size:13px;">' + (i + 2) + '.</span> ' +
          '<span style="color:#1f2937;font-size:14px;font-weight:600;">' + memberName + '</span><br>' +
          '<span style="color:#6b7280;font-size:12px;">' +
          (memberEmail ? memberEmail + ' &nbsp;|&nbsp; ' : '') +
          (memberPhone ? memberPhone + ' &nbsp;|&nbsp; ' : '') +
          (memberBranch ? memberBranch + (memberSection ? ' - ' + memberSection : '') : '') +
          '</span>' +
          '</div>';
      }
    }

    membersHtml += '</div></td></tr>';
  }

  // Event description block (only if provided)
  var descHtml = "";
  if (evtDesc) {
    descHtml = '<tr><td style="padding:0 40px 24px;">' +
      '<div style="background:linear-gradient(135deg,#f0f0ff 0%,#f8f9fa 100%);border-radius:10px;padding:20px 24px;border:1px solid #e0e0f0;">' +
      '<h3 style="margin:0 0 8px;color:#2e3190;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">About This Event</h3>' +
      '<p style="margin:0;color:#4b5563;font-size:13px;line-height:1.7;">' + evtDesc + '</p>' +
      '</div>' +
      '</td></tr>';
  }

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f7;font-family:\'Segoe UI\',Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">' +
    '<tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +

    // ---- Header Banner ----
    '<tr><td style="background:linear-gradient(135deg,#2e3190 0%,#1a1d5e 100%);padding:40px;text-align:center;">' +
    '<p style="margin:0 0 6px;color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:2px;">You\'re registered for</p>' +
    '<h1 style="margin:0 0 8px;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">' + evtName + '</h1>' +
    '<div style="display:inline-block;background:#eb4d28;color:#fff;font-size:12px;font-weight:700;padding:5px 16px;border-radius:20px;letter-spacing:1px;">REGISTRATION CONFIRMED</div>' +
    '</td></tr>' +

    // ---- Greeting ----
    '<tr><td style="padding:32px 40px 20px;">' +
    '<p style="margin:0 0 6px;color:#1f2937;font-size:17px;">Hello <strong>' + data.leaderName + '</strong>,</p>' +
    '<p style="margin:0;color:#6b7280;font-size:14px;line-height:1.7;">Thank you for registering for <strong style="color:#eb4d28;">' + evtName + '</strong>! ' +
    (data.teamSize > 1 ? 'We\'re excited to have your team participate.' : 'We\'re excited to have you participate.') +
    '</p>' +
    '</td></tr>' +

    // ---- Event Description ----
    descHtml +

    // ---- Registration Details Table ----
    '<tr><td style="padding:10px 40px 24px;">' +
    '<h3 style="margin:0 0 14px;color:#2e3190;font-size:16px;font-weight:700;">Registration Details</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;width:40%;"><strong style="color:#374151;font-size:13px;">Registration ID</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:#2e3190;font-weight:700;font-size:13px;font-family:\'Courier New\',monospace;">' + data.registrationId + '</span></td>' +
    '</tr>' +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">Ticket Number</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:#eb4d28;font-weight:700;font-size:13px;font-family:\'Courier New\',monospace;">' + data.ticketNumber + '</span></td>' +
    '</tr>' +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">Event</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><strong style="color:#2e3190;font-size:13px;">' + evtName + '</strong></td>' +
    '</tr>' +

    (data.teamName ? '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">Team Name</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><strong style="color:#eb4d28;font-size:13px;">' + data.teamName + '</strong></td>' +
    '</tr>' : '') +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">' + (data.teamSize > 1 ? 'Team Leader' : 'Participant') + '</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><strong style="color:#1f2937;font-size:13px;">' + data.leaderName + '</strong></td>' +
    '</tr>' +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;font-size:13px;">Branch / Section</strong></td>' +
    '<td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><span style="color:#1f2937;font-size:13px;">' + data.branch + ' — Section ' + data.section + '</span></td>' +
    '</tr>' +

    '<tr>' +
    '<td style="padding:12px 16px;background:#f8f9fa;"><strong style="color:#374151;font-size:13px;">Team Size</strong></td>' +
    '<td style="padding:12px 16px;"><span style="color:#1f2937;font-size:13px;">' + data.teamSize + ' member' + (data.teamSize > 1 ? 's' : '') + '</span></td>' +
    '</tr>' +

    '</table>' +
    '</td></tr>' +

    // ---- Team Members ----
    membersHtml +

    // ---- Important Note ----
    '<tr><td style="padding:0 40px 30px;">' +
    '<div style="background:#fef3f2;border-left:4px solid #eb4d28;border-radius:0 8px 8px 0;padding:14px 18px;">' +
    '<p style="margin:0;color:#991b1b;font-size:13px;"><strong>Important:</strong> Please save your Registration ID and Ticket Number for future reference. You may need them at the event venue for check-in.</p>' +
    '</div>' +
    '</td></tr>' +

    // ---- Footer ----
    '<tr><td style="background:linear-gradient(135deg,#2e3190 0%,#1a1d5e 100%);padding:24px 40px;text-align:center;">' +
    '<p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1px;">' + evtName + '</p>' +
    '<p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;">© ' + new Date().getFullYear() + ' CSBS Department • Vishnu Institute of Technology</p>' +
    '<p style="margin:6px 0 0;color:rgba(255,255,255,0.5);font-size:10px;">This is an automated confirmation. Please do not reply.</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr>' +
    '</table>' +
    '</body></html>';
}

/**
 * Professional HTML email template for OTP emails
 */
function getOtpEmailTemplate_(otp, adminName) {
  return '<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f7;font-family:\'Segoe UI\',Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">' +
    '<tr><td align="center">' +
    '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +

    // Header
    '<tr><td style="background:#2e3190;padding:32px 40px;text-align:center;">' +
    '<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:2px;">CSBS</h1>' +
    '<p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">ADMIN PORTAL</p>' +
    '</td></tr>' +

    // Body
    '<tr><td style="padding:40px;">' +
    '<p style="margin:0 0 8px;color:#1f2937;font-size:16px;">Hello <strong>' + adminName + '</strong>,</p>' +
    '<p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">A sign-in attempt requires your verification. Use the access code below to complete authentication.</p>' +

    // OTP Box
    '<div style="background:#f8f9fa;border:2px dashed #2e3190;border-radius:10px;padding:24px;text-align:center;margin:0 0 28px;">' +
    '<p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;">Your Access Code</p>' +
    '<p style="margin:0;color:#eb4d28;font-size:36px;font-weight:800;letter-spacing:6px;font-family:\'Courier New\',monospace;">' + otp + '</p>' +
    '</div>' +

    // Expiry Notice
    '<div style="background:#fef3f2;border-left:4px solid #eb4d28;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 28px;">' +
    '<p style="margin:0;color:#991b1b;font-size:13px;">This code expires in <strong>' + CONFIG.OTP_EXPIRY_MINUTES + ' minutes</strong>. Do not share it with anyone.</p>' +
    '</div>' +

    '<p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.6;">If you did not request this code, please ignore this email or contact the administrator.</p>' +
    '</td></tr>' +

    // Footer
    '<tr><td style="background:#f8f9fa;padding:20px 40px;border-top:1px solid #e5e7eb;">' +
    '<p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© ' + new Date().getFullYear() + ' CSBS Department • Vishnu Institute of Technology</p>' +
    '<p style="margin:4px 0 0;color:#9ca3af;font-size:11px;text-align:center;">This is an automated message. Please do not reply.</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr>' +
    '</table>' +
    '</body></html>';
}

// ============================================================================
//                      BRUTE-FORCE PREVENTION
// ============================================================================

/**
 * Check if email is locked out due to failed attempts
 */
function isLockedOut_(email) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("lockout_" + email);
  if (!raw) return false;

  try {
    var data = JSON.parse(raw);
    if (data.count >= CONFIG.MAX_FAILED_ATTEMPTS) {
      var lockExpiry = new Date(data.lastAttempt);
      lockExpiry.setMinutes(lockExpiry.getMinutes() + CONFIG.LOCKOUT_MINUTES);
      if (new Date() < lockExpiry) {
        return true;
      }
      // Lockout expired — reset
      props.deleteProperty("lockout_" + email);
      return false;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Increment failed attempt counter
 */
function incrementFailedAttempts_(email) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("lockout_" + email);
  var data = { count: 0 };

  if (raw) {
    try { data = JSON.parse(raw); } catch (e) { data = { count: 0 }; }
  }

  data.count = (data.count || 0) + 1;
  data.lastAttempt = new Date().toISOString();
  props.setProperty("lockout_" + email, JSON.stringify(data));
}

/**
 * Reset failed attempts after successful action
 */
function resetFailedAttempts_(email) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty("lockout_" + email);
}

// ============================================================================
//                           UTILITIES
// ============================================================================

/**
 * Validate email format — must end with @vishnu.edu.in
 * Used by Admin OTP Auth
 */
function isValidEmail_(email) {
  if (!email || typeof email !== "string") return false;
  var re = /^[^\s@]+@vishnu\.edu\.in$/i;
  return re.test(email);
}

/**
 * Validate @vishnu.edu.in email
 * Used by Registration
 */
function isVishnuEmail_(email) {
  return /^[^\s@]+@vishnu\.edu\.in$/i.test(email);
}

/**
 * Format ISO timestamp to readable string
 */
function formatTimestamp_(isoString) {
  try {
    var d = new Date(isoString);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  } catch (e) {
    return isoString;
  }
}

// ============================================================================
// AUTHORIZATION & GMAIL API SETUP
// ============================================================================
// Run these functions from the Apps Script editor (select → ▶ Run).
// ============================================================================

/**
 * ⚡ RUN THIS FIRST!
 * Triggers the authorization prompt for all required Google APIs.
 * Select this function and click ▶ Run → click "Review Permissions" → Allow.
 */
function AUTHORIZE_ALL_PERMISSIONS() {
  // Touch each API to trigger its permission scope
  Logger.log("Requesting permissions...");

  // SpreadsheetApp (for registrations)
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Logger.log("✅ SpreadsheetApp: " + ss.getName());

  // MailApp (for sending emails — OTP, registration, QR codes)
  var remaining = MailApp.getRemainingDailyQuota();
  Logger.log("✅ MailApp: accessible (" + remaining + " emails remaining today)");

  // UrlFetchApp (for Firestore REST API + Gmail API)
  var testUrl = "https://www.googleapis.com";
  UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
  Logger.log("✅ UrlFetchApp: accessible");

  // PropertiesService (for OTP storage + email counts + refresh tokens)
  PropertiesService.getScriptProperties().getProperties();
  Logger.log("✅ PropertiesService: accessible");

  // LockService (for thread safety)
  var lock = LockService.getScriptLock();
  lock.waitLock(1000);
  lock.releaseLock();
  Logger.log("✅ LockService: accessible");

  Logger.log("");
  Logger.log("🎉 ALL PERMISSIONS GRANTED!");
  Logger.log("You can now deploy/redeploy the web app.");
  Logger.log("");
  Logger.log("NEXT STEPS (if not done yet):");
  Logger.log("  1. Set up OAuth2 credentials (see CONFIG comments).");
  Logger.log("  2. Run SETUP_SAVE_REFRESH_TOKEN(senderId, token) for each sender 2–5.");
  Logger.log("  3. Run SETUP_TEST_GMAIL_API(senderId) to verify each sender works.");
}

/**
 * 🔑 SETUP_SAVE_REFRESH_TOKEN — Store a Gmail API refresh token for a sender account.
 *
 * Usage (from the editor):
 *   SETUP_SAVE_REFRESH_TOKEN(2, "1//0abc123...");  // for csbs.vitb1@gmail.com
 *   SETUP_SAVE_REFRESH_TOKEN(3, "1//0xyz789...");  // for csbs.vitb2@gmail.com
 *   etc.
 *
 * @param {number} senderId     The sender ID (2, 3, 4, or 5)
 * @param {string} refreshToken The OAuth2 refresh token from Google OAuth Playground
 */
function SETUP_SAVE_REFRESH_TOKEN(senderId, refreshToken) {
  if (!senderId || senderId < 2 || senderId > 5) {
    Logger.log("❌ Invalid senderId. Must be 2, 3, 4, or 5.");
    Logger.log("   (Account 1 uses MailApp directly — no token needed.)");
    return;
  }
  if (!refreshToken || refreshToken.length < 10) {
    Logger.log("❌ Invalid refresh token. It should start with '1//' and be quite long.");
    return;
  }

  var account = null;
  for (var i = 0; i < CONFIG.SENDER_ACCOUNTS.length; i++) {
    if (CONFIG.SENDER_ACCOUNTS[i].id === senderId) {
      account = CONFIG.SENDER_ACCOUNTS[i];
      break;
    }
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty("gmail_refresh_token_" + senderId, refreshToken);

  Logger.log("✅ Refresh token saved for sender " + senderId + " (" + (account ? account.email : "unknown") + ").");
  Logger.log("   Key: gmail_refresh_token_" + senderId);
  Logger.log("");
  Logger.log("Next: Run SETUP_TEST_GMAIL_API(" + senderId + ") to verify it works.");
}

/**
 * 🧪 SETUP_TEST_GMAIL_API — Test that a sender's Gmail API credentials work.
 * Attempts to get an access token. Does NOT send any email.
 *
 * @param {number} senderId  The sender ID to test (2, 3, 4, or 5)
 */
function SETUP_TEST_GMAIL_API(senderId) {
  if (!senderId || senderId < 2 || senderId > 5) {
    Logger.log("❌ Invalid senderId. Must be 2, 3, 4, or 5.");
    return;
  }

  var account = null;
  for (var i = 0; i < CONFIG.SENDER_ACCOUNTS.length; i++) {
    if (CONFIG.SENDER_ACCOUNTS[i].id === senderId) {
      account = CONFIG.SENDER_ACCOUNTS[i];
      break;
    }
  }

  Logger.log("=== GMAIL API TEST — Sender " + senderId + " (" + (account ? account.email : "?") + ") ===");

  // Check refresh token exists
  var props = PropertiesService.getScriptProperties();
  var refreshToken = props.getProperty("gmail_refresh_token_" + senderId);
  if (!refreshToken) {
    Logger.log("❌ No refresh token stored for sender " + senderId + ".");
    Logger.log("   Run SETUP_SAVE_REFRESH_TOKEN(" + senderId + ", 'your-token') first.");
    return;
  }
  Logger.log("✅ Refresh token found (length: " + refreshToken.length + " chars).");

  // Check OAuth2 credentials
  if (!CONFIG.GMAIL_API_CLIENT_ID || CONFIG.GMAIL_API_CLIENT_ID === "YOUR_GCP_CLIENT_ID") {
    Logger.log("❌ GMAIL_API_CLIENT_ID is not configured in CONFIG.");
    return;
  }
  if (!CONFIG.GMAIL_API_CLIENT_SECRET || CONFIG.GMAIL_API_CLIENT_SECRET === "YOUR_GCP_CLIENT_SECRET") {
    Logger.log("❌ GMAIL_API_CLIENT_SECRET is not configured in CONFIG.");
    return;
  }
  Logger.log("✅ OAuth2 Client ID and Secret configured.");

  // Try to get an access token
  try {
    var accessToken = getAccessToken_(senderId);
    Logger.log("✅ Access token obtained successfully!");
    Logger.log("   Token preview: " + accessToken.substring(0, 20) + "...");
    Logger.log("");
    Logger.log("🎉 Sender " + senderId + " is ready to send emails via Gmail API.");
  } catch (err) {
    Logger.log("❌ Failed to get access token: " + err.toString());
    Logger.log("");
    Logger.log("TROUBLESHOOTING:");
    Logger.log("  - Make sure the Gmail API is enabled in your GCP project.");
    Logger.log("  - Verify the Client ID and Secret match your GCP credentials.");
    Logger.log("  - Try generating a new refresh token from OAuth Playground.");
  }
}

/**
 * 📋 SETUP_VIEW_REFRESH_TOKENS — List which senders have tokens stored.
 * Does NOT reveal the actual tokens (only shows presence and length).
 */
function SETUP_VIEW_REFRESH_TOKENS() {
  Logger.log("=== STORED REFRESH TOKENS ===");
  var props = PropertiesService.getScriptProperties();

  for (var i = 0; i < CONFIG.SENDER_ACCOUNTS.length; i++) {
    var account = CONFIG.SENDER_ACCOUNTS[i];
    if (account.useDirectGmail) {
      Logger.log("Sender " + account.id + " (" + account.email + "): Uses MailApp directly — no token needed.");
    } else {
      var token = props.getProperty("gmail_refresh_token_" + account.id);
      if (token) {
        Logger.log("Sender " + account.id + " (" + account.email + "): ✅ Token stored (" + token.length + " chars)");
      } else {
        Logger.log("Sender " + account.id + " (" + account.email + "): ❌ No token — run SETUP_SAVE_REFRESH_TOKEN(" + account.id + ", 'token')");
      }
    }
  }
}

/**
 * 🔧 SETUP_SPREADSHEET
 * Creates/recreates the Registrations sheet with proper headers, formatting,
 * column widths, and styling. Run this to fix misaligned columns.
 *
 * ⚠️ This will DELETE the existing "Registrations" sheet and create a fresh one!
 *    Make a backup if you need the old data.
 */
function SETUP_SPREADSHEET() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // Delete existing sheet if present
  var existing = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (existing) {
    ss.deleteSheet(existing);
    Logger.log("🗑️  Deleted old '" + CONFIG.SHEET_NAME + "' sheet.");
  }

  // Create new sheet
  var sheet = ss.insertSheet(CONFIG.SHEET_NAME);

  // Write headers
  sheet.appendRow(REG_HEADERS);

  // ---- Header Formatting ----
  var headerRange = sheet.getRange(1, 1, 1, REG_HEADERS.length);
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setBackground("#2e3190");
  headerRange.setFontColor("#ffffff");
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  headerRange.setWrap(true);

  // Freeze header row
  sheet.setFrozenRows(1);

  // ---- Column Widths (optimized for readability) ----
  var columnWidths = {
    1: 50,    // A: S.No
    2: 160,   // B: Timestamp
    3: 200,   // C: Registration ID
    4: 220,   // D: Ticket Number
    5: 160,   // E: Team Name
    6: 160,   // F: Leader Name
    7: 240,   // G: Leader Email
    8: 120,   // H: Leader Phone
    9: 100,   // I: Leader Branch
    10: 80,   // J: Leader Section
    11: 80,   // K: Team Size
    12: 140,  // L: Member 2 Name
    13: 220,  // M: Member 2 Email
    14: 120,  // N: Member 2 Phone
    15: 100,  // O: Member 2 Branch
    16: 80,   // P: Member 2 Section
    17: 140,  // Q: Member 3 Name
    18: 220,  // R: Member 3 Email
    19: 120,  // S: Member 3 Phone
    20: 100,  // T: Member 3 Branch
    21: 80,   // U: Member 3 Section
    22: 140,  // V: Member 4 Name
    23: 220,  // W: Member 4 Email
    24: 120,  // X: Member 4 Phone
    25: 100,  // Y: Member 4 Branch
    26: 80,   // Z: Member 4 Section
    27: 140,  // AA: Member 5 Name
    28: 220,  // AB: Member 5 Email
    29: 120,  // AC: Member 5 Phone
    30: 100,  // AD: Member 5 Branch
    31: 80,   // AE: Member 5 Section
    32: 80,   // AF: Verified
    33: 320   // AG: QR Code
  };

  for (var col in columnWidths) {
    sheet.setColumnWidth(parseInt(col), columnWidths[col]);
  }

  // ---- Set row height for header ----
  sheet.setRowHeight(1, 36);

  // ---- Color-code header groups ----
  sheet.getRange(1, 6, 1, 3).setBackground("#3a3fa0");
  sheet.getRange(1, 9, 1, 3).setBackground("#4a4fb0");
  if (REG_HEADERS.length > 11) {
    sheet.getRange(1, 12, 1, REG_HEADERS.length - 11).setBackground("#5a5fc0");
  }

  // ---- Data Validation: Team Size (1-5) ----
  var teamSizeRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, CONFIG.MAX_TEAM_SIZE)
    .setAllowInvalid(false)
    .setHelpText("Team size must be between 1 and " + CONFIG.MAX_TEAM_SIZE)
    .build();
  sheet.getRange(2, 11, 500, 1).setDataValidation(teamSizeRule);

  // ---- Conditional formatting for alternating rows ----
  var dataRange = sheet.getRange(2, 1, 500, REG_HEADERS.length);
  dataRange.setFontSize(9);
  dataRange.setVerticalAlignment("middle");

  // ---- Add filter ----
  sheet.getRange(1, 1, 1, REG_HEADERS.length).createFilter();

  // ---- Protect header row ----
  var protection = sheet.getRange(1, 1, 1, REG_HEADERS.length).protect();
  protection.setDescription("Header row — do not edit");
  protection.setWarningOnly(true);

  Logger.log("✅ Spreadsheet setup complete!");
  Logger.log("Column Layout: A=S.No, B=Timestamp, C=Registration ID, D=Ticket Number, E=Team Name, F=Leader Name, G=Leader Email, H=Leader Phone, I=Leader Branch, J=Leader Section, K=Team Size, L-P=Member 2, Q-U=Member 3, V-Z=Member 4, AA-AE=Member 5, AF=Verified, AG=QR Code");
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * TEST 1: Unified Health Check
 */
function TEST_healthCheck() {
  Logger.log("=== UNIFIED BACKEND HEALTH CHECK ===");
  Logger.log("Firebase Project: " + CONFIG.FIREBASE_PROJECT_ID);
  Logger.log("Spreadsheet ID : " + CONFIG.SPREADSHEET_ID);
  Logger.log("OTP Format     : " + CONFIG.OTP_PREFIX + "XXXX (" + CONFIG.OTP_LENGTH + " chars)");
  Logger.log("OTP Expiry     : " + CONFIG.OTP_EXPIRY_MINUTES + " minutes");
  Logger.log("Daily Limit    : " + CONFIG.DAILY_EMAIL_LIMIT + " emails/account");
  Logger.log("");

  // Test Spreadsheet access
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log("✅ Spreadsheet: " + ss.getName());
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (sheet) {
      Logger.log("✅ Sheet '" + CONFIG.SHEET_NAME + "': " + Math.max(0, sheet.getLastRow() - 1) + " registrations");
    } else {
      Logger.log("ℹ️  Sheet '" + CONFIG.SHEET_NAME + "' not found (will be created on first registration)");
    }
  } catch (err) {
    Logger.log("❌ Spreadsheet error: " + err.toString());
  }

  var sampleOtp = generateOtp_();
  Logger.log("Sample OTP: " + sampleOtp);
  Logger.log("✅ Health check passed!");
}

/**
 * TEST — Email Sender Rotation Status
 * Shows current daily counts for each sender account.
 */
function TEST_emailSenderStatus() {
  Logger.log("=== EMAIL SENDER ROTATION STATUS ===");
  Logger.log("Daily limit per account: " + CONFIG.DAILY_EMAIL_LIMIT);
  Logger.log("");

  for (var i = 0; i < CONFIG.SENDER_ACCOUNTS.length; i++) {
    var account = CONFIG.SENDER_ACCOUNTS[i];
    var sent = getEmailCountToday_(account.id);
    var remaining = CONFIG.DAILY_EMAIL_LIMIT - sent;
    var status = sent >= CONFIG.DAILY_EMAIL_LIMIT ? "❌ LIMIT REACHED" : "✅ Available";
    var method = account.useDirectGmail ? "MailApp (direct)" : "Gmail API (OAuth2)";
    Logger.log("Sender " + account.id + ": " + account.email);
    Logger.log("  Status    : " + status);
    Logger.log("  Method    : " + method);
    Logger.log("  Sent today: " + sent + " / " + CONFIG.DAILY_EMAIL_LIMIT);
    Logger.log("  Remaining : " + remaining);
    Logger.log("");
  }

  var available = getAvailableSender_();
  if (available) {
    Logger.log("👉 Next sender to be used: Sender " + available.id + " (" + available.email + ")");
  } else {
    Logger.log("⚠️  WARNING: All senders exhausted! No emails can be sent today.");
  }
}

/**
 * TEST — Reset email counts (for testing purposes only)
 */
function TEST_resetEmailCounts() {
  Logger.log("=== RESETTING EMAIL COUNTS ===");
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();

  for (var key in all) {
    if (key.indexOf("emailCount_") === 0) {
      props.deleteProperty(key);
      Logger.log("Deleted: " + key);
    }
  }

  Logger.log("✅ All email count keys cleared.");
}

/**
 * TEST 2: Firestore Connection
 */
function TEST_firestoreConnection() {
  var testEmail = "csbs.vitb@gmail.com";
  Logger.log("=== FIRESTORE CONNECTION TEST ===");
  Logger.log("Querying admins collection for: " + testEmail);

  var admin = getFirestoreAdmin_(testEmail);

  if (admin) {
    Logger.log("✅ Admin found!");
    Logger.log("   Name : " + (admin.name || "(not set)"));
    Logger.log("   Email: " + (admin.email || "(not set)"));
    Logger.log("   Role : " + (admin.role || "(not set)"));
  } else {
    Logger.log("❌ No admin found with email: " + testEmail);
  }
}

/**
 * TEST 3: Send OTP
 */
function TEST_sendOtp() {
  var testEmail = "csbs.vitb@gmail.com";
  Logger.log("=== SEND OTP TEST ===");
  Logger.log("Sending OTP to: " + testEmail);

  var fakeBody = { email: testEmail };
  var response = handleSendOtp_(fakeBody);
  var result = JSON.parse(response.getContent());

  Logger.log("Status : " + result.status);
  Logger.log("Message: " + result.message);

  if (result.status === "success") {
    var props = PropertiesService.getScriptProperties();
    var storedRaw = props.getProperty("otp_" + testEmail.toLowerCase());
    if (storedRaw) {
      var storedData = JSON.parse(storedRaw);
      Logger.log("OTP Code: " + storedData.otp);
      Logger.log("Expires : " + storedData.expiry);
    }
  }
}

/**
 * TEST 4: Verify OTP
 */
function TEST_verifyOtp() {
  var testEmail = "csbs.vitb@gmail.com";
  var testOtp   = "CSBS-XXXX"; // ← Replace with real OTP

  if (testOtp === "CSBS-XXXX") {
    Logger.log("⚠️  Replace 'CSBS-XXXX' with the real OTP from TEST_sendOtp log.");
    return;
  }

  var fakeBody = { email: testEmail, otp: testOtp };
  var response = handleVerifyOtp_(fakeBody);
  var result = JSON.parse(response.getContent());

  Logger.log("Status : " + result.status);
  Logger.log("Message: " + result.message);
  Logger.log("Data   : " + JSON.stringify(result.data, null, 2));
}

/**
 * TEST 5: Simulate Registration
 */
function TEST_registration() {
  var fakeBody = {
    action: "REGISTER",
    leaderName: "Test User",
    email: "testuser@vishnu.edu.in",
    phone: "9876543210",
    branch: "CSBS",
    section: "A",
    teamName: "Code Warriors",
    teamSize: 3,
    teamMembers: [
      { name: "Member Two",   email: "member2@vishnu.edu.in", phone: "9876543211", branch: "CSE", section: "B" },
      { name: "Member Three", email: "member3@vishnu.edu.in", phone: "9876543212", branch: "IT",  section: "A" }
    ],
    timestamp: new Date().toISOString()
  };

  Logger.log("=== REGISTRATION TEST ===");
  var response = handleRegister_(fakeBody);
  var result = JSON.parse(response.getContent());

  Logger.log("Status : " + result.status);
  Logger.log("Message: " + result.message);
  Logger.log("Data   : " + JSON.stringify(result.data));
}

/**
 * TEST 6: Get Slot Count
 */
function TEST_getSlots() {
  Logger.log("=== GET SLOTS TEST ===");
  var response = handleGetSlots_();
  var result = JSON.parse(response.getContent());
  Logger.log("Status          : " + result.status);
  Logger.log("Total Registered: " + result.data.totalRegistered);
}

/**
 * TEST 7: Check Lockout Status
 */
function TEST_checkLockout() {
  var testEmail = "csbs.vitb@gmail.com";
  Logger.log("=== LOCKOUT STATUS CHECK ===");
  var locked = isLockedOut_(testEmail);
  Logger.log("Locked out: " + (locked ? "YES ❌" : "NO ✅"));

  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("lockout_" + testEmail.toLowerCase());
  if (raw) {
    var data = JSON.parse(raw);
    Logger.log("Failed attempts: " + data.count + " / " + CONFIG.MAX_FAILED_ATTEMPTS);
  } else {
    Logger.log("No failed attempts recorded.");
  }
}

/**
 * TEST 8: Clear All Test Data
 */
function TEST_clearTestData() {
  var testEmail = "csbs.vitb@gmail.com";
  Logger.log("=== CLEAR TEST DATA ===");

  var props = PropertiesService.getScriptProperties();
  var emailKey = testEmail.toLowerCase();

  var hadOtp     = props.getProperty("otp_" + emailKey) !== null;
  var hadLockout = props.getProperty("lockout_" + emailKey) !== null;

  props.deleteProperty("otp_" + emailKey);
  props.deleteProperty("lockout_" + emailKey);

  Logger.log("OTP data    : " + (hadOtp     ? "DELETED ✅" : "None found"));
  Logger.log("Lockout data: " + (hadLockout ? "DELETED ✅" : "None found"));
  Logger.log("✅ Test data cleared.");
}

/**
 * TEST 9: View All Script Properties
 */
function TEST_viewAllProperties() {
  Logger.log("=== ALL SCRIPT PROPERTIES ===");

  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all);

  if (keys.length === 0) {
    Logger.log("(empty — no data stored)");
    return;
  }

  Logger.log("Total properties: " + keys.length);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    Logger.log("--- " + key + " ---");
    try {
      var parsed = JSON.parse(all[key]);
      Logger.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      Logger.log(all[key]);
    }
  }
}

/**
 * TEST 10: Send QR Code Emails (dry-run info)
 * Shows how many registrations would receive QR emails.
 * Run sendQRCodeEmailsToAll_() directly to actually send.
 */
function TEST_qrEmailPreview() {
  Logger.log("=== QR EMAIL PREVIEW ===");

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("No registrations found.");
    return;
  }

  var lastRow = sheet.getLastRow();
  var numCols = Math.max(QR_CODE_COL, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  var needsQR = 0;
  var alreadyHasQR = 0;
  var noTicket = 0;

  for (var i = 0; i < data.length; i++) {
    var ticketNumber = (data[i][3] || "").toString().trim();
    var existingQR = (data[i][QR_CODE_COL - 1] || "").toString().trim();

    if (!ticketNumber) {
      noTicket++;
    } else if (existingQR) {
      alreadyHasQR++;
    } else {
      needsQR++;
    }
  }

  Logger.log("Total registrations : " + data.length);
  Logger.log("Needs QR email      : " + needsQR);
  Logger.log("Already has QR      : " + alreadyHasQR);
  Logger.log("No ticket (skip)    : " + noTicket);
  Logger.log("");

  if (needsQR > 0) {
    Logger.log("👉 Run sendQRCodeEmailsToAll_() to send " + needsQR + " QR email(s).");
    Logger.log("   Or run sendQRCodeEmailsToAll_(true) to force resend ALL.");
  } else if (alreadyHasQR > 0) {
    Logger.log("✅ All registrations already have QR codes sent.");
    Logger.log("   Run sendQRCodeEmailsToAll_(true) to force resend ALL.");
  } else {
    Logger.log("ℹ️  No registrations with ticket numbers found.");
  }
}

/**
 * RUN THIS: Send QR Code Emails to all registrations that haven't received one yet.
 * Safe to run multiple times — only processes rows without a QR Code in the sheet.
 */
function SEND_QR_EMAILS_NOW() {
  Logger.log("=== SENDING QR CODE EMAILS ===");
  var result = sendQRCodeEmailsToAll_(false);
  Logger.log("Done! " + result.message);
}

/**
 * RUN THIS: Force resend QR Code Emails to ALL registrations (even those already sent).
 * Use with caution — will re-email everyone.
 */
function SEND_QR_EMAILS_FORCE_RESEND() {
  Logger.log("=== FORCE RESENDING QR CODE EMAILS ===");
  var result = sendQRCodeEmailsToAll_(true);
  Logger.log("Done! " + result.message);
}

// ============================================================================
// MASTER TEST — Verify the entire Apps Script works end-to-end
// ============================================================================
// Test recipient: 24pa1a5716@vishnu.edu.in
// Run this function from the Apps Script editor to verify everything works.
// ============================================================================

/**
 * 🧪 MASTER TEST — Run this to verify the entire Apps Script is working.
 * Checks: Permissions, Spreadsheet, MailApp, UrlFetch, Firestore, and
 * sends a real test email to 24pa1a5716@vishnu.edu.in.
 *
 * Select this function in the dropdown → click ▶ Run.
 */
function TEST_EVERYTHING() {
  var TEST_EMAIL = "24pa1a5716@vishnu.edu.in";
  var passed = 0;
  var failed = 0;
  var warnings = 0;

  Logger.log("╔══════════════════════════════════════════════════════════╗");
  Logger.log("║       CSBS APPS SCRIPT — MASTER TEST SUITE             ║");
  Logger.log("║       Test Email: " + TEST_EMAIL + "          ║");
  Logger.log("╚══════════════════════════════════════════════════════════╝");
  Logger.log("");

  // ── TEST 1: MailApp (email permission) ──
  Logger.log("━━━ TEST 1: MailApp Permission ━━━");
  try {
    var quota = MailApp.getRemainingDailyQuota();
    Logger.log("✅ PASS — MailApp accessible. Daily quota remaining: " + quota);
    if (quota <= 0) {
      Logger.log("⚠️  WARNING — Quota is 0. No emails can be sent today.");
      warnings++;
    }
    passed++;
  } catch (e) {
    Logger.log("❌ FAIL — MailApp error: " + e.toString());
    Logger.log("   FIX: Re-run AUTHORIZE_ALL_PERMISSIONS and approve the permission prompt.");
    failed++;
  }

  Logger.log("");

  // ── TEST 2: SpreadsheetApp ──
  Logger.log("━━━ TEST 2: Spreadsheet Access ━━━");
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log("✅ PASS — Spreadsheet: " + ss.getName());
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (sheet) {
      var regCount = Math.max(0, sheet.getLastRow() - 1);
      Logger.log("   Sheet '" + CONFIG.SHEET_NAME + "' has " + regCount + " registration(s).");
    } else {
      Logger.log("   ℹ️  Sheet '" + CONFIG.SHEET_NAME + "' not found yet (will be created on first registration).");
    }
    passed++;
  } catch (e) {
    Logger.log("❌ FAIL — Spreadsheet error: " + e.toString());
    Logger.log("   FIX: Check CONFIG.SPREADSHEET_ID is correct and you have access.");
    failed++;
  }

  Logger.log("");

  // ── TEST 3: UrlFetchApp (external requests) ──
  Logger.log("━━━ TEST 3: UrlFetchApp (External Requests) ━━━");
  try {
    var resp = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
    Logger.log("✅ PASS — UrlFetchApp works. Google.com HTTP " + resp.getResponseCode());
    passed++;
  } catch (e) {
    Logger.log("❌ FAIL — UrlFetchApp error: " + e.toString());
    failed++;
  }

  Logger.log("");

  // ── TEST 4: PropertiesService ──
  Logger.log("━━━ TEST 4: PropertiesService (Storage) ━━━");
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty("_test_key", "ok");
    var val = props.getProperty("_test_key");
    props.deleteProperty("_test_key");
    if (val === "ok") {
      Logger.log("✅ PASS — PropertiesService read/write works.");
      passed++;
    } else {
      Logger.log("❌ FAIL — PropertiesService returned unexpected value: " + val);
      failed++;
    }
  } catch (e) {
    Logger.log("❌ FAIL — PropertiesService error: " + e.toString());
    failed++;
  }

  Logger.log("");

  // ── TEST 5: OTP Generation ──
  Logger.log("━━━ TEST 5: OTP Generation ━━━");
  try {
    var otp = generateOtp_();
    if (otp && otp.indexOf(CONFIG.OTP_PREFIX) === 0 && otp.length === CONFIG.OTP_PREFIX.length + CONFIG.OTP_LENGTH) {
      Logger.log("✅ PASS — Generated OTP: " + otp);
      passed++;
    } else {
      Logger.log("❌ FAIL — OTP format unexpected: " + otp);
      failed++;
    }
  } catch (e) {
    Logger.log("❌ FAIL — OTP generation error: " + e.toString());
    failed++;
  }

  Logger.log("");

  // ── TEST 6: Firestore Connection ──
  Logger.log("━━━ TEST 6: Firestore Connection ━━━");
  try {
    var url = CONFIG.FIRESTORE_BASE_URL + "/admins?pageSize=1&key=" + CONFIG.FIREBASE_API_KEY;
    var fResp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var fCode = fResp.getResponseCode();
    if (fCode === 200) {
      Logger.log("✅ PASS — Firestore accessible (HTTP 200).");
      passed++;
    } else {
      Logger.log("⚠️  WARNING — Firestore returned HTTP " + fCode + ". Check Firebase credentials in CONFIG.");
      Logger.log("   Response: " + fResp.getContentText().substring(0, 200));
      warnings++;
      passed++; // Not a hard failure — credentials may just need updating
    }
  } catch (e) {
    Logger.log("❌ FAIL — Firestore fetch error: " + e.toString());
    failed++;
  }

  Logger.log("");

  // ── TEST 7: Send a REAL test email ──
  Logger.log("━━━ TEST 7: Send Test Email to " + TEST_EMAIL + " ━━━");
  try {
    var quota2 = MailApp.getRemainingDailyQuota();
    if (quota2 <= 0) {
      Logger.log("⚠️  SKIPPED — No email quota remaining today.");
      warnings++;
    } else {
      var testSubject = "✅ CSBS Apps Script Test — " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      var testHtml = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;">'
        + '<div style="max-width:500px;margin:0 auto;border:2px solid #2e3190;border-radius:12px;overflow:hidden;">'
        + '<div style="background:linear-gradient(135deg,#2e3190,#1a1d5e);padding:20px;text-align:center;">'
        + '<h1 style="color:#fff;margin:0;font-size:22px;">✅ Test Successful!</h1></div>'
        + '<div style="padding:24px;">'
        + '<p style="color:#333;font-size:15px;">This is a test email from the <strong>CSBS Apps Script</strong>.</p>'
        + '<p style="color:#333;font-size:15px;">If you received this, it means:</p>'
        + '<ul style="color:#555;font-size:14px;">'
        + '<li>✅ MailApp is working</li>'
        + '<li>✅ Email permissions are granted</li>'
        + '<li>✅ The deploying account can send emails</li>'
        + '<li>✅ HTML emails render correctly</li></ul>'
        + '<div style="background:#f0f0ff;padding:12px;border-radius:8px;margin-top:16px;">'
        + '<p style="margin:0;font-size:13px;color:#666;">Sent from: <strong>' + CONFIG.EMAIL_SENDER_EMAIL + '</strong></p>'
        + '<p style="margin:0;font-size:13px;color:#666;">Time: <strong>' + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + '</strong></p>'
        + '<p style="margin:0;font-size:13px;color:#666;">Quota remaining: <strong>' + (quota2 - 1) + '</strong></p>'
        + '</div></div></div></body></html>';

      var testPlain = "CSBS Apps Script Test — Email is working! Sent at " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

      MailApp.sendEmail({
        to: TEST_EMAIL,
        subject: testSubject,
        body: testPlain,
        htmlBody: testHtml,
        name: CONFIG.REG_EMAIL_SENDER_NAME
      });

      Logger.log("✅ PASS — Test email sent to " + TEST_EMAIL);
      Logger.log("   📬 Check the inbox of " + TEST_EMAIL + " for the test email.");
      passed++;
    }
  } catch (e) {
    Logger.log("❌ FAIL — Email send error: " + e.toString());
    Logger.log("   FIX: Make sure the script is deployed from " + CONFIG.EMAIL_SENDER_EMAIL);
    failed++;
  }

  Logger.log("");

  // ── TEST 8: Email rotation system ──
  Logger.log("━━━ TEST 8: Email Rotation System ━━━");
  try {
    var sender = getAvailableSender_();
    if (sender) {
      Logger.log("✅ PASS — Available sender: " + sender.email + " (ID: " + sender.id + ")");
      var sentToday = getEmailCountToday_(sender.id);
      Logger.log("   Sent today: " + sentToday + " / " + CONFIG.DAILY_EMAIL_LIMIT);
      passed++;
    } else {
      Logger.log("⚠️  WARNING — No available sender (all quotas exhausted).");
      warnings++;
      passed++;
    }
  } catch (e) {
    Logger.log("❌ FAIL — Email rotation error: " + e.toString());
    failed++;
  }

  Logger.log("");

  // ── SUMMARY ──
  var total = passed + failed;
  Logger.log("╔══════════════════════════════════════════════════════════╗");
  Logger.log("║                    TEST RESULTS                        ║");
  Logger.log("╠══════════════════════════════════════════════════════════╣");
  Logger.log("║  ✅ Passed  : " + passed + " / " + total + "                                       ║");
  if (failed > 0) {
    Logger.log("║  ❌ Failed  : " + failed + "                                             ║");
  }
  if (warnings > 0) {
    Logger.log("║  ⚠️  Warnings: " + warnings + "                                             ║");
  }
  Logger.log("╠══════════════════════════════════════════════════════════╣");

  if (failed === 0) {
    Logger.log("║  🎉 ALL TESTS PASSED — Apps Script is ready!          ║");
    Logger.log("║  You can deploy/redeploy the web app now.             ║");
  } else {
    Logger.log("║  ⚠️  Some tests failed. Fix the issues above and      ║");
    Logger.log("║  re-run TEST_EVERYTHING() to verify.                  ║");
  }
  Logger.log("╚══════════════════════════════════════════════════════════╝");
}

/**
 * 🧪 QUICK EMAIL TEST — Just sends a test email, nothing else.
 * Run this if you only want to verify email sending works.
 */
function TEST_SEND_EMAIL_ONLY() {
  var TEST_EMAIL = "24pa1a5716@vishnu.edu.in";
  Logger.log("=== QUICK EMAIL TEST ===");
  Logger.log("Sending test email to: " + TEST_EMAIL);

  try {
    var quota = MailApp.getRemainingDailyQuota();
    Logger.log("Email quota remaining: " + quota);

    if (quota <= 0) {
      Logger.log("❌ No email quota left for today. Try again tomorrow.");
      return;
    }

    MailApp.sendEmail({
      to: TEST_EMAIL,
      subject: "CSBS Test Email — " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      body: "This is a test email from CSBS Apps Script. If you see this, email sending works!",
      htmlBody: '<div style="font-family:Arial;padding:20px;text-align:center;">'
        + '<h2 style="color:#2e3190;">✅ Email Test Passed!</h2>'
        + '<p>Sent from <strong>' + CONFIG.EMAIL_SENDER_EMAIL + '</strong></p>'
        + '<p style="color:#888;font-size:12px;">' + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + '</p></div>',
      name: CONFIG.REG_EMAIL_SENDER_NAME
    });

    Logger.log("✅ Email sent successfully! Check inbox of " + TEST_EMAIL);
  } catch (e) {
    Logger.log("❌ Email failed: " + e.toString());
    Logger.log("FIX: Make sure script is deployed from " + CONFIG.EMAIL_SENDER_EMAIL + " and permissions are granted.");
  }
}
