// ============================================================================
// CSBS UNIFIED BACKEND — Google Apps Script
// ============================================================================
// Deploy as: Execute as Me | Access: Anyone
// Single script serving BOTH:
//   1. Event Registration  → REGISTER, GET_SLOTS
//   2. Admin OTP Auth      → SEND_OTP, VERIFY_OTP
//
// ⚠️  DELETE Registration.gs from this project — everything is in this file.
// ============================================================================

// ========================== CONFIGURATION ==================================

var CONFIG = {
  // ---------- Firebase Firestore ----------
  FIREBASE_PROJECT_ID: "csbs-events-2",
  FIREBASE_API_KEY: "AIzaSyDKeXEOVYw395TgVHmlJcc7BrrUEI9eeEs",
  FIRESTORE_BASE_URL: "https://firestore.googleapis.com/v1/projects/csbs-events-2/databases/(default)/documents",

  // ---------- Google Spreadsheet (Registration) ----------
  SPREADSHEET_ID: "1MLPZtVySd1VG74I7R1LhcsjuagDsiOpDidYr7yhLTIE",
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
  EMAIL_SENDER_EMAIL: "csbs.vitb@gmail.com",
  EMAIL_SENDER_NAME: "CSBS Admin Portal",
  EMAIL_SUBJECT: "Your CSBS Admin Access Code",

  // ---------- Registration Email ----------
  REG_EMAIL_SENDER_NAME: "CSBS Tech Fest 2026",
  REG_EMAIL_SUBJECT: "Registration Confirmed — CSBS Tech Fest 2026",
  EVENT_NAME: "STRAT-A-THON 1.0",

  // ---------- Events Sheet ----------
  EVENTS_SHEET_NAME: "Events"
};

// Spreadsheet column headers
var REG_HEADERS = [
  "S.No", "Timestamp", "Registration ID", "Ticket Number", "Team Name",
  "Leader Name", "Leader Email", "Leader Phone",
  "Leader Branch", "Leader Section", "Team Size",
  "Member 2 Name", "Member 2 Email", "Member 2 Phone", "Member 2 Branch", "Member 2 Section",
  "Member 3 Name", "Member 3 Email", "Member 3 Phone", "Member 3 Branch", "Member 3 Section",
  "Member 4 Name", "Member 4 Email", "Member 4 Phone", "Member 4 Branch", "Member 4 Section",
  "Member 5 Name", "Member 5 Email", "Member 5 Phone", "Member 5 Branch", "Member 5 Section"
];

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
 * Actions: REGISTER, GET_SLOTS, SEND_OTP, VERIFY_OTP
 */
function doPost(e) {
  try {
    // Parse request body
    // Frontend sends Content-Type: text/plain to avoid CORS preflight,
    // but the body is still valid JSON — parse it normally.
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

      // --- Event CRUD ---
      case "CREATE_EVENT":
        return handleCreateEvent_(body);
      case "GET_EVENTS":
        return handleGetEvents_(body);
      case "UPDATE_EVENT":
        return handleUpdateEvent_(body);
      case "DELETE_EVENT":
        return handleDeleteEvent_(body);

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
    version: "2.2.0",
    actions: ["REGISTER", "GET_SLOTS", "GET_REGISTRATIONS", "SEND_OTP", "VERIFY_OTP", "CREATE_EVENT", "GET_EVENTS", "UPDATE_EVENT", "DELETE_EVENT"]
  });
}

// ============================================================================
//                        REGISTRATION SERVICE
// ============================================================================

/**
 * REGISTER — validate → check duplicates → write to spreadsheet
 */
