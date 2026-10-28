import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Home, MessageSquare, FolderLock, CalendarDays, FileText, Sparkles, Check, ChevronRight, Search, Clock, MapPin, Send, RefreshCw } from "lucide-react";
import { cn } from "./ui/utils";
import { Logo } from "./Logo";

type Tab = "today" | "talk" | "vault" | "calendar";

const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "today", label: "Today", icon: Home },
  { id: "talk", label: "Talk", icon: MessageSquare },
  { id: "vault", label: "Vault", icon: FolderLock },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

function DriveLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 36" aria-hidden="true" className={className}>
      <path fill="#00832d" d="M13.3 2h13.4L40 25.2H26.7z" />
      <path fill="#0066da" d="M0 25.2h13.3L6.7 36H0l-6.7-10.8z" transform="translate(6.7)" />
      <path fill="#ffba00" d="M13.3 2 0 25.2h13.3l13.4-23.2z" />
    </svg>
  );
}

function DropboxLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 36" aria-hidden="true" className={className}>
      <path fill="#0061ff" d="m12 2 10 6-10 6L2 8zm16 0 10 6-10 6-10-6zM2 19l10-6 10 6-10 6zm26-6 10 6-10 6-10-6zm-16 14 10-6 10 6-10 6z" />
    </svg>
  );
}

function GoogleCalendarLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="30" height="28" rx="6" fill="#4285f4" />
      <path fill="#34a853" d="M3 11h7v22H9a6 6 0 0 1-6-6z" />
      <path fill="#fbbc04" d="M26 5h1a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6h-1z" />
      <path fill="#ea4335" d="M9 3h18v7H9z" />
      <path fill="#fff" d="M12 14h12v12H12z" />
    </svg>
  );
}

function AppleCalendarLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="28" height="29" rx="7" fill="#f1f5f9" stroke="#cbd5e1" />
      <path fill="#ef4444" d="M4 11a7 7 0 0 1 7-7h14a7 7 0 0 1 7 7v3H4z" />
    </svg>
  );
}

// October 2026 starts on a Thursday. Mon–Tue Jordan, Wed–Thu Sam, Fri–Sun alternates by week.
function owner(day: number): "me" | "co" {
  const mondayIndex = (4 + day - 1 + 6) % 7;
  if (mondayIndex <= 1) return "me";
  if (mondayIndex <= 3) return "co";
  return Math.floor((day - 1 + 3) / 7) % 2 === 0 ? "me" : "co";
}

const EVENTS: Record<number, string> = {
  6: "Parent-teacher conference",
  15: "Eli · dentist 4:00",
  29: "Mediation follow-up",
  31: "Halloween",
};

function SyncChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        { name: "Google Calendar", logo: <GoogleCalendarLogo /> },
        { name: "Apple Calendar", logo: <AppleCalendarLogo /> },
        { name: "Dropbox", logo: <DropboxLogo /> },
        { name: "Google Drive", logo: <DriveLogo /> },
      ].map((c) => (
        <span key={c.name} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">
          {c.logo}
          {c.name}
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="connected" />
        </span>
      ))}
    </div>
  );
}

