import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import { marked } from "marked";
import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { Upload, Check, Send, X, Edit3, Play, Pause, MessageSquare, User, BookOpen, ChevronRight, FileText, Heart, DollarSign, Users, Baby, Sparkles, Search, Square, Clock, Copy, Trash2, LogOut, Shield, HelpCircle, Info, ArrowLeft, Eye, EyeOff, ThumbsUp, ThumbsDown, Volume2, VolumeX, FolderLock, Download, CalendarDays, Plus, ChevronLeft, ChevronDown, Home } from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./components/ui/utils";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Logo } from "./components/Logo";

marked.setOptions({ breaks: true, gfm: true });

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

// --- Supabase raw fetch helpers ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sbFetch = async (path: string, { method = "GET", body, token }: any = {}) => {
  const headers: any = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.msg || err.error_description || err.message || res.statusText); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const authSubmit = async (email: string, password: string, intent: string) => {
  const res = await fetch(`/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, intent }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Auth failed");
  return data;
};

const authRefreshToken = (refreshToken: string) =>
  sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });

const dbSelect = (table: string, query: string, token: string) =>
  sbFetch(`/rest/v1/${table}?${query}`, { token });

const dbUpdate = async (table: string, query: string, body: any, token: string) => {
  const headers: any = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  return res.json();
};

const dbUpsert = async (table: string, body: any, token: string) => {
  const headers: any = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(body) });
  return res.json();
};

const dbDelete = async (table: string, query: string, token: string) => {
  const headers: any = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: "DELETE", headers });
};

const dbStorageUpload = async (bucket: string, path: string, file: File, token: string) => {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type, "x-upsert": "true" },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
};

const VAULT_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "decree", label: "Decree" },
  { id: "custody_agreement", label: "Custody" },
  { id: "financial_records", label: "Financial" },
  { id: "court_orders", label: "Court Orders" },
  { id: "messages", label: "Messages" },
  { id: "other", label: "Other" },
] as const;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const EVENT_TYPES = [
  { id: "handoff", label: "Handoff", color: "bg-blue-500" },
  { id: "kids_activity", label: "Kids Activity", color: "bg-purple-500" },
  { id: "court_mediation", label: "Court / Mediation", color: "bg-red-500" },
  { id: "appointment", label: "Appointment", color: "bg-amber-500" },
  { id: "deadline", label: "Deadline", color: "bg-orange-500" },
  { id: "other", label: "Other", color: "bg-slate-400" },
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const CUSTODY_TEMPLATES: Record<string, { label: string; desc: string; pattern: number[] }> = {
  "week-on-week-off": { label: "Week on / week off", desc: "Alternating full weeks", pattern: [7, 7] },
  "2-2-3": { label: "2-2-3", desc: "2 days, 2 days, 3 days — alternating", pattern: [2, 2, 3] },
  "2-2-5-5": { label: "2-2-5-5", desc: "2 days each, then 5 days alternating", pattern: [2, 2, 5, 5] },
  "every-other-weekend": { label: "Every other weekend", desc: "Weekdays with one, weekends alternate", pattern: [5, 2] },
};

const getCustodyForDate = (dateStr: string, schedule: any): "me" | "coparent" | null => {
  if (!schedule) return null;
  const tmpl = CUSTODY_TEMPLATES[schedule.template];
  const pattern = schedule.template === "custom" ? schedule.custom_pattern : tmpl?.pattern;
  if (!pattern?.length) return null;
  const start = new Date(schedule.start_date + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return null;
  const halfCycle = pattern.reduce((a: number, b: number) => a + b, 0);
  const fullCycle = halfCycle * 2;
  const pos = ((diffDays % fullCycle) + fullCycle) % fullCycle;
  let isFirstHalf = pos < halfCycle;
  let posInHalf = isFirstHalf ? pos : pos - halfCycle;
  let accumulated = 0;
  for (let i = 0; i < pattern.length; i++) {
    accumulated += pattern[i];
    if (posInHalf < accumulated) {
      const isStartParent = isFirstHalf ? (i % 2 === 0) : (i % 2 !== 0);
      return isStartParent ? schedule.start_parent : (schedule.start_parent === "me" ? "coparent" : "me");
    }
  }
  return null;
};

const formatTime12 = (t: string) => {
  if (!t) return "";
  if (t.includes("AM") || t.includes("PM")) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

// --- Feature flags ---
const FEATURE_DECREE_INTELLIGENCE = true;

// --- System prompt ---
const SYSTEM_PROMPT = `Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

You're Meridian — think of yourself as a calm, wise friend who's been through divorce and co-parenting. You talk like a real person, not a chatbot.

HOW YOU SOUND:
- Warm but direct. Say what needs to be said in 2-4 sentences, not paragraphs.
- Ask follow-up questions. Don't assume you have the full picture.
- Use casual, natural language. Contractions. Short sentences.
- Never use bullet points, numbered lists, headers, or bold text unless drafting a message.
- No filler phrases like "Great question!" or "I understand your concern."
- One thought at a time. If you need more info, just ask.

WHAT YOU DO:
- Help people understand their divorce decree in plain English
- Help them think through co-parenting conflicts without escalating
- Draft calm, neutral messages to their co-parent when asked

BOUNDARIES:
- You're not a lawyer. If something needs legal advice, say "That's a question for your attorney" and move on.
- Never take sides against the co-parent. Stay neutral, stay focused on the kids.

End with a brief grounding thought when it feels natural.

NAMES: If the user's documents contain real names (children, co-parent, etc.), use them instead of generic placeholders like "[child's name]" or "[co-parent's name]". Never use bracketed placeholders when you have the actual name available.`;

// --- Constants ---
const QUICK_ACTIONS = [
  { id: "decree", label: "Understand my decree", icon: FileText },
  { id: "draft", label: "Draft a message", icon: MessageSquare },
  { id: "situation", label: "Navigate a situation", icon: Sparkles },
  { id: "financial", label: "Financial planning", icon: DollarSign },
  { id: "children", label: "Talk to kids about divorce", icon: Heart },
] as const;

const ACTION_PROMPTS: Record<string, string> = {
  decree: "I'd like to understand what my decree says about...",
  draft: "I need to draft a message to my co-parent about...",
  situation: "I'm dealing with a situation and need guidance:",
  financial: "I have questions about financial planning during/after divorce:",
  children: "I need help talking to my children about our divorce:",
};

const COACH_SYSTEM_PROMPT = `Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

You are Meridian's Co-Parenting Communication Coach. Your role is to help users communicate with their co-parent in ways that are:

1. LEGALLY NEUTRAL — avoid language that could be used against them in court. No accusations, threats, ultimatums, or inflammatory language.
2. EMOTIONALLY DE-ESCALATED — calm, measured, and non-reactive. Remove sarcasm, passive aggression, and emotional charge.
3. CHILD-FOCUSED — center the children's needs and wellbeing. Use "the kids" or children's names rather than possessive language.
4. BRIEF AND CLEAR — keep messages short and factual. State the topic, the request/information, and next steps.

FORMATTING RULES:
- When given a message to respond to: First briefly analyze what the message is really asking/saying (1-2 sentences), flag any manipulative tactics if present, then provide a drafted response they can copy and send.
- When helping draft a message: Ask clarifying questions only if truly needed, then provide the draft.
- Always put the draft message in a clearly marked section starting with "**Your message:**" so they can easily copy it.
- After the draft, add a brief "**Why this works:**" explanation (1-2 sentences) to teach them the principle.
- Keep drafts under 4 sentences unless the situation requires more detail.
- Be warm and supportive in your coaching voice, but make the actual draft messages businesslike and neutral.

NAMES: If the user's documents contain real names (children, co-parent, etc.), use them in drafted messages instead of generic placeholders like "[child's name]" or "[co-parent's name]". The goal is a message they can copy and send as-is.`;

type Tab = "today" | "talk" | "vault" | "profile";

// ============================================================
export default function App() {
  // --- Auth ---
  const [session, setSession] = useState<any>(() => { try { return JSON.parse(localStorage.getItem("m_session") || "null"); } catch { return null; } });
  const [sessionRestored, setSessionRestored] = useState(false);

  // On mount: restore session from native storage if localStorage was cleared
  useEffect(() => {
    if (session) { setSessionRestored(true); return; }
    Preferences.get({ key: "m_session" }).then(({ value }) => {
      if (value) {
        try {
          const s = JSON.parse(value);
          if (s?.token) { setSession(s); localStorage.setItem("m_session", value); }
        } catch {}
      }
      setSessionRestored(true);
    }).catch(() => setSessionRestored(true));
  }, []);

  // Save session to native storage whenever it changes (but only after initial restore)
  useEffect(() => {
    if (!sessionRestored) return;
    if (session?.token) {
      Preferences.set({ key: "m_session", value: JSON.stringify(session) }).catch(() => {});
    }
  }, [session, sessionRestored]);
  const [authView, setAuthView] = useState(() => {
    const hasSession = !!localStorage.getItem("m_session") && localStorage.getItem("m_session") !== "null";
    if (hasSession) return "main";
    return Capacitor.isNativePlatform() ? "signin" : "main";
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [subscription, setSubscription] = useState<{ status: string | null; trialEnd: string | null; loading: boolean }>({ status: null, trialEnd: null, loading: true });
  const [selectedPlan, setSelectedPlan] = useState("yearly");
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const TRIAL_DAYS = 3;
  const [trialBannerSeen, setTrialBannerSeen] = useState(() => localStorage.getItem("m_trial_banner_seen") === "1");
  const [talkMode, setTalkMode] = useState<"chat" | "coach">("chat");
  const [coachMode, setCoachMode] = useState<"respond" | "draft">("respond");
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [coachStreaming, setCoachStreaming] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachCopied, setCoachCopied] = useState(false);
  const [coachFollowUp, setCoachFollowUp] = useState("");
  const coachAbortRef = useRef<AbortController | null>(null);
  const coachBottomRef = useRef<HTMLDivElement>(null);
  const [coachSessions, setCoachSessions] = useState<any[]>(() => { try { const c = JSON.parse(localStorage.getItem("m_coach_sessions") || "null"); if (c?.length) return c.map((s: any) => ({ ...s, messages: s.messages || [{ role: "user", content: s.input || "" }, { role: "assistant", content: s.result || "" }].filter(m => m.content) })); return []; } catch { return []; } });
  const [activeCoachSessionId, setActiveCoachSessionId] = useState<string | null>(null);
  const [coachDeleteConfirmId, setCoachDeleteConfirmId] = useState<string | null>(null);
  const activeCoachSession = coachSessions.find((s) => s.id === activeCoachSessionId);
  const [thumbs, setThumbs] = useState<Record<number, "up" | "down">>({});

  // Process OAuth tokens from hash fragment
  const processOAuthTokens = useCallback(async (hash: string) => {
    const params = new URLSearchParams(hash.includes("#") ? hash.substring(hash.indexOf("#") + 1) : hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken) return;
    (async () => {
      try {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } });
        if (!userRes.ok) throw new Error("Failed to get user");
        const userData = await userRes.json();
        const userId = userData.id;
        const email = userData.email || "";
        const oauthName = userData.user_metadata?.full_name || userData.user_metadata?.name || "";
        // Check if profile exists and user completed onboarding
        const profile = await dbSelect("profiles", `id=eq.${userId}&select=name,onboarded`, accessToken);
        if (profile?.length && profile[0].name && profile[0].onboarded) {
          // Existing user — sign in
          const s = { token: accessToken, refresh_token: refreshToken || "", user: { id: userId, email, name: profile[0].name } };
          setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
          setShowSplash(false); setAuthView("main"); setOauthProcessing(false); setAppReady(true);
          dbSelect("conversations", `user_id=eq.${userId}&order=updated_at.desc`, accessToken).then((rows: any) => {
            if (rows?.length) {
              if (rows.some((r: any) => r.id === "_trial_banner_seen")) { setTrialBannerSeen(true); localStorage.setItem("m_trial_banner_seen", "1"); }
              const chatRows = rows.filter((r: any) => !r.id?.startsWith("coach_") && r.id !== "_trial_banner_seen");
              const coachRows = rows.filter((r: any) => r.id?.startsWith("coach_"));
              if (chatRows.length) { const convs = chatRows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at })); setConversations(convs); localStorage.setItem("m_conversations", JSON.stringify(convs)); }
              if (coachRows.length) {
                const sessions = coachRows.map((r: any) => {
                  const msgs = r.messages || [];
                  const userMsg = msgs.find((m: any) => m.role === "user");
                  const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
                  const inputText = userMsg?.content?.replace(/^I received this message from my co-parent\. Help me respond:\n\n"|^I need to send a message to my co-parent about the following:\n\n/g, "").replace(/"$/, "") || "";
                  const mode = userMsg?.content?.startsWith("I received") ? "respond" : "draft";
                  return { id: r.id, mode, messages: msgs, title: r.title, createdAt: r.created_at };
                });
                setCoachSessions(sessions); localStorage.setItem("m_coach_sessions", JSON.stringify(sessions));
              }
            }
          }).catch(() => {});
        } else {
          // New user — go to onboarding
          setSession({ token: accessToken, refresh_token: refreshToken || "", user: { id: userId, email, name: oauthName } });
          setAuthView("onboarding"); setShowSplash(false); setOauthProcessing(false); setAppReady(true);
          if (oauthName) setEditName(oauthName);
        }
      } catch (err: any) { setAuthError("Sign-in failed. Please try again."); setShowSplash(false); setAuthView("main"); setOauthProcessing(false); setAppReady(true); }
    })();
  }, []);

  // Handle OAuth callback + deep link hashes on page load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      setOauthProcessing(true);
      window.history.replaceState(null, "", window.location.pathname);
      processOAuthTokens(hash);
    } else if (hash === "#signup" || hash === "#signin") {
      window.history.replaceState(null, "", window.location.pathname);
      setAppReady(true);
      setAuthView(hash === "#signup" ? "signup" : "signin");
    } else if (!localStorage.getItem("m_session") && !isNative) {
      // No session, no OAuth — show splash
      setShowSplash(true);
      setAppReady(true);
    } else {
      setAppReady(true);
    }
  }, []);

  // Handle Universal Link callback — iOS app opened via URL after OAuth redirect
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener("appUrlOpen", (event: { url: string }) => {
      if (event.url.includes("access_token=")) {
        processOAuthTokens(event.url);
      }
    });
    return () => { listener.then((l) => l.remove()); };
  }, []);

  useEffect(() => {
    if (!sessionRestored || !session?.refresh_token) return;
    authRefreshToken(session.refresh_token).then((data: any) => {
      if (data?.access_token) {
        const s = { ...session, token: data.access_token, refresh_token: data.refresh_token }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
        // If session exists but no profile name, check DB then resume onboarding
        if (!session.user?.name && session.user?.id) {
          dbSelect("profiles", `id=eq.${session.user.id}&select=name`, data.access_token).then((p: any) => {
            if (p?.length && p[0].name) {
              const updated = { ...s, user: { ...s.user, name: p[0].name } }; setSession(updated); localStorage.setItem("m_session", JSON.stringify(updated));
            } else { setAuthView("onboarding"); setShowSplash(false); }
          }).catch(() => { setAuthView("onboarding"); setShowSplash(false); });
        }
        // Load decree from DB if not in localStorage
        if (!localStorage.getItem("m_decree_text") && session.user?.id) {
          dbSelect("profiles", `id=eq.${session.user.id}&select=decree_text,decree_name,decree_pages,coparent_name,children_names`, data.access_token).then((p: any) => {
            if (p?.[0]?.decree_text) { setDecreeText(p[0].decree_text); setDecreeFileName(p[0].decree_name || "Decree"); setDecreePages(p[0].decree_pages || 0); }
            if (p?.[0]?.coparent_name) { setCoparentName(p[0].coparent_name); localStorage.setItem("m_coparent_name", p[0].coparent_name); }
            if (p?.[0]?.children_names) { setChildrenNames(p[0].children_names); localStorage.setItem("m_children_names", p[0].children_names); }
          }).catch(() => {});
          // Load custody schedule
          dbSelect("custody_schedules", `user_id=eq.${session.user.id}&order=created_at.desc&limit=1`, data.access_token).then((rows: any) => {
            if (rows?.[0]) { setCustodySchedule(rows[0]); localStorage.setItem("m_custody_schedule", JSON.stringify(rows[0])); }
          }).catch(() => {});
        }
        // Load conversations + coach sessions from Supabase
        if (session.user?.id) {
          dbSelect("conversations", `user_id=eq.${session.user.id}&order=updated_at.desc`, data.access_token).then((rows: any) => {
            if (rows?.length) {
              if (rows.some((r: any) => r.id === "_trial_banner_seen")) { setTrialBannerSeen(true); localStorage.setItem("m_trial_banner_seen", "1"); }
              const chatRows = rows.filter((r: any) => !r.id?.startsWith("coach_") && r.id !== "_trial_banner_seen");
              const coachRows = rows.filter((r: any) => r.id?.startsWith("coach_"));
              if (chatRows.length) {
                const convs = chatRows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at }));
                setConversations(convs);
                localStorage.setItem("m_conversations", JSON.stringify(convs));
              }
              if (coachRows.length) {
                const sessions = coachRows.map((r: any) => {
                  const msgs = r.messages || [];
                  const userMsg = msgs.find((m: any) => m.role === "user");
                  const mode = userMsg?.content?.startsWith("I received") ? "respond" : "draft";
                  return { id: r.id, mode, messages: msgs, title: r.title, createdAt: r.created_at };
                });
                setCoachSessions(sessions);
                localStorage.setItem("m_coach_sessions", JSON.stringify(sessions));
              }
            }
          }).catch(() => {});
        }
      }
    }).catch(async () => {
      // Retry once after 2s in case of cold-start network delay
      await new Promise(r => setTimeout(r, 2000));
      try {
        const retry = await authRefreshToken(session.refresh_token);
        if (retry?.access_token) {
          const s = { ...session, token: retry.access_token, refresh_token: retry.refresh_token }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
          return;
        }
      } catch {}
      // Only clear session if retry also failed
      setSession(null); localStorage.removeItem("m_session"); localStorage.removeItem("m_conversations");
      Preferences.remove({ key: "m_session" }).catch(() => {});
    });
  }, [sessionRestored]);

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      const data = await authSubmit(authEmail, authPassword, authView);
      if (data.isNew) { setSession({ token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name: "" } }); setAuthView("onboarding"); }
      else {
        let name = "";
        try {
          const p = await dbSelect("profiles", `id=eq.${data.user.id}&select=name,decree_text,decree_name,decree_pages,coparent_name,children_names`, data.access_token);
          if (p?.length) {
            name = p[0].name;
            if (p[0].decree_text) { setDecreeText(p[0].decree_text); setDecreeFileName(p[0].decree_name || "Decree"); setDecreePages(p[0].decree_pages || 0); }
            if (p[0].coparent_name) { setCoparentName(p[0].coparent_name); localStorage.setItem("m_coparent_name", p[0].coparent_name); }
            if (p[0].children_names) { setChildrenNames(p[0].children_names); localStorage.setItem("m_children_names", p[0].children_names); }
          }
        } catch {}
        const s = { token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); setAuthView("main");
        // Load conversations + coach sessions from Supabase
        dbSelect("conversations", `user_id=eq.${data.user.id}&order=updated_at.desc`, data.access_token).then((rows: any) => {
          if (rows?.length) {
            if (rows.some((r: any) => r.id === "_trial_banner_seen")) { setTrialBannerSeen(true); localStorage.setItem("m_trial_banner_seen", "1"); }
            const chatRows = rows.filter((r: any) => !r.id?.startsWith("coach_") && r.id !== "_trial_banner_seen");
            const coachRows = rows.filter((r: any) => r.id?.startsWith("coach_"));
            if (chatRows.length) {
              const convs = chatRows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at }));
              setConversations(convs); localStorage.setItem("m_conversations", JSON.stringify(convs));
            }
            if (coachRows.length) {
              const sessions = coachRows.map((r: any) => {
                const msgs = r.messages || [];
                const userMsg = msgs.find((m: any) => m.role === "user");
                const mode = userMsg?.content?.startsWith("I received") ? "respond" : "draft";
                return { id: r.id, mode, messages: msgs, title: r.title, createdAt: r.created_at };
              });
              setCoachSessions(sessions); localStorage.setItem("m_coach_sessions", JSON.stringify(sessions));
            }
          }
        }).catch(() => {});
      }
    } catch (err: any) { setAuthError(err.message); } finally { setAuthLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!authEmail) { setAuthError("Enter your email address above"); return; }
    setAuthError(""); setAuthLoading(true);
    try {
      await sbFetch("/auth/v1/recover", { method: "POST", body: { email: authEmail } });
      setResetSent(true);
    } catch { setResetSent(true); /* don't reveal if email exists */ } finally { setAuthLoading(false); }
  };

  const handleOnboarding = async () => {
    if (!authName.trim()) return; setAuthLoading(true);
    try {
      await sbFetch("/rest/v1/profiles", { method: "POST", body: { id: session.user.id, name: authName.trim(), email: session.user.email }, token: session.token, headers: { Prefer: "resolution=merge-duplicates" } });
      const s = { ...session, user: { ...session.user, name: authName.trim() } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
      setAuthView("onboard-modes");
    } catch (err: any) { setAuthError(err.message); } finally { setAuthLoading(false); }
  };

  const finishOnboarding = () => { setAuthView("main"); if (session?.token && session?.user?.id) dbUpdate("profiles", `id=eq.${session.user.id}`, { onboarded: true }, session.token).catch(() => {}); };

  const handleUpdateName = async (newName: string) => {
    if (!newName.trim() || !session?.token) return;
    try { await dbUpdate("profiles", `id=eq.${session.user.id}`, { name: newName.trim() }, session.token); const s = { ...session, user: { ...session.user, name: newName.trim() } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); } catch {}
  };

  const handleSignOut = () => { setSession(null); localStorage.removeItem("m_session"); Preferences.remove({ key: "m_session" }).catch(() => {}); localStorage.removeItem("m_conversations"); localStorage.removeItem("m_coach_sessions"); localStorage.removeItem("m_sub_status"); localStorage.removeItem("m_trial_banner_seen"); localStorage.removeItem("m_decree_text"); localStorage.removeItem("m_decree_name"); localStorage.removeItem("m_decree_pages"); localStorage.removeItem("m_coparent_name"); localStorage.removeItem("m_children_names"); setCoparentName(""); setChildrenNames(""); setDecreeText(""); setDecreeFileName(""); setDecreePages(0); setVaultDocs([]); setConversations([]); setActiveConvId(null); setCoachSessions([]); setActiveCoachSessionId(null); setCoachMessages([]); setCoachStreaming(""); setCoachInput(""); setTrialBannerSeen(false); setAuthEmail(""); setAuthPassword(""); setAuthError(""); if (Capacitor.isNativePlatform()) { setAuthView("signin"); setShowSplash(false); } else { setAuthView("main"); setShowSplash(true); } setSubscription({ status: null, trialEnd: null, loading: true }); };

  // --- Subscription ---
  const [showSubscribeSuccess, setShowSubscribeSuccess] = useState(false);

  const checkSubscription = useCallback(async (token: string, userId: string) => {
    // 1. If returning from Stripe checkout — grant access, persist locally, sync DB in background
    if (window.location.hash.includes("subscription=success")) {
      window.history.replaceState(null, "", window.location.pathname);
      localStorage.setItem("m_sub_status", "active");
      setSubscription({ status: "active", trialEnd: null, loading: false });
      setShowSubscribeSuccess(true);
      setTimeout(() => setShowSubscribeSuccess(false), 4000);
      fetch(`/api/stripe-verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
      return;
    }

    // 2. Check localStorage first — this survives app restarts regardless of DB/API state
    const cachedStatus = localStorage.getItem("m_sub_status");
    if (cachedStatus === "active" || cachedStatus === "trialing") {
      setSubscription({ status: cachedStatus, trialEnd: null, loading: false });
      // Still try to sync DB in background (non-blocking)
      fetch(`/api/stripe-verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
      return;
    }

    // 3. Fall back to DB check (for trial calculation and DB-synced subscriptions)
    try {
      const p = await dbSelect("profiles", `id=eq.${userId}&select=subscription_status,current_period_end,created_at`, token);
      if (Array.isArray(p) && p[0]?.created_at) {
        const createdAt = new Date(p[0].created_at);
        const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
        const status = p[0].subscription_status || null;
        if (status) localStorage.setItem("m_sub_status", status);
        setSubscription({ status, trialEnd: trialEnd.toISOString(), loading: false });
      } else {
        setSubscription({ status: null, trialEnd: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(), loading: false });
      }
    } catch {
      setSubscription({ status: "active", trialEnd: null, loading: false });
    }
  }, []);

  useEffect(() => {
    if (session?.token && session?.user?.id) {
      setSubscription(s => s.loading ? s : { ...s, loading: true });
      checkSubscription(session.token, session.user.id);
      // Safety: if subscription check hangs, stop loading after 5s so user isn't stuck
      const t = setTimeout(() => setSubscription((s) => s.loading ? { ...s, loading: false } : s), 5000);
      return () => clearTimeout(t);
    }
  }, [session?.token, session?.user?.id, checkSubscription]);

  const isTrialActive = subscription.trialEnd ? new Date() < new Date(subscription.trialEnd) : false;
  const isSubscribed = subscription.status === "active" || subscription.status === "trialing";
  const hasAccess = isTrialActive || isSubscribed;
  const trialDaysLeft = subscription.trialEnd ? Math.max(0, Math.ceil((new Date(subscription.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

  const isNative = Capacitor.isNativePlatform() || Capacitor.getPlatform() === "ios";
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Initialize RevenueCat on native platforms
  useEffect(() => {
    if (!isNative) return;
    Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    Purchases.configure({ apiKey: "appl_zjhHqHWWBLBxnLORAmRXUwlfUSZ" });
    if (session?.user?.id) {
      Purchases.logIn({ appUserID: session.user.id }).catch(() => {});
    }
  }, [isNative, session?.user?.id]);

  // Check RevenueCat subscription status on native
  useEffect(() => {
    if (!isNative || !session?.user?.id) return;
    Purchases.getCustomerInfo().then(({ customerInfo }) => {
      const isActive = customerInfo.entitlements.active["Meridian Pro"] !== undefined;
      if (isActive && subscription.status !== "active") {
        setSubscription((s) => ({ ...s, status: "active", loading: false }));
        dbUpdate("profiles", session.user.id, { subscription_status: "active" }, session.token!).catch(() => {});
      }
    }).catch(() => {});
  }, [isNative, session?.user?.id]);

  const handleSubscribe = async () => {
    if (!session?.token) { console.error("Subscribe: no token"); return; }
    if (isNative || isIOS) {
      try {
        if (!isNative) {
          await Purchases.configure({ apiKey: "appl_zjhHqHWWBLBxnLORAmRXUwlfUSZ" });
          if (session.user?.id) await Purchases.logIn({ appUserID: session.user.id }).catch(() => {});
        }
        const offerings = await Purchases.getOfferings();
        const packages = offerings.current?.availablePackages || [];
        const pkg = packages.find((p: any) => selectedPlan === "yearly" ? p.packageType === "ANNUAL" : p.packageType === "MONTHLY") || packages[0];
        if (!pkg) { alert("No subscription available. Please try again later."); return; }
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
        if (customerInfo.entitlements.active["Meridian Pro"]) {
          setSubscription({ status: "active", trialEnd: null, loading: false });
          localStorage.setItem("m_sub_status", "active");
          dbUpdate("profiles", session.user!.id, { subscription_status: "active" }, session.token).catch(() => {});
        }
      } catch (err: any) {
        if (err.code !== "1" && err.code !== "PURCHASE_CANCELLED") {
          alert(`App Store error: ${err.message || err.code || JSON.stringify(err)}`);
        }
      }
      return;
    }
    try {
      const res = await fetch(`/api/stripe-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: session.token }) });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { console.error("Stripe checkout error:", data); alert("Something went wrong. Please try again."); }
    } catch (err) { console.error("Subscribe error:", err); alert("Connection error. Please try again."); }
  };

  const handleManageSubscription = async () => {
    if (!session?.token) return;
    if (isNative || isIOS) {
      window.open("https://apps.apple.com/account/subscriptions", "_blank");
      return;
    }
    try {
      const res = await fetch(`/api/stripe-portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: session.token }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
  };

  // --- Splash ---
  const [appReady, setAppReady] = useState(() => window.location.hash.includes("access_token=") ? false : (!!localStorage.getItem("m_session") || isNative));
  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const enterApp = () => { setShowSplash(false); setAuthView("signup"); setAuthError(""); setAuthEmail(""); setAuthPassword(""); };
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const handleWaitlist = async () => {
    if (!waitlistEmail.trim() || waitlistStatus === "sending") return;
    setWaitlistStatus("sending");
    try {
      await sbFetch("/rest/v1/waitlist", { method: "POST", body: { email: waitlistEmail.trim().toLowerCase() } });
      setWaitlistStatus("sent");
    } catch { setWaitlistStatus("sent"); /* don't reveal failures */ }
  };

  // Pull-to-refresh for splash landing page
  const splashRef = useRef<HTMLDivElement>(null);
  const [pullY, setPullY] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const pulling = useRef(false);

  const onPullTouchStart = (e: React.TouchEvent) => {
    const el = splashRef.current;
    if (el && el.scrollTop <= 0) { pullStartY.current = e.touches[0].clientY; pulling.current = true; }
  };
  const onPullTouchMove = (e: React.TouchEvent) => {
    if (!pulling.current) return;
    const dy = Math.max(0, (e.touches[0].clientY - pullStartY.current) * 0.4);
    setPullY(Math.min(dy, 80));
  };
  const onPullTouchEnd = () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY > 50) { setPullRefreshing(true); setTimeout(() => window.location.reload(), 300); }
    else setPullY(0);
  };
  const [videoMuted, setVideoMuted] = useState(true);
  const openVideo = () => { setShowVideo(true); setVideoProgress(0); setVideoEnded(false); setVideoPaused(false); setVideoMuted(true); };
  const dismissVideo = () => { if (videoRef.current) videoRef.current.pause(); setShowVideo(false); };
  const [videoPaused, setVideoPaused] = useState(false);
  const unmuteVideo = (e: React.MouseEvent) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = false; setVideoMuted(false); } };
  const togglePlayPause = () => { const v = videoRef.current; if (!v || videoEnded) return; if (v.paused) { v.play().catch(() => {}); setVideoPaused(false); } else { v.pause(); setVideoPaused(true); } };

  // --- App state ---
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [conversations, setConversations] = useState<any[]>(() => { try { const c = JSON.parse(localStorage.getItem("m_conversations") || "null"); if (c?.length) return c; return []; } catch { return []; } });
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [vaultDocs, setVaultDocs] = useState<any[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultCategory, setVaultCategory] = useState("all");
  const [vaultUploading, setVaultUploading] = useState(false);
  const [vaultUploadProgress, setVaultUploadProgress] = useState<"uploading" | "processing" | "done" | null>(null);
  const [vaultViewDoc, setVaultViewDoc] = useState<any>(null);
  const [vaultViewUrl, setVaultViewUrl] = useState<string | null>(null);
  const [vaultRenameId, setVaultRenameId] = useState<string | null>(null);
  const [vaultRenameName, setVaultRenameName] = useState("");
  const [vaultDeleteId, setVaultDeleteId] = useState<string | null>(null);
  const [vaultUploadCategory, setVaultUploadCategory] = useState<string | null>(null);
  const vaultFileRef = useRef<HTMLInputElement>(null);
  // Decree Intelligence state
  const [decreeExtraction, setDecreeExtraction] = useState<any>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [showDecreeSummary, setShowDecreeSummary] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calShowAdd, setCalShowAdd] = useState(false);
  const [calEditEvent, setCalEditEvent] = useState<any | null>(null);
  const [calDeleteConfirm, setCalDeleteConfirm] = useState<string | null>(null);
  const [calForm, setCalForm] = useState({ title: "", date: "", time: "", type: "handoff", notes: "" });
  // Custody schedule state
  const [custodySchedule, setCustodySchedule] = useState<any>(() => { try { return JSON.parse(localStorage.getItem("m_custody_schedule") || "null"); } catch { return null; } });
  const [showCustodySetup, setShowCustodySetup] = useState(false);
  const [custodyForm, setCustodyForm] = useState({ template: "week-on-week-off", start_date: "", start_parent: "me" as "me" | "coparent", handoff_time: "6:00 PM" });
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const activeConv = conversations.find((c) => c.id === activeConvId);
  const messages = activeConv?.messages || [];

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Copied!");
  const [toastIsError, setToastIsError] = useState(false);
  const showToastMsg = (msg: string, isError = false) => { setToastMessage(msg); setToastIsError(isError); setShowToast(true); setTimeout(() => setShowToast(false), 2500); };
  const abortRef = useRef<AbortController | null>(null);

  const [decreeText, setDecreeText] = useState(() => localStorage.getItem("m_decree_text") || "");
  const decreeTextRef = useRef(decreeText);
  useEffect(() => { decreeTextRef.current = decreeText; }, [decreeText]);
  const [decreeFileName, setDecreeFileName] = useState(() => localStorage.getItem("m_decree_name") || "");
  const [decreePages, setDecreePages] = useState(() => { try { return parseInt(localStorage.getItem("m_decree_pages") || "0") || 0; } catch { return 0; } });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackChatMessage, setFeedbackChatMessage] = useState("");

  const [editName, setEditName] = useState("");
  const [coparentName, setCoparentName] = useState(() => localStorage.getItem("m_coparent_name") || "");
  const [childrenNames, setChildrenNames] = useState(() => localStorage.getItem("m_children_names") || "");

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  const syncTimeoutRef = useRef<any>(null);
  useEffect(() => {
    localStorage.setItem("m_conversations", JSON.stringify(conversations));
    // Debounced sync to Supabase
    if (session?.token && session?.user?.id && conversations.length > 0) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        conversations.forEach((c) => {
          dbUpsert("conversations", { id: c.id, user_id: session.user.id, title: c.title || "Untitled", messages: c.messages, updated_at: new Date().toISOString() }, session.token).catch(() => {});
        });
      }, 1500);
    }
  }, [conversations]);
  const coachSyncRef = useRef<any>(null);
  useEffect(() => {
    localStorage.setItem("m_coach_sessions", JSON.stringify(coachSessions));
    if (session?.token && session?.user?.id && coachSessions.length > 0) {
      clearTimeout(coachSyncRef.current);
      coachSyncRef.current = setTimeout(() => {
        coachSessions.forEach((s) => {
          const msgs = s.messages || [{ role: "user", content: s.input }, { role: "assistant", content: s.result }];
          dbUpsert("conversations", { id: s.id, user_id: session.user.id, title: s.title || "Coach session", messages: msgs, updated_at: new Date().toISOString() }, session.token).catch(() => {});
        });
      }, 1500);
    }
  }, [coachSessions]);
  useEffect(() => {
    if (coachStreaming || coachMessages.length > 0) coachBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachStreaming, coachMessages]);
  useEffect(() => {
    if (decreeText) localStorage.setItem("m_decree_text", decreeText); else localStorage.removeItem("m_decree_text");
    if (decreeFileName) localStorage.setItem("m_decree_name", decreeFileName); else localStorage.removeItem("m_decree_name");
    if (decreePages) localStorage.setItem("m_decree_pages", String(decreePages)); else localStorage.removeItem("m_decree_pages");
    // Persist to Supabase
    if (session?.token && session?.user?.id) {
      dbUpdate("profiles", `id=eq.${session.user.id}`, { decree_text: decreeText || null, decree_name: decreeFileName || null, decree_pages: decreePages || 0 }, session.token).catch(() => {});
    }
  }, [decreeText, decreeFileName, decreePages]);

  const resizeTextarea = useCallback(() => { const el = textareaRef.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }, []);

  const copyToClipboard = (text: string, idx: number) => { navigator.clipboard.writeText(text).then(() => { setCopied(idx); showToastMsg("Copied!"); setTimeout(() => setCopied(null), 1500); }); };

  const extractPdfText = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    setDecreePages(pdf.numPages);
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content?.items;
        if (Array.isArray(items)) {
          const text = items
            .filter((item: any) => typeof item.str === "string")
            .map((item: any) => item.str)
            .join(" ");
          if (text.trim()) pages.push(text);
        }
      } catch (e) {
        console.warn(`Page ${i} extraction failed:`, e);
      }
    }
    return pages.join("\n\n");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setDecreeFileName(file.name); setUploading(true); setUploadError("");
    try {
      let text: string;
      const name = file.name.toLowerCase();
      if (name.endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        text = result.value;
      } else {
        text = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (ev) => resolve(ev.target?.result as string); reader.onerror = () => reject(new Error("Failed")); reader.readAsText(file); });
      }
      if (!text || !text.trim()) { throw new Error("No text found — the file may be scanned or image-based."); }
      setDecreeText(text);
      decreeUploadedThisSession.current = true;
      // Also save to vault as a decree document + trigger extraction
      if (session?.token && session?.user?.id) {
        try {
          const storagePath = `${session.user.id}/${crypto.randomUUID()}_${file.name}`;
          await dbStorageUpload("documents", storagePath, file, session.token);
          const docResult = await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: "decree", file_name: file.name, file_size: file.size, mime_type: file.type, storage_path: storagePath, text_content: text.slice(0, 500000) || null }, token: session.token });
          await loadVaultDocs();
          // Trigger decree intelligence extraction
          if (FEATURE_DECREE_INTELLIGENCE) {
            const docId = Array.isArray(docResult) ? docResult[0]?.id : docResult?.id;
            if (docId) triggerExtraction(text.slice(0, 500000), docId);
          }
        } catch {}
      }
    } catch (err: any) {
      setDecreeText(""); setDecreeFileName(""); setDecreePages(0);
      setUploadError(err?.message || "Something went wrong reading that file. Try again.");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleStop = () => { abortRef.current?.abort(); setStreaming(false); setLoading(false); };

  const handleSend = async (overrideMsg?: string) => {
    const userMsg = (overrideMsg || input).trim(); if (!userMsg || loading || streaming) return;
    setInput(""); if (textareaRef.current) textareaRef.current.style.height = "auto";
    let convId = activeConvId;
    if (!convId) { convId = `conv_${Date.now()}`; setConversations((prev) => [{ id: convId, title: userMsg.slice(0, 50), messages: [], createdAt: new Date().toISOString() }, ...prev]); setActiveConvId(convId); }
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { role: "user", content: userMsg }] } : c));
    setLoading(true);
    // Build vault docs context — use extraction summary for decrees (much smaller), raw text for other docs
    const MAX_CONTEXT_CHARS = 20000;
    let vaultContext = "";
    // If we have a decree extraction, use the compact summary instead of raw decree text
    if (decreeExtraction?.status === "complete") {
      const parts = [`\n\n[DECREE SUMMARY]`];
      if (decreeExtraction.raw_summary) parts.push(decreeExtraction.raw_summary);
      if (decreeExtraction.custody_type) parts.push(`Custody: ${decreeExtraction.custody_type}`);
      if (decreeExtraction.custody_schedule?.details) parts.push(`Schedule: ${decreeExtraction.custody_schedule.details}`);
      if (decreeExtraction.child_support) parts.push(`Child Support: ${JSON.stringify(decreeExtraction.child_support)}`);
      if (decreeExtraction.holiday_schedule) parts.push(`Holidays: ${JSON.stringify(decreeExtraction.holiday_schedule)}`);
      if (decreeExtraction.geographic_restriction) parts.push(`Geographic Restriction: ${JSON.stringify(decreeExtraction.geographic_restriction)}`);
      if (decreeExtraction.children) parts.push(`Children: ${JSON.stringify(decreeExtraction.children)}`);
      if (decreeExtraction.medical_decision_rights) parts.push(`Medical Rights: ${decreeExtraction.medical_decision_rights}`);
      if (decreeExtraction.right_of_first_refusal) parts.push(`Right of First Refusal: ${JSON.stringify(decreeExtraction.right_of_first_refusal)}`);
      if (decreeExtraction.pickup_dropoff) parts.push(`Pickup/Dropoff: ${JSON.stringify(decreeExtraction.pickup_dropoff)}`);
      if (decreeExtraction.communication_requirements) parts.push(`Communication: ${decreeExtraction.communication_requirements}`);
      vaultContext += parts.join("\n");
    }
    // Add non-decree docs (capped)
    let contextLen = vaultContext.length;
    for (const d of vaultDocs.filter(d => d.text_content && d.category !== "decree")) {
      const chunk = `\n\n[VAULT DOCUMENT: ${d.file_name} (${VAULT_CATEGORIES.find(c => c.id === d.category)?.label || d.category})]\n${d.text_content}`;
      if (contextLen + chunk.length > MAX_CONTEXT_CHARS) { vaultContext += chunk.slice(0, MAX_CONTEXT_CHARS - contextLen) + "\n[...truncated]"; break; }
      vaultContext += chunk; contextLen += chunk.length;
    }
    // If no extraction and decree exists, use truncated raw text
    if (!decreeExtraction) {
      for (const d of vaultDocs.filter(d => d.text_content && d.category === "decree")) {
        const chunk = `\n\n[VAULT DOCUMENT: ${d.file_name} (Decree)]\n${d.text_content}`;
        if (contextLen + chunk.length > MAX_CONTEXT_CHARS) { vaultContext += chunk.slice(0, MAX_CONTEXT_CHARS - contextLen) + "\n[...truncated]"; break; }
        vaultContext += chunk; contextLen += chunk.length;
      }
    }
    const namesContext = (coparentName || childrenNames) ? `\n\n[USER'S FAMILY DETAILS]\n${coparentName ? `Co-parent: ${coparentName}\n` : ""}${childrenNames ? `Children: ${childrenNames}` : ""}` : "";
    const docsContext = (vaultContext || "\n\nNo documents uploaded yet.") + namesContext;
    const currentMsgs = conversations.find((c) => c.id === convId)?.messages || [];
    const history = [...currentMsgs, { role: "user", content: userMsg }].map((m: any) => ({ role: m.role, content: m.content }));
    const updateConvMessages = (fn: any) => { setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: typeof fn === "function" ? fn(c.messages) : fn } : c)); };
    const abort = new AbortController(); abortRef.current = abort;
    try {
      let res = await fetch(`/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `${SYSTEM_PROMPT}${docsContext}`, messages: history }), signal: abort.signal });
      if (res.status === 429) {
        updateConvMessages((prev: any[]) => [...prev, { role: "assistant", content: "Give me just a moment..." }]); setLoading(false);
        await new Promise(r => setTimeout(r, 15000));
        updateConvMessages((prev: any[]) => { const u = [...prev]; u.pop(); return u; }); setLoading(true);
        res = await fetch(`/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `${SYSTEM_PROMPT}${docsContext}`, messages: history }), signal: abort.signal });
      }
      if (!res.ok) throw new Error("API error");
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let fullText = ""; let buffer = "";
      updateConvMessages((prev: any[]) => [...prev, { role: "assistant", content: "" }]); setLoading(false); setStreaming(true);
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) { if (!line.startsWith("data: ")) continue; const data = line.slice(6); if (data === "[DONE]") continue; try { const parsed = JSON.parse(data); if (parsed.type === "content_block_delta" && parsed.delta?.text) { fullText += parsed.delta.text; updateConvMessages((prev: any[]) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: fullText }; return u; }); } } catch {} }
        }
      } catch (e: any) { if (e.name === "AbortError") { setStreaming(false); return; } throw e; }
      setStreaming(false);
      if (!fullText) updateConvMessages((prev: any[]) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." }; return u; });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("Chat error:", e);
      const errMsg = "Something went wrong — please try again in a moment.";
      updateConvMessages((prev: any[]) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: errMsg }; return u; }
        return [...prev, { role: "assistant", content: errMsg }];
      });
      setLoading(false); setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleQuickAction = (actionId: string) => { setInput(ACTION_PROMPTS[actionId] || ""); textareaRef.current?.focus(); };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || feedbackSending) return; setFeedbackSending(true);
    try { const res = await fetch(`/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: feedbackText.trim(), userId: session?.user?.id, email: session?.user?.email, chatMessage: feedbackChatMessage || undefined }) }); if (!res.ok) throw new Error(); setFeedbackSent(true); setTimeout(() => { setShowFeedback(false); setFeedbackText(""); setFeedbackSent(false); setFeedbackChatMessage(""); }, 1800); }
    catch { alert("Failed to send feedback. Please try again."); } finally { setFeedbackSending(false); }
  };

  const firstName = session?.user?.name?.split(" ")[0] || "";
  const hasConversation = messages.length > 0;

  // --- Vault ---
  const loadVaultDocs = useCallback(async () => {
    if (!session?.token) return;
    setVaultLoading(true);
    try {
      const docs = await dbSelect("documents", `user_id=eq.${session.user.id}&order=created_at.desc`, session.token);
      setVaultDocs(docs || []);
    } catch {} finally { setVaultLoading(false); }
  }, [session?.token, session?.user?.id]);

  useEffect(() => { if (activeTab === "vault" || activeTab === "talk") loadVaultDocs(); }, [activeTab]);
  // Also load vault docs on session init so chat always has context
  useEffect(() => { if (session?.token) loadVaultDocs(); }, [session?.token]);

  // Migrate legacy decree (localStorage/profiles) into vault documents table
  // Only runs for decrees loaded from localStorage/profiles (not freshly uploaded ones)
  const decreeUploadedThisSession = useRef(false);
  useEffect(() => {
    if (!session?.token || !session?.user?.id || !decreeText || decreeUploadedThisSession.current) return;
    (async () => {
      try {
        const existing = await dbSelect("documents", `user_id=eq.${session.user.id}&category=eq.decree`, session.token);
        if (existing && existing.length > 0) return; // already migrated
        await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: "decree", file_name: decreeFileName || "Decree", file_size: 0, mime_type: "text/plain", storage_path: `${session.user.id}/migrated_decree`, text_content: decreeText.slice(0, 500000) }, token: session.token });
        await loadVaultDocs();
      } catch {}
    })();
  }, [session?.token, session?.user?.id, decreeText]);

  const extractFileText = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      return await extractPdfText(file);
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const buffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return result.value;
    } else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
      return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (ev) => resolve(ev.target?.result as string); reader.onerror = () => reject(new Error("Failed")); reader.readAsText(file); });
    }
    return "";
  };

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.token || !vaultUploadCategory) return;
    if (file.size > 50 * 1024 * 1024) { alert("File must be under 50MB"); return; }
    setVaultUploading(true); setVaultUploadProgress("uploading");
    try {
      const storagePath = `${session.user.id}/${crypto.randomUUID()}_${file.name}`;
      await dbStorageUpload("documents", storagePath, file, session.token);
      setVaultUploadProgress("processing");
      let textContent: string | null = null;
      try { textContent = await extractFileText(file); } catch {}
      const docResult = await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: vaultUploadCategory, file_name: file.name, file_size: file.size, mime_type: file.type, storage_path: storagePath, text_content: textContent?.slice(0, 500000) || null }, token: session.token });
      setVaultUploadProgress("done");
      await new Promise(r => setTimeout(r, 1200));
      await loadVaultDocs();
      // Trigger decree intelligence extraction in background
      if (FEATURE_DECREE_INTELLIGENCE && vaultUploadCategory === "decree" && textContent) {
        const docId = Array.isArray(docResult) ? docResult[0]?.id : docResult?.id;
        if (docId) triggerExtraction(textContent.slice(0, 500000), docId);
      }
    } catch (err: any) { showToastMsg(err?.message || "Upload failed. Please try again.", true); }
    finally { setVaultUploading(false); setVaultUploadProgress(null); setVaultUploadCategory(null); if (vaultFileRef.current) vaultFileRef.current.value = ""; }
  };

  const handleVaultDelete = async (doc: any) => {
    if (!session?.token) return;
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${doc.storage_path}`, { method: "DELETE", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.token}` } });
      await dbDelete("documents", `id=eq.${doc.id}`, session.token);
      setVaultDocs(prev => prev.filter(d => d.id !== doc.id));
      // If deleting a decree, clear legacy profile data + extraction so it doesn't get re-created
      if (doc.category === "decree") {
        setDecreeText(""); setDecreeFileName(""); setDecreePages(0);
        localStorage.removeItem("m_decree_text"); localStorage.removeItem("m_decree_name"); localStorage.removeItem("m_decree_pages");
        dbUpdate("profiles", `id=eq.${session.user.id}`, { decree_text: null, decree_name: null, decree_pages: 0 }, session.token).catch(() => {});
        // Clean up decree extraction
        const remaining = vaultDocs.filter(d => d.id !== doc.id && d.category === "decree");
        if (remaining.length === 0) {
          dbDelete("decree_extractions", `user_id=eq.${session.user.id}`, session.token).catch(() => {});
          setDecreeExtraction(null);
        }
      }
    } catch {}
    setVaultDeleteId(null);
  };

  const handleVaultRename = async (docId: string, newName: string) => {
    if (!session?.token || !newName.trim()) { setVaultRenameId(null); return; }
    try {
      await dbUpdate("documents", `id=eq.${docId}`, { file_name: newName.trim() }, session.token);
      setVaultDocs(prev => prev.map(d => d.id === docId ? { ...d, file_name: newName.trim() } : d));
      if (vaultViewDoc?.id === docId) setVaultViewDoc((prev: any) => prev ? { ...prev, file_name: newName.trim() } : prev);
    } catch {}
    setVaultRenameId(null);
  };

  const filteredVaultDocs = vaultCategory === "all" ? vaultDocs : vaultDocs.filter(d => d.category === vaultCategory);

  // --- Decree Intelligence ---
  const extractionLoaded = useRef(false);
  const loadExtraction = useCallback(async () => {
    if (!FEATURE_DECREE_INTELLIGENCE || !session?.token || !session?.user?.id) return;
    try {
      const rows = await dbSelect("decree_extractions", `user_id=eq.${session.user.id}&order=created_at.desc&limit=1`, session.token);
      if (rows?.length) setDecreeExtraction(rows[0]);
    } catch {}
    extractionLoaded.current = true;
  }, [session?.token, session?.user?.id]);

  useEffect(() => { if (FEATURE_DECREE_INTELLIGENCE && session?.token) loadExtraction(); }, [loadExtraction]);

  // Auto-populate My Details from decree extraction (only if fields are empty)
  useEffect(() => {
    if (!decreeExtraction || !session?.token || !session?.user?.id) return;
    const updates: any = {};
    if (!childrenNames && decreeExtraction.children?.length) {
      const names = decreeExtraction.children.map((c: any) => c.name?.split(" ")[0]).filter(Boolean).join(", ");
      if (names) { setChildrenNames(names); localStorage.setItem("m_children_names", names); updates.children_names = names; }
    }
    if (!coparentName && decreeExtraction.parent_names) {
      const userName = (session.user.name || "").toLowerCase().split(" ")[0];
      const { petitioner, respondent } = decreeExtraction.parent_names;
      const petFirst = petitioner?.split(" ")[0] || "";
      const resFirst = respondent?.split(" ")[0] || "";
      // Pick the name that isn't the current user
      const coparent = petFirst.toLowerCase() === userName ? resFirst : resFirst.toLowerCase() === userName ? petFirst : resFirst || petFirst;
      if (coparent) { setCoparentName(coparent); localStorage.setItem("m_coparent_name", coparent); updates.coparent_name = coparent; }
    }
    if (Object.keys(updates).length) dbUpdate("profiles", `id=eq.${session.user.id}`, updates, session.token).catch(() => {});
  }, [decreeExtraction]);

  // Auto-trigger extraction for existing decrees that haven't been analyzed yet
  const autoExtractTriggered = useRef(false);
  useEffect(() => {
    if (!FEATURE_DECREE_INTELLIGENCE || !session?.token || !extractionLoaded.current || extractionLoading || autoExtractTriggered.current) return;
    // Re-extract if no extraction exists OR if parent_names is missing (schema upgrade)
    const needsReExtract = decreeExtraction && !decreeExtraction.parent_names;
    if (decreeExtraction && !needsReExtract) return;
    const decree = vaultDocs.find((d: any) => d.category === "decree" && d.text_content);
    if (decree) {
      if (needsReExtract) dbDelete("decree_extractions", `user_id=eq.${session.user.id}`, session.token).catch(() => {});
      autoExtractTriggered.current = true;
      triggerExtraction(decree.text_content.slice(0, 500000), decree.id);
    }
  }, [vaultDocs, session?.token, extractionLoading, decreeExtraction]);

  const triggerExtraction = async (textContent: string, documentId: string) => {
    if (!FEATURE_DECREE_INTELLIGENCE || !session?.token || !session?.user?.id) return;
    setExtractionLoading(true);
    try {
      // Create pending row
      await sbFetch("/rest/v1/decree_extractions", { method: "POST", body: { user_id: session.user.id, document_id: documentId, status: "extracting" }, token: session.token });
      // Call extraction API
      const res = await fetch(`/api/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text_content: textContent }) });
      if (!res.ok) throw new Error("Extraction failed");
      const fields = await res.json();
      // Update extraction row
      const updated = await dbUpdate("decree_extractions", `user_id=eq.${session.user.id}&status=eq.extracting`, { ...fields, status: "complete", extracted_at: new Date().toISOString() }, session.token);
      if (updated?.[0]) setDecreeExtraction(updated[0]);
      else await loadExtraction();
      showToastMsg("Your decree has been analyzed");
    } catch {
      // Mark as failed
      await dbUpdate("decree_extractions", `user_id=eq.${session.user.id}&status=eq.extracting`, { status: "failed" }, session.token).catch(() => {});
    } finally { setExtractionLoading(false); }
  };

  const handleFieldEdit = async (field: string, value: any) => {
    if (!session?.token || !decreeExtraction?.id) return;
    try {
      const updates: any = { [field]: value, user_edits: { ...(decreeExtraction.user_edits || {}), [field]: true }, updated_at: new Date().toISOString() };
      await dbUpdate("decree_extractions", `id=eq.${decreeExtraction.id}`, updates, session.token);
      setDecreeExtraction((prev: any) => ({ ...prev, ...updates }));
    } catch {}
    setEditingField(null);
    setEditingValue("");
  };

  // --- Coach ---
  const handleCoachSend = async (followUp?: string) => {
    const isFollowUp = !!followUp;
    const inputText = isFollowUp ? followUp.trim() : coachInput.trim();
    if (!inputText || coachLoading) return;

    setCoachLoading(true); setCoachCopied(false); setCoachStreaming("");

    // Build message history
    let msgs: Array<{ role: string; content: string }>;
    if (isFollowUp) {
      // Add follow-up to existing conversation
      msgs = [...coachMessages, { role: "user", content: inputText }];
      setCoachFollowUp("");
    } else {
      // First message — wrap with mode context
      const userPrompt = coachMode === "respond"
        ? `I received this message from my co-parent. Help me respond:\n\n"${inputText}"`
        : `I need to send a message to my co-parent about the following:\n\n${inputText}`;
      msgs = [{ role: "user", content: userPrompt }];
    }
    setCoachMessages(msgs);

    const savedMode = coachMode;
    const savedInput = isFollowUp ? (coachMessages[0]?.content || inputText) : inputText;
    const abort = new AbortController(); coachAbortRef.current = abort;
    let finalText = "";
    try {
      const coachVaultContext = vaultDocs.filter(d => d.text_content).map(d => `\n\n[VAULT DOCUMENT: ${d.file_name} (${VAULT_CATEGORIES.find(c => c.id === d.category)?.label || d.category})]\n${d.text_content}`).join("") || "";
      const coachNamesContext = (coparentName || childrenNames) ? `\n\n[USER'S FAMILY DETAILS]\n${coparentName ? `Co-parent: ${coparentName}\n` : ""}${childrenNames ? `Children: ${childrenNames}` : ""}` : "";
      const res = await fetch(`/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: `${COACH_SYSTEM_PROMPT}${coachVaultContext}${coachNamesContext}`, messages: msgs }), signal: abort.signal });
      if (!res.ok) throw new Error("API error");
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let fullText = ""; let buffer = "";
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) { if (!line.startsWith("data: ")) continue; const data = line.slice(6); if (data === "[DONE]") continue; try { const parsed = JSON.parse(data); if (parsed.type === "content_block_delta" && parsed.delta?.text) { fullText += parsed.delta.text; setCoachStreaming(fullText); } } catch {} }
        }
      } catch (e: any) { if (e.name !== "AbortError") throw e; }
      finalText = fullText;
    } catch (err: any) { if (err.name !== "AbortError") setCoachStreaming("Something went wrong. Please try again."); }
    finally {
      setCoachLoading(false);
      if (finalText && finalText !== "Something went wrong. Please try again.") {
        const updatedMsgs = [...msgs, { role: "assistant", content: finalText }];
        setCoachMessages(updatedMsgs);
        setCoachStreaming("");

        // Extract original input text for session title
        const firstUserContent = updatedMsgs[0]?.content || "";
        const titleText = firstUserContent.replace(/^I received this message from my co-parent\. Help me respond:\n\n"|^I need to send a message to my co-parent about the following:\n\n/g, "").replace(/"$/, "");

        if (activeCoachSessionId) {
          // Update existing session
          setCoachSessions((prev) => prev.map((s) => s.id === activeCoachSessionId ? { ...s, messages: updatedMsgs, result: finalText } : s));
        } else {
          // Create new session
          const sessionId = `coach_${Date.now()}`;
          const newSession = { id: sessionId, mode: savedMode, messages: updatedMsgs, title: titleText.slice(0, 50), createdAt: new Date().toISOString() };
          setCoachSessions((prev) => [newSession, ...prev]);
          setActiveCoachSessionId(sessionId);
        }
      } else {
        setCoachStreaming("");
      }
    }
  };

  const copyCoachMessage = () => {
    // Find the latest assistant message
    const lastAssistant = [...coachMessages].reverse().find(m => m.role === "assistant")?.content || coachStreaming;
    const match = lastAssistant.match(/\*\*Your message:\*\*\s*\n([\s\S]*?)(?:\n\*\*|$)/);
    const textToCopy = match ? match[1].trim() : lastAssistant;
    navigator.clipboard.writeText(textToCopy).then(() => { setCoachCopied(true); setTimeout(() => setCoachCopied(false), 2000); }).catch(() => {});
  };

  // --- Calendar ---
  const loadCalEvents = useCallback(async () => {
    if (!session?.token) return;
    setCalLoading(true);
    try {
      const start = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-01`;
      const end = new Date(calMonth.year, calMonth.month + 1, 0);
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      const events = await dbSelect("calendar_events", `user_id=eq.${session.user.id}&date=gte.${start}&date=lte.${endStr}&order=date,time`, session.token);
      setCalEvents(events || []);
    } catch { setCalEvents([]); }
    setCalLoading(false);
  }, [session?.token, session?.user?.id, calMonth]);

  useEffect(() => { if (activeTab === "today") loadCalEvents(); }, [activeTab, calMonth]);

  const calDays = (() => {
    const first = new Date(calMonth.year, calMonth.month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const prevDays = new Date(calMonth.year, calMonth.month, 0).getDate();
    const cells: { day: number; month: "prev" | "current" | "next"; dateStr: string }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const m = calMonth.month === 0 ? 12 : calMonth.month;
      const y = calMonth.month === 0 ? calMonth.year - 1 : calMonth.year;
      cells.push({ day: d, month: "prev", dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ day: i, month: "current", dateStr: `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}` });
    }
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const m = calMonth.month === 11 ? 1 : calMonth.month + 2;
      const y = calMonth.month === 11 ? calMonth.year + 1 : calMonth.year;
      cells.push({ day: i, month: "next", dateStr: `${y}-${String(m).padStart(2, "0")}-${String(i).padStart(2, "0")}` });
    }
    return cells;
  })();

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

  const handleCalSave = async () => {
    if (!calForm.title.trim() || !calForm.date || !session?.token) return;
    const body = { user_id: session.user.id, title: calForm.title.trim(), date: calForm.date, time: calForm.time ? formatTime12(calForm.time) : null, type: calForm.type, notes: calForm.notes.trim() || null };
    try {
      if (calEditEvent) {
        await dbUpdate("calendar_events", `id=eq.${calEditEvent.id}`, body, session.token);
      } else {
        await sbFetch("/rest/v1/calendar_events", { method: "POST", body, token: session.token });
      }
      await loadCalEvents();
      setCalShowAdd(false);
      setCalEditEvent(null);
      setCalForm({ title: "", date: "", time: "", type: "handoff", notes: "" });
    } catch {}
  };

  const handleCalDelete = async (eventId: string) => {
    if (!session?.token) return;
    await dbDelete("calendar_events", `id=eq.${eventId}`, session.token);
    setCalEvents(prev => prev.filter(e => e.id !== eventId));
    setCalDeleteConfirm(null);
  };

  const openAddEvent = (date?: string) => {
    setCalEditEvent(null);
    setCalForm({ title: "", date: date || calSelectedDate || todayStr, time: "", type: "handoff", notes: "" });
    setCalShowAdd(true);
  };

  const openEditEvent = (evt: any) => {
    setCalEditEvent(evt);
    const timeVal = evt.time ? (() => { const [hm, p] = evt.time.split(" "); const [h, m] = hm.split(":").map(Number); const h24 = p === "PM" && h !== 12 ? h + 12 : p === "AM" && h === 12 ? 0 : h; return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; })() : "";
    setCalForm({ title: evt.title, date: evt.date, time: timeVal, type: evt.type, notes: evt.notes || "" });
    setCalShowAdd(true);
  };

  const selectedDateEvents = calEvents.filter(e => e.date === calSelectedDate);

  const spring = { type: "spring" as const, stiffness: 500, damping: 30 };

  // ============================================================
  return (
    <>
      <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
      <input ref={vaultFileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.xlsx,.csv" className="hidden" onChange={handleVaultUpload} />

      {/* ==================== LOADING / SPLASH ==================== */}
        {!appReady && (
          <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
            <Logo size="md" className="mb-4 animate-pulse" />
          </div>
        )}
        {showSplash && (
          <div ref={splashRef} onTouchStart={onPullTouchStart} onTouchMove={onPullTouchMove} onTouchEnd={onPullTouchEnd}
            className="fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden scroll-smooth [-webkit-overflow-scrolling:touch]">
            {/* Pull-to-refresh indicator — fixed overlay, doesn't push content */}
            {(pullY > 0 || pullRefreshing) && (
              <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center bg-white" style={{ height: pullRefreshing ? 48 : pullY }}>
                <div className={cn("w-6 h-6 rounded-full border-2 border-emerald-400 border-t-transparent", pullRefreshing && "animate-spin")}
                  style={{ opacity: pullRefreshing ? 1 : Math.min(pullY / 50, 1), transform: `rotate(${pullY * 4}deg)` }} />
              </div>
            )}
            {/* Content wrapper — slides down with pull */}
            <div className="relative min-h-full bg-gradient-to-b from-white via-emerald-50/20 to-white transition-transform duration-200 ease-out"
              style={{ transform: pullY > 0 || pullRefreshing ? `translateY(${pullRefreshing ? 48 : pullY}px)` : undefined }}>
            {/* Soft ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ height: "100dvh", position: "fixed" }}>
              <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-100/30 to-cyan-50/20 blur-3xl" />
            </div>

            {/* Sticky top nav */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md" style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
              <div className="flex items-center gap-2">
                <Logo size="sm" />
                <span className="font-sans font-medium text-base tracking-normal text-slate-800">Meridian</span>
              </div>
              <div className="flex items-center gap-5">
                <a href="/guides/" className="text-sm font-medium text-slate-400 hover:text-emerald-600 transition-colors">Guides</a>
                <button onClick={() => { setShowSplash(false); setAuthView("signin"); setAuthError(""); setAuthEmail(""); setAuthPassword(""); }}
                  className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">
                  Sign In
                </button>
              </div>
            </div>

            {/* ===== SECTION 1: Hero ===== */}
            <div className="min-h-[calc(100dvh-60px)] flex flex-col items-center justify-center px-6 max-w-xl mx-auto relative z-10">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-8">
                <div className="flex items-center gap-4">
                  <Logo size="lg" />
                  <span className="font-sans font-medium text-2xl tracking-normal text-slate-800">Meridian</span>
                </div>
              </motion.div>

              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="text-3xl sm:text-5xl font-light tracking-tight text-slate-800 text-center mb-3 leading-[1.15]">
                Hard chapter.<br />
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent font-normal">Not the last one.</span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="text-sm text-slate-500 text-center mb-8 max-w-sm leading-relaxed">
                Meridian walks with you through divorce, co-parenting, and everything you're rebuilding.
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-4 w-full max-w-xs">
                {/* Mobile: iOS → app download primary; non-iOS → web primary */}
                <div className="flex flex-col items-center gap-3 sm:hidden w-full">
                  {isIOS ? (
                    <>
                      <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-12 flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-2xl transition-all duration-500">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                        Get the app — free for 3 days
                      </a>
                      <button onClick={enterApp} className="w-full h-11 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                        Start free on web
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={enterApp} className="w-full h-12 flex items-center justify-center text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-2xl transition-all duration-500">
                        Get support now — free for 3 days
                      </button>
                      <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                        Also on iPhone
                      </a>
                    </>
                  )}
                </div>
                {/* Desktop: web primary, app download secondary */}
                <div className="hidden sm:flex flex-col items-center gap-3 w-full">
                  <Button size="lg" onClick={enterApp} className="w-full h-13 px-8 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                    Get support now — free for 3 days
                  </Button>
                  <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    Also on iPhone
                  </a>
                </div>
                <p className="text-[11px] text-slate-400 -mt-2">No credit card needed. Private forever.</p>
              </motion.div>

              {/* Scroll hint */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.8 }} className="absolute bottom-8">
                <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="text-slate-500">
                  <ChevronLeft className="w-6 h-6 rotate-[-90deg]" />
                </motion.div>
              </motion.div>
            </div>

            {/* ===== SECTION: Privacy Promise ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <motion.div className="max-w-lg w-full" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-3 text-center">Your privacy is the product</p>
                <h2 className="text-2xl sm:text-3xl font-light text-slate-800 mb-4 text-center leading-snug">A safe space. Not a legal record.</h2>
                <p className="text-sm text-slate-500 text-center mb-10 max-w-sm mx-auto leading-relaxed">Other co-parenting apps build for court admissibility. Everything you write becomes a permanent record. Meridian is different.</p>

                <div className="space-y-4">
                  {[
                    { icon: Shield, title: "Private by default", desc: "Your conversations stay between you and Meridian. Not your co-parent. Not a courtroom. Not advertisers." },
                    { icon: EyeOff, title: "Nothing is shared", desc: "We don't sell data, we don't build ad profiles, and we never will." },
                    { icon: Trash2, title: "You're in control", desc: "Delete your data anytime. No questions, no hoops." },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center shrink-0">
                        <item.icon className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 mb-1">{item.title}</p>
                        <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* ===== SECTION 2: The Mirror ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <motion.div className="max-w-lg" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <h2 className="text-2xl sm:text-3xl font-light text-slate-800 mb-2 leading-snug">
                  We know where you are.
                </h2>
                <p className="text-lg sm:text-xl font-light text-emerald-600 mb-8">We've been there.</p>

                <div className="space-y-5 text-[15px] sm:text-base text-slate-600 leading-relaxed">
                  <p>Googling custody laws at midnight. Re-reading a text from your ex for the fifth time trying to figure out how to respond without making it worse. Holding it together for the kids and quietly breaking down in the car.</p>
                  <p>You don't need another article that says "prioritize self-care" and "control what you can control." You need someone who gets it and can actually help you figure out what to do next.</p>
                </div>

              </motion.div>
            </div>

            {/* ===== SECTION 3: What Meridian Does ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <motion.div className="max-w-lg w-full" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-8 text-center">One app for all of it</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Sparkles, title: "Talk through anything", desc: "AI that listens, understands, and helps you think clearly" },
                    { icon: MessageSquare, title: "Draft calm messages", desc: "Respond to your co-parent without escalating" },
                    { icon: FolderLock, title: "Keep documents safe", desc: "Your decree, agreements, and records — locked down" },
                    { icon: CalendarDays, title: "Stay organized", desc: "Custody schedules, handoffs, and important dates" },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center mb-3">
                        <item.icon className="w-4.5 h-4.5 text-emerald-600" strokeWidth={1.5} />
                      </div>
                      <p className="text-sm font-medium text-slate-800 mb-1">{item.title}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* ===== SECTION 4.5: Testimonials ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <div className="max-w-lg w-full space-y-6">
                <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="text-xs font-medium text-slate-400 uppercase tracking-wider text-center mb-2">People like you</motion.p>
                {[
                  { quote: "I was drowning in legal documents and couldn\u2019t afford to call my lawyer every time I had a question. Meridian helped me understand my decree in plain English.", name: "Sarah", situation: "2 years post-divorce" },
                  { quote: "The message coach saved me. I used to fire off angry texts at 2am. Now I run them through Meridian first and actually get better responses from my ex.", name: "Marcus", situation: "co-parenting two kids" },
                  { quote: "I just needed someone to talk to who understood. Not a therapist appointment I had to wait 3 weeks for. Meridian was there at midnight when I needed it most.", name: "Jamie", situation: "going through separation" },
                ].map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <p className="text-sm text-slate-600 italic">&ldquo;{t.quote}&rdquo;</p>
                    <p className="text-xs text-slate-400 font-medium mt-3">&mdash; {t.name}, {t.situation}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* ===== SECTION 4.75: FAQ ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <div className="max-w-lg w-full">
                <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="text-xs font-medium text-slate-400 uppercase tracking-wider text-center mb-8">Common questions</motion.p>
                <div className="space-y-3">
                  {[
                    { q: "Is Meridian a therapist or a lawyer?", a: "Neither \u2014 think of it as a knowledgeable friend who\u2019s available anytime. It won\u2019t replace professional advice, but it can help you think clearly, understand your documents, and figure out what to say \u2014 especially at 2am when no one else is picking up." },
                    { q: "What does Meridian actually do?", a: "Everything you need in one place. Store and reference your legal documents. Get coached on exactly what to say to your co-parent. Understand your decree in plain English. Manage your schedule, handoffs, and deadlines. Build healthier habits for yourself and your kids. Meridian is your private command center for getting through the hardest chapter \u2014 and becoming a better version of yourself on the other side." },
                    { q: "Is my data private?", a: "Completely. Your conversations and documents are encrypted and never shared with anyone \u2014 not your ex, not a court, not even us. Meridian is built for you alone." },
                    { q: "Is it really free?", a: "You get a full 3-day free trial with no credit card required. After that, Meridian is $4.99/month. Money can be tight during times like these \u2014 cost should never be a barrier to getting the support you need. Cancel anytime, no questions asked." },
                    { q: "Can my ex see what I write here?", a: "No. There is no shared access, no co-parent portal, no way for anyone else to see your account. This is your private space." },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <button onClick={() => setExpandedSetting(expandedSetting === `faq-${i}` ? null : `faq-${i}`)} className="w-full p-5 text-left flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-slate-700">{item.q}</span>
                        <motion.div animate={{ rotate: expandedSetting === `faq-${i}` ? 45 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 mt-0.5">
                          <Plus className="w-4 h-4 text-slate-400" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {expandedSetting === `faq-${i}` && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                            <p className="px-5 pb-5 pt-0 text-[13px] text-slate-500 leading-relaxed">{item.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* ===== SECTION 5: Your Story + Final CTA ===== */}
            <div className="min-h-[100dvh] flex items-center justify-center px-6 pt-24 pb-12 relative z-10">
              <motion.div className="max-w-lg text-center" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-8">Why Meridian exists</p>

                <div className="text-[15px] sm:text-base text-slate-600 leading-relaxed space-y-4 text-left mb-12">
                  <p>I went through a divorce. It sucks. It's not easy, and no one wins.</p>
                  <p>Many nights I didn't know what to do, who to call, or if I was going to be okay. I couldn't afford to ask a lawyer every question. I didn't want pity. I just wanted someone to help me think clearly when I couldn't.</p>
                  <p className="text-slate-800 font-medium">That's why I built Meridian.</p>
                </div>

                {/* Founder video */}
                <div className="w-full rounded-2xl overflow-hidden shadow-lg shadow-slate-900/10 mb-10">
                  <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src="https://www.youtube.com/embed/wlnhSIS11I8?rel=0&modestbranding=1"
                      title="A message from our founder"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>

                {/* Final CTA */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-lg sm:text-xl font-light text-slate-800 mb-2">Whenever you're ready.</p>
                  {/* Mobile: iOS → app download primary; non-iOS → web primary */}
                  <div className="flex flex-col items-center gap-3 sm:hidden w-full max-w-xs">
                    {isIOS ? (
                      <>
                        <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-12 flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-2xl transition-all duration-500">
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                          Get the app — free for 3 days
                        </a>
                        <button onClick={enterApp} className="w-full h-11 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                          Start free on web
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={enterApp} className="w-full h-12 flex items-center justify-center text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-2xl transition-all duration-500">
                          Talk it through — free for 3 days
                        </button>
                        <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                          Also on iPhone
                        </a>
                      </>
                    )}
                  </div>
                  {/* Desktop: web primary, app download secondary */}
                  <div className="hidden sm:flex flex-col items-center gap-3 w-full max-w-xs">
                    <Button size="lg" onClick={enterApp} className="w-full h-13 px-8 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                      Talk it through — free for 3 days
                    </Button>
                    <a href="https://apps.apple.com/us/app/meridian-calm-clarity/id6760792373" className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 border border-emerald-300 hover:bg-emerald-50 rounded-2xl transition-colors">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                      Also on iPhone
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-400">Free for 3 days, then $4.99/mo. Cancel anytime.</p>
                </div>

                {/* Email capture */}
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-12 w-full max-w-sm mx-auto">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider text-center mb-3">Not ready yet? Stay in the loop.</p>
                  {waitlistStatus === "sent" ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-emerald-600 font-medium">
                      <Check className="w-4 h-4" />
                      <span>You're on the list.</span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input type="email" placeholder="Your email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleWaitlist()}
                        className="flex-1 px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                      <Button onClick={handleWaitlist} disabled={!waitlistEmail.trim() || waitlistStatus === "sending"}
                        className="px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl text-sm disabled:opacity-40">
                        {waitlistStatus === "sending" ? "..." : "Join"}
                      </Button>
                    </div>
                  )}
                </motion.div>

                {/* Social links */}
                <div className="mt-12 flex items-center justify-center gap-4">
                  <a href="https://www.linkedin.com/company/mymeridian/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </a>
                  <a href="https://www.youtube.com/@MyMeridianapp" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                    <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                </div>

                {/* Trust footer */}
                <div className="mt-6 pb-8 flex flex-col items-center gap-2">
                  <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    <span>Private & confidential</span>
                    <span className="text-slate-300">·</span>
                    <span>Not legal advice</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href="/guides/" className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2">Guides</a>
                    <span className="text-[11px] text-slate-600">·</span>
                    <button onClick={() => setShowPrivacy(true)} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2">Privacy Policy</button>
                    <span className="text-[11px] text-slate-600">·</span>
                    <button onClick={() => setShowTerms(true)} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2">Terms of Service</button>
                  </div>
                </div>
              </motion.div>
            </div>
            </div>{/* end content wrapper */}
          </div>
        )}

      {/* ==================== VIDEO OVERLAY ==================== */}
      {showVideo && (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6" onClick={dismissVideo}>
          <div className="relative bg-slate-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col" style={{ height: "min(85vh, 700px)", maxWidth: "min(380px, 90vw)" }} onClick={(e) => e.stopPropagation()}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-white/5 shrink-0">
              <div>
                <div className="text-sm font-medium text-white/80">A message from our founder</div>
                <div className="text-[11px] text-white/30">The story behind Meridian</div>
              </div>
              <button onClick={dismissVideo} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-all"><X className="w-4 h-4" /></button>
            </div>
            {/* YouTube embed */}
            <div className="relative flex-1 min-h-0 bg-black">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/wlnhSIS11I8?autoplay=1&rel=0&modestbranding=1"
                title="A message from our founder"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================== PRIVACY POLICY ==================== */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[60] bg-white overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-light tracking-tight text-slate-800">Privacy Policy</h1>
              <button onClick={() => setShowPrivacy(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-6">Effective January 2026</p>
            <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
              <p>Meridian is built for people navigating one of the hardest chapters of their lives. We believe your privacy isn't just a feature — it's a right. This policy explains exactly what we collect, why, and what we'll never do.</p>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">What we collect</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Account info:</strong> Your name and email address, used solely for authentication and to personalize your experience.</li>
                  <li><strong>Conversations:</strong> Messages you exchange with Meridian's AI assistant are stored securely so you can access your history across sessions.</li>
                  <li><strong>Documents:</strong> Files you upload to your Vault (decrees, agreements, etc.) are stored in encrypted cloud storage tied to your account.</li>
                  <li><strong>Calendar events:</strong> Dates, times, and notes you add to your co-parenting calendar.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">What we never do</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>We <strong>never sell, share, or monetize</strong> your personal data. Period.</li>
                  <li>We <strong>never use your conversations or documents to train AI models.</strong> Your words stay yours.</li>
                  <li>We <strong>never show ads</strong> or share data with advertisers.</li>
                  <li>We <strong>never allow your co-parent, attorneys, or anyone else</strong> to access your account or data.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">How we protect your data</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>All data is transmitted over HTTPS and encrypted at rest.</li>
                  <li>Authentication is handled by Supabase with industry-standard security practices including bcrypt password hashing and secure token management.</li>
                  <li>Document storage uses isolated, access-controlled cloud buckets — only you can retrieve your files.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">AI conversations</h2>
                <p>When you chat with Meridian, your messages are sent to Anthropic's Claude API to generate responses. Anthropic does not use API inputs or outputs to train their models. Your conversations are processed in real time and are not retained by Anthropic beyond what's needed to deliver the response.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Google sign-in</h2>
                <p>If you sign in with Google, we receive only your name and email address. We do not access your Google contacts, calendar, drive, or any other Google services.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Deleting your data</h2>
                <p>You can delete individual conversations, documents, and calendar events at any time. To delete your entire account and all associated data, contact us at <a href="mailto:support@mymeridianapp.com" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">support@mymeridianapp.com</a> and we'll remove everything within 48 hours.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Changes to this policy</h2>
                <p>If we make meaningful changes, we'll notify you in the app. We'll never quietly weaken your privacy protections.</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 text-xs">Questions? Reach us at <a href="mailto:support@mymeridianapp.com" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">support@mymeridianapp.com</a></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TERMS OF SERVICE ==================== */}
      {showTerms && (
        <div className="fixed inset-0 z-[60] bg-white overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-light tracking-tight text-slate-800">Terms of Service</h1>
              <button onClick={() => setShowTerms(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-6">Effective January 2026</p>
            <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
              <p>Welcome to Meridian. By using our app, you agree to these terms. Please read them carefully — they're written in plain language because we believe you deserve clarity, especially right now.</p>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">What Meridian is</h2>
                <p>Meridian is an AI-powered support tool designed to help people navigating divorce and co-parenting. It provides emotional support, informational resources, and organizational tools to help you through this chapter of your life.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">What Meridian is not</h2>
                <p>Meridian is <strong>not a law firm, not a licensed attorney, and not a substitute for legal counsel.</strong> AI responses are provided for informational and emotional support purposes only. Nothing in this app constitutes legal advice. You are solely responsible for your own legal decisions, and we strongly encourage you to consult a qualified attorney for any legal matters.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Eligibility</h2>
                <p>You must be at least 18 years old to use Meridian. By creating an account, you confirm that you meet this requirement.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Subscription & billing</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Meridian offers a <strong>3-day free trial</strong> for new users.</li>
                  <li>After the trial, Meridian Pro is available at <strong>$4.99/month</strong> or <strong>$39.99/year</strong>.</li>
                  <li>Subscriptions <strong>automatically renew</strong> at the end of each billing period unless canceled at least 24 hours before the renewal date.</li>
                  <li>On iOS, payment is charged to your Apple ID account. Manage or cancel your subscription in your device's Settings → Apple ID → Subscriptions.</li>
                  <li>You can cancel anytime. Cancellation takes effect at the end of your current billing period.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Your content</h2>
                <p>Any content you upload to Meridian — documents, messages, calendar entries, notes — <strong>remains your property.</strong> We do not claim ownership of your content. We store it securely solely to provide the service to you.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Acceptable use</h2>
                <p>We built Meridian to help people. We reserve the right to suspend or terminate accounts that are used to harass others, upload harmful content, attempt to compromise the service, or otherwise abuse the platform. We'll always try to give notice before taking action, except in cases where safety is at risk.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Limitation of liability</h2>
                <p>Meridian is provided "as is" without warranties of any kind. To the maximum extent permitted by law, Meridian and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill, arising from your use of the service. Our total liability to you for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Changes to these terms</h2>
                <p>We may update these terms from time to time. When we do, we'll notify you in the app. Continued use of Meridian after changes take effect means you accept the updated terms.</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 text-xs">Questions? Reach us at <a href="mailto:support@mymeridianapp.com" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">support@mymeridianapp.com</a></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== AUTH ==================== */}
      {SUPABASE_URL && (!session?.user?.name || authView === "signin" || authView === "signup" || authView === "forgot" || authView.startsWith("onboard-")) && !showSplash ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center px-8 bg-gradient-to-b from-white via-emerald-50/20 to-white overflow-hidden z-40">
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-100/30 to-cyan-50/20 blur-3xl pointer-events-none" />
          <motion.div className="max-w-[380px] w-full flex flex-col items-center relative z-10" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-center gap-3 mb-12">
              <Logo size="md" />
              <span className="font-sans font-medium text-lg tracking-normal text-slate-800">Meridian</span>
            </div>

            <AnimatePresence mode="wait">
              {(authView === "onboarding" || authView.startsWith("onboard-")) && (
                <div className="w-full mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-slate-400 font-medium">Step {authView === "onboarding" ? 1 : authView === "onboard-modes" ? 2 : authView === "onboard-decree" ? 3 : 4} of 4</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" initial={{ width: "0%" }} animate={{ width: authView === "onboarding" ? "25%" : authView === "onboard-modes" ? "50%" : authView === "onboard-decree" ? "75%" : "100%" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                </div>
              )}
              {authView === "onboarding" ? (
                <motion.div key="name" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-8 text-center">What's your first name?</h2>
                  <div className="w-full flex flex-col gap-3">
                    <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Your first name" value={authName} onChange={(e) => setAuthName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleOnboarding()} />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleOnboarding} disabled={!authName.trim() || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">{authLoading ? "Saving..." : "Continue"}</Button>
                  </div>
                </motion.div>
              ) : authView === "onboard-modes" ? (
                <motion.div key="modes" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Where are you in your journey?</h2>
                  <p className="text-sm text-slate-400 mb-6 text-center">This helps us show you the most relevant resources.</p>
                  <div className="w-full flex flex-col gap-2.5 mb-6">
                    {[
                      { id: "during", label: "Going through it now", desc: "Actively navigating the divorce process" },
                      { id: "after", label: "Recently divorced", desc: "Adjusting to life after separation" },
                      { id: "coparenting", label: "Focused on co-parenting", desc: "Building a healthy co-parenting relationship" },
                    ].map((option) => (
                      <button key={option.id} onClick={() => { localStorage.setItem("m_phase", option.id); setAuthView("onboard-decree"); }} className="w-full flex items-start gap-3.5 p-4 rounded-xl bg-white border border-slate-200/60 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all text-left group">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                        <div><div className="text-sm font-medium text-slate-800 mb-0.5">{option.label}</div><div className="text-[13px] text-slate-400 leading-snug">{option.desc}</div></div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAuthView("onboard-decree")} className="text-sm text-slate-400 hover:text-slate-600 transition-colors mt-1">Skip for now</button>
                </motion.div>
              ) : authView === "onboard-decree" ? (
                <motion.div key="decree" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <button onClick={() => setAuthView("onboard-modes")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors mb-6 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Upload your decree</h2>
                  <p className="text-sm text-slate-500 mb-2 text-center leading-relaxed max-w-[300px]">When Meridian has your decree, it can answer questions using your actual terms — custody schedules, financial obligations, and more.</p>
                  <div className="mb-6" />
                  <AnimatePresence mode="wait">
                    {uploading ? (
                      <motion.div key="uploading" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full py-8 px-6 border-2 border-emerald-300 bg-emerald-50/50 rounded-2xl flex flex-col items-center gap-3 mb-4">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-[2.5px] border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-sm font-medium text-emerald-700">Uploading your document...</span>
                        <span className="text-xs text-emerald-500/70">This only takes a moment</span>
                      </motion.div>
                    ) : decreeFileName && decreeText ? (
                      <motion.div key="uploaded" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full border-2 border-emerald-200 bg-emerald-50 rounded-2xl flex flex-col items-center gap-2 mb-4 text-emerald-700 overflow-hidden">
                        <div className="py-6 px-6 flex flex-col items-center gap-2">
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}><Check size={28} className="text-emerald-500" /></motion.div>
                          <span className="text-sm font-medium">{decreeFileName}</span>
                          {decreePages > 0 && <span className="text-xs text-emerald-500/70">{decreePages} pages ready</span>}
                        </div>
                        {FEATURE_DECREE_INTELLIGENCE && extractionLoading && !decreeExtraction && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="w-full border-t border-emerald-200 bg-emerald-50/80 px-6 py-4 flex flex-col items-center gap-3">
                            <div className="flex items-center gap-2">
                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
                              <span className="text-xs font-medium text-emerald-600">Summarizing key details...</span>
                            </div>
                            <span className="text-[11px] text-slate-400 text-center leading-relaxed">Feel free to continue — your summary will be ready when you get in.</span>
                          </motion.div>
                        )}
                        {FEATURE_DECREE_INTELLIGENCE && decreeExtraction?.status === "complete" && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.4 }} className="w-full border-t border-emerald-200 bg-white/60 px-5 py-4">
                            <p className="text-xs font-medium text-emerald-700 mb-3 text-center">Here's what we found</p>
                            <div className="space-y-2">
                              {decreeExtraction.custody_type && (
                                <div className="flex items-start gap-2 text-left">
                                  <span className="text-[11px] text-emerald-500 mt-px shrink-0">Custody</span>
                                  <span className="text-[12px] text-slate-600 leading-snug">{decreeExtraction.custody_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                                </div>
                              )}
                              {decreeExtraction.child_support?.amount && (
                                <div className="flex items-start gap-2 text-left">
                                  <span className="text-[11px] text-emerald-500 mt-px shrink-0">Support</span>
                                  <span className="text-[12px] text-slate-600 leading-snug">${decreeExtraction.child_support.amount}/mo{decreeExtraction.child_support.payer ? ` from ${decreeExtraction.child_support.payer}` : ""}</span>
                                </div>
                              )}
                              {decreeExtraction.geographic_restriction?.restricted && (
                                <div className="flex items-start gap-2 text-left">
                                  <span className="text-[11px] text-emerald-500 mt-px shrink-0">Geo</span>
                                  <span className="text-[12px] text-slate-600 leading-snug">{decreeExtraction.geographic_restriction.area || "Restricted"}</span>
                                </div>
                              )}
                              {decreeExtraction.children?.length > 0 && (
                                <div className="flex items-start gap-2 text-left">
                                  <span className="text-[11px] text-emerald-500 mt-px shrink-0">Children</span>
                                  <span className="text-[12px] text-slate-600 leading-snug">{decreeExtraction.children.map((c: any) => c.name).filter(Boolean).join(", ") || `${decreeExtraction.children.length} listed`}</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-3 text-center">You can view and edit the full summary anytime</p>
                          </motion.div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full mb-4">
                        <button onClick={() => fileRef.current?.click()} className="w-full py-8 px-6 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all text-slate-400 mb-3">
                          <Upload size={24} /><span className="text-sm font-medium text-slate-600">Tap to upload your decree</span><span className="text-xs text-slate-400">.pdf, .docx, .txt, or .md</span>
                        </button>
                        <div className="flex flex-col items-center gap-2 mt-1">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center gap-1"><FolderLock size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Encrypted<br/>storage</span></div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1"><Eye size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Never read<br/>by humans</span></div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1"><Shield size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Never shared<br/>or sold</span></div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {uploadError && <div className="text-red-600 text-[13px] text-center py-2 px-3 bg-red-50 rounded-lg mb-3 w-full">{uploadError}</div>}
                  {decreeFileName && decreeText ? (
                    <Button onClick={() => setAuthView("onboard-ready")} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">Continue</Button>
                  ) : (
                    <>
                      <p className="text-xs text-slate-400 text-center mb-3">Don't have it yet? That's completely okay — you can add it anytime from your vault.</p>
                      <button onClick={() => setAuthView("onboard-ready")} disabled={uploading} className="text-sm text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40">{uploading ? "Processing..." : "Skip for now"}</button>
                    </>
                  )}
                </motion.div>
              ) : authView === "onboard-ready" ? (
                <motion.div key="ready" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <button onClick={() => setAuthView("onboard-decree")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors mb-6 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-4 text-center">Just so you know</h2>
                  <p className="text-sm text-slate-400 mb-3 text-center leading-relaxed max-w-[280px]">Meridian is not a lawyer or legal advisor. It's a grounding tool — built to help you stay clear, calm, and centered through divorce and co-parenting.</p>
                  <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed max-w-[280px]">For legal decisions, always loop in your attorney. For everything else, we're right here with you.</p>
                  <Button onClick={finishOnboarding} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">Let's go{firstName ? `, ${firstName}` : ""}</Button>
                </motion.div>
              ) : authView === "forgot" ? (
                <motion.div key="forgot" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {resetSent ? (
                    <>
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4"><Check className="w-6 h-6 text-emerald-500" /></motion.div>
                      <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Check your email</h2>
                      <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed max-w-[280px]">If an account exists for <span className="text-slate-600 font-medium">{authEmail}</span>, you'll receive a password reset link shortly.</p>
                      <Button onClick={() => { setAuthView("signin"); setAuthError(""); setResetSent(false); setAuthPassword(""); }} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">Back to Sign In</Button>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Reset your password</h2>
                      <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed max-w-[280px]">Enter your email and we'll send you a link to reset your password.</p>
                      <div className="w-full flex flex-col gap-3">
                        <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type="email" placeholder="Email address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()} />
                        {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                        <Button onClick={handleForgotPassword} disabled={!authEmail || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 disabled:opacity-40">{authLoading ? "Sending..." : "Send Reset Link"}</Button>
                      </div>
                      <button onClick={() => { setAuthView("signin"); setAuthError(""); }} className="mt-6 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to Sign In</button>
                    </>
                  )}
                </motion.div>
              ) : (authView === "signin" || authView === "signup") ? (
                <motion.div key={authView} className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">{authView === "signin" ? "Welcome back" : "Create your account"}</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">{authView === "signin" ? "Let's pick up where you left off." : "You've taken the first step. Let's make the road ahead clearer."}</p>
                  <div className="w-full flex flex-col gap-3">
                    <button onClick={() => { window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${window.location.origin}`; }}
                      className="w-full h-11 flex items-center justify-center gap-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all">
                      <svg className="w-4.5 h-4.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      Continue with Google
                    </button>
                    <button onClick={() => { window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=apple&redirect_to=${window.location.origin}`; }}
                      className="w-full h-11 flex items-center justify-center gap-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all">
                      <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                      Continue with Apple
                    </button>
                    <div className="flex items-center gap-3 my-1 w-full"><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-200" /></div>
                    <div>
                      <label htmlFor="auth-email" className="sr-only">Email address</label>
                      <input id="auth-email" className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type="email" placeholder="Email address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
                    </div>
                    <div className="relative">
                      <label htmlFor="auth-password" className="sr-only">Password</label>
                      <input id="auth-password" className="w-full pl-4 pr-11 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type={showPassword ? "text" : "password"} placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authView === "signin" && (
                      <div className="flex justify-center">
                        <button onClick={() => { setAuthView("forgot"); setAuthError(""); setResetSent(false); }} className="text-[13px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors">Forgot password?</button>
                      </div>
                    )}
                    {authView === "signup" && authPassword.length > 0 && (
                      <div className="flex flex-col gap-1.5 px-1">
                        {[
                          { met: authPassword.length >= 8, label: "At least 8 characters" },
                          { met: /[A-Z]/.test(authPassword), label: "One uppercase letter" },
                          { met: /[0-9]/.test(authPassword), label: "One number" },
                        ].map((req) => (
                          <div key={req.label} className="flex items-center gap-2 text-[11px]">
                            <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center transition-all", req.met ? "bg-emerald-500 border-emerald-500" : "border-slate-300 bg-white")}>
                              {req.met && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                            </div>
                            <span className={req.met ? "text-emerald-600" : "text-slate-400"}>{req.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleAuth} disabled={!authEmail || !authPassword || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 disabled:opacity-40">{authLoading ? (authView === "signin" ? "Signing in..." : "Creating account...") : (authView === "signin" ? "Sign In" : "Create Account")}</Button>
                  </div>
                  <p className="mt-6 text-xs text-slate-400">{authView === "signin" ? "New here?" : "Already have an account?"}{" "}<button onClick={() => { setAuthView(authView === "signin" ? "signup" : "signin"); setAuthError(""); setAuthPassword(""); }} className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors">{authView === "signin" ? "Create an account" : "Sign in"}</button></p>
                  {!isNative && (
                    <button onClick={() => { setShowSplash(true); setAuthView("main"); setAuthError(""); }} className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && subscription.loading ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-40">
          <Logo size="md" className="mb-4 animate-pulse" />
        </div>
      ) : !showSplash && !hasAccess ? (
        <>
          {/* ==================== PAYWALL ==================== */}
          <div className="fixed inset-0 flex flex-col items-center justify-center px-8 bg-gradient-to-b from-white via-emerald-50/20 to-white z-40">
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl pointer-events-none" />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-sm w-full text-center">
              <Logo size="lg" className="mx-auto mb-6" />
              <h2 className="text-2xl font-light tracking-tight text-slate-800 mb-2">Your free trial has ended</h2>
              <h3 className="text-base font-medium text-slate-700 mb-1">Meridian Pro</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">Unlimited access to all features. Cancel anytime.</p>
              {(isNative || isIOS) ? (
                <div className="space-y-3 mb-6">
                  {[
                    { id: "yearly", label: "Yearly", price: "$39.99", period: "/year", badge: "Save 33%", perMonth: null },
                    { id: "monthly", label: "Monthly", price: "$4.99", period: "/month", badge: null, perMonth: null },
                  ].map((plan) => (
                    <button key={plan.id} onClick={() => setSelectedPlan(plan.id)} className={cn("w-full rounded-2xl border-2 p-4 text-left transition-all relative", selectedPlan === plan.id ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200 bg-white")}>
                      {plan.badge && <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500 text-white px-2 py-0.5 rounded-full">{plan.badge}</span>}
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-light text-slate-800">{plan.price}</span>
                        <span className="text-sm text-slate-400">{plan.period}</span>
                      </div>
                      {plan.perMonth && <p className="text-xs text-emerald-600 mt-0.5">{plan.perMonth}</p>}
                    </button>
                  ))}
                  <ul className="text-sm text-slate-600 space-y-2.5 text-left my-5 px-1">
                    {["Unlimited AI conversations", "Communication coach", "Document vault", "Calendar & scheduling"].map((f, i) => (
                      <li key={i} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-emerald-500 shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button onClick={handleSubscribe} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-xl text-base font-medium">
                    Subscribe
                  </Button>
                  <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                    {selectedPlan === "yearly" ? "Meridian Pro · $39.99/year · " : "Meridian Pro · $4.99/month · "}
                    Includes unlimited AI conversations, communication coach, document vault, and calendar for the subscription period. Subscription auto-renews until canceled. Manage or cancel anytime in your device Settings.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm mb-6">
                  <div className="flex items-baseline justify-center gap-1 mb-1">
                    <span className="text-3xl font-light text-slate-800">$4.99</span>
                    <span className="text-sm text-slate-400">/month</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-5">Unlimited access to everything</p>
                  <ul className="text-sm text-slate-600 space-y-2.5 text-left mb-6">
                    {["Unlimited AI conversations", "Communication coach", "Document vault", "Calendar & scheduling"].map((f, i) => (
                      <li key={i} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-emerald-500 shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button onClick={handleSubscribe} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-xl text-base font-medium">
                    Subscribe
                  </Button>
                  <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                    Meridian Pro · $4.99/month · Includes unlimited AI conversations, communication coach, document vault, and calendar for the subscription period. Subscription auto-renews until canceled. Cancel anytime.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3 mt-2 mb-1 flex-wrap">
                <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Use (EULA)</a>
                <span className="text-slate-300">·</span>
                <button onClick={() => setShowPrivacy(true)} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Privacy Policy</button>
                <span className="text-slate-300">·</span>
                <button onClick={() => setShowTerms(true)} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Service</button>
              </div>
              <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors mt-1">Sign out</button>
            </motion.div>
          </div>
        </>
      ) : !showSplash && (
        <>
          {/* ==================== MAIN APP ==================== */}

          {/* Subscription success toast */}
          <AnimatePresence>
            {showSubscribeSuccess && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-white rounded-2xl shadow-xl shadow-emerald-500/10 border border-emerald-100 px-6 py-4 flex items-center gap-3 max-w-sm">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Welcome to Meridian</p>
                  <p className="text-xs text-slate-400">You have full access. We're glad you're here.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="fixed inset-0 flex flex-col max-w-3xl mx-auto bg-white overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>

            {/* Trial banner */}
            {isTrialActive && !isSubscribed && trialDaysLeft < TRIAL_DAYS && (
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500">
                  {trialDaysLeft === 0 ? "Your trial ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`}
                </span>
                <button onClick={() => setShowSubscribeModal(true)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 active:text-emerald-800 transition-colors px-3 py-1 rounded-lg hover:bg-emerald-50 active:bg-emerald-100">
                  Subscribe
                </button>
              </div>
            )}

            {/* Header */}
            <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }} className="flex items-center justify-between px-6 py-4 border-b border-slate-100/80 bg-white shrink-0 z-20">
              <div className="flex items-center gap-3">
                <Logo size="sm" />
                <span className="font-sans font-medium text-base tracking-normal text-slate-800">Meridian</span>
              </div>
              <div className="flex items-center gap-1">
                {conversations.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { if (activeTab !== "talk") setActiveTab("talk"); setTalkMode("chat"); setShowHistory(!showHistory); }} className={cn("text-slate-500 hover:text-slate-700 hover:bg-slate-100", showHistory && activeTab === "talk" && "text-emerald-600 bg-emerald-50")} aria-label="Conversation history"><Clock className="w-4 h-4" /></Button>
                )}
                {(hasConversation || showHistory) && (
                  <Button variant="ghost" size="sm" onClick={() => { if (streaming) handleStop(); if (activeTab !== "talk") setActiveTab("talk"); setTalkMode("chat"); setActiveConvId(null); setShowHistory(false); }} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"><Edit3 className="w-4 h-4" /></Button>
                )}
              </div>
            </motion.header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* TODAY */}
                {activeTab === "today" && (
                  <motion.div key="today" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    {/* Greeting */}
                    <h2 className="text-2xl font-light tracking-tight text-slate-700">
                      Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}{firstName ? ", " : ""}<span className="text-emerald-600">{firstName}</span>{firstName ? "." : "."}
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>

                    {/* This Week's Schedule */}
                    {custodySchedule ? (() => {
                      const today = new Date();
                      const dayOfWeek = today.getDay(); // 0=Sun
                      const monday = new Date(today);
                      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
                      const weekDays = Array.from({ length: 7 }, (_, i) => {
                        const d = new Date(monday);
                        d.setDate(monday.getDate() + i);
                        return { dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, day: d.getDate(), label: WEEK_DAYS[i] };
                      });
                      const custodyDays = weekDays.map(d => ({ ...d, custody: getCustodyForDate(d.dateStr, custodySchedule) }));
                      const myDays = custodyDays.filter(d => d.custody === "me").length;
                      const nextHandoff = custodyDays.find((d, i) => i > 0 && d.custody !== custodyDays[i - 1].custody && new Date(d.dateStr + "T00:00:00") >= today);
                      const childFirst = childrenNames?.split(",")[0]?.trim() || "";
                      const cpName = coparentName || "co-parent";
                      const todayCustody = getCustodyForDate(todayStr, custodySchedule);
                      const isCurrentWeek = weekOffset === 0;
                      const weekLabel = isCurrentWeek ? "This week's schedule" : (() => {
                        const monDate = new Date(monday);
                        const sunDate = new Date(monday); sunDate.setDate(monday.getDate() + 6);
                        return `${monDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                      })();

                      let summaryText = "";
                      if (myDays >= 5) summaryText = `It's your week${childFirst ? ` with ${childFirst}` : ""}.`;
                      else if (myDays <= 2) summaryText = `It's ${cpName}'s week${childFirst ? ` with ${childFirst}` : ""}.`;
                      else summaryText = todayCustody === "me" ? `${childFirst || "Kids"} are with you today.` : `${childFirst || "Kids"} are with ${cpName} today.`;
                      if (nextHandoff) {
                        const handoffDate = new Date(nextHandoff.dateStr + "T00:00:00");
                        const handoffDay = handoffDate.toLocaleDateString("en-US", { weekday: "long" });
                        const handoffTo = nextHandoff.custody === "me" ? "you" : cpName;
                        summaryText += ` Handoff to ${handoffTo} on ${handoffDay}${custodySchedule.handoff_time ? ` at ${custodySchedule.handoff_time}` : ""}.`;
                      }

                      return (
                        <div className="mt-6 bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-100/60 rounded-2xl p-5">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider">{showFullCalendar ? MONTHS[calMonth.month] + " " + calMonth.year : weekLabel}</p>
                            {showFullCalendar && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setCalMonth(p => { const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m }; })} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                                <button onClick={() => setCalMonth(p => { const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m }; })} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"><ChevronRight className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                          <AnimatePresence mode="wait">
                            {!showFullCalendar ? (
                              <motion.div
                                key={`week-${weekOffset}`}
                                initial={{ opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -40 }}
                                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.15}
                                onDragEnd={(_e: any, info: any) => { if (Math.abs(info.offset.x) > 50) { setWeekOffset(p => info.offset.x > 0 ? p - 1 : p + 1); } }}
                              >
                                <p className="text-[15px] text-slate-700 leading-relaxed mb-5">{summaryText}</p>
                                <div className="grid grid-cols-7">
                                  {custodyDays.map(d => {
                                    const isToday = d.dateStr === todayStr;
                                    return (
                                      <div key={d.dateStr} className="flex flex-col items-center gap-2">
                                        <span className="text-[10px] font-medium text-slate-400 uppercase">{d.label}</span>
                                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                                          d.custody === "me" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500",
                                          isToday && "ring-2 ring-offset-2 ring-slate-800"
                                        )}>
                                          {d.day}
                                        </div>
                                        <div className={cn("w-5 h-0.5 rounded-full", d.custody === "me" ? "bg-emerald-300" : "bg-transparent")} />
                                      </div>
                                    );
                                  })}
                                </div>
                                {weekOffset !== 0 && (
                                  <button onClick={() => setWeekOffset(0)} className="mt-3 mx-auto block text-[11px] text-emerald-600 hover:text-emerald-700 transition-colors">Back to this week</button>
                                )}
                              </motion.div>
                            ) : (
                              <motion.div key="month" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                <div className="grid grid-cols-7 mb-2">{DAYS.map(d => <div key={d} className="text-center text-[11px] font-medium text-slate-400">{d}</div>)}</div>
                                <div className="grid grid-cols-7 gap-y-1">
                                  {calDays.map((cell: any, i: number) => {
                                    const isTodayCell = cell.dateStr === todayStr;
                                    const isSelected = cell.dateStr === calSelectedDate;
                                    const dayEvents = calEvents.filter((e: any) => e.date === cell.dateStr);
                                    const eventTypes = [...new Set(dayEvents.map((e: any) => e.type))].slice(0, 3);
                                    const custodyDay = getCustodyForDate(cell.dateStr, custodySchedule);
                                    return (
                                      <button key={i} onClick={() => setCalSelectedDate(cell.dateStr === calSelectedDate ? null : cell.dateStr)}
                                        className={cn("flex flex-col items-center py-1.5 rounded-xl transition-all relative", cell.month !== "current" && "opacity-30", isSelected && "bg-emerald-50", isTodayCell && !isSelected && "ring-1 ring-emerald-400 ring-inset")}>
                                        <span className={cn("text-sm w-7 h-7 flex items-center justify-center rounded-full", isSelected ? "bg-emerald-500 text-white font-medium" : isTodayCell ? "text-emerald-600 font-medium" : "text-slate-700")}>{cell.day}</span>
                                        <div className="flex gap-0.5 mt-0.5">
                                          {custodyDay && <div className={cn("w-1.5 h-1.5 rounded-full", custodyDay === "me" ? "bg-emerald-400" : "bg-slate-300")} />}
                                          {eventTypes.map((t: any) => <div key={t} className={cn("w-1.5 h-1.5 rounded-full", EVENT_TYPES.find(et => et.id === t)?.color || "bg-slate-400")} />)}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                                <AnimatePresence>
                                  {calSelectedDate && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                      <div className="mt-4 pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-3">
                                          <h3 className="text-sm font-medium text-slate-700">{new Date(calSelectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3>
                                          <button onClick={() => openAddEvent()} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"><Plus className="w-4 h-4" /></button>
                                        </div>
                                        {selectedDateEvents.length === 0 ? (
                                          <div className="text-center py-6">
                                            <p className="text-sm text-slate-400 mb-1">Nothing scheduled</p>
                                            <Button size="sm" onClick={() => openAddEvent()} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-sm">Add event</Button>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            {selectedDateEvents.map((evt: any) => {
                                              const typeInfo = EVENT_TYPES.find(t => t.id === evt.type);
                                              return (
                                                <button key={evt.id} onClick={() => openEditEvent(evt)} className="w-full text-left p-3.5 bg-white border border-slate-200/60 rounded-xl hover:border-slate-300 transition-all">
                                                  <div className="flex items-start gap-3">
                                                    <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", typeInfo?.color || "bg-slate-400")} />
                                                    <div className="flex-1 min-w-0">
                                                      <div className="text-sm font-medium text-slate-700">{evt.title}</div>
                                                      <div className="text-xs text-slate-400 mt-0.5">{evt.time && <span>{evt.time}</span>}{evt.notes && <span> · {evt.notes}</span>}</div>
                                                    </div>
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs text-slate-500">Your days</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-200" /><span className="text-xs text-slate-500">{cpName}'s days</span></div>
                            </div>
                            <button onClick={() => { setShowFullCalendar(p => !p); if (!showFullCalendar) setCalSelectedDate(null); }} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors">
                              {showFullCalendar ? "This week" : "Full month"}
                              <motion.span animate={{ rotate: showFullCalendar ? 180 : 0 }} transition={{ duration: 0.25 }}>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </motion.span>
                            </button>
                          </div>
                        </div>
                      );
                    })() : (
                      <button onClick={() => setShowCustodySetup(true)} className="mt-6 w-full bg-white border border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center gap-2 hover:border-emerald-400 hover:bg-emerald-50/30 transition-all">
                        <CalendarDays className="w-6 h-6 text-emerald-500" />
                        <span className="text-sm font-medium text-slate-700">Set up your custody schedule</span>
                        <span className="text-xs text-slate-400">See your week at a glance</span>
                      </button>
                    )}

                    {/* Coming Up */}
                    {(() => {
                      const upcoming = calEvents
                        .filter(e => e.date >= todayStr)
                        .sort((a: any, b: any) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""))
                        .slice(0, 3);
                      if (upcoming.length === 0) return null;
                      return (
                        <div className="mt-8">
                          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">Coming up</p>
                          <div className="space-y-2">
                            {upcoming.map((evt: any) => {
                              const typeInfo = EVENT_TYPES.find(t => t.id === evt.type);
                              const evtDate = new Date(evt.date + "T12:00:00");
                              return (
                                <div key={evt.id} className="bg-white border border-slate-200/60 rounded-xl p-4 flex items-center gap-4">
                                  <div className="flex flex-col items-center shrink-0 w-10">
                                    <span className="text-[10px] font-medium text-emerald-600 uppercase">{evtDate.toLocaleDateString("en-US", { month: "short" })}</span>
                                    <span className="text-xl font-light text-slate-800">{evtDate.getDate()}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{evt.title}</p>
                                    <p className="text-xs text-slate-400">{evtDate.toLocaleDateString("en-US", { weekday: "long" })}{evt.time ? ` at ${evt.time}` : ""}{evt.notes ? ` · ${evt.notes}` : ""}</p>
                                  </div>
                                  {typeInfo && <span className={cn("text-[10px] font-medium px-2 py-1 rounded-full text-white shrink-0", typeInfo.color)}>{typeInfo.label}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  </motion.div>
                )}

                {/* TALK (Chat + Coach) */}
                {activeTab === "talk" && (
                  <motion.div key="talk" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-4 pb-4">
                    {/* Mode toggle */}
                    <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                      <button onClick={() => { setTalkMode("chat"); setShowHistory(false); }} className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-all", talkMode === "chat" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}>Chat</button>
                      <button onClick={() => setTalkMode("coach")} className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-all", talkMode === "coach" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}>Coach</button>
                    </div>

                  {talkMode === "chat" && (
                  <div>
                    {/* Messages */}
                    <AnimatePresence mode="popLayout">
                      {showHistory ? (
                        <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="flex flex-col">
                          <h2 className="text-lg font-light text-slate-700 mb-4">Your conversations</h2>
                          {conversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                              <MessageSquare className="w-8 h-8 text-slate-200 mb-3" strokeWidth={1.5} />
                              <p className="text-sm text-slate-400">No conversations yet</p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {[...conversations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((c, idx) => {
                                const lastMsg = c.messages?.[c.messages.length - 1];
                                const preview = lastMsg?.content?.slice(0, 80) || "";
                                const date = c.createdAt ? new Date(c.createdAt) : null;
                                const now = new Date();
                                const diffMs = date ? now.getTime() - date.getTime() : 0;
                                const diffMins = Math.floor(diffMs / 60000);
                                const diffHrs = Math.floor(diffMins / 60);
                                const diffDays = Math.floor(diffHrs / 24);
                                const timeAgo = !date ? "" : diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : diffHrs < 24 ? `${diffHrs}h ago` : diffDays < 7 ? `${diffDays}d ago` : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                const deleteConv = () => { setConversations((prev) => prev.filter((x) => x.id !== c.id)); if (activeConvId === c.id) setActiveConvId(null); if (session?.token) dbDelete("conversations", `id=eq.${c.id}`, session.token).catch(() => {}); };
                                return (
                                  <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03, duration: 0.3 }}>
                                    <button
                                      onClick={() => { setActiveConvId(c.id); setShowHistory(false); }}
                                      className={cn("w-full text-left p-4 rounded-xl border transition-all", c.id === activeConvId ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50")}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium text-slate-700 truncate">{c.title || "New conversation"}</div>
                                          {preview && <div className="text-[13px] text-slate-400 truncate mt-0.5">{lastMsg?.role === "assistant" ? preview : `You: ${preview}`}{preview.length >= 80 ? "..." : ""}</div>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[11px] text-slate-300">{timeAgo}</span>
                                          {confirmDeleteId === c.id ? (
                                            <button className="px-2 py-1 rounded-md text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-all"
                                              onClick={(e) => { e.stopPropagation(); deleteConv(); setConfirmDeleteId(null); }}>
                                              Delete
                                            </button>
                                          ) : (
                                            <button className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id); setTimeout(() => setConfirmDeleteId((prev) => prev === c.id ? null : prev), 3000); }}>
                                              <Trash2 size={12} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 mt-2">
                                        <span className="text-[11px] text-slate-300">{c.messages?.length || 0} messages</span>
                                      </div>
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      ) : !hasConversation ? (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center justify-center text-center flex-1">
                          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/60 flex items-center justify-center mb-5">
                            <MessageSquare className="w-5 h-5 text-emerald-500" strokeWidth={1.5} />
                          </motion.div>
                          <h2 className="text-lg font-light tracking-tight text-slate-700 mb-1.5">{firstName ? `Welcome back, ${firstName}.` : "Welcome back."}</h2>
                          <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-4">Let's take the high road today.</p>
                          {isTrialActive && !isSubscribed && !trialBannerSeen && (
                            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }} ref={() => {
                              // Mark as seen in background (persists cross-device) but keep showing for this session
                              localStorage.setItem("m_trial_banner_seen", "1");
                              if (session?.token && session?.user?.id) { dbUpsert("conversations", { id: "_trial_banner_seen", user_id: session.user.id, title: "_flag", messages: [], updated_at: new Date().toISOString() }, session.token).catch(() => {}); }
                            }} className="w-full max-w-sm bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100/60 rounded-2xl px-5 py-3.5 mb-5">
                              <p className="text-[13px] text-emerald-700 leading-relaxed">
                                {`You have ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} free — here's how to make the most of them. Ask anything, upload your decree, or try the Coach.`}
                              </p>
                            </motion.div>
                          )}
                          {/* Auto-scrolling action pills carousel */}
                          <div ref={(el) => {
                            if (!el) return;
                            let scrollPos = 0; let direction = 1; let paused = false; let pauseTimer: ReturnType<typeof setTimeout>;
                            const maxScroll = el.scrollWidth - el.clientWidth;
                            const step = () => {
                              if (paused || maxScroll <= 0) { requestAnimationFrame(step); return; }
                              scrollPos += 0.4 * direction;
                              if (scrollPos >= maxScroll) { direction = -1; paused = true; pauseTimer = setTimeout(() => { paused = false; }, 1200); }
                              else if (scrollPos <= 0) { direction = 1; paused = true; pauseTimer = setTimeout(() => { paused = false; }, 1200); }
                              el.scrollLeft = scrollPos;
                              requestAnimationFrame(step);
                            };
                            const startTimer = setTimeout(() => requestAnimationFrame(step), 1500);
                            const onTouch = () => { paused = true; clearTimeout(pauseTimer); pauseTimer = setTimeout(() => { scrollPos = el.scrollLeft; paused = false; }, 3000); };
                            el.addEventListener("touchstart", onTouch, { passive: true });
                            el.addEventListener("mousedown", onTouch);
                            return () => { clearTimeout(startTimer); clearTimeout(pauseTimer); };
                          }} className="flex gap-2 overflow-x-auto w-full -mx-6 px-6 pb-2 scrollbar-hide">
                            {QUICK_ACTIONS.map((action, idx) => { const Icon = action.icon; return (
                              <motion.button key={action.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + idx * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }} whileTap={{ scale: 0.96 }} onClick={() => handleQuickAction(action.id)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-100 rounded-full hover:border-emerald-200 hover:bg-emerald-50/30 transition-all shrink-0 group">
                                <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" strokeWidth={1.5} />
                                <span className="text-[13px] text-slate-600 group-hover:text-slate-800 transition-colors whitespace-nowrap">{action.label}</span>
                              </motion.button>
                            ); })}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="space-y-6">
                          {messages.map((msg: any, i: number) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
                              {msg.role === "user" ? (
                                <div className="max-w-[85%] rounded-2xl rounded-br-md text-[15px] leading-relaxed bg-gradient-to-br from-slate-800 to-slate-700 text-white/95 px-5 py-3.5 shadow-md shadow-slate-800/10 whitespace-pre-wrap">{msg.content}</div>
                              ) : (
                                <>
                                  <div className="max-w-[85%] rounded-2xl rounded-bl-md text-[15px] leading-relaxed bg-white border border-slate-100 text-slate-600 px-5 py-4 shadow-sm m-md" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") }} />
                                  {msg.content && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <button onClick={() => copyToClipboard(msg.content, i)} className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-300 hover:text-slate-500 rounded transition-all">
                                        {copied === i ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                                      </button>
                                      <button onClick={() => setThumbs(p => ({ ...p, [i]: p[i] === "up" ? undefined as any : "up" }))} className={cn("p-1 rounded transition-all", thumbs[i] === "up" ? "text-emerald-500" : "text-slate-300 hover:text-slate-500")}>
                                        <ThumbsUp size={10} />
                                      </button>
                                      <button onClick={() => { setThumbs(p => ({ ...p, [i]: p[i] === "down" ? undefined as any : "down" })); if (thumbs[i] !== "down") { setFeedbackChatMessage(msg.content); setShowFeedback(true); } }} className={cn("p-1 rounded transition-all", thumbs[i] === "down" ? "text-red-400" : "text-slate-300 hover:text-slate-500")}>
                                        <ThumbsDown size={10} />
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </motion.div>
                          ))}
                          {loading && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex justify-start">
                              <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
                                <div className="flex gap-1.5">
                                  {[0, 0.15, 0.3].map((d) => <motion.div key={d} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: d, ease: "easeInOut" }} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />)}
                                </div>
                              </div>
                            </motion.div>
                          )}
                          <div ref={bottomRef} />
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                  )}

                  {talkMode === "coach" && (
                  <div>
                    <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-1">Communication Coach</h2>
                    <p className="text-sm text-slate-400 mb-6">Craft calm, child-focused messages</p>

                    {/* Mode toggle — only when no active conversation */}
                    {coachMessages.length === 0 && !coachLoading && (
                      <div className="flex bg-slate-100 rounded-xl p-1 mb-5">
                        {([{ id: "respond" as const, label: "Respond to a message" }, { id: "draft" as const, label: "Draft a message" }]).map((m) => (
                          <button key={m.id} onClick={() => { setCoachMode(m.id); setCoachInput(""); setActiveCoachSessionId(null); setCoachMessages([]); setCoachStreaming(""); }}
                            className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium transition-all", coachMode === m.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Active conversation thread */}
                    {coachMessages.length > 0 || coachStreaming ? (
                      <div>
                        {/* New session button */}
                        <button onClick={() => { setCoachMessages([]); setCoachStreaming(""); setCoachInput(""); setCoachFollowUp(""); setActiveCoachSessionId(null); setCoachCopied(false); }}
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-600 transition-colors mb-4">
                          <ArrowLeft className="w-3 h-3" /> New session
                        </button>

                        {/* Message thread */}
                        <div className="space-y-4 mb-4">
                          {coachMessages.map((msg, i) => {
                            // Strip the mode prefix for display on first user message
                            const displayContent = i === 0 && msg.role === "user"
                              ? msg.content.replace(/^I received this message from my co-parent\. Help me respond:\n\n"|^I need to send a message to my co-parent about the following:\n\n/g, "").replace(/"$/, "")
                              : msg.content;
                            return msg.role === "user" ? (
                              <div key={i} className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-4">
                                {i === 0 && <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">{coachMode === "respond" ? "Their message" : "Your situation"}</label>}
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{displayContent}</p>
                              </div>
                            ) : (
                              <div key={i}>
                                <div className="bg-white border border-slate-200/60 rounded-2xl p-5">
                                  <div className="prose prose-sm prose-slate max-w-none text-[14px] leading-relaxed [&_strong]:text-slate-800 [&_p]:text-slate-600 [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }} />
                                </div>
                              </div>
                            );
                          })}

                          {/* Streaming response */}
                          {coachStreaming && (
                            <div>
                              <div className="bg-white border border-slate-200/60 rounded-2xl p-5">
                                <div className="prose prose-sm prose-slate max-w-none text-[14px] leading-relaxed [&_strong]:text-slate-800 [&_p]:text-slate-600 [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: marked.parse(coachStreaming) as string }} />
                              </div>
                            </div>
                          )}

                          {/* Loading dots */}
                          {coachLoading && !coachStreaming && (
                            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm inline-block">
                              <div className="flex gap-1.5">
                                {[0, 0.15, 0.3].map((d) => <motion.div key={d} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: d, ease: "easeInOut" }} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />)}
                              </div>
                            </div>
                          )}
                          <div ref={coachBottomRef} />
                        </div>

                        {/* Copy + follow-up input — show after first response */}
                        {(coachMessages.some(m => m.role === "assistant") || coachStreaming) && !coachLoading && (
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <Button size="sm" onClick={copyCoachMessage}
                                className={cn("flex-1 transition-all", coachCopied ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                                {coachCopied ? <><Check className="w-3.5 h-3.5 mr-1.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy message</>}
                              </Button>
                            </div>
                            <div className="flex gap-2">
                              <input value={coachFollowUp} onChange={(e) => setCoachFollowUp(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && coachFollowUp.trim()) { e.preventDefault(); handleCoachSend(coachFollowUp); } }}
                                placeholder="Ask for changes or follow up..."
                                className="flex-1 px-4 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                              <Button onClick={() => handleCoachSend(coachFollowUp)} disabled={!coachFollowUp.trim()}
                                className="px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl">
                                <Send className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Initial input — no conversation yet */}
                        <div className="mb-4">
                          <label className="text-xs font-medium text-slate-500 mb-2 block">
                            {coachMode === "respond" ? "Paste the message you received" : "What do you need to communicate?"}
                          </label>
                          <textarea value={coachInput} onChange={(e) => setCoachInput(e.target.value)}
                            placeholder={coachMode === "respond" ? "Paste their text message, email, or app message here..." : "e.g. I need to change the pickup time this Friday from 5pm to 6pm..."}
                            className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none min-h-[120px]" />
                        </div>

                        <Button onClick={() => handleCoachSend()} disabled={!coachInput.trim() || coachLoading}
                          className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 mb-6">
                          {coachLoading ? (
                            <div className="flex items-center gap-2"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Coaching...</div>
                          ) : (
                            <>{coachMode === "respond" ? "Coach my response" : "Draft my message"}</>
                          )}
                        </Button>

                        {/* Empty state tips */}
                        {!coachLoading && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-4 space-y-3">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">How this helps</p>
                            {[
                              { title: "Legally neutral", desc: "Avoid language that could be used against you" },
                              { title: "De-escalated", desc: "Remove emotional charge without losing your point" },
                              { title: "Child-focused", desc: "Center your kids' needs in every message" },
                            ].map((tip, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 bg-slate-50/60 rounded-xl">
                                <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3 text-emerald-500" /></div>
                                <div><div className="text-sm font-medium text-slate-600">{tip.title}</div><div className="text-xs text-slate-400">{tip.desc}</div></div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </>
                    )}

                    {/* Recent sessions */}
                    {coachSessions.length > 0 && !coachLoading && coachMessages.length === 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-8 pt-6 border-t border-slate-100">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Recent sessions</p>
                        <div className="flex flex-col gap-2">
                          {[...coachSessions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5).map((s) => {
                            const date = s.createdAt ? new Date(s.createdAt) : null;
                            const now = new Date();
                            const diffMs = date ? now.getTime() - date.getTime() : 0;
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHrs = Math.floor(diffMins / 60);
                            const diffDays = Math.floor(diffHrs / 24);
                            const timeAgo = !date ? "" : diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : diffHrs < 24 ? `${diffHrs}h ago` : diffDays < 7 ? `${diffDays}d ago` : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                            const deleteSession = () => { setCoachSessions((prev) => prev.filter((x) => x.id !== s.id)); if (activeCoachSessionId === s.id) { setActiveCoachSessionId(null); setCoachMessages([]); setCoachStreaming(""); setCoachInput(""); } if (session?.token) dbDelete("conversations", `id=eq.${s.id}`, session.token).catch(() => {}); };
                            const titleText = (() => { const firstMsg = s.messages?.[0]?.content || s.input || ""; return firstMsg.replace(/^I received this message from my co-parent\. Help me respond:\n\n"|^I need to send a message to my co-parent about the following:\n\n/g, "").replace(/"$/, "").slice(0, 50) || s.title || "Untitled"; })();
                            const msgCount = s.messages?.length || 2;
                            return (
                              <button key={s.id}
                                onClick={() => { setActiveCoachSessionId(s.id); setCoachMode(s.mode); setCoachMessages(s.messages || []); setCoachStreaming(""); setCoachFollowUp(""); }}
                                className={cn("w-full text-left p-3 rounded-xl border transition-all", s.id === activeCoachSessionId ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50")}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={cn("text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0", s.mode === "respond" ? "bg-blue-50 text-blue-500" : "bg-purple-50 text-purple-500")}>{s.mode === "respond" ? "Response" : "Draft"}</span>
                                    <span className="text-sm text-slate-600 truncate">{titleText}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {msgCount > 2 && <span className="text-[10px] text-emerald-500 font-medium">{Math.ceil(msgCount / 2)} turns</span>}
                                    <span className="text-[11px] text-slate-300">{timeAgo}</span>
                                    {coachDeleteConfirmId === s.id ? (
                                      <button className="px-2 py-1 rounded-md text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-all"
                                        onClick={(e) => { e.stopPropagation(); deleteSession(); setCoachDeleteConfirmId(null); }}>
                                        Delete
                                      </button>
                                    ) : (
                                      <button className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                        onClick={(e) => { e.stopPropagation(); setCoachDeleteConfirmId(s.id); setTimeout(() => setCoachDeleteConfirmId((prev) => prev === s.id ? null : prev), 3000); }}>
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                  )}

                  </motion.div>
                )}


                {/* VAULT */}
                {activeTab === "vault" && (
                  <motion.div key="vault" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-light tracking-tight text-slate-700">Document Vault</h2>
                      <Button size="sm" onClick={() => setVaultUploadCategory("picking")} disabled={vaultUploading}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-sm shadow-emerald-500/15 text-sm">
                        {vaultUploading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload</>}
                      </Button>
                    </div>

                    {/* Category filter pills */}
                    <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-6 px-6 scrollbar-hide">
                      {VAULT_CATEGORIES.map(cat => (
                        <button key={cat.id} onClick={() => setVaultCategory(cat.id)}
                          className={cn("px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-all shrink-0",
                            vaultCategory === cat.id ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/15"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Decree Intelligence Summary Card */}
                    {FEATURE_DECREE_INTELLIGENCE && (vaultCategory === "all" || vaultCategory === "decree") && decreeExtraction?.status === "complete" && (
                      <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} onClick={() => setShowDecreeSummary(true)}
                        className="w-full bg-white border border-slate-200/60 rounded-2xl p-4 mb-4 text-left hover:border-emerald-200 hover:shadow-sm transition-all group">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                              <FileText className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
                            </div>
                            <div>
                              <span className="text-[13px] font-medium text-slate-700 block leading-tight">Your Decree at a Glance</span>
                              <span className="text-[10px] text-slate-400">Key terms extracted from your document</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 text-emerald-500 group-hover:text-emerald-600 transition-colors shrink-0">
                            <span className="text-[11px] font-medium">View all</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {decreeExtraction.custody_type && (
                            <div className="bg-slate-50/80 rounded-lg px-3 py-2.5">
                              <span className="text-[10px] text-slate-400 block mb-0.5">Custody</span>
                              <span className="text-[13px] font-medium text-slate-700 leading-snug line-clamp-2">{decreeExtraction.custody_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                            </div>
                          )}
                          {decreeExtraction.child_support?.amount && (
                            <div className="bg-slate-50/80 rounded-lg px-3 py-2.5">
                              <span className="text-[10px] text-slate-400 block mb-0.5">Child Support</span>
                              <span className="text-[13px] font-medium text-slate-700 leading-snug">${decreeExtraction.child_support.amount.toLocaleString()}/mo</span>
                            </div>
                          )}
                          {decreeExtraction.geographic_restriction?.area && (
                            <div className="bg-slate-50/80 rounded-lg px-3 py-2.5">
                              <span className="text-[10px] text-slate-400 block mb-0.5">Geographic</span>
                              <span className="text-[13px] font-medium text-slate-700 leading-snug line-clamp-2">{decreeExtraction.geographic_restriction.area}</span>
                            </div>
                          )}
                          {decreeExtraction.children?.length > 0 && (
                            <div className="bg-slate-50/80 rounded-lg px-3 py-2.5">
                              <span className="text-[10px] text-slate-400 block mb-0.5">Children</span>
                              <span className="text-[13px] font-medium text-slate-700 leading-snug">{decreeExtraction.children.map((c: any) => c.name?.split(" ")[0]).filter(Boolean).join(", ") || `${decreeExtraction.children.length}`}</span>
                            </div>
                          )}
                        </div>
                      </motion.button>
                    )}
                    {FEATURE_DECREE_INTELLIGENCE && (vaultCategory === "all" || vaultCategory === "decree") && extractionLoading && (
                      <div className="w-full bg-white border border-slate-200/60 rounded-2xl px-5 py-4 mb-4">
                        <div className="flex items-center gap-3">
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full" />
                          <span className="text-sm text-slate-400">Analyzing your decree...</span>
                        </div>
                      </div>
                    )}

                    {/* Document list */}
                    {vaultLoading ? (
                      <div className="flex justify-center py-16">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                      </div>
                    ) : filteredVaultDocs.length === 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <FolderLock className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                        {vaultCategory === "all" ? (
                          <>
                            <p className="text-sm text-slate-400 mb-1">No documents yet</p>
                            <p className="text-xs text-slate-300 mb-4 max-w-[260px] leading-relaxed">Upload your divorce decree so Meridian can answer questions using your exact terms and schedule.</p>
                            <Button size="sm" onClick={() => { setVaultUploadCategory("decree"); setTimeout(() => vaultFileRef.current?.click(), 100); }} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-sm">Upload decree</Button>
                            <div className="flex items-center gap-4 mt-8">
                              <div className="flex flex-col items-center gap-1"><FolderLock size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Encrypted<br/>storage</span></div>
                              <div className="w-px h-8 bg-slate-200" />
                              <div className="flex flex-col items-center gap-1"><Eye size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Never read<br/>by humans</span></div>
                              <div className="w-px h-8 bg-slate-200" />
                              <div className="flex flex-col items-center gap-1"><Shield size={14} className="text-emerald-400" /><span className="text-[10px] text-slate-400 leading-tight text-center">Never shared<br/>or sold</span></div>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-slate-400 mb-1">No documents in this category</p>
                            <p className="text-xs text-slate-300">Upload a document to get started</p>
                          </>
                        )}
                      </motion.div>
                    ) : (
                      <div className="space-y-3">
                        {filteredVaultDocs.map((doc: any, idx: number) => (
                          <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04, duration: 0.3 }}
                            className="bg-white border border-slate-200/60 rounded-xl p-4 hover:border-emerald-300/60 transition-all cursor-pointer active:scale-[0.98]"
                            onClick={() => {
                              setVaultViewDoc(doc); setVaultViewUrl(null);
                              if (doc.storage_path && !doc.storage_path.startsWith(session?.user?.id + "/migrated"))
                                fetch(`${SUPABASE_URL}/storage/v1/object/documents/${doc.storage_path}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.token}` } })
                                  .then(r => r.blob()).then(blob => setVaultViewUrl(URL.createObjectURL(blob))).catch(() => setVaultViewUrl(""));
                              else setVaultViewUrl("");
                            }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5", doc.mime_type?.startsWith("image/") ? "bg-purple-50" : "bg-emerald-50")}>
                                  {doc.mime_type?.startsWith("image/") ? <Eye className="w-4.5 h-4.5 text-purple-500" /> : <FileText className="w-4.5 h-4.5 text-emerald-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {vaultRenameId === doc.id ? (
                                    <input autoFocus value={vaultRenameName} onChange={(e) => setVaultRenameName(e.target.value)}
                                      onBlur={() => handleVaultRename(doc.id, vaultRenameName)}
                                      onKeyDown={(e) => { if (e.key === "Enter") handleVaultRename(doc.id, vaultRenameName); if (e.key === "Escape") setVaultRenameId(null); }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full text-sm font-medium text-slate-700 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                                  ) : (
                                    <h4 className="text-sm font-medium text-slate-700 truncate">{doc.file_name}</h4>
                                  )}
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-600 rounded-md">{VAULT_CATEGORIES.find(c => c.id === doc.category)?.label || doc.category}</span>
                                    <span className="text-[11px] text-slate-300">{new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setVaultRenameId(doc.id); setVaultRenameName(doc.file_name); }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {vaultDeleteId === doc.id ? (
                                  <button onClick={() => handleVaultDelete(doc)} className="px-2 py-1 rounded-md text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-all">Delete</button>
                                ) : (
                                  <button onClick={() => { setVaultDeleteId(doc.id); setTimeout(() => setVaultDeleteId(prev => prev === doc.id ? null : prev), 3000); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* PROFILE */}
                {activeTab === "profile" && (
                  <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-6">{firstName ? `Hi, ${firstName}` : "Profile"}</h2>

                    {/* My Details */}
                    <div className="mb-6">
                      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden">
                        <button onClick={() => setExpandedSetting(expandedSetting === "my-details" ? null : "my-details")} className="w-full p-4 hover:bg-slate-50 transition-all text-left flex items-center justify-between">
                          <div className="flex items-center gap-3"><User className="w-4 h-4 text-slate-400" /><span className="text-sm text-slate-700">My Details</span></div>
                          <motion.div animate={{ rotate: expandedSetting === "my-details" ? 90 : 0 }} transition={{ duration: 0.2 }}><ChevronRight className="w-4 h-4 text-slate-400" /></motion.div>
                        </button>
                        <AnimatePresence initial={false}>
                          {expandedSetting === "my-details" && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                              <div className="px-4 pb-4 space-y-3">
                                <div>
                                  <label className="text-[11px] text-slate-400 mb-1 block">Name</label>
                                  <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={editName || session?.user?.name || ""} onChange={(e) => setEditName(e.target.value)} onBlur={() => { if (editName.trim() && editName.trim() !== session?.user?.name) handleUpdateName(editName); }} onKeyDown={(e) => { if (e.key === "Enter") { handleUpdateName(editName); (e.target as HTMLInputElement).blur(); } }} />
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400 mb-1 block">Email</label>
                                  <div className="px-3 py-2.5 bg-slate-50/40 border border-slate-100 rounded-lg text-sm text-slate-400">{session?.user?.email || "—"}</div>
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400 mb-1 block">Co-parent's name</label>
                                  <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Their first name" value={coparentName} onChange={(e) => setCoparentName(e.target.value)}
                                    onBlur={() => { localStorage.setItem("m_coparent_name", coparentName); if (session?.token) dbUpdate("profiles", `id=eq.${session.user.id}`, { coparent_name: coparentName || null }, session.token).catch(() => {}); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }} />
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-400 mb-1 block">Children's names</label>
                                  <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Their first names, separated by commas" value={childrenNames} onChange={(e) => setChildrenNames(e.target.value)}
                                    onBlur={() => { localStorage.setItem("m_children_names", childrenNames); if (session?.token) dbUpdate("profiles", `id=eq.${session.user.id}`, { children_names: childrenNames || null }, session.token).catch(() => {}); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }} />
                                </div>
                                {!decreeText && !vaultDocs.some(d => d.category === "decree") && (coparentName || childrenNames) && (
                                  <p className="text-[11px] text-emerald-600/70">Upload your decree in the Vault for even more personalized guidance.</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Settings */}
                    <div className="mb-8">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Settings</h3>
                      <div className="space-y-2">
                        {[
                          { id: "privacy", icon: Shield, label: "Privacy & Data", content: <>Your conversations and documents are encrypted and stored securely. Meridian never shares your personal information with third parties. You can delete your account and all associated data at any time by contacting us at <a href="mailto:support@mymeridianapp.com" className="text-blue-500 underline">support@mymeridianapp.com</a>.</> },
                          { id: "help", icon: HelpCircle, label: "Help & Support", content: <>Have a question or running into an issue? Reach out to us at <a href="mailto:support@mymeridianapp.com" className="text-blue-500 underline">support@mymeridianapp.com</a> and we'll get back to you within 24 hours.</> },
                          { id: "about", icon: Info, label: "About Meridian", content: "Meridian is a grounding companion for anyone navigating divorce and co-parenting. Built with care, designed for calm and clarity. Meridian is not a law firm and does not provide legal advice." },
                        ].map((item) => (
                          <div key={item.id} className="bg-white border border-slate-200/60 rounded-xl overflow-hidden transition-all">
                            <button onClick={() => setExpandedSetting(expandedSetting === item.id ? null : item.id)} className="w-full p-4 hover:bg-slate-50 transition-all text-left flex items-center justify-between">
                              <div className="flex items-center gap-3"><item.icon className="w-4 h-4 text-slate-400" /><span className="text-sm text-slate-700">{item.label}</span></div>
                              <motion.div animate={{ rotate: expandedSetting === item.id ? 90 : 0 }} transition={{ duration: 0.2 }}><ChevronRight className="w-4 h-4 text-slate-400" /></motion.div>
                            </button>
                            <AnimatePresence>
                              {expandedSetting === item.id && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                                  <div className="px-4 pb-4 pt-0 text-[13px] text-slate-500 leading-relaxed">{item.content}</div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Subscription + Feedback + Sign out */}
                    <div className="flex flex-col gap-2">
                      {isSubscribed ? (
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100/60 rounded-2xl px-5 py-4 text-center">
                          <p className="text-sm text-emerald-800 font-medium mb-0.5">Meridian Pro</p>
                          <p className="text-xs text-emerald-600/70 mb-2">Unlimited AI conversations, communication coach, document vault, and calendar. $4.99/month or $39.99/year. Auto-renews until canceled.</p>
                          <button onClick={handleManageSubscription} className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium underline underline-offset-2 decoration-emerald-300">Manage subscription</button>
                          <div className="flex items-center justify-center gap-2 mt-3">
                            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-500/70 underline underline-offset-2">Terms of Use (EULA)</a>
                            <span className="text-emerald-300">·</span>
                            <button onClick={() => setShowPrivacy(true)} className="text-[10px] text-emerald-500/70 underline underline-offset-2">Privacy Policy</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setShowSubscribeModal(true)} className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-medium hover:from-emerald-600 hover:to-teal-600 transition-all">
                            {isTrialActive ? `Subscribe — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial` : "Subscribe — $4.99/mo"}
                          </button>
                          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed text-center">Meridian Pro provides unlimited access to AI conversations, communication coach, document vault, and calendar. $4.99/month or $39.99/year. Auto-renews until canceled.</p>
                          <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
                            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Use (EULA)</a>
                            <span className="text-slate-300">·</span>
                            <button onClick={() => setShowPrivacy(true)} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Privacy Policy</button>
                            <span className="text-slate-300">·</span>
                            <button onClick={() => setShowTerms(true)} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Service</button>
                          </div>
                        </>
                      )}
                      <button onClick={() => setShowFeedback(true)} className="w-full py-2.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors">Share feedback</button>
                      <button onClick={() => setShowSignOutConfirm(true)} className="w-full py-3 border border-slate-200 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2">
                        <LogOut size={15} /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input - chat only, hidden when viewing history */}
            {activeTab === "talk" && talkMode === "chat" && !showHistory && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }} className="px-6 py-4 border-t border-slate-100/60 bg-white shrink-0">
                <div className="flex items-end gap-3 bg-slate-50/60 rounded-2xl px-4 py-3 border border-slate-200/40 focus-within:border-emerald-400/60 focus-within:ring-4 focus-within:ring-emerald-500/8 transition-all duration-300">
                  <Textarea ref={textareaRef} className="flex-1 border-0 bg-transparent p-0 text-base text-slate-800 placeholder:text-slate-400 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[120px]" placeholder={hasConversation ? "How can we get better today?" : "How can we get better today?"} value={input} onChange={(e) => { setInput(e.target.value); resizeTextarea(); }} onKeyDown={handleKeyDown} rows={1} />
                  {streaming ? (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" onClick={handleStop} className="rounded-full w-9 h-9 bg-slate-700 hover:bg-slate-800 flex-shrink-0 p-0"><Square className="w-3 h-3" fill="currentColor" /></Button>
                    </motion.div>
                  ) : (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" className="rounded-full w-9 h-9 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-sm shadow-emerald-500/15 flex-shrink-0 p-0" onClick={() => handleSend()} disabled={!input.trim() || loading}><Send className="w-4 h-4" /></Button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Bottom Nav */}
            <motion.nav initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }} className="border-t border-slate-100/60 bg-white shrink-0 z-10" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="flex items-center justify-around px-6 py-2.5">
                {([{ id: "today" as Tab, icon: Home, label: "Today" }, { id: "talk" as Tab, icon: MessageSquare, label: "Talk" }, { id: "vault" as Tab, icon: FolderLock, label: "Vault" }, { id: "profile" as Tab, icon: User, label: "Profile" }]).map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-300 relative", activeTab === tab.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-500")}>
                    <tab.icon className="w-5 h-5" strokeWidth={activeTab === tab.id ? 2 : 1.5} /><span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                    {activeTab === tab.id && <motion.div layoutId="nav-indicator" className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-emerald-500" transition={{ type: "spring", stiffness: 500, damping: 30 }} />}
                  </button>
                ))}
              </div>
            </motion.nav>
          </motion.div>


          {/* Calendar add/edit event */}
          <AnimatePresence>
            {calShowAdd && (
              <motion.div className="fixed inset-0 z-[250] bg-black/30 flex items-end justify-center" onClick={() => { setCalShowAdd(false); setCalEditEvent(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-light text-slate-700">{calEditEvent ? "Edit event" : "Add event"}</h3>
                    <button onClick={() => { setCalShowAdd(false); setCalEditEvent(null); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><X size={14} /></button>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Title</label>
                      <input className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="e.g. Pick up kids" value={calForm.title} onChange={e => setCalForm(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Date</label>
                        <input type="date" className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={calForm.date} onChange={e => setCalForm(p => ({ ...p, date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Time <span className="text-slate-300">(optional)</span></label>
                        <input type="time" className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={calForm.time} onChange={e => setCalForm(p => ({ ...p, time: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Type</label>
                      <div className="flex flex-wrap gap-2">
                        {EVENT_TYPES.map(t => (
                          <button key={t.id} onClick={() => setCalForm(p => ({ ...p, type: t.id }))}
                            className={cn("px-3 py-2 rounded-full text-[13px] font-medium transition-all flex items-center gap-1.5",
                              calForm.type === t.id ? "text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                              calForm.type === t.id && t.color)}>
                            <div className={cn("w-2 h-2 rounded-full", calForm.type === t.id ? "bg-white/60" : t.color)} />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Notes <span className="text-slate-300">(optional)</span></label>
                      <textarea className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none" rows={3} placeholder="Any details..." value={calForm.notes} onChange={e => setCalForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <Button onClick={handleCalSave} disabled={!calForm.title.trim() || !calForm.date} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 disabled:opacity-40">{calEditEvent ? "Save Changes" : "Add Event"}</Button>
                    {calEditEvent && (
                      calDeleteConfirm === calEditEvent.id ? (
                        <button onClick={() => { handleCalDelete(calEditEvent.id); setCalShowAdd(false); setCalEditEvent(null); }} className="w-full py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all">Confirm Delete</button>
                      ) : (
                        <button onClick={() => setCalDeleteConfirm(calEditEvent.id)} className="w-full py-2.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">Delete Event</button>
                      )
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Custody Schedule Setup Modal */}
          <AnimatePresence>
            {showCustodySetup && (
              <motion.div className="fixed inset-0 z-[250] bg-black/30 flex items-end justify-center" onClick={() => setShowCustodySetup(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-light text-slate-700">Custody schedule</h3>
                    <button onClick={() => setShowCustodySetup(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><X size={14} /></button>
                  </div>

                  {/* Co-parent & children names if missing */}
                  {!coparentName && (
                    <div className="mb-4">
                      <label className="text-[11px] text-slate-400 mb-1 block">Co-parent's first name</label>
                      <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Their first name" value={coparentName} onChange={(e) => setCoparentName(e.target.value)} />
                    </div>
                  )}
                  {!childrenNames && (
                    <div className="mb-4">
                      <label className="text-[11px] text-slate-400 mb-1 block">Children's names</label>
                      <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Separated by commas" value={childrenNames} onChange={(e) => setChildrenNames(e.target.value)} />
                    </div>
                  )}

                  {/* Template picker */}
                  <label className="text-[11px] text-slate-400 mb-2 block">Schedule template</label>
                  <div className="space-y-2 mb-5">
                    {Object.entries(CUSTODY_TEMPLATES).map(([key, tmpl]) => (
                      <button key={key} onClick={() => setCustodyForm(f => ({ ...f, template: key }))} className={cn("w-full text-left p-3.5 rounded-xl border transition-all", custodyForm.template === key ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200/60 bg-white hover:border-slate-300")}>
                        <p className="text-sm font-medium text-slate-700">{tmpl.label}</p>
                        <p className="text-xs text-slate-400">{tmpl.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Start date */}
                  <div className="mb-4">
                    <label className="text-[11px] text-slate-400 mb-1 block">When does your current rotation start?</label>
                    <input type="date" className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={custodyForm.start_date} onChange={(e) => setCustodyForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>

                  {/* Who starts */}
                  <div className="mb-4">
                    <label className="text-[11px] text-slate-400 mb-2 block">Who has the kids first in this rotation?</label>
                    <div className="flex gap-2">
                      <button onClick={() => setCustodyForm(f => ({ ...f, start_parent: "me" }))} className={cn("flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all", custodyForm.start_parent === "me" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}>Me</button>
                      <button onClick={() => setCustodyForm(f => ({ ...f, start_parent: "coparent" }))} className={cn("flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all", custodyForm.start_parent === "coparent" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}>{coparentName || "Co-parent"}</button>
                    </div>
                  </div>

                  {/* Handoff time */}
                  <div className="mb-6">
                    <label className="text-[11px] text-slate-400 mb-1 block">Usual handoff time</label>
                    <input className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="6:00 PM" value={custodyForm.handoff_time} onChange={(e) => setCustodyForm(f => ({ ...f, handoff_time: e.target.value }))} />
                  </div>

                  {/* Save */}
                  <Button onClick={async () => {
                    if (!custodyForm.start_date) return;
                    try {
                      // Save coparent/children names if newly entered
                      if (coparentName && session?.token) { localStorage.setItem("m_coparent_name", coparentName); dbUpdate("profiles", `id=eq.${session.user.id}`, { coparent_name: coparentName }, session.token).catch(() => {}); }
                      if (childrenNames && session?.token) { localStorage.setItem("m_children_names", childrenNames); dbUpdate("profiles", `id=eq.${session.user.id}`, { children_names: childrenNames }, session.token).catch(() => {}); }
                      // Save custody schedule
                      const body = { user_id: session!.user.id, template: custodyForm.template, start_date: custodyForm.start_date, start_parent: custodyForm.start_parent, handoff_time: custodyForm.handoff_time || "6:00 PM" };
                      const res = await dbUpsert("custody_schedules", body, session!.token);
                      const saved = Array.isArray(res) ? res[0] : res;
                      setCustodySchedule(saved);
                      localStorage.setItem("m_custody_schedule", JSON.stringify(saved));
                      setShowCustodySetup(false);
                    } catch (err) { console.error("Failed to save custody schedule", err); }
                  }} disabled={!custodyForm.start_date} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">
                    Save schedule
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Decree Intelligence Summary Modal */}
          {FEATURE_DECREE_INTELLIGENCE && showDecreeSummary && decreeExtraction && (
            <motion.div className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center" onClick={() => { setShowDecreeSummary(false); setEditingField(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-light text-slate-700">Decree Summary</h3>
                  <button onClick={() => { setShowDecreeSummary(false); setEditingField(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Plain-Language Summary */}
                {decreeExtraction.raw_summary && (
                  <div className="mb-5 p-4 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 rounded-xl border border-emerald-100/40">
                    <p className="text-sm text-slate-600 leading-relaxed">{decreeExtraction.raw_summary}</p>
                  </div>
                )}

                {/* Sections */}
                <div className="space-y-5">
                  {/* Custody */}
                  {decreeExtraction.custody_type && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Custody</h4>
                      <span className="text-sm text-slate-700">{decreeExtraction.custody_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                      {decreeExtraction.custody_schedule?.details && (
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{decreeExtraction.custody_schedule.details}</p>
                      )}
                    </div>
                  )}

                  {/* Holiday Schedule */}
                  {decreeExtraction.holiday_schedule?.length > 0 && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Holiday Schedule</h4>
                      <div className="space-y-3">
                        {decreeExtraction.holiday_schedule.map((h: any, i: number) => (
                          <div key={i} className="border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                            <span className="text-sm text-slate-700 font-medium block mb-1">{h.holiday}</span>
                            {(h.even_years || h.odd_years) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                {h.even_years && <span className="text-xs text-slate-400"><span className="text-slate-300">Even:</span> {h.even_years}</span>}
                                {h.odd_years && <span className="text-xs text-slate-400"><span className="text-slate-300">Odd:</span> {h.odd_years}</span>}
                              </div>
                            )}
                            {h.notes && <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{h.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Child Support */}
                  {decreeExtraction.child_support && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Child Support</h4>
                      <div className="space-y-2">
                        {decreeExtraction.child_support.amount && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Amount</span>
                            <span className="text-slate-700 font-medium">${decreeExtraction.child_support.amount.toLocaleString()}/mo</span>
                          </div>
                        )}
                        {decreeExtraction.child_support.payer && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Paid by</span>
                            <span className="text-slate-700">{decreeExtraction.child_support.payer}</span>
                          </div>
                        )}
                        {decreeExtraction.child_support.due_day && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Due</span>
                            <span className="text-slate-700">{decreeExtraction.child_support.due_day === 1 ? "1st" : `${decreeExtraction.child_support.due_day}th`} of each month</span>
                          </div>
                        )}
                        {decreeExtraction.child_support.details && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{decreeExtraction.child_support.details}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Geographic Restriction */}
                  {decreeExtraction.geographic_restriction?.restricted && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Geographic Restriction</h4>
                      <span className="text-sm text-slate-700">{decreeExtraction.geographic_restriction.area}</span>
                      {decreeExtraction.geographic_restriction.details && (
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{decreeExtraction.geographic_restriction.details}</p>
                      )}
                    </div>
                  )}

                  {/* Medical / Dental Rights */}
                  {(decreeExtraction.medical_decision_rights || decreeExtraction.dental_decision_rights) && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Decision Rights</h4>
                      <div className="space-y-2">
                        {decreeExtraction.medical_decision_rights && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Medical</span>
                            <span className="text-slate-700">{decreeExtraction.medical_decision_rights.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                          </div>
                        )}
                        {decreeExtraction.dental_decision_rights && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Dental</span>
                            <span className="text-slate-700">{decreeExtraction.dental_decision_rights.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Right of First Refusal */}
                  {decreeExtraction.right_of_first_refusal?.enabled && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-2">Right of First Refusal</h4>
                      <p className="text-sm text-slate-700">
                        {decreeExtraction.right_of_first_refusal.hours_threshold
                          ? `Applies when a parent will be away for ${decreeExtraction.right_of_first_refusal.hours_threshold}+ hours`
                          : "Enabled"}
                      </p>
                      {decreeExtraction.right_of_first_refusal.details && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{decreeExtraction.right_of_first_refusal.details}</p>
                      )}
                    </div>
                  )}

                  {/* Communication Requirements */}
                  {decreeExtraction.communication_requirements && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-2">Communication</h4>
                      <p className="text-sm text-slate-700 leading-relaxed">{decreeExtraction.communication_requirements}</p>
                    </div>
                  )}

                  {/* Pickup / Dropoff */}
                  {decreeExtraction.pickup_dropoff && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Pickup & Dropoff</h4>
                      <div className="space-y-2.5">
                        {decreeExtraction.pickup_dropoff.location && (
                          <div>
                            <span className="text-[11px] text-slate-400 block mb-0.5">Location</span>
                            <span className="text-sm text-slate-700">{decreeExtraction.pickup_dropoff.location}</span>
                          </div>
                        )}
                        {decreeExtraction.pickup_dropoff.weekday_time && (
                          <div>
                            <span className="text-[11px] text-slate-400 block mb-0.5">Weekday</span>
                            <span className="text-sm text-slate-700">{decreeExtraction.pickup_dropoff.weekday_time}</span>
                          </div>
                        )}
                        {decreeExtraction.pickup_dropoff.weekend_time && (
                          <div>
                            <span className="text-[11px] text-slate-400 block mb-0.5">Weekend</span>
                            <span className="text-sm text-slate-700">{decreeExtraction.pickup_dropoff.weekend_time}</span>
                          </div>
                        )}
                        {decreeExtraction.pickup_dropoff.details && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{decreeExtraction.pickup_dropoff.details}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Children */}
                  {decreeExtraction.children?.length > 0 && (
                    <div className="border border-slate-100 rounded-xl p-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Children</h4>
                      <div className="space-y-2">
                        {decreeExtraction.children.map((child: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-slate-700 font-medium">{child.name || "Unnamed"}</span>
                            {child.birthdate && <span className="text-xs text-slate-400">{new Date(child.birthdate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Re-analyze button */}
                <button onClick={() => {
                  const decree = vaultDocs.find(d => d.category === "decree" && d.text_content);
                  if (decree) { setShowDecreeSummary(false); triggerExtraction(decree.text_content, decree.id); }
                }} className="w-full mt-6 py-3 text-sm text-slate-400 hover:text-emerald-600 transition-colors">
                  Re-analyze decree
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* Vault category picker */}
          <AnimatePresence>
            {vaultUploadCategory === "picking" && (
              <motion.div className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center" onClick={() => setVaultUploadCategory(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  <h3 className="text-lg font-light text-slate-700 mb-1">Upload document</h3>
                  <p className="text-sm text-slate-400 mb-5">Choose a category for your file</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VAULT_CATEGORIES.filter(c => c.id !== "all").map(cat => (
                      <button key={cat.id} onClick={() => { setVaultUploadCategory(cat.id); setTimeout(() => vaultFileRef.current?.click(), 100); }}
                        className="p-4 rounded-xl border border-slate-200/60 text-left hover:border-emerald-300 hover:bg-emerald-50/30 transition-all">
                        <span className="text-sm font-medium text-slate-700">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* Upload progress overlay */}
            {vaultUploadProgress && (
              <motion.div className="fixed inset-0 z-[250] bg-white/95 flex flex-col items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {vaultUploadProgress === "done" ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 400 }}>
                        <Check className="w-8 h-8 text-emerald-500" />
                      </motion.div>
                    </div>
                    <span className="text-base font-medium text-slate-700">Saved to vault</span>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="relative w-16 h-16 mb-5">
                      <motion.div className="absolute inset-0 rounded-full border-[3px] border-emerald-100" />
                      <motion.div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-500"
                        animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                      <motion.div className="absolute inset-2 rounded-full border-[2px] border-transparent border-b-teal-400"
                        animate={{ rotate: -360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-emerald-500" />
                      </div>
                    </div>
                    <motion.span key={vaultUploadProgress} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-medium text-slate-600">
                      {vaultUploadProgress === "uploading" ? "Uploading..." : "Processing document..."}
                    </motion.span>
                    <motion.div className="w-48 h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
                      <motion.div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: vaultUploadProgress === "uploading" ? "60%" : "90%" }}
                        transition={{ duration: vaultUploadProgress === "uploading" ? 2 : 1.5, ease: "easeOut" }} />
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Document viewer modal */}
            {vaultViewDoc && (
              <motion.div className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center" onClick={() => { setVaultViewDoc(null); if (vaultViewUrl) { URL.revokeObjectURL(vaultViewUrl); setVaultViewUrl(null); } }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      {vaultRenameId === vaultViewDoc.id ? (
                        <input autoFocus value={vaultRenameName} onChange={(e) => setVaultRenameName(e.target.value)}
                          onBlur={() => handleVaultRename(vaultViewDoc.id, vaultRenameName)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleVaultRename(vaultViewDoc.id, vaultRenameName); if (e.key === "Escape") setVaultRenameId(null); }}
                          className="w-full text-base font-medium text-slate-800 bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      ) : (
                        <button onClick={() => { setVaultRenameId(vaultViewDoc.id); setVaultRenameName(vaultViewDoc.file_name); }}
                          className="flex items-center gap-1.5 group text-left">
                          <h3 className="text-base font-medium text-slate-800 truncate">{vaultViewDoc.file_name}</h3>
                          <Edit3 className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                        </button>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-600 rounded-md">{VAULT_CATEGORIES.find(c => c.id === vaultViewDoc.category)?.label}</span>
                        <span className="text-[11px] text-slate-400">{new Date(vaultViewDoc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    </div>
                    <button onClick={() => { setVaultViewDoc(null); if (vaultViewUrl) { URL.revokeObjectURL(vaultViewUrl); setVaultViewUrl(null); } }} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"><X className="w-4 h-4" /></button>
                  </div>
                  {/* Decree Intelligence in vault detail */}
                  {FEATURE_DECREE_INTELLIGENCE && vaultViewDoc.category === "decree" && decreeExtraction?.status === "complete" && (
                    <button onClick={() => setShowDecreeSummary(true)} className="w-full mb-3 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border border-emerald-100/40 rounded-xl px-4 py-3 flex items-center justify-between hover:border-emerald-200 transition-all">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                        <span className="text-sm text-emerald-700 font-medium">View decree summary</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-emerald-400" />
                    </button>
                  )}
                  <div className="flex-1 overflow-auto rounded-xl border border-slate-200/60 bg-slate-50/50 min-h-[200px]">
                    {!vaultViewUrl ? (
                      <div className="flex items-center justify-center h-48">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                      </div>
                    ) : vaultViewDoc.mime_type?.startsWith("image/") ? (
                      <img src={vaultViewUrl} alt={vaultViewDoc.file_name} className="w-full rounded-xl" />
                    ) : vaultViewDoc.mime_type === "application/pdf" ? (
                      <iframe src={vaultViewUrl} className="w-full h-[60vh] rounded-xl" title={vaultViewDoc.file_name} />
                    ) : vaultViewDoc.text_content ? (
                      <div className="p-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{vaultViewDoc.text_content.slice(0, 10000)}</div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                        <FileText className="w-8 h-8 mb-2" strokeWidth={1.5} />
                        <p className="text-sm">Preview not available</p>
                        <button onClick={() => window.open(vaultViewUrl, "_blank")} className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium">Open in new tab</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback modal */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center" onClick={() => { if (!feedbackSending) { setShowFeedback(false); setFeedbackChatMessage(""); } }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  {feedbackSent ? (
                    <div className="flex flex-col items-center py-6"><Check size={32} className="text-emerald-500 mb-3" /><span className="text-base font-semibold text-slate-800">Thank you!</span><span className="text-sm text-slate-400">Your feedback helps us improve.</span></div>
                  ) : (<>
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">{feedbackChatMessage ? "What went wrong?" : "Send Feedback"}</h3>
                    <p className="text-sm text-slate-400 mb-4">{feedbackChatMessage ? "Help us improve — tell us what was wrong with this response." : "Tell us what's working, what's not, or what you'd love to see."}</p>
                    {feedbackChatMessage && <div className="bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3 mb-3 text-sm text-slate-500 max-h-24 overflow-y-auto line-clamp-4">{feedbackChatMessage.slice(0, 300)}{feedbackChatMessage.length > 300 ? "..." : ""}</div>}
                    <textarea className="w-full border border-slate-200/60 rounded-xl px-4 py-3 text-base text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none placeholder:text-slate-400" placeholder={feedbackChatMessage ? "What was incorrect or unhelpful?" : "Your feedback..."} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={4} autoFocus />
                    <Button onClick={handleFeedbackSubmit} disabled={!feedbackText.trim() || feedbackSending} className="w-full mt-3 h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 disabled:opacity-40">{feedbackSending ? "Sending..." : "Submit Feedback"}</Button>
                  </>)}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sign out confirm */}
          <AnimatePresence>
            {showSignOutConfirm && (
              <motion.div className="fixed inset-0 z-[9999] bg-black/35 flex items-center justify-center px-6" onClick={() => setShowSignOutConfirm(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="bg-white rounded-2xl p-7 max-w-[300px] w-full text-center" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={spring}>
                  <h3 className="text-[17px] font-semibold text-slate-800 mb-1.5">Sign out?</h3>
                  <p className="text-sm text-slate-400 mb-6 leading-snug">You'll need to sign back in to continue your conversations.</p>
                  <div className="flex gap-2.5">
                    <Button variant="secondary" onClick={() => setShowSignOutConfirm(false)} className="flex-1">Cancel</Button>
                    <Button onClick={() => { setShowSignOutConfirm(false); handleSignOut(); }} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">Sign Out</Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subscribe Modal */}
          <AnimatePresence>
            {showSubscribeModal && (
              <motion.div className="fixed inset-0 z-[300] bg-black/30 flex items-end justify-center" onPointerUp={(e) => { if (e.target === e.currentTarget) setShowSubscribeModal(false); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  <div className="text-center mb-5">
                    <Logo size="md" className="mx-auto mb-3" />
                    <h3 className="text-xl font-light text-slate-800 mb-1">Meridian Pro</h3>
                    <p className="text-sm text-slate-500">Unlimited access to all features. Cancel anytime.</p>
                  </div>

                  <div className="space-y-3 mb-5">
                    {[
                      { id: "yearly", label: "Yearly", price: "$39.99", period: "/year", badge: "Save 33%", perMonth: null },
                      { id: "monthly", label: "Monthly", price: "$4.99", period: "/month", badge: null, perMonth: null },
                    ].map((plan) => (
                      <button key={plan.id} onClick={() => setSelectedPlan(plan.id)} className={cn("w-full rounded-2xl border-2 p-4 text-left transition-all relative", selectedPlan === plan.id ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200 bg-white")}>
                        {plan.badge && <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500 text-white px-2 py-0.5 rounded-full">{plan.badge}</span>}
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-light text-slate-800">{plan.price}</span>
                          <span className="text-sm text-slate-400">{plan.period}</span>
                        </div>
                        {plan.perMonth && <p className="text-xs text-emerald-600 mt-0.5">{plan.perMonth}</p>}
                      </button>
                    ))}
                  </div>

                  <ul className="text-sm text-slate-600 space-y-2.5 text-left mb-5 px-1">
                    {["Unlimited AI conversations", "Communication coach", "Document vault", "Calendar & scheduling"].map((f, i) => (
                      <li key={i} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-emerald-500 shrink-0" />{f}</li>
                    ))}
                  </ul>

                  <Button onClick={() => { setShowSubscribeModal(false); handleSubscribe(); }} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 rounded-xl text-base font-medium">
                    Subscribe
                  </Button>

                  <p className="text-[10px] text-slate-400 mt-3 leading-relaxed text-center">
                    {selectedPlan === "yearly" ? "Meridian Pro · $39.99/year · " : "Meridian Pro · $4.99/month · "}
                    Includes unlimited AI conversations, communication coach, document vault, and calendar for the subscription period. Subscription auto-renews until canceled. Manage or cancel anytime in your device Settings.
                  </p>

                  <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                    <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Use (EULA)</a>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => { setShowSubscribeModal(false); setShowPrivacy(true); }} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Privacy Policy</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => { setShowSubscribeModal(false); setShowTerms(true); }} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2">Terms of Service</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toast */}
          <AnimatePresence>
            {showToast && <motion.div className={`fixed bottom-[100px] left-1/2 -translate-x-1/2 ${toastIsError ? "bg-red-600" : "bg-slate-800"} text-white px-5 py-2 rounded-full text-[13px] font-medium z-[200] pointer-events-none`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toastMessage}</motion.div>}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