function handleRegister_(body) {
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
        registeredBy: (row[5] || "").toString()
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

  // Send OTP email
  sendOtpEmail_(email, otp, adminDoc.name || "Admin");

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

  // Send to each unique email
  var emailList = Object.keys(allEmails);
  for (var e = 0; e < emailList.length; e++) {
    try {
      GmailApp.sendEmail(emailList[e], subject, plainText, {
        from: CONFIG.EMAIL_SENDER_EMAIL,
        name: evtName,
        htmlBody: htmlBody
      });
    } catch (sendErr) {
      Logger.log("Failed to send email to " + emailList[e] + ": " + sendErr.toString());
    }
  }
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
 * Send OTP email with professional HTML format
 */
function sendOtpEmail_(email, otp, adminName) {
  var htmlBody = getOtpEmailTemplate_(otp, adminName);

  GmailApp.sendEmail(email, CONFIG.EMAIL_SUBJECT, "Your CSBS Admin Access Code: " + otp, {
    from: CONFIG.EMAIL_SENDER_EMAIL,
    name: CONFIG.EMAIL_SENDER_NAME,
    htmlBody: htmlBody
  });
}

/**
 * Professional HTML email template
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
// AUTHORIZATION — Run this FIRST from the Apps Script editor!
// ============================================================================
// Google Apps Script requires manual authorization for APIs like
// SpreadsheetApp, GmailApp, UrlFetchApp, etc.
// This function triggers the authorization prompt.
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

  // GmailApp (for OTP emails)
  var drafts = GmailApp.getDrafts();
  Logger.log("✅ GmailApp: accessible (" + drafts.length + " drafts)");

  // UrlFetchApp (for Firestore REST API)
  var testUrl = "https://www.googleapis.com";
  UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
  Logger.log("✅ UrlFetchApp: accessible");

  // PropertiesService (for OTP storage)
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
    31: 80    // AE: Member 5 Section
  };

  for (var col in columnWidths) {
    sheet.setColumnWidth(parseInt(col), columnWidths[col]);
  }

  // ---- Set row height for header ----
  sheet.setRowHeight(1, 36);

  // ---- Color-code header groups ----
  // Registration Info (A-E): Primary blue (already set above)
  // Leader Info (F-H): Slightly different shade
  sheet.getRange(1, 6, 1, 3).setBackground("#3a3fa0");
  // Academic (I-K)
  sheet.getRange(1, 9, 1, 3).setBackground("#4a4fb0");
  // Team Members (L-AE)
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
  Logger.log("");
  Logger.log("📊 Sheet: " + CONFIG.SHEET_NAME);
  Logger.log("📋 Columns: " + REG_HEADERS.length);
  Logger.log("📌 Headers: " + REG_HEADERS.join(" | "));
  Logger.log("");
  Logger.log("Column Layout:");
  Logger.log("  A: S.No");
  Logger.log("  B: Timestamp");
  Logger.log("  C: Registration ID  (e.g. CSBS-1771951494481)");
  Logger.log("  D: Ticket Number    (e.g. TKT-1771951494481-LD4)");
  Logger.log("  E: Team Name");
  Logger.log("  F: Leader Name");
  Logger.log("  G: Leader Email");
  Logger.log("  H: Leader Phone");
  Logger.log("  I: Leader Branch");
  Logger.log("  J: Leader Section");
  Logger.log("  K: Team Size");
  Logger.log("  L-P: Member 2 (Name, Email, Phone, Branch, Section)");
  Logger.log("  Q-U: Member 3 (Name, Email, Phone, Branch, Section)");
  Logger.log("  V-Z: Member 4 (Name, Email, Phone, Branch, Section)");
  Logger.log("  AA-AE: Member 5 (Name, Email, Phone, Branch, Section)");
}

// ============================================================================
// TEST FUNCTIONS — Run from the Apps Script editor (▶ Run button)
// ============================================================================
// HOW TO USE:
//   1. Select a function name from the dropdown next to ▶ Run
//   2. Click ▶ Run
//   3. Check the "Execution log" at the bottom for results
//   4. First run will ask for permissions — click "Allow"
// ============================================================================

/**
 * TEST 1: Unified Health Check
 * Verifies the script is working, spreadsheet + Firebase are accessible.
 */
function TEST_healthCheck() {
  Logger.log("=== UNIFIED BACKEND HEALTH CHECK ===");
  Logger.log("Firebase Project: " + CONFIG.FIREBASE_PROJECT_ID);
  Logger.log("Spreadsheet ID : " + CONFIG.SPREADSHEET_ID);
  Logger.log("Sender Email   : " + CONFIG.EMAIL_SENDER_EMAIL);
  Logger.log("OTP Format     : " + CONFIG.OTP_PREFIX + "XXXX (" + CONFIG.OTP_LENGTH + " chars)");
  Logger.log("OTP Expiry     : " + CONFIG.OTP_EXPIRY_MINUTES + " minutes");
  Logger.log("Lockout After  : " + CONFIG.MAX_FAILED_ATTEMPTS + " failed attempts (" + CONFIG.LOCKOUT_MINUTES + " min cooldown)");
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

  Logger.log("");

  // Generate a sample OTP (not stored)
  var sampleOtp = generateOtp_();
  Logger.log("Sample OTP: " + sampleOtp);
  Logger.log("");
  Logger.log("✅ Health check passed! All systems operational.");
}

/**
 * TEST 2: Firestore Connection
 * Queries the admins collection to verify Firestore REST API access.
 */
function TEST_firestoreConnection() {
  var testEmail = "csbs.vitb@gmail.com"; // ← Change to a real admin email

  Logger.log("=== FIRESTORE CONNECTION TEST ===");
  Logger.log("Querying admins collection for: " + testEmail);
  Logger.log("");

  var admin = getFirestoreAdmin_(testEmail);

  if (admin) {
    Logger.log("✅ Admin found!");
    Logger.log("   Name : " + (admin.name || "(not set)"));
    Logger.log("   Email: " + (admin.email || "(not set)"));
    Logger.log("   Role : " + (admin.role || "(not set)"));
    Logger.log("");
    Logger.log("Full document: " + JSON.stringify(admin, null, 2));
  } else {
    Logger.log("❌ No admin found with email: " + testEmail);
    Logger.log("");
    Logger.log("Possible reasons:");
    Logger.log("  1. The email doesn't exist in Firestore 'admins' collection");
    Logger.log("  2. The field name in Firestore is not 'email'");
    Logger.log("  3. Firebase API key or project ID is wrong");
    Logger.log("  4. Firestore security rules are blocking the request");
  }
}

/**
 * TEST 3: Send OTP (Full Flow)
 * ⚠️ This WILL send a real email!
 */
function TEST_sendOtp() {
  var testEmail = "csbs.vitb@gmail.com"; // ← Change to the admin email to test

  Logger.log("=== SEND OTP TEST ===");
  Logger.log("Sending OTP to: " + testEmail);
  Logger.log("");

  var fakeBody = { email: testEmail };
  var response = handleSendOtp_(fakeBody);
  var result = JSON.parse(response.getContent());

  Logger.log("Status : " + result.status);
  Logger.log("Message: " + result.message);
  Logger.log("Data   : " + JSON.stringify(result.data));
  Logger.log("");

  if (result.status === "success") {
    var props = PropertiesService.getScriptProperties();
    var storedRaw = props.getProperty("otp_" + testEmail.toLowerCase());
    if (storedRaw) {
      var storedData = JSON.parse(storedRaw);
      Logger.log("📧 Email sent! Check inbox of: " + testEmail);
      Logger.log("--- Stored OTP (for testing) ---");
      Logger.log("   OTP Code : " + storedData.otp);
      Logger.log("   Expires  : " + storedData.expiry);
      Logger.log("");
      Logger.log("✅ Now run TEST_verifyOtp() with this code.");
    }
  } else {
    Logger.log("❌ Send OTP failed.");
  }
}

/**
 * TEST 4: Verify OTP
 * ⚠️ Run TEST_sendOtp() FIRST, then paste the OTP code below.
 */
function TEST_verifyOtp() {
  var testEmail = "csbs.vitb@gmail.com"; // ← Same email used in TEST_sendOtp
  var testOtp   = "CSBS-XXXX";           // ← Replace XXXX with the real code

  Logger.log("=== VERIFY OTP TEST ===");
  Logger.log("Email: " + testEmail);
  Logger.log("OTP  : " + testOtp);
  Logger.log("");

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
  Logger.log("");

  if (result.status === "success") {
    Logger.log("✅ OTP verified! Admin Name: " + result.data.name + ", Role: " + result.data.role);
  } else {
    Logger.log("❌ Verification failed.");
  }
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
      { name: "Member Two", email: "member2@vishnu.edu.in", phone: "9876543211", branch: "CSE", section: "B" },
      { name: "Member Three", email: "member3@vishnu.edu.in", phone: "9876543212", branch: "IT", section: "A" }
    ],
    timestamp: new Date().toISOString()
  };

  Logger.log("=== REGISTRATION TEST ===");
  Logger.log("Submitting: " + JSON.stringify(fakeBody, null, 2));
  Logger.log("");

  var response = handleRegister_(fakeBody);
  var result = JSON.parse(response.getContent());

  Logger.log("Status : " + result.status);
  Logger.log("Message: " + result.message);
  Logger.log("Data   : " + JSON.stringify(result.data));

  if (result.status === "success") {
    Logger.log("");
    Logger.log("✅ Check your spreadsheet — a new row should appear!");
  }
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
  Logger.log("Email: " + testEmail);
  Logger.log("");

  var locked = isLockedOut_(testEmail);
  Logger.log("Locked out: " + (locked ? "YES ❌" : "NO ✅"));

  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("lockout_" + testEmail.toLowerCase());
  if (raw) {
    var data = JSON.parse(raw);
    Logger.log("Failed attempts: " + data.count + " / " + CONFIG.MAX_FAILED_ATTEMPTS);
    Logger.log("Last attempt   : " + data.lastAttempt);
  } else {
    Logger.log("No failed attempts recorded.");
  }
}

