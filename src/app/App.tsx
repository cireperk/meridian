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

const JOURNEY_PHASES = [
  { id: "during", label: "During Divorce" },
  { id: "after", label: "After Divorce" },
  { id: "coparenting", label: "Co-Parenting" },
] as const;

const RESOURCE_TOPICS = [
  { id: "legal", label: "Legal Basics", icon: FileText, color: "from-blue-500 to-blue-600" },
  { id: "emotional", label: "Emotional Support", icon: Heart, color: "from-pink-500 to-rose-600" },
  { id: "financial", label: "Financial Planning", icon: DollarSign, color: "from-green-500 to-emerald-600" },
  { id: "children", label: "Children & Family", icon: Baby, color: "from-purple-500 to-purple-600" },
  { id: "coparenting", label: "Co-Parenting Tools", icon: Users, color: "from-teal-500 to-cyan-600" },
] as const;

const MOCK_RESOURCES: Record<string, { title: string; topic: string; readTime: string }[]> = {
  considering: [
    { title: "Is Divorce Right for Me?", topic: "emotional", readTime: "8 min" },
    { title: "Understanding Divorce Costs", topic: "financial", readTime: "6 min" },
    { title: "How to Tell Your Spouse", topic: "emotional", readTime: "5 min" },
  ],
  during: [
    { title: "Preparing for Mediation", topic: "legal", readTime: "10 min" },
    { title: "Protecting Your Finances During Divorce", topic: "financial", readTime: "12 min" },
    { title: "Supporting Children Through Divorce", topic: "children", readTime: "9 min" },
    { title: "Creating a Parenting Plan", topic: "coparenting", readTime: "15 min" },
  ],
  after: [
    { title: "Your First Week Post-Divorce", topic: "emotional", readTime: "7 min" },
    { title: "Establishing New Routines", topic: "children", readTime: "8 min" },
    { title: "Managing Shared Expenses", topic: "financial", readTime: "6 min" },
  ],
  coparenting: [
    { title: "Effective Co-Parent Communication", topic: "coparenting", readTime: "10 min" },
    { title: "Handling Pickup & Dropoff", topic: "coparenting", readTime: "5 min" },
    { title: "Holidays and Special Events", topic: "coparenting", readTime: "8 min" },
    { title: "When to Modify Your Decree", topic: "legal", readTime: "12 min" },
  ],
};

type Tab = "chat" | "calendar" | "vault" | "learn" | "profile";

