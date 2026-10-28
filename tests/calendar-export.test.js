import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarIcs } from "../lib/calendar-export.js";

const now = new Date("2026-10-28T12:00:00Z");

test("merges consecutive custody days into single all-day events", () => {
  const ics = buildCalendarIcs({
    startDate: "2026-11-01",
    days: 4,
    custodyFor: (date) => (date < "2026-11-03" ? "me" : "coparent"),
    childName: "Dawson",
    coparentName: "Eric",
    now,
  });
  assert.match(ics, /SUMMARY:Dawson with you/);
  assert.match(ics, /SUMMARY:Dawson with Eric/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261103/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261105/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
});

test("exports timed events with escaped text and a one-hour duration", () => {
  const ics = buildCalendarIcs({
    startDate: "2026-11-01",
    days: 0,
    events: [{ id: "a1", date: "2026-11-05", time: "3:30 PM", title: "Handoff, school; gate", notes: "Bring bag\nand coat", location: "Main St" }],
    now,
  });
  assert.match(ics, /DTSTART:20261105T153000/);
  assert.match(ics, /DTEND:20261105T163000/);
  assert.match(ics, /SUMMARY:Handoff\\, school\\; gate/);
  assert.match(ics, /DESCRIPTION:Bring bag\\nand coat/);
  assert.match(ics, /LOCATION:Main St/);
});

test("treats events without a time as all-day and rolls late events past midnight", () => {
  const ics = buildCalendarIcs({
    startDate: "2026-11-01",
    days: 0,
    events: [
      { id: "b", date: "2026-12-31", title: "Court date" },
      { id: "c", date: "2026-12-31", time: "11:30 PM", title: "Late call" },
    ],
    now,
  });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(ics, /DTSTART:20261231T233000\r\nDTEND:20270101T003000/);
});

test("uses CRLF endings and folds long lines at 75 octets", () => {
  const ics = buildCalendarIcs({
    startDate: "2026-11-01",
    days: 0,
    events: [{ id: "d", date: "2026-11-02", title: "é".repeat(120) }],
    now,
  });
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.doesNotMatch(ics, /[^\r]\n/);
});