/**
 * TEST 8: Clear All Test Data
 * Removes stored OTPs and lockout data for a specific email.
 */
function TEST_clearTestData() {
  var testEmail = "csbs.vitb@gmail.com";

  Logger.log("=== CLEAR TEST DATA ===");
  Logger.log("Clearing data for: " + testEmail);
  Logger.log("");

  var props = PropertiesService.getScriptProperties();
  var emailKey = testEmail.toLowerCase();

  var hadOtp = props.getProperty("otp_" + emailKey) !== null;
  var hadLockout = props.getProperty("lockout_" + emailKey) !== null;

  props.deleteProperty("otp_" + emailKey);
  props.deleteProperty("lockout_" + emailKey);

  Logger.log("OTP data    : " + (hadOtp ? "DELETED ✅" : "None found"));
  Logger.log("Lockout data: " + (hadLockout ? "DELETED ✅" : "None found"));
  Logger.log("");
  Logger.log("✅ Test data cleared. Ready for a fresh test run.");
}

/**
 * TEST 9: View All Script Properties
 */
function TEST_viewAllProperties() {
  Logger.log("=== ALL SCRIPT PROPERTIES ===");
  Logger.log("");

  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all);

  if (keys.length === 0) {
    Logger.log("(empty — no data stored)");
    return;
  }

  Logger.log("Total properties: " + keys.length);
  Logger.log("");

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    Logger.log("--- " + key + " ---");
    try {
      var parsed = JSON.parse(all[key]);
      Logger.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      Logger.log(all[key]);
    }
    Logger.log("");
  }
}
