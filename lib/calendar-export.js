const CRLF = "\r\n";

const escapeText = (value) => String(value ?? "")
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,");

// Fold at 75 octets, never splitting a multi-byte character.
const fold = (line) => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + charSize > limit) {
      parts.push(current);
      current = char;
      size = charSize;
    } else {
      current += char;
      size += charSize;
    }
  }
  parts.push(current);
  return parts.join(CRLF + " ");
};

const pad = (n) => String(n).padStart(2, "0");
const compactDate = (dateStr) => dateStr.replaceAll("-", "");

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const parseTime = (value) => {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(value).trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

const utcStamp = (date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

const allDayEvent = ({ uid, stamp, start, endExclusive, summary, description }) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  `DTSTAMP:${stamp}`,
  `DTSTART;VALUE=DATE:${compactDate(start)}`,
  `DTEND;VALUE=DATE:${compactDate(endExclusive)}`,
  `SUMMARY:${escapeText(summary)}`,
  description ? `DESCRIPTION:${escapeText(description)}` : null,
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
].filter(Boolean);

// Times are written as floating local times so they show at the same hour wherever the calendar is opened.
const timedEvent = ({ uid, stamp, date, time, summary, description, location }) => {
  const startLabel = `${compactDate(date)}T${pad(time.hours)}${pad(time.minutes)}00`;
  const endTotal = time.hours * 60 + time.minutes + 60;
  const endDate = endTotal >= 1440 ? addDays(date, 1) : date;
  const endMinutes = endTotal % 1440;
  const endLabel = `${compactDate(endDate)}T${pad(Math.floor(endMinutes / 60))}${pad(endMinutes % 60)}00`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startLabel}`,
    `DTEND:${endLabel}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    "END:VEVENT",
  ].filter(Boolean);
};

/**
 * Builds an iCalendar file that Apple Calendar, Google Calendar and Outlook can import.
 * custodyFor(dateStr) returns "me", "coparent" or null and is supplied by the caller.
 */
export function buildCalendarIcs({
  events = [],
  custodyFor = () => null,
  startDate,
  days = 365,
  childName = "",
  coparentName = "",
  now = new Date(),
}) {
  const stamp = utcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meridian//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Meridian",
  ];

  const child = childName.trim() || "Your child";
  const coparent = coparentName.trim() || "co-parent";
  const labelFor = (parent) => (parent === "me" ? `${child} with you` : `${child} with ${coparent}`);

  let runStart = null;
  let runParent = null;
  const closeRun = (endExclusive) => {
    if (!runParent) return;
    lines.push(...allDayEvent({
      uid: `custody-${runStart}-${runParent}@mymeridianapp.com`,
      stamp,
      start: runStart,
      endExclusive,
      summary: labelFor(runParent),
    }));
  };
  for (let i = 0; i < days; i += 1) {
    const date = addDays(startDate, i);
    const parent = custodyFor(date);
    if (parent !== runParent) {
      closeRun(date);
      runStart = date;
      runParent = parent;
    }
  }
  closeRun(addDays(startDate, days));

  for (const event of events) {
    if (!event?.date || !event?.title) continue;
    const uid = `event-${event.id ?? `${event.date}-${event.title}`}@mymeridianapp.com`;
    const time = parseTime(event.time);
    lines.push(...(time
      ? timedEvent({ uid, stamp, date: event.date, time, summary: event.title, description: event.notes, location: event.location })
      : allDayEvent({ uid, stamp, start: event.date, endExclusive: addDays(event.date, 1), summary: event.title, description: event.notes })));
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
