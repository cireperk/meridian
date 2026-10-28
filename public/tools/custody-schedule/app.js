const TEMPLATES = {
  "2-2-3": { label: "2-2-3", pattern: [2, 2, 3], alternatesByWeek: true, blurb: "2 days, 2 days, then 3 days, flipping each week. Kids see both parents every few days." },
  "2-2-5-5": { label: "2-2-5-5", pattern: [2, 2, 5, 5], alternatesByWeek: false, blurb: "Two days each on weekdays, then five-day blocks. Same weekdays every week." },
  "week-on-week-off": { label: "Week on / week off", pattern: [7, 7], alternatesByWeek: false, blurb: "Alternating full weeks. Simple, with only one handoff a week." },
  "every-other-weekend": { label: "Every other weekend", pattern: [5, 2], alternatesByWeek: true, blurb: "One parent has weekdays, the other has alternating weekends." },
};

const DAY_MS = 86400000;
const parse = (value) => new Date(`${value}T00:00:00Z`);
const fmt = (date) => date.toISOString().slice(0, 10);
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);

function parentFor(template, startDate, startParent, dateStr) {
  const config = TEMPLATES[template];
  const diff = Math.floor((parse(dateStr) - parse(startDate)) / DAY_MS);
  if (diff < 0) return null;
  const patternLength = config.pattern.reduce((a, b) => a + b, 0);
  const fullCycle = patternLength * (config.alternatesByWeek ? 2 : 1);
  const pos = ((diff % fullCycle) + fullCycle) % fullCycle;
  const alternate = config.alternatesByWeek && pos >= patternLength;
  const inPattern = pos % patternLength;
  let acc = 0;
  for (let i = 0; i < config.pattern.length; i++) {
    acc += config.pattern[i];
    if (inPattern < acc) {
      const isStart = (i % 2 === 0) !== alternate;
      return isStart ? startParent : startParent === "a" ? "b" : "a";
    }
  }
  return null;
}

function track(event) {
  const body = new Blob([JSON.stringify({ event })], { type: "application/json" });
  if (navigator.sendBeacon && navigator.sendBeacon("/api/analytics", body)) return;
  fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {});
}

const icsEscape = (value) => String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (dateStr) => dateStr.replaceAll("-", "");

export function buildScheduleIcs({ template, startDate, startParent, names, days }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Meridian//Custody Schedule Generator//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Custody schedule"];
  let runParent = null;
  let runStart = null;
  const flush = (endExclusive) => {
    if (!runParent) return;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${template}-${startDate}-${runStart}-${runParent}@mymeridianapp.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(runStart)}`,
      `DTEND;VALUE=DATE:${compact(endExclusive)}`,
      `SUMMARY:${icsEscape(names[runParent])}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  };
  for (let i = 0; i < days; i++) {
    const day = fmt(addDays(parse(startDate), i));
    const parent = parentFor(template, startDate, startParent, day);
    if (parent !== runParent) {
      flush(day);
      runParent = parent;
      runStart = day;
    }
  }
  flush(fmt(addDays(parse(startDate), days)));
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const form = $("generator-form");
  const preview = $("preview");
  const legend = $("legend");
  const months = $("months");
  const blurb = $("template-blurb");
  const download = $("download-ics");
  let tracked = false;

  const today = new Date();
  $("start-date").value = fmt(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));

  const escapeHtml = (value) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const readState = () => ({
    template: $("template").value,
    startDate: $("start-date").value,
    startParent: $("start-parent").value,
    names: { a: $("name-a").value.trim() || "Parent A", b: $("name-b").value.trim() || "Parent B" },
  });

  function renderMonth(state, year, month) {
    const first = new Date(Date.UTC(year, month, 1));
    const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const cells = [];
    for (let i = 0; i < first.getUTCDay(); i++) cells.push('<div class="cell empty"></div>');
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmt(new Date(Date.UTC(year, month, d)));
      const parent = parentFor(state.template, state.startDate, state.startParent, dateStr);
      cells.push(`<div class="cell ${parent ? `p-${parent}` : "none"}" title="${parent ? escapeHtml(state.names[parent]) : ""}">${d}</div>`);
    }
    const weekdays = ["S", "M", "T", "W", "T", "F", "S"].map((l) => `<div class="dow">${l}</div>`).join("");
    return `<section class="month"><h3>${title}</h3><div class="grid">${weekdays}${cells.join("")}</div></section>`;
  }

  function render() {
    const state = readState();
    if (!state.startDate) return;
    const start = parse(state.startDate);
    months.innerHTML = [0, 1, 2].map((offset) => renderMonth(state, start.getUTCFullYear(), start.getUTCMonth() + offset)).join("");
    legend.innerHTML = `<span><i class="swatch p-a"></i>${escapeHtml(state.names.a)}</span><span><i class="swatch p-b"></i>${escapeHtml(state.names.b)}</span>`;
    blurb.textContent = TEMPLATES[state.template].blurb;
    preview.hidden = false;
    if (!tracked) {
      tracked = true;
      track("tool_schedule_generated");
    }
  }

  form.addEventListener("input", render);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });

  download.addEventListener("click", () => {
    const state = readState();
    if (!state.startDate) return;
    const ics = buildScheduleIcs({ ...state, days: 365 });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "custody-schedule.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    track("tool_calendar_downloaded");
  });

  document.querySelectorAll("[data-signup]").forEach((el) => el.addEventListener("click", () => track("tool_signup_clicked")));
  render();
}
