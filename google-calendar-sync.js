// ============================================================================
// Provider Availability → Google Calendar Sync
// ============================================================================
// SETUP INSTRUCTIONS:
// 1. Go to script.google.com and create a new project
// 2. Paste this entire file, replacing any existing code
// 3. Fill in YOUR_BIN_ID and YOUR_API_KEY below
// 4. Fill in the CALENDAR_IDS map with each provider's Google Calendar ID
// 5. Click Save, then Run → syncAvailability once manually to test
// 6. Click Triggers (clock icon) → Add Trigger:
//    - Function: syncAvailability
//    - Event source: Time-driven
//    - Type: Hour timer
//    - Every: 1 hour
// ============================================================================

// ── YOUR CREDENTIALS ─────────────────────────────────────────────────────────
const BIN_ID = 'YOUR_BIN_ID_HERE';
const API_KEY = 'YOUR_API_KEY_HERE';

// ── PROVIDER → CALENDAR MAPPING ──────────────────────────────────────────────
// Find a calendar's ID in Google Calendar:
// Settings → click the calendar → "Calendar ID" (looks like xxx@group.calendar.google.com)
// Add one entry per provider. The key must match the provider's id in your app (p1, p2, etc.)
// If a provider has no calendar, leave them out of this map.
const CALENDAR_IDS = {
  'p1':  'PROVIDER_1_CALENDAR_ID@group.calendar.google.com',
  'p2':  'PROVIDER_2_CALENDAR_ID@group.calendar.google.com',
  'p3':  'PROVIDER_3_CALENDAR_ID@group.calendar.google.com',
  'p4':  'PROVIDER_4_CALENDAR_ID@group.calendar.google.com',
  'p5':  'PROVIDER_5_CALENDAR_ID@group.calendar.google.com',
  'p6':  'PROVIDER_6_CALENDAR_ID@group.calendar.google.com',
  'p7':  'PROVIDER_7_CALENDAR_ID@group.calendar.google.com',
  'p8':  'PROVIDER_8_CALENDAR_ID@group.calendar.google.com',
  'p9':  'PROVIDER_9_CALENDAR_ID@group.calendar.google.com',
  'p10': 'PROVIDER_10_CALENDAR_ID@group.calendar.google.com',
  'p11': 'PROVIDER_11_CALENDAR_ID@group.calendar.google.com',
  'p12': 'PROVIDER_12_CALENDAR_ID@group.calendar.google.com',
};

// ── SETTINGS ─────────────────────────────────────────────────────────────────
// Tag added to every event created by this script — used to find and clean up old events
const EVENT_TAG = '[Auto-Availability]';

// Day order — week starts Sunday
const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────
function syncAvailability() {
  const data = fetchJSONBin();
  if (!data) {
    Logger.log('ERROR: Could not fetch data from JSONBin');
    return;
  }

  const providers  = data.providers  || [];
  const availability = data.availability || {};

  // Get the current week's Sunday–Saturday date range
  const weekDates = getCurrentWeekDates();
  Logger.log('Syncing week: ' + weekDates['Sunday'].toDateString() + ' → ' + weekDates['Saturday'].toDateString());

  providers.forEach(provider => {
    const calId = CALENDAR_IDS[provider.id];
    if (!calId || calId.includes('PROVIDER_')) {
      Logger.log('Skipping ' + provider.name + ' — no calendar ID configured');
      return;
    }

    let cal;
    try {
      cal = CalendarApp.getCalendarById(calId);
      if (!cal) throw new Error('Calendar not found');
    } catch(e) {
      Logger.log('ERROR: Cannot access calendar for ' + provider.name + ' (' + calId + '): ' + e.message);
      return;
    }

    // Delete all auto-generated events for this week
    clearWeekEvents(cal, weekDates);

    // Create new events from availability data
    const provAvail = availability[provider.id] || {};
    let createdCount = 0;

    DAY_ORDER.forEach(dayName => {
      const dayData = provAvail[dayName];
      if (!dayData) return;

      const date = weekDates[dayName];
      if (!date) return;

      // Shift 1
      if (dayData.s1start && dayData.s1end) {
        createEvent(cal, provider.name, date, dayData.s1start, dayData.s1end, 1);
        createdCount++;
      }

      // Shift 2
      if (dayData.s2start && dayData.s2end) {
        createEvent(cal, provider.name, date, dayData.s2start, dayData.s2end, 2);
        createdCount++;
      }
    });

    Logger.log(provider.name + ': ' + createdCount + ' event(s) created');
  });

  Logger.log('Sync complete at ' + new Date().toLocaleString());
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fetchJSONBin() {
  try {
    const url = 'https://api.jsonbin.io/v3/b/' + BIN_ID + '/latest';
    const options = {
      method: 'GET',
      headers: { 'X-Master-Key': API_KEY },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log('JSONBin HTTP error: ' + response.getResponseCode());
      return null;
    }
    const json = JSON.parse(response.getContentText());
    return json.record || null;
  } catch(e) {
    Logger.log('fetchJSONBin error: ' + e.message);
    return null;
  }
}

function getCurrentWeekDates() {
  // Week resets on Sunday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);

  const dates = {};
  DAY_ORDER.forEach((name, idx) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + idx);
    dates[name] = d;
  });
  return dates;
}

function clearWeekEvents(cal, weekDates) {
  // Delete any events this script previously created in this week
  const sunday   = weekDates['Sunday'];
  const saturday = new Date(weekDates['Saturday']);
  saturday.setHours(23, 59, 59, 999);

  try {
    const events = cal.getEvents(sunday, saturday);
    events.forEach(ev => {
      if (ev.getTitle().startsWith(EVENT_TAG)) {
        ev.deleteEvent();
      }
    });
  } catch(e) {
    Logger.log('clearWeekEvents error: ' + e.message);
  }
}

function createEvent(cal, providerName, date, startStr, endStr, shiftNum) {
  // startStr / endStr are "HH:MM" (24-hour)
  const startTime = parseTime(date, startStr);
  const endTime   = parseTime(date, endStr);

  if (!startTime || !endTime || startTime >= endTime) {
    Logger.log('Skipping invalid time block: ' + startStr + '-' + endStr);
    return;
  }

  const title = EVENT_TAG + ' ' + providerName + ' Available';
  const description = 'Auto-synced from Provider Availability app.\nShift ' + shiftNum + ': ' + formatTime(startStr) + ' – ' + formatTime(endStr);

  try {
    cal.createEvent(title, startTime, endTime, { description: description });
  } catch(e) {
    Logger.log('createEvent error for ' + providerName + ': ' + e.message);
  }
}

function parseTime(date, timeStr) {
  // timeStr = "HH:MM"
  try {
    const parts = timeStr.split(':');
    const d = new Date(date);
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    return d;
  } catch(e) {
    return null;
  }
}

function formatTime(timeStr) {
  // Convert "14:30" to "2:30 PM"
  try {
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h < 12 ? 'AM' : 'PM';
    h = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h + ':' + m + ' ' + ampm;
  } catch(e) {
    return timeStr;
  }
}

// ── MANUAL TEST ───────────────────────────────────────────────────────────────
// Run this function from the Apps Script editor to test without waiting for the trigger
function testSync() {
  Logger.log('=== Manual test run ===');
  syncAvailability();
}