// ============================================================
export default function App() {
  // --- Auth ---
  const [session, setSession] = useState<any>(() => { try { return JSON.parse(localStorage.getItem("m_session") || "null"); } catch { return null; } });
  const [authView, setAuthView] = useState("main");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [viewingArticle, setViewingArticle] = useState<{ title: string; topic: string; readTime: string } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, "up" | "down">>({});

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
        // Load conversations from Supabase
        if (session.user?.id) {
          dbSelect("conversations", `user_id=eq.${session.user.id}&order=updated_at.desc`, data.access_token).then((rows: any) => {
            if (rows?.length) {
              const convs = rows.map((r: any) => ({ id: r.id, title: r.title, messages: r.messages || [], createdAt: r.created_at }));
              setConversations(convs);
              localStorage.setItem("m_conversations", JSON.stringify(convs));
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
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
        const s = { token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s));
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

  const handleSignOut = () => { setSession(null); localStorage.removeItem("m_session"); localStorage.removeItem("m_conversations"); setConversations([]); setActiveConvId(null); setAuthView("main"); };

  // --- Splash ---
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem("m_session"));
  const [showVideo, setShowVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const enterApp = () => setShowSplash(false);
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

  const [selectedPhase, setSelectedPhase] = useState(() => localStorage.getItem("m_phase") || "during");
  const [searchQuery, setSearchQuery] = useState("");
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

  const copyToClipboard = (text: string, idx: number) => { navigator.clipboard.writeText(text).then(() => { setCopied(idx); setShowToast(true); setTimeout(() => setCopied(null), 1500); setTimeout(() => setShowToast(false), 1500); }); };

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
    } catch (e: any) { if (e.name === "AbortError") return; updateConvMessages((prev: any[]) => [...prev, { role: "assistant", content: "Connection error. Please try again." }]); setLoading(false); setStreaming(false); }
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
    setVaultUploading(true);
    try {
      const storagePath = `${session.user.id}/${crypto.randomUUID()}_${file.name}`;
      await dbStorageUpload("documents", storagePath, file, session.token);
      // Extract text content for chat context
      let textContent: string | null = null;
      try { textContent = await extractFileText(file); } catch {}
      await sbFetch("/rest/v1/documents", { method: "POST", body: { user_id: session.user.id, category: vaultUploadCategory, file_name: file.name, file_size: file.size, mime_type: file.type, storage_path: storagePath, text_content: textContent?.slice(0, 50000) || null }, token: session.token });
      await loadVaultDocs();
    } catch (err: any) { alert(err?.message || "Upload failed"); }
    finally { setVaultUploading(false); setVaultUploadCategory(null); if (vaultFileRef.current) vaultFileRef.current.value = ""; }
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

  const filteredVaultDocs = vaultCategory === "all" ? vaultDocs : vaultDocs.filter(d => d.category === vaultCategory);

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
          <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-white via-emerald-50/20 to-white overflow-hidden">
            {/* Soft ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-100/30 to-cyan-50/20 blur-3xl" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-xl mx-auto relative z-10">
              {/* Logo */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-8">
                <div className="flex items-center gap-4">
                  <Logo size="lg" />
                  <span className="font-sans font-medium text-2xl tracking-normal text-slate-800">Meridian</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="text-3xl sm:text-5xl font-light tracking-tight text-slate-800 text-center mb-3 leading-[1.15]">
                Navigate what's next<br />
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent font-normal">with calm and clarity</span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="text-sm text-slate-500 text-center mb-8 max-w-sm leading-relaxed">
                A grounding companion for every stage — from navigating divorce to building a stronger co-parenting relationship.
              </motion.p>

              {/* Feature cards — always horizontal */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex flex-row gap-3 w-full max-w-md mb-8">
                {[
                  { icon: MessageSquare, title: "Guidance" },
                  { icon: BookOpen, title: "Resources" },
                  { icon: FileText, title: "Decree Help" },
                ].map((card, idx) => (
                  <motion.div key={card.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + idx * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-1 bg-white/70 backdrop-blur-sm border border-slate-200/40 rounded-2xl p-4 text-center">
                    <card.icon className="w-5 h-5 text-emerald-500 mx-auto mb-2" strokeWidth={1.5} />
                    <h3 className="text-xs font-medium text-slate-800">{card.title}</h3>
                  </motion.div>
                ))}
              </motion.div>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-4 w-full max-w-xs">
                <Button size="lg" onClick={enterApp} className="w-full h-13 px-8 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                  Get Started
                </Button>
                <p className="text-[11px] text-slate-400 -mt-2">Free to start. No credit card needed.</p>
                <button onClick={openVideo} className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-all duration-300 group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:border-emerald-300 group-hover:bg-emerald-50 transition-all duration-300">
                      <Play className="w-3 h-3 ml-0.5 group-hover:text-emerald-600 transition-colors" />
                    </div>
                    <span className="text-sm">Hear why we built Meridian</span>
                  </div>
                  <span className="text-[11px] text-slate-300">A 1-minute message from our founder</span>
                </button>
              </motion.div>
            </div>

            {/* Trust footer */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} className="pb-6 text-center relative z-10 shrink-0">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <span>Private & confidential</span>
                <span className="text-slate-300">·</span>
                <span>Not legal advice</span>
              </div>
            </motion.div>
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

      {/* ==================== AUTH ==================== */}
      {SUPABASE_URL && (!session?.user?.name || authView.startsWith("onboard-")) && !showSplash ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center px-8 bg-gradient-to-b from-white via-emerald-50/20 to-white overflow-hidden z-40">
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-100/30 to-cyan-50/20 blur-3xl pointer-events-none" />
          <motion.div className="max-w-[380px] w-full flex flex-col items-center relative z-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
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
                      <button key={option.id} onClick={() => { setSelectedPhase(option.id); localStorage.setItem("m_phase", option.id); setAuthView("onboard-decree"); }} className="w-full flex items-start gap-3.5 p-4 rounded-xl bg-white border border-slate-200/60 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all text-left group">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                        <div><div className="text-sm font-medium text-slate-800 mb-0.5">{option.label}</div><div className="text-[13px] text-slate-400 leading-snug">{option.desc}</div></div>
                      </button>
                    ))}
                  </div>
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
              ) : authView === "signin" || authView === "signup" ? (
                <motion.div key={authView} className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">{authView === "signin" ? "Welcome back" : "Create your account"}</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">{authView === "signin" ? "Let's pick up where you left off." : "You've taken the first step. Let's make the road ahead clearer."}</p>
                  <div className="w-full flex flex-col gap-3">
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
                      <div className="flex justify-end px-1 -mt-1">
                        <button onClick={() => { setAuthView("forgot"); setAuthError(""); setResetSent(false); }} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">Forgot password?</button>
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
              ) : (
                <motion.div key="chooser" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Welcome to Meridian</h2>
                  <p className="text-sm text-slate-400 mb-10 text-center">From divorce to co-parenting — find your footing.</p>
                  <div className="w-full flex flex-col gap-3">
                    <Button onClick={() => { setAuthView("signup"); setAuthError(""); setAuthEmail(""); setAuthPassword(""); }} className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 text-[15px]">Create Account</Button>
                    <Button onClick={() => { setAuthView("signin"); setAuthError(""); setAuthEmail(""); setAuthPassword(""); }} variant="outline" className="w-full h-12 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-[15px]">Sign In</Button>
                  </div>
                  <button onClick={() => setShowSplash(true)} className="mt-8 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && (
        <>
          {/* ==================== MAIN APP ==================== */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-full flex flex-col max-w-3xl mx-auto bg-white overflow-hidden">

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
                      {decreeFileName && (
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors">
                          {uploading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-3 h-3 border-[1.5px] border-emerald-600 border-t-transparent rounded-full" /> : <Check className="w-3 h-3" />}
                          Decree
                        </button>
                      )}
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
                {activeTab === "learn" && (
                  <motion.div key="learn" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    <AnimatePresence mode="wait">
                      {viewingArticle ? (
                        <motion.div key="article" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                          <button onClick={() => setViewingArticle(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"><ArrowLeft className="w-4 h-4" /> Back to resources</button>
                          <h2 className="text-xl font-light tracking-tight text-slate-800 mb-2">{viewingArticle.title}</h2>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md">{RESOURCE_TOPICS.find((t) => t.id === viewingArticle.topic)?.label}</span>
                            <span>•</span><span>{viewingArticle.readTime} read</span>
                          </div>
                          <div className="bg-slate-50/80 border border-slate-200/40 rounded-2xl p-8 text-center">
                            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
                            <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">This article is coming soon. We're working with experts to bring you thoughtful, evidence-based content.</p>
                            <p className="text-xs text-slate-400 mt-3">Want to be notified when it's ready? Let us know via feedback.</p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <div className="mb-6 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" placeholder="Search by topic, question, or keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-6 px-6 scrollbar-hide">
                            {JOURNEY_PHASES.map((phase) => (
                              <button key={phase.id} onClick={() => { setSelectedPhase(phase.id); localStorage.setItem("m_phase", phase.id); }} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0", selectedPhase === phase.id ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                                <span>{phase.label}</span>
                              </button>
                            ))}
                          </div>
                          <div className="space-y-3">
                            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">{JOURNEY_PHASES.find((p) => p.id === selectedPhase)?.label}</h3>
                            {(MOCK_RESOURCES[selectedPhase] || []).filter((r) => !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase())).map((resource, idx) => (
                              <motion.button key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} onClick={() => setViewingArticle(resource)} className="w-full bg-white border border-slate-200/60 rounded-xl p-4 hover:border-emerald-300 hover:shadow-md transition-all text-left group">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-slate-800 mb-1 group-hover:text-emerald-700 transition-colors">{resource.title}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                      <span className="px-2 py-0.5 bg-slate-100 rounded-md">{RESOURCE_TOPICS.find((t) => t.id === resource.topic)?.label}</span>
                                      <span>•</span><span>{resource.readTime}</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                                </div>
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                            <p className="text-sm text-slate-400 mb-3">No events</p>
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
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center">
                        <FolderLock className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                        <p className="text-sm text-slate-400 mb-1">{vaultCategory === "all" ? "No documents yet" : "No documents in this category"}</p>
                        <p className="text-xs text-slate-300">Upload your first document to get started</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-3">
                        {filteredVaultDocs.map((doc: any, idx: number) => (
                          <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04, duration: 0.3 }}
                            className="bg-white border border-slate-200/60 rounded-xl p-4 hover:border-slate-300/60 transition-all">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-slate-700 truncate">{doc.file_name}</h4>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-600 rounded-md">{VAULT_CATEGORIES.find(c => c.id === doc.category)?.label || doc.category}</span>
                                  <span className="text-[11px] text-slate-300">{formatFileSize(doc.file_size)}</span>
                                  <span className="text-[11px] text-slate-300">·</span>
                                  <span className="text-[11px] text-slate-300">{new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <a href={`${SUPABASE_URL}/storage/v1/object/authenticated/documents/${doc.storage_path}`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    fetch(`${SUPABASE_URL}/storage/v1/object/documents/${doc.storage_path}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.token}` } })
                                      .then(r => r.blob()).then(blob => { const url = URL.createObjectURL(blob); window.open(url, "_blank"); }).catch(() => {});
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                                  <Eye className="w-4 h-4" />
                                </a>
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

                    {/* Activity summary */}
                    <div className="flex gap-3 mb-6">
                      {[
                        { label: "Conversations", value: conversations.length },
                        { label: "Documents", value: vaultDocs.length },
                      ].map((stat) => (
                        <div key={stat.label} className="flex-1 bg-slate-50/80 border border-slate-200/40 rounded-xl p-3.5 text-center">
                          <div className="text-lg font-medium text-slate-800">{stat.value}</div>
                          <div className="text-xs text-slate-400">{stat.label}</div>
                        </div>
                      ))}
                    </div>

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
                          { id: "privacy", icon: Shield, label: "Privacy & Data", content: "Your conversations and documents are encrypted and stored securely. Meridian never shares your personal information with third parties. You can delete your account and all associated data at any time by contacting support." },
                          { id: "help", icon: HelpCircle, label: "Help & Support", content: "Have a question or running into an issue? Reach out to us at support@getmeridian.app and we'll get back to you within 24 hours." },
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

                    {/* Feedback + Sign out */}
                    <div className="flex flex-col gap-2">
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
                {([{ id: "chat" as Tab, icon: MessageSquare, label: "Chat" }, { id: "calendar" as Tab, icon: CalendarDays, label: "Calendar" }, { id: "vault" as Tab, icon: FolderLock, label: "Vault" }, { id: "learn" as Tab, icon: BookOpen, label: "Learn" }]).map((tab) => (
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
            {showToast && <motion.div className="fixed bottom-[100px] left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-2 rounded-full text-[13px] font-medium z-[200] pointer-events-none" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>Copied!</motion.div>}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