function TodayPanel({ go }: { go: (t: Tab) => void }) {
  return (
    <div>
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Wednesday, October 28</p>
        <h3 className="mt-1 text-2xl font-light tracking-tight text-slate-800 sm:text-3xl">Good evening, Jordan.</h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[22px] bg-gradient-to-br from-[#123f36] to-[#0f766e] p-5 text-white sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Next handoff</p>
          <p className="mt-2 text-xl font-medium leading-snug sm:text-2xl">Friday at 6:00 PM</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-50/85"><MapPin className="h-3.5 w-3.5" />Oakridge Elementary pickup · Maya &amp; Eli with you through Sunday</p>
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {[26, 27, 28, 29, 30, 31, 1].map((d, i) => {
              const mine = d === 1 ? false : owner(d) === "me";
              return (
                <div key={d} className={cn("rounded-lg px-1 py-2 text-center", d === 28 ? "bg-white text-emerald-900" : mine ? "bg-white/20" : "bg-white/8 text-white/70")}>
                  <p className="text-[8px] uppercase opacity-70">{["M", "T", "W", "T", "F", "S", "S"][i]}</p>
                  <p className="text-xs font-semibold">{d}</p>
                  <span className={cn("mx-auto mt-1 block h-1 w-1 rounded-full", mine ? "bg-emerald-300" : "bg-white/40")} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Coming up</p>
            <ul className="mt-3 space-y-2.5">
              {[
                { d: "Thu", t: "Mediation follow-up", s: "10:30 AM · video call" },
                { d: "Fri", t: "Handoff at school", s: "6:00 PM · Oakridge Elementary" },
                { d: "Sat", t: "Maya · soccer", s: "9:00 AM · Riverside fields" },
              ].map((e) => (
                <li key={e.t} className="flex items-center gap-3">
                  <span className="w-8 rounded-lg bg-emerald-50 py-1 text-center text-[10px] font-semibold text-emerald-800">{e.d}</span>
                  <span><strong className="block text-[11px] font-semibold text-slate-800">{e.t}</strong><span className="text-[10px] text-slate-500">{e.s}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Connected</p>
            <div className="mt-3"><SyncChips /></div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button onClick={() => go("vault")} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition-colors hover:border-emerald-200">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><FileText className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[11px] font-semibold text-slate-800">Custody decree · summarized</strong><span className="mt-0.5 block text-[10px] text-slate-500">3 dates to remember before the holidays</span></span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </button>
        <button onClick={() => go("talk")} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition-colors hover:border-emerald-200">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Sparkles className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[11px] font-semibold text-slate-800">Draft a reply to Sam</strong><span className="mt-0.5 block text-[10px] text-slate-500">Calm, clear, and on the record</span></span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </button>
      </div>
    </div>
  );
}

function TalkPanel() {
  return (
    <div>
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Talk</p>
        <h3 className="mt-1 text-2xl font-light tracking-tight text-slate-800 sm:text-3xl">Ask about your own documents.</h3>
      </div>
      <div className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-700 px-4 py-3 text-xs leading-relaxed text-white">
          Sam wants to take the kids to Denver over Thanksgiving. What does our decree say?
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
          <p>Under Section 7.2, Thanksgiving alternates yearly. This year the holiday runs <strong>Wednesday 6 PM to Sunday 6 PM with Sam</strong>.</p>
          <p className="mt-2">Section 7.5 allows out-of-state travel with <strong>14 days&rsquo; written notice</strong> and an itinerary. That deadline is <strong>November 11</strong>.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"><FileText className="h-3 w-3 text-rose-500" />Custody decree · §7.2</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"><FileText className="h-3 w-3 text-rose-500" />Custody decree · §7.5</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <span className="flex-1 text-xs text-slate-400">Ask anything about your plan…</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-700 text-white"><Send className="h-3.5 w-3.5" /></span>
        </div>
      </div>
    </div>
  );
}

function VaultPanel() {
  const files = [
    { title: "Custody decree.pdf", meta: "Dropbox · updated 3 days ago", logo: <DropboxLogo />, tag: "Decree", highlight: true },
    { title: "Parenting plan 2026.docx", meta: "Google Drive · synced today", logo: <DriveLogo /> },
    { title: "School calendar 2026–27.pdf", meta: "Google Drive · synced today", logo: <DriveLogo /> },
    { title: "Mediation notes — Oct 14.pdf", meta: "Uploaded from phone", logo: <FileText className="h-4 w-4 text-slate-500" /> },
  ];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Vault</p>
          <h3 className="mt-1 text-2xl font-light tracking-tight text-slate-800 sm:text-3xl">Every document, in one place.</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-400"><Search className="h-3 w-3" />Search your files</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2.5">
          {files.map((f) => (
            <div key={f.title} className={cn("flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-sm", f.highlight ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200/80")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">{f.logo}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-slate-800">{f.title}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{f.meta}</span></span>
              {f.tag && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">{f.tag}</span>}
            </div>
          ))}
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">In plain language</p>
          <h4 className="mt-1.5 text-sm font-semibold text-slate-800">Custody decree</h4>
          <ul className="mt-3 space-y-2.5">
            {[
              "Schedule: 2-2-5-5, exchanges at school or 6 PM",
              "Holidays alternate yearly; Thanksgiving starts Wednesday",
              "Out-of-state travel needs 14 days’ written notice",
              "Either parent may call a 4-hour right of first refusal",
            ].map((t) => (
              <li key={t} className="flex gap-2 text-[11px] leading-relaxed text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{t}</li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400"><RefreshCw className="h-3 w-3" />Auto-synced from Dropbox</p>
        </div>
      </div>
    </div>
  );
}

function CalendarPanel() {
  const cells: (number | null)[] = [null, null, null, ...Array.from({ length: 31 }, (_, i) => i + 1)];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Calendar</p>
          <h3 className="mt-1 text-2xl font-light tracking-tight text-slate-800 sm:text-3xl">October 2026</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" />With you</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />With Sam</span>
        </div>
      </div>
      <div className="rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {cells.map((d, i) =>
            d === null ? (
              <span key={`e${i}`} />
            ) : (
              <div key={d} className={cn("min-h-11 rounded-lg p-1 text-left sm:min-h-14", owner(d) === "me" ? "bg-emerald-50" : "bg-slate-100/80", d === 28 && "ring-2 ring-emerald-600")}>
                <span className={cn("text-[10px] font-semibold", d === 28 ? "text-emerald-800" : "text-slate-600")}>{d}</span>
                {EVENTS[d] && <span className="mt-0.5 hidden truncate rounded bg-white px-1 py-0.5 text-[8px] font-medium text-slate-600 shadow-sm sm:block">{EVENTS[d]}</span>}
                {EVENTS[d] && <span className="mt-1 block h-1 w-1 rounded-full bg-emerald-600 sm:hidden" />}
              </div>
            ),
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><Clock className="h-3.5 w-3.5" />Synced just now</span>
        <SyncChips />
      </div>
    </div>
  );
}

export function ProductPreview() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_80px_-40px_rgba(15,23,42,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-slate-800">Meridian</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-slate-500 sm:block">Jordan Ellis</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">JE</span>
        </div>
      </div>

      <div className="grid min-h-[480px] bg-[#f7f9f8] md:grid-cols-[168px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-100 bg-white p-4 md:block">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={cn("mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors", tab === id ? "bg-emerald-50 text-emerald-800" : "text-slate-400 hover:text-slate-700")}>
              <Icon className="h-4 w-4" strokeWidth={1.7} />{label}
            </button>
          ))}
          <div className="mt-8 rounded-2xl bg-slate-50 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Synced</p>
            <div className="mt-2 flex items-center gap-1.5"><DropboxLogo className="h-3.5 w-3.5" /><DriveLogo className="h-3.5 w-3.5" /><GoogleCalendarLogo className="h-3.5 w-3.5" /><AppleCalendarLogo className="h-3.5 w-3.5" /></div>
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mb-4 flex rounded-xl bg-slate-100 p-1 md:hidden" role="tablist" aria-label="Meridian screens">
            {NAV.map(({ id, label }) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("min-h-9 flex-1 rounded-lg text-[11px] font-semibold transition-colors", tab === id ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500")}>{label}</button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {tab === "today" && <TodayPanel go={setTab} />}
              {tab === "talk" && <TalkPanel />}
              {tab === "vault" && <VaultPanel />}
              {tab === "calendar" && <CalendarPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
