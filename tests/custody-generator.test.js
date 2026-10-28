import test from "node:test";
import assert from "node:assert/strict";
import { buildScheduleIcs } from "../public/tools/custody-schedule/app.js";

const names = { a: "Mom", b: "Dad" };

test("2-2-3 produces the expected alternating runs over two weeks", () => {
  const ics = buildScheduleIcs({ template: "2-2-3", startDate: "2026-01-05", startParent: "a", names, days: 14 });
  const runs = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d+)\r\nDTEND;VALUE=DATE:(\d+)\r\nSUMMARY:(\w+)/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(runs.map((r) => r[2]), ["Mom", "Dad", "Mom", "Dad", "Mom", "Dad"]);
  assert.deepEqual(runs[0].slice(0, 2), ["20260105", "20260107"]);
  assert.deepEqual(runs[2].slice(0, 2), ["20260109", "20260112"]);
});

test("week on week off alternates full weeks and uses CRLF", () => {
  const ics = buildScheduleIcs({ template: "week-on-week-off", startDate: "2026-01-05", startParent: "b", names, days: 21 });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.match(ics, /SUMMARY:Dad/);
});

test("escapes special characters in parent names", () => {
  const ics = buildScheduleIcs({ template: "2-2-3", startDate: "2026-01-05", startParent: "a", names: { a: "Mom, Jo;", b: "Dad" }, days: 3 });
  assert.match(ics, /SUMMARY:Mom\\, Jo\\;/);
});
