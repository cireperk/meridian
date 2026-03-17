import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import { marked } from "marked";
import { Upload, Check, Send, X, Edit3, Play, Pause, MessageSquare, User, BookOpen, ChevronRight, FileText, Heart, DollarSign, Users, Baby, Sparkles, Search, Square, Clock, Copy, Trash2, LogOut, Shield, HelpCircle, Info, ArrowLeft, Eye, EyeOff, ThumbsUp, ThumbsDown, Volume2, VolumeX, FolderLock, Download, CalendarDays, Plus, ChevronLeft } from "lucide-react";
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

const authSubmit = async (email: string, password: string) => {
  const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
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
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const formatTime12 = (t: string) => {
  if (!t) return "";
  if (t.includes("AM") || t.includes("PM")) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

// --- System prompt ---
const SYSTEM_PROMPT = `You're Meridian — think of yourself as a calm, wise friend who's been through divorce and co-parenting. You talk like a real person, not a chatbot.

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

End with a brief grounding thought when it feels natural.`;

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

const COACH_SYSTEM_PROMPT = `You are Meridian's Co-Parenting Communication Coach. Your role is to help users communicate with their co-parent in ways that are:

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
- Be warm and supportive in your coaching voice, but make the actual draft messages businesslike and neutral.`;

type Tab = "chat" | "calendar" | "vault" | "coach" | "profile";

// ============================================================
export default function App() {
  // --- Auth ---
  const [session, setSession] = useState<any>(() => { try { return JSON.parse(localStorage.getItem("m_session") || "null"); } catch { return null; } });
  const [authView, setAuthView] = useState("main");
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
  const TRIAL_DAYS = 3;
  const [coachMode, setCoachMode] = useState<"respond" | "draft">("respond");
  const [coachInput, setCoachInput] = useState("");
  const [coachResult, setCoachResult] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachCopied, setCoachCopied] = useState(false);
  const coachAbortRef = useRef<AbortController | null>(null);
  const [coachSessions, setCoachSessions] = useState<any[]>(() => { try { const c = JSON.parse(localStorage.getItem("m_coach_sessions") || "null"); if (c?.length) return c; return []; } catch { return []; } });
  const [activeCoachSessionId, setActiveCoachSessionId] = useState<string | null>(null);
  const [coachDeleteConfirmId, setCoachDeleteConfirmId] = useState<string | null>(null);
  const activeCoachSession = coachSessions.find((s) => s.id === activeCoachSessionId);
  const [thumbs, setThumbs] = useState<Record<number, "up" | "down">>({});

  // Handle OAuth callback (Google sign-in redirect)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      try {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } });
        if (!userRes.ok) throw new Error("Failed to get user");
        const userData = await userRes.json();
        const userId = userData.id;
        const email = userData.email || "";
        const oauthName = userData.user_metadata?.full_name || userData.user_metadata?.name || "";
        // Check if profile exists
        const profile = await dbSelect("profiles", `id=eq.${userId}&select=name`, accessToken);
        if (profile?.length && profile[0].name) {
          // Existing user — sign in
          const s = { token: accessToken, refresh_token: refreshToken || "", user: { id: userId, email, name: profile[0].name } };
          setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
          setShowSplash(false); setAuthView("main");
          dbSelect("conversations", `user_id=eq.${userId}&order=updated_at.desc`, accessToken).then((rows: any) => {
            if (rows?.length) { const convs = rows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at })); setConversations(convs); localStorage.setItem("m_conversations", JSON.stringify(convs)); }
          }).catch(() => {});
        } else {
          // New user — go to onboarding
          setSession({ token: accessToken, refresh_token: refreshToken || "", user: { id: userId, email, name: oauthName } });
          setAuthView("onboarding"); setShowSplash(false);
          if (oauthName) setEditName(oauthName);
        }
      } catch (err: any) { setAuthError("Google sign-in failed. Please try again."); setShowSplash(false); setAuthView("main"); }
    })();
  }, []);

  useEffect(() => {
    if (!session?.refresh_token) return;
    authRefreshToken(session.refresh_token).then((data: any) => {
      if (data?.access_token) {
        const s = { ...session, token: data.access_token, refresh_token: data.refresh_token }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
        // Load decree from DB if not in localStorage
        if (!localStorage.getItem("m_decree_text") && session.user?.id) {
          dbSelect("profiles", `id=eq.${session.user.id}&select=decree_text,decree_name,decree_pages`, data.access_token).then((p: any) => {
            if (p?.[0]?.decree_text) { setDecreeText(p[0].decree_text); setDecreeFileName(p[0].decree_name || "Decree"); setDecreePages(p[0].decree_pages || 0); }
          }).catch(() => {});
        }
        // Load conversations + coach sessions from Supabase
        if (session.user?.id) {
          dbSelect("conversations", `user_id=eq.${session.user.id}&order=updated_at.desc`, data.access_token).then((rows: any) => {
            if (rows?.length) {
              const chatRows = rows.filter((r: any) => !r.id?.startsWith("coach_"));
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
                  const assistantMsg = msgs.find((m: any) => m.role === "assistant");
                  const inputText = userMsg?.content?.replace(/^I received this message from my co-parent\. Help me respond:\n\n"|^I need to send a message to my co-parent about the following:\n\n/g, "").replace(/"$/, "") || "";
                  const mode = userMsg?.content?.startsWith("I received") ? "respond" : "draft";
                  return { id: r.id, mode, input: inputText, result: assistantMsg?.content || "", title: r.title, createdAt: r.created_at };
                });
                setCoachSessions(sessions);
                localStorage.setItem("m_coach_sessions", JSON.stringify(sessions));
              }
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {
      // Refresh token is invalid/expired — clear session, let app redirect to auth
      setSession(null); localStorage.removeItem("m_session"); localStorage.removeItem("m_conversations");
    });
  }, []);

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      const data = await authSubmit(authEmail, authPassword);
      if (data.isNew) { setSession({ token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name: "" } }); setAuthView("onboarding"); }
      else {
        let name = "";
        try {
          const p = await dbSelect("profiles", `id=eq.${data.user.id}&select=name,decree_text,decree_name,decree_pages`, data.access_token);
          if (p?.length) {
            name = p[0].name;
            if (p[0].decree_text) { setDecreeText(p[0].decree_text); setDecreeFileName(p[0].decree_name || "Decree"); setDecreePages(p[0].decree_pages || 0); }
          }
        } catch {}
        const s = { token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); setAuthView("main");
        // Load conversations from Supabase
        dbSelect("conversations", `user_id=eq.${data.user.id}&order=updated_at.desc`, data.access_token).then((rows: any) => {
          if (rows?.length) {
            const convs = rows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at }));
            setConversations(convs);
            localStorage.setItem("m_conversations", JSON.stringify(convs));
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
      await sbFetch("/rest/v1/profiles", { method: "POST", body: { id: session.user.id, name: authName.trim(), email: session.user.email }, token: session.token });
      const s = { ...session, user: { ...session.user, name: authName.trim() } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
      setAuthView("onboard-modes");
    } catch (err: any) { setAuthError(err.message); } finally { setAuthLoading(false); }
  };

  const finishOnboarding = () => setAuthView("main");

  const handleUpdateName = async (newName: string) => {
    if (!newName.trim() || !session?.token) return;
    try { await dbUpdate("profiles", `id=eq.${session.user.id}`, { name: newName.trim() }, session.token); const s = { ...session, user: { ...session.user, name: newName.trim() } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); } catch {}
  };

  const handleSignOut = () => { setSession(null); localStorage.removeItem("m_session"); localStorage.removeItem("m_conversations"); localStorage.removeItem("m_coach_sessions"); localStorage.removeItem("m_sub_status"); setConversations([]); setActiveConvId(null); setCoachSessions([]); setActiveCoachSessionId(null); setCoachResult(""); setCoachInput(""); setAuthView("main"); setShowSplash(true); setSubscription({ status: null, trialEnd: null, loading: true }); };

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
      fetch("/api/stripe-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
      return;
    }

    // 2. Check localStorage first — this survives app restarts regardless of DB/API state
    const cachedStatus = localStorage.getItem("m_sub_status");
    if (cachedStatus === "active" || cachedStatus === "trialing") {
      setSubscription({ status: cachedStatus, trialEnd: null, loading: false });
      // Still try to sync DB in background (non-blocking)
      fetch("/api/stripe-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
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
    if (session?.token && session?.user?.id) checkSubscription(session.token, session.user.id);
  }, [session?.token, session?.user?.id, checkSubscription]);

  const isTrialActive = subscription.trialEnd ? new Date() < new Date(subscription.trialEnd) : false;
  const isSubscribed = subscription.status === "active" || subscription.status === "trialing";
  const hasAccess = isTrialActive || isSubscribed;
  const trialDaysLeft = subscription.trialEnd ? Math.max(0, Math.ceil((new Date(subscription.trialEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

  const handleSubscribe = async () => {
    if (!session?.token) { console.error("Subscribe: no token"); return; }
    try {
      const res = await fetch("/api/stripe-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: session.token }) });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { console.error("Stripe checkout error:", data); alert("Something went wrong. Please try again."); }
    } catch (err) { console.error("Subscribe error:", err); alert("Connection error. Please try again."); }
  };

  const handleManageSubscription = async () => {
    if (!session?.token) return;
    try {
      const res = await fetch("/api/stripe-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: session.token }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
  };

  // --- Splash ---
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem("m_session"));
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
  const [activeTab, setActiveTab] = useState<Tab>("chat");
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
  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calShowAdd, setCalShowAdd] = useState(false);
  const [calEditEvent, setCalEditEvent] = useState<any | null>(null);
  const [calDeleteConfirm, setCalDeleteConfirm] = useState<string | null>(null);
  const [calForm, setCalForm] = useState({ title: "", date: "", time: "", type: "handoff", notes: "" });
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

  const [editName, setEditName] = useState("");

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
          dbUpsert("conversations", { id: s.id, user_id: session.user.id, title: s.title || "Coach session", messages: [{ role: "user", content: s.input }, { role: "assistant", content: s.result }], updated_at: new Date().toISOString() }, session.token).catch(() => {});
        });
      }, 1500);
    }
  }, [coachSessions]);
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
      // Also save to vault as a decree document
      if (session?.token && session?.user?.id) {
        try {
          const storagePath = `${session.user.id}/${crypto.randomUUID()}_${file.name}`;
          await dbStorageUpload("documents", storagePath, file, session.token);
          await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: "decree", file_name: file.name, file_size: file.size, mime_type: file.type, storage_path: storagePath, text_content: text.slice(0, 50000) || null }, token: session.token });
          await loadVaultDocs();
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
    // Build vault docs context (includes decree if uploaded)
    const vaultContext = vaultDocs.filter(d => d.text_content).map(d => `\n\n[VAULT DOCUMENT: ${d.file_name} (${VAULT_CATEGORIES.find(c => c.id === d.category)?.label || d.category})]\n${d.text_content.slice(0, 6000)}`).join("");
    const docsContext = vaultContext || "\n\nNo documents uploaded yet.";
    const currentMsgs = conversations.find((c) => c.id === convId)?.messages || [];
    const history = [...currentMsgs, { role: "user", content: userMsg }].map((m: any) => ({ role: m.role, content: m.content }));
    const updateConvMessages = (fn: any) => { setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: typeof fn === "function" ? fn(c.messages) : fn } : c)); };
    const abort = new AbortController(); abortRef.current = abort;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `${SYSTEM_PROMPT}${docsContext}`, messages: history }), signal: abort.signal });
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
      const errMsg = "I'm having trouble connecting right now. Please check your internet connection and try again.";
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
    try { const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: feedbackText.trim(), userId: session?.user?.id, email: session?.user?.email }) }); if (!res.ok) throw new Error(); setFeedbackSent(true); setTimeout(() => { setShowFeedback(false); setFeedbackText(""); setFeedbackSent(false); }, 1800); }
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

  useEffect(() => { if (activeTab === "vault" || activeTab === "chat") loadVaultDocs(); }, [activeTab]);

  // Migrate legacy decree (localStorage/profiles) into vault documents table
  useEffect(() => {
    if (!session?.token || !session?.user?.id || !decreeText) return;
    (async () => {
      try {
        const existing = await dbSelect("documents", `user_id=eq.${session.user.id}&category=eq.decree`, session.token);
        if (existing && existing.length > 0) return; // already migrated
        await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: "decree", file_name: decreeFileName || "Decree", file_size: 0, mime_type: "text/plain", storage_path: `${session.user.id}/migrated_decree`, text_content: decreeText.slice(0, 50000) }, token: session.token });
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
      await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: vaultUploadCategory, file_name: file.name, file_size: file.size, mime_type: file.type, storage_path: storagePath, text_content: textContent?.slice(0, 50000) || null }, token: session.token });
      setVaultUploadProgress("done");
      await new Promise(r => setTimeout(r, 1200));
      await loadVaultDocs();
    } catch (err: any) { showToastMsg(err?.message || "Upload failed. Please try again.", true); }
    finally { setVaultUploading(false); setVaultUploadProgress(null); setVaultUploadCategory(null); if (vaultFileRef.current) vaultFileRef.current.value = ""; }
  };

  const handleVaultDelete = async (doc: any) => {
    if (!session?.token) return;
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${doc.storage_path}`, { method: "DELETE", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.token}` } });
      await dbDelete("documents", `id=eq.${doc.id}`, session.token);
      setVaultDocs(prev => prev.filter(d => d.id !== doc.id));
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

  // --- Coach ---
  const handleCoachSend = async () => {
    if (!coachInput.trim() || coachLoading) return;
    setCoachResult(""); setCoachLoading(true); setCoachCopied(false);
    const savedInput = coachInput.trim();
    const savedMode = coachMode;
    const userPrompt = coachMode === "respond"
      ? `I received this message from my co-parent. Help me respond:\n\n"${coachInput}"`
      : `I need to send a message to my co-parent about the following:\n\n${coachInput}`;
    const abort = new AbortController(); coachAbortRef.current = abort;
    let finalText = "";
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: COACH_SYSTEM_PROMPT, messages: [{ role: "user", content: userPrompt }] }), signal: abort.signal });
      if (!res.ok) throw new Error("API error");
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let fullText = ""; let buffer = "";
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) { if (!line.startsWith("data: ")) continue; const data = line.slice(6); if (data === "[DONE]") continue; try { const parsed = JSON.parse(data); if (parsed.type === "content_block_delta" && parsed.delta?.text) { fullText += parsed.delta.text; setCoachResult(fullText); } } catch {} }
        }
      } catch (e: any) { if (e.name !== "AbortError") throw e; }
      finalText = fullText;
    } catch (err: any) { if (err.name !== "AbortError") setCoachResult("Something went wrong. Please try again."); }
    finally {
      setCoachLoading(false);
      if (finalText && finalText !== "Something went wrong. Please try again.") {
        const sessionId = `coach_${Date.now()}`;
        const newSession = { id: sessionId, mode: savedMode, input: savedInput, result: finalText, title: savedInput.slice(0, 50), createdAt: new Date().toISOString() };
        setCoachSessions((prev) => [newSession, ...prev]);
        setActiveCoachSessionId(sessionId);
      }
    }
  };

  const copyCoachMessage = () => {
    const match = coachResult.match(/\*\*Your message:\*\*\s*\n([\s\S]*?)(?:\n\*\*|$)/);
    const textToCopy = match ? match[1].trim() : coachResult;
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

  useEffect(() => { if (activeTab === "calendar") loadCalEvents(); }, [activeTab, calMonth]);

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

      {/* ==================== SPLASH ==================== */}
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
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Logo size="sm" />
                <span className="font-sans font-medium text-base tracking-normal text-slate-800">Meridian</span>
              </div>
              <button onClick={() => { setShowSplash(false); setAuthView("signin"); setAuthError(""); setAuthEmail(""); setAuthPassword(""); }}
                className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">
                Sign In
              </button>
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
                <Button size="lg" onClick={enterApp} className="w-full h-13 px-8 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                  Start here
                </Button>
                <p className="text-[11px] text-slate-400 -mt-2">Free to start. Private forever.</p>
              </motion.div>

              {/* Scroll hint */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.8 }} className="absolute bottom-8">
                <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="text-slate-500">
                  <ChevronLeft className="w-6 h-6 rotate-[-90deg]" />
                </motion.div>
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

            {/* ===== SECTION 4: The Anti-Competitor ===== */}
            <div className="flex items-center justify-center px-6 py-24 relative z-10">
              <motion.div className="max-w-lg w-full" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <div className="space-y-6 text-center">
                  {[
                    "Your conversations never end up in court.",
                    "No one sees your data. Not even us.",
                    "Try free for 3 days. No credit card required.",
                  ].map((line, i) => (
                    <motion.p key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="text-lg sm:text-xl font-light text-slate-800">
                      {line}
                    </motion.p>
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
                    { q: "Is it really free?", a: "You get a full 3-day free trial with no credit card required. After that, Meridian is $4.99/month \u2014 less than a single coffee. Cancel anytime, no questions asked." },
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

                {/* Video card */}
                <button onClick={openVideo} className="w-full rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-left group hover:shadow-xl hover:shadow-slate-900/20 transition-all duration-500 mb-10 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-500">
                      <Play className="w-5 h-5 text-emerald-400 ml-0.5" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/90 text-sm font-medium mb-0.5">A message from our founder</p>
                      <p className="text-white/40 text-xs">Eric — 1 min watch</p>
                    </div>
                  </div>
                  <p className="relative z-10 text-white/50 text-[13px] italic leading-relaxed mt-4 border-t border-white/5 pt-4">
                    "Divorce is hard. When you thought this was the end, you found co-parenting is even harder, and I hope you use this app to navigate those waters."
                  </p>
                </button>

                {/* Final CTA */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-lg sm:text-xl font-light text-slate-800 mb-2">Whenever you're ready.</p>
                  <Button size="lg" onClick={enterApp} className="h-13 px-10 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                    Take the first step
                  </Button>
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
            {/* Video */}
            <div className="relative flex-1 min-h-0 bg-black cursor-pointer" onClick={togglePlayPause}>
              <video ref={videoRef} className="w-full h-full object-contain block" src="/welcome.mp4" playsInline autoPlay muted onTimeUpdate={() => { const v = videoRef.current; if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100); }} onEnded={() => { setVideoProgress(100); setVideoEnded(true); }} />
              {(videoPaused || videoEnded) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              )}
            </div>
            {/* Controls */}
            <div className="px-4 py-3 bg-slate-800/80 border-t border-white/5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <input type="range" min="0" max="100" step="0.1" value={videoProgress} onChange={(e) => { const v = videoRef.current; if (v && v.duration) { const pct = Number(e.target.value); v.currentTime = (pct / 100) * v.duration; setVideoProgress(pct); } }} className="w-full h-1 mb-3 appearance-none bg-white/10 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-md" style={{ background: `linear-gradient(to right, #10b981 ${videoProgress}%, rgba(255,255,255,0.1) ${videoProgress}%)` }} />
              <div className="flex items-center gap-3">
                <button onClick={() => { if (videoEnded) { const v = videoRef.current; if (v) { v.currentTime = 0; setVideoEnded(false); setVideoProgress(0); setVideoPaused(false); v.play().catch(() => {}); } } else { togglePlayPause(); } }} className="text-white/70 hover:text-white transition-colors">
                  {videoPaused || videoEnded ? <Play className="w-5 h-5" fill="white" /> : <Pause className="w-5 h-5" fill="white" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = !v.muted; setVideoMuted(v.muted); } }} className="text-white/70 hover:text-white transition-colors">
                  {videoMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <span className="text-white/40 text-xs font-mono">{videoRef.current ? `${Math.floor((videoRef.current.currentTime || 0) / 60)}:${String(Math.floor((videoRef.current.currentTime || 0) % 60)).padStart(2, "0")}` : "0:00"} / {videoRef.current?.duration ? `${Math.floor(videoRef.current.duration / 60)}:${String(Math.floor(videoRef.current.duration % 60)).padStart(2, "0")}` : "0:00"}</span>
              </div>
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
            <p className="text-xs text-slate-400 mb-6">Effective March 16, 2026</p>
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
                <p>You can delete individual conversations, documents, and calendar events at any time. To delete your entire account and all associated data, contact us at <a href="mailto:privacy@mymeridian.app" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">privacy@mymeridian.app</a> and we'll remove everything within 48 hours.</p>
              </div>

              <div>
                <h2 className="text-base font-medium text-slate-800 mb-2">Changes to this policy</h2>
                <p>If we make meaningful changes, we'll notify you in the app. We'll never quietly weaken your privacy protections.</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-slate-400 text-xs">Questions? Reach us at <a href="mailto:privacy@mymeridian.app" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">privacy@mymeridian.app</a></p>
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
            <p className="text-xs text-slate-400 mb-6">Effective March 16, 2026</p>
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
                  <li>After the trial, the service costs <strong>$4.99/month</strong>, billed monthly.</li>
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
                <p className="text-slate-400 text-xs">Questions? Reach us at <a href="mailto:terms@mymeridian.app" className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">terms@mymeridian.app</a></p>
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
                  <p className="text-xs text-slate-400 mb-6 text-center">Your document stays private and is never shared.</p>
                  <AnimatePresence mode="wait">
                    {uploading ? (
                      <motion.div key="uploading" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full py-8 px-6 border-2 border-emerald-300 bg-emerald-50/50 rounded-2xl flex flex-col items-center gap-3 mb-4">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-[2.5px] border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-sm font-medium text-emerald-700">Reading your document...</span>
                        <span className="text-xs text-emerald-500/70">This only takes a moment</span>
                      </motion.div>
                    ) : decreeFileName && decreeText ? (
                      <motion.div key="uploaded" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full py-8 px-6 border-2 border-emerald-200 bg-emerald-50 rounded-2xl flex flex-col items-center gap-2 mb-4 text-emerald-700">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}><Check size={28} className="text-emerald-500" /></motion.div>
                        <span className="text-sm font-medium">{decreeFileName}</span>
                        {decreePages > 0 && <span className="text-xs text-emerald-500/70">{decreePages} pages ready</span>}
                      </motion.div>
                    ) : (
                      <motion.button key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={() => fileRef.current?.click()} className="w-full py-8 px-6 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all mb-4 text-slate-400">
                        <Upload size={24} /><span className="text-sm font-medium text-slate-600">Tap to upload your decree</span><span className="text-xs text-slate-400">.pdf, .docx, .txt, or .md</span>
                      </motion.button>
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
                  <button onClick={() => { setShowSplash(true); setAuthView("main"); setAuthError(""); }} className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && !subscription.loading && !hasAccess ? (
        <>
          {/* ==================== PAYWALL ==================== */}
          <div className="fixed inset-0 flex flex-col items-center justify-center px-8 bg-gradient-to-b from-white via-emerald-50/20 to-white z-40">
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl pointer-events-none" />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-sm w-full text-center">
              <Logo size="lg" className="mx-auto mb-6" />
              <h2 className="text-2xl font-light tracking-tight text-slate-800 mb-2">Your free trial has ended</h2>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">Continue having Meridian walk with you for just $4.99/month. Cancel anytime.</p>
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
              </div>
              <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Sign out</button>
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

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-full flex flex-col max-w-3xl mx-auto bg-white overflow-hidden">

            {/* Trial banner */}
            {isTrialActive && !isSubscribed && trialDaysLeft < TRIAL_DAYS && (
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500">
                  {trialDaysLeft === 0 ? "Your trial ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`}
                </span>
                <button onClick={handleSubscribe} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 active:text-emerald-800 transition-colors px-3 py-1 rounded-lg hover:bg-emerald-50 active:bg-emerald-100">
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
                <AnimatePresence>
                  {activeTab === "chat" && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-1">
                      {conversations.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => { setShowHistory(!showHistory); }} className={cn("text-slate-500 hover:text-slate-700 hover:bg-slate-100", showHistory && "text-emerald-600 bg-emerald-50")} aria-label="Conversation history"><Clock className="w-4 h-4" /></Button>
                      )}
                      {(hasConversation || showHistory) && (
                        <Button variant="ghost" size="sm" onClick={() => { if (streaming) handleStop(); setActiveConvId(null); setShowHistory(false); }} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"><Edit3 className="w-4 h-4" /></Button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button onClick={() => setActiveTab("profile")} className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200", activeTab === "profile" ? "bg-emerald-100 text-emerald-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100")}>
                  <User className="w-4 h-4" strokeWidth={activeTab === "profile" ? 2 : 1.5} />
                </button>
              </div>
            </motion.header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* CHAT */}
                {activeTab === "chat" && (
                  <motion.div key="chat" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-4 pb-4">
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
                              {conversations.map((c, idx) => {
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
                          <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-6">Let's take the high road today.</p>
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
                                      <button onClick={() => setThumbs(p => ({ ...p, [i]: p[i] === "down" ? undefined as any : "down" }))} className={cn("p-1 rounded transition-all", thumbs[i] === "down" ? "text-red-400" : "text-slate-300 hover:text-slate-500")}>
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
                  </motion.div>
                )}

                {/* LEARN */}
                {activeTab === "coach" && (
                  <motion.div key="coach" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-1">Communication Coach</h2>
                    <p className="text-sm text-slate-400 mb-6">Craft calm, child-focused messages</p>

                    {/* Mode toggle — always visible */}
                    <div className="flex bg-slate-100 rounded-xl p-1 mb-5">
                      {([{ id: "respond" as const, label: "Respond to a message" }, { id: "draft" as const, label: "Draft a message" }]).map((m) => (
                        <button key={m.id} onClick={() => { setCoachMode(m.id); setCoachResult(""); setCoachInput(""); setActiveCoachSessionId(null); }}
                          className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium transition-all", coachMode === m.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}>
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* Viewing a past session */}
                    {activeCoachSession && !coachLoading && coachResult === activeCoachSession.result ? (
                      <div>
                        <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-4 mb-4">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">{activeCoachSession.mode === "respond" ? "Their message" : "Your situation"}</label>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{activeCoachSession.input}</p>
                        </div>
                        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 mb-3">
                          <div className="prose prose-sm prose-slate max-w-none text-[14px] leading-relaxed [&_strong]:text-slate-800 [&_p]:text-slate-600 [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: marked.parse(activeCoachSession.result) as string }} />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={copyCoachMessage}
                            className={cn("flex-1 transition-all", coachCopied ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                            {coachCopied ? <><Check className="w-3.5 h-3.5 mr-1.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy message</>}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                    {/* Input */}
                    <div className="mb-4">
                      <label className="text-xs font-medium text-slate-500 mb-2 block">
                        {coachMode === "respond" ? "Paste the message you received" : "What do you need to communicate?"}
                      </label>
                      <textarea value={coachInput} onChange={(e) => setCoachInput(e.target.value)}
                        placeholder={coachMode === "respond" ? "Paste their text message, email, or app message here..." : "e.g. I need to change the pickup time this Friday from 5pm to 6pm..."}
                        className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none min-h-[120px]" />
                    </div>

                    <Button onClick={handleCoachSend} disabled={!coachInput.trim() || coachLoading}
                      className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 mb-6">
                      {coachLoading ? (
                        <div className="flex items-center gap-2"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Coaching...</div>
                      ) : (
                        <>{coachMode === "respond" ? "Coach my response" : "Draft my message"}</>
                      )}
                    </Button>

                    {/* Result */}
                    <AnimatePresence>
                      {coachResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 mb-3">
                            <div className="prose prose-sm prose-slate max-w-none text-[14px] leading-relaxed [&_strong]:text-slate-800 [&_p]:text-slate-600 [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: marked.parse(coachResult) as string }} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={copyCoachMessage}
                              className={cn("flex-1 transition-all", coachCopied ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                              {coachCopied ? <><Check className="w-3.5 h-3.5 mr-1.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy message</>}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setCoachResult(""); setCoachInput(""); setActiveCoachSessionId(null); }} className="text-slate-400 hover:text-slate-600">
                              Clear
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Empty state tips */}
                    {!coachResult && !coachLoading && (
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
                    {coachSessions.length > 0 && !coachLoading && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-8 pt-6 border-t border-slate-100">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-300 mb-3">Recent sessions</p>
                        <div className="flex flex-col gap-2">
                          {coachSessions.slice(0, 5).map((s) => {
                            const date = s.createdAt ? new Date(s.createdAt) : null;
                            const now = new Date();
                            const diffMs = date ? now.getTime() - date.getTime() : 0;
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHrs = Math.floor(diffMins / 60);
                            const diffDays = Math.floor(diffHrs / 24);
                            const timeAgo = !date ? "" : diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : diffHrs < 24 ? `${diffHrs}h ago` : diffDays < 7 ? `${diffDays}d ago` : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                            const deleteSession = () => { setCoachSessions((prev) => prev.filter((x) => x.id !== s.id)); if (activeCoachSessionId === s.id) { setActiveCoachSessionId(null); setCoachResult(""); setCoachInput(""); } if (session?.token) dbDelete("conversations", `id=eq.${s.id}`, session.token).catch(() => {}); };
                            return (
                              <button key={s.id}
                                onClick={() => { setActiveCoachSessionId(s.id); setCoachMode(s.mode); setCoachInput(s.input); setCoachResult(s.result); }}
                                className={cn("w-full text-left p-3 rounded-xl border transition-all", s.id === activeCoachSessionId ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50")}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={cn("text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0", s.mode === "respond" ? "bg-blue-50 text-blue-500" : "bg-purple-50 text-purple-500")}>{s.mode === "respond" ? "Response" : "Draft"}</span>
                                    <span className="text-sm text-slate-600 truncate">{s.title || "Untitled"}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
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
                  </motion.div>
                )}

                {/* CALENDAR */}
                {activeTab === "calendar" && (
                  <motion.div key="calendar" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    {/* Month header */}
                    <div className="flex items-center justify-between mb-6">
                      <button onClick={() => setCalMonth(p => { const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m }; })} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <h2 className="text-lg font-light tracking-tight text-slate-700">{MONTHS[calMonth.month]} {calMonth.year}</h2>
                      <button onClick={() => setCalMonth(p => { const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m }; })} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-2">
                      {DAYS.map(d => <div key={d} className="text-center text-[11px] font-medium text-slate-400">{d}</div>)}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-y-1">
                      {calDays.map((cell, i) => {
                        const isToday = cell.dateStr === todayStr;
                        const isSelected = cell.dateStr === calSelectedDate;
                        const dayEvents = calEvents.filter(e => e.date === cell.dateStr);
                        const eventTypes = [...new Set(dayEvents.map(e => e.type))].slice(0, 3);
                        return (
                          <button key={i} onClick={() => setCalSelectedDate(cell.dateStr)}
                            className={cn("flex flex-col items-center py-1.5 rounded-xl transition-all relative", cell.month !== "current" && "opacity-30", isSelected && "bg-emerald-50", isToday && !isSelected && "ring-1 ring-emerald-400 ring-inset")}>
                            <span className={cn("text-sm w-7 h-7 flex items-center justify-center rounded-full", isSelected ? "bg-emerald-500 text-white font-medium" : isToday ? "text-emerald-600 font-medium" : "text-slate-700")}>{cell.day}</span>
                            {eventTypes.length > 0 && (
                              <div className="flex gap-0.5 mt-0.5">
                                {eventTypes.map(t => <div key={t} className={cn("w-1.5 h-1.5 rounded-full", EVENT_TYPES.find(et => et.id === t)?.color || "bg-slate-400")} />)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Hint when no date selected */}
                    {!calSelectedDate && calEvents.length === 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 flex flex-col items-center text-center py-6">
                        <p className="text-sm text-slate-400 mb-1">Tap a date to get started</p>
                        <p className="text-xs text-slate-300">Track handoffs, appointments, deadlines, and more</p>
                      </motion.div>
                    )}
                    {!calSelectedDate && calEvents.length > 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 flex flex-col items-center text-center py-4">
                        <p className="text-xs text-slate-300">Tap a date to view or add events</p>
                      </motion.div>
                    )}

                    {/* Selected date events */}
                    {calSelectedDate && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-medium text-slate-700">
                            {new Date(calSelectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                          </h3>
                          <button onClick={() => openAddEvent()} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {selectedDateEvents.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-sm text-slate-400 mb-1">Nothing scheduled</p>
                            <p className="text-xs text-slate-300 mb-4">Track a handoff, appointment, or deadline</p>
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
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {evt.time && <span className="text-[12px] text-slate-400">{evt.time}</span>}
                                        <span className="text-[11px] text-slate-300 px-1.5 py-0.5 bg-slate-50 rounded">{typeInfo?.label}</span>
                                      </div>
                                      {evt.notes && <p className="text-[12px] text-slate-400 mt-1 truncate">{evt.notes}</p>}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* FAB */}
                    {!calSelectedDate && (
                      <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                        onClick={() => openAddEvent(todayStr)} className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25 flex items-center justify-center text-white z-30 hover:shadow-xl transition-shadow">
                        <Plus className="w-6 h-6" />
                      </motion.button>
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
                            <Button size="sm" onClick={() => vaultFileRef.current?.click()} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-sm">Upload decree</Button>
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

                    {/* Name */}
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Name</h3>
                      <input className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={editName || session?.user?.name || ""} onChange={(e) => setEditName(e.target.value)} onBlur={() => { if (editName.trim() && editName.trim() !== session?.user?.name) handleUpdateName(editName); }} onKeyDown={(e) => { if (e.key === "Enter") { handleUpdateName(editName); (e.target as HTMLInputElement).blur(); } }} />
                      {session?.user?.email && <div className="text-xs text-slate-400 mt-2 px-1">{session.user.email}</div>}
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
                        <button onClick={handleManageSubscription} className="w-full py-2.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium">Manage Subscription</button>
                      ) : (
                        <button onClick={handleSubscribe} className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-medium hover:from-emerald-600 hover:to-teal-600 transition-all">
                          {isTrialActive ? `Subscribe — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial` : "Subscribe — $4.99/mo"}
                        </button>
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
            {activeTab === "chat" && !showHistory && (
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
            <motion.nav initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }} className="border-t border-slate-100/60 bg-white shrink-0 z-10">
              <div className="flex items-center justify-around px-6 py-2.5 pb-3">
                {([{ id: "chat" as Tab, icon: MessageSquare, label: "Chat" }, { id: "calendar" as Tab, icon: CalendarDays, label: "Calendar" }, { id: "vault" as Tab, icon: FolderLock, label: "Vault" }, { id: "coach" as Tab, icon: Users, label: "Coach" }]).map((tab) => (
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
              <motion.div className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center" onClick={() => !feedbackSending && setShowFeedback(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3" onClick={(e) => e.stopPropagation()} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  {feedbackSent ? (
                    <div className="flex flex-col items-center py-6"><Check size={32} className="text-emerald-500 mb-3" /><span className="text-base font-semibold text-slate-800">Thank you!</span><span className="text-sm text-slate-400">Your feedback helps us improve.</span></div>
                  ) : (<>
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">Send Feedback</h3>
                    <p className="text-sm text-slate-400 mb-4">Tell us what's working, what's not, or what you'd love to see.</p>
                    <textarea className="w-full border border-slate-200/60 rounded-xl px-4 py-3 text-base text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none placeholder:text-slate-400" placeholder="Your feedback..." value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={4} autoFocus />
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

          {/* Toast */}
          <AnimatePresence>
            {showToast && <motion.div className={`fixed bottom-[100px] left-1/2 -translate-x-1/2 ${toastIsError ? "bg-red-600" : "bg-slate-800"} text-white px-5 py-2 rounded-full text-[13px] font-medium z-[200] pointer-events-none`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toastMessage}</motion.div>}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
