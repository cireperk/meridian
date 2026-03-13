import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { marked } from "marked";
import { Upload, Check, Send, X, Edit3, Play, Pause, MessageSquare, User, BookOpen, ChevronRight, FileText, Heart, DollarSign, Users, Baby, Sparkles, Search, Square, Clock, Copy, Trash2, LogOut, Shield, HelpCircle, Info, ArrowLeft } from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./components/ui/utils";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

marked.setOptions({ breaks: true, gfm: true });

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

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
  { id: "considering", label: "Considering Divorce", emoji: "🤔" },
  { id: "during", label: "During Divorce", emoji: "📋" },
  { id: "after", label: "After Divorce", emoji: "🌅" },
  { id: "coparenting", label: "Co-Parenting", emoji: "👨‍👩‍👧" },
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

type Tab = "chat" | "learn" | "profile";

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

  useEffect(() => {
    if (!session?.refresh_token) return;
    authRefreshToken(session.refresh_token).then((data: any) => {
      if (data?.access_token) { const s = { ...session, token: data.access_token, refresh_token: data.refresh_token }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); }
    }).catch(() => {});
  }, []);

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      const data = await authSubmit(authEmail, authPassword);
      if (data.isNew) { setSession({ token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name: "" } }); setAuthView("onboarding"); }
      else { let name = ""; try { const p = await dbSelect("profiles", `id=eq.${data.user.id}&select=name`, data.access_token); if (p?.length) name = p[0].name; } catch {} const s = { token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name } }; setSession(s); localStorage.setItem("m_session", JSON.stringify(s)); }
    } catch (err: any) { setAuthError(err.message); } finally { setAuthLoading(false); }
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
  const openVideo = () => { setShowVideo(true); setVideoProgress(0); setVideoEnded(false); setTimeout(() => { const v = videoRef.current; if (v) { v.currentTime = 0; v.play().catch(() => {}); } }, 100); };
  const dismissVideo = () => { if (videoRef.current) videoRef.current.pause(); setShowVideo(false); };

  // --- App state ---
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [conversations, setConversations] = useState<any[]>(() => { try { const c = JSON.parse(localStorage.getItem("m_conversations") || "null"); if (c?.length) return c; return []; } catch { return []; } });
  const [activeConvId, setActiveConvId] = useState<string | null>(() => { try { const c = JSON.parse(localStorage.getItem("m_conversations") || "null"); return c?.length ? c[0].id : null; } catch { return null; } });
  const [showHistory, setShowHistory] = useState(false);
  const activeConv = conversations.find((c) => c.id === activeConvId);
  const messages = activeConv?.messages || [];

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [decreeText, setDecreeText] = useState(() => localStorage.getItem("m_decree_text") || "");
  const [decreeFileName, setDecreeFileName] = useState(() => localStorage.getItem("m_decree_name") || "");
  const [decreePages, setDecreePages] = useState(() => { try { return parseInt(localStorage.getItem("m_decree_pages") || "0") || 0; } catch { return 0; } });
  const [uploading, setUploading] = useState(false);

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [selectedPhase, setSelectedPhase] = useState("considering");
  const [searchQuery, setSearchQuery] = useState("");
  const [editName, setEditName] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { localStorage.setItem("m_conversations", JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    if (decreeText) localStorage.setItem("m_decree_text", decreeText); else localStorage.removeItem("m_decree_text");
    if (decreeFileName) localStorage.setItem("m_decree_name", decreeFileName); else localStorage.removeItem("m_decree_name");
    if (decreePages) localStorage.setItem("m_decree_pages", String(decreePages)); else localStorage.removeItem("m_decree_pages");
  }, [decreeText, decreeFileName, decreePages]);

  const resizeTextarea = useCallback(() => { const el = textareaRef.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }, []);

  const copyToClipboard = (text: string, idx: number) => { navigator.clipboard.writeText(text).then(() => { setCopied(idx); setShowToast(true); setTimeout(() => setCopied(null), 1500); setTimeout(() => setShowToast(false), 1500); }); };

  const extractPdfText = async (file: File) => {
    const buffer = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({ data: buffer }).promise; setDecreePages(pdf.numPages);
    const pages: string[] = []; for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); pages.push(content.items.map((item: any) => item.str).join(" ")); }
    return pages.join("\n\n");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setDecreeFileName(file.name); setUploading(true);
    try { let text: string; if (file.name.toLowerCase().endsWith(".pdf")) { text = await extractPdfText(file); } else { text = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (ev) => resolve(ev.target?.result as string); reader.onerror = () => reject(new Error("Failed")); reader.readAsText(file); }); } setDecreeText(text); }
    catch { setDecreeText(""); setDecreeFileName(""); setDecreePages(0); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleStop = () => { abortRef.current?.abort(); setStreaming(false); setLoading(false); };

  const handleSend = async (overrideMsg?: string) => {
    const userMsg = (overrideMsg || input).trim(); if (!userMsg || loading || streaming) return;
    setInput(""); if (textareaRef.current) textareaRef.current.style.height = "auto";
    let convId = activeConvId;
    if (!convId) { convId = `conv_${Date.now()}`; setConversations((prev) => [{ id: convId, title: userMsg.slice(0, 50), messages: [], createdAt: new Date().toISOString() }, ...prev]); setActiveConvId(convId); }
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { role: "user", content: userMsg }] } : c));
    setLoading(true);
    const decreeContext = decreeText ? `\n\nDIVORCE DECREE CONTENT:\n${decreeText.slice(0, 8000)}` : "\n\nNo decree uploaded yet.";
    const currentMsgs = conversations.find((c) => c.id === convId)?.messages || [];
    const history = [...currentMsgs, { role: "user", content: userMsg }].map((m: any) => ({ role: m.role, content: m.content }));
    const updateConvMessages = (fn: any) => { setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: typeof fn === "function" ? fn(c.messages) : fn } : c)); };
    const abort = new AbortController(); abortRef.current = abort;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `${SYSTEM_PROMPT}${decreeContext}`, messages: history }), signal: abort.signal });
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

  const spring = { type: "spring" as const, stiffness: 500, damping: 30 };

  // ============================================================
  return (
    <>
      <input ref={fileRef} type="file" accept=".txt,.md,.pdf" className="hidden" onChange={handleFileUpload} />

      {/* ==================== SPLASH ==================== */}
      <AnimatePresence mode="wait">
        {showSplash && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
            {/* Skip */}
            <motion.button initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }} onClick={enterApp} className="absolute top-6 right-6 text-sm text-slate-400 hover:text-slate-600 transition-colors z-20 px-3 py-1.5 rounded-lg hover:bg-slate-100/80">
              Skip
            </motion.button>

            <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-2xl mx-auto relative z-10">
              {/* Logo */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }} className="mb-12">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20" />
                  <span className="text-3xl font-semibold tracking-tight text-slate-900">Meridian</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }} className="text-5xl sm:text-6xl font-semibold tracking-tight text-slate-900 text-center mb-6 leading-[1.1]">
                Navigate divorce<br />
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">with calm and clarity</span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }} className="text-lg text-slate-600 text-center mb-12 max-w-xl leading-relaxed">
                Your companion through separation and beyond. Get guidance, understand your decree, and access resources designed for clarity.
              </motion.p>

              {/* Feature cards */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6, ease: "easeOut" }} className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl mb-12">
                {[
                  { icon: MessageSquare, title: "AI Guidance", desc: "Navigate situations with calm support" },
                  { icon: BookOpen, title: "Resources", desc: "Expert articles and practical tools" },
                  { icon: FileText, title: "Decree Help", desc: "Understand your legal documents" },
                ].map((card) => (
                  <div key={card.title} className="group relative overflow-hidden bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-6 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <card.icon className="w-6 h-6 text-emerald-600 mb-3 relative z-10" />
                    <h3 className="font-semibold text-slate-900 mb-1 relative z-10">{card.title}</h3>
                    <p className="text-sm text-slate-600 relative z-10">{card.desc}</p>
                  </div>
                ))}
              </motion.div>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.6, ease: "easeOut" }} className="flex flex-col sm:flex-row items-center gap-4">
                <Button size="lg" onClick={enterApp} className="w-full sm:w-auto h-12 px-8 text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                  Get Started
                </Button>
                <button onClick={openVideo} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors group px-4 py-2 rounded-lg hover:bg-slate-100/80">
                  <Play className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  Watch introduction
                </button>
              </motion.div>
            </div>

            {/* Trust footer */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.5 }} className="pb-8 text-center relative z-10">
              <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <span className="text-xs text-slate-700 font-medium">Private & Confidential</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500">Not legal advice</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== VIDEO OVERLAY ==================== */}
      <AnimatePresence>
        {showVideo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={dismissVideo}>
            <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-white/70 hover:text-white transition-all" onClick={dismissVideo}><X className="w-5 h-5" /></motion.button>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.4, ease: "easeOut" }} className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="text-xs font-medium tracking-widest uppercase text-white/40 text-center mb-4">A message from the founder</div>
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 shadow-2xl border border-white/10">
                <video ref={videoRef} className="w-full block" src="/welcome.mp4" playsInline onTimeUpdate={() => { const v = videoRef.current; if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100); }} onEnded={() => { setVideoProgress(100); setVideoEnded(true); }} />
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                  <motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${videoProgress}%` }} transition={{ duration: 0.2 }} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== AUTH ==================== */}
      {SUPABASE_URL && (!session?.user?.name || authView.startsWith("onboard-")) && !showSplash ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center px-6 bg-white overflow-hidden z-40">
          <motion.div className="max-w-[400px] w-full flex flex-col items-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
            <div className="flex items-center gap-2.5 mb-10">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm" />
              <span className="text-lg font-semibold tracking-tight text-slate-900">Meridian</span>
            </div>

            <AnimatePresence mode="wait">
              {authView === "onboarding" ? (
                <motion.div key="name" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">One more step</h2>
                  <p className="text-sm text-slate-500 mb-8 text-center">What should we call you?</p>
                  <div className="w-full flex flex-col gap-3">
                    <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Your first name" value={authName} onChange={(e) => setAuthName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleOnboarding()} autoFocus />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleOnboarding} disabled={!authName.trim() || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25">{authLoading ? "Saving..." : "Continue"}</Button>
                  </div>
                </motion.div>
              ) : authView === "onboard-modes" ? (
                <motion.div key="modes" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="flex gap-1.5 mb-6">{[0,1,2].map(i => <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i === 0 ? "bg-emerald-600" : "bg-slate-200")} />)}</div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">Three ways to help</h2>
                  <p className="text-sm text-slate-500 mb-6 text-center">Meridian works in three modes, each designed for a different moment.</p>
                  <div className="w-full flex flex-col gap-3 mb-6">
                    {[{ icon: MessageSquare, name: "Guidance", hint: "Talk through conflicts, boundaries, and tough co-parenting moments." }, { icon: FileText, name: "Decree Q&A", hint: "Upload your decree and ask questions in plain English." }, { icon: Sparkles, name: "Draft", hint: "Get help writing calm, neutral messages to your co-parent." }].map((m) => (
                      <div key={m.name} className="flex items-start gap-3.5 p-4 rounded-xl bg-white border border-slate-200/60">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0"><m.icon size={18} className="text-white" /></div>
                        <div><div className="text-sm font-semibold text-slate-900 mb-0.5">{m.name}</div><div className="text-[13px] text-slate-500 leading-snug">{m.hint}</div></div>
                      </div>
                    ))}
                  </div>
                  <Button onClick={() => setAuthView("onboard-decree")} className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25">Continue</Button>
                </motion.div>
              ) : authView === "onboard-decree" ? (
                <motion.div key="decree" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="flex gap-1.5 mb-6">{[0,1,2].map(i => <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i <= 1 ? "bg-emerald-600" : "bg-slate-200", i === 0 && "cursor-pointer")} onClick={i === 0 ? () => setAuthView("onboard-modes") : undefined} />)}</div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-5"><FileText size={28} className="text-white" /></div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">Upload your decree</h2>
                  <p className="text-sm text-slate-500 mb-6 text-center leading-relaxed">If you have your divorce decree handy, you can upload it now. You can always add it later.</p>
                  {decreeFileName ? (
                    <div className="w-full py-8 px-6 border-2 border-emerald-200 bg-emerald-50 rounded-2xl flex flex-col items-center gap-2 mb-4 text-emerald-700"><Check size={24} /><span className="text-sm font-medium">{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span></div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()} className="w-full py-8 px-6 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all mb-4 text-slate-400">
                      <Upload size={24} /><span className="text-sm font-medium text-slate-600">Tap to upload PDF or text file</span><span className="text-xs text-slate-400">.pdf, .txt, or .md</span>
                    </button>
                  )}
                  <Button onClick={() => setAuthView("onboard-ready")} className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25">{decreeFileName ? "Continue" : "Skip for now"}</Button>
                </motion.div>
              ) : authView === "onboard-ready" ? (
                <motion.div key="ready" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="flex gap-1.5 mb-6">{[0,1,2].map(i => <div key={i} className={cn("w-1.5 h-1.5 rounded-full bg-emerald-600", i < 2 && "cursor-pointer")} onClick={i === 0 ? () => setAuthView("onboard-modes") : i === 1 ? () => setAuthView("onboard-decree") : undefined} />)}</div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-4 text-center">Just so you know</h2>
                  <p className="text-sm text-slate-500 mb-3 text-center leading-relaxed max-w-[300px]">Meridian is your companion through this — not a lawyer and not a therapist. Think of it as a calm, thoughtful friend who's always in your corner.</p>
                  <p className="text-sm text-slate-500 mb-8 text-center leading-relaxed max-w-[300px]">For real legal decisions, loop in your attorney. For everything else, we're here.</p>
                  <Button onClick={finishOnboarding} className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25">Let's go{firstName ? `, ${firstName}` : ""}</Button>
                </motion.div>
              ) : (
                <motion.div key="auth" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">Welcome to Meridian</h2>
                  <p className="text-sm text-slate-500 mb-8 text-center">Sign in or create an account to continue.</p>
                  <div className="w-full flex flex-col gap-3">
                    <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type="email" placeholder="Email address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoFocus />
                    <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleAuth} disabled={!authEmail || !authPassword || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 disabled:opacity-40">{authLoading ? "Loading..." : "Continue"}</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && (
        <>
          {/* ==================== MAIN APP ==================== */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-dvh flex flex-col max-w-3xl mx-auto bg-white">

            {/* Header */}
            <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }} className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur-xl sticky top-0 z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm" />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Meridian</span>
              </div>
              <AnimatePresence>
                {activeTab === "chat" && hasConversation && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"><Clock className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (streaming) handleStop(); setActiveConvId(null); setShowHistory(false); }} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"><Edit3 className="w-4 h-4 mr-1.5" />New chat</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* CHAT */}
                {activeTab === "chat" && (
                  <motion.div key="chat" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-24">
                    {/* Decree chip */}
                    <div className="mb-6">
                      <AnimatePresence mode="wait">
                        {decreeFileName ? (
                          <motion.div key="uploaded" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 shadow-sm">
                            {uploading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full" /> : <Check className="w-4 h-4" />}
                            <span className="text-sm font-medium">{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span>
                            <button className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 transition-all ml-1" onClick={() => { setDecreeText(""); setDecreeFileName(""); setDecreePages(0); }}><X className="w-3.5 h-3.5" /></button>
                          </motion.div>
                        ) : (
                          <motion.button key="upload" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/30 transition-all" onClick={() => fileRef.current?.click()}>
                            <Upload className="w-4 h-4" /><span className="text-sm font-medium">Upload your decree</span>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Messages */}
                    <AnimatePresence mode="popLayout">
                      {!hasConversation ? (
                        <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }} className="flex flex-col items-center justify-center text-center py-12">
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-6 shadow-sm">
                            <MessageSquare className="w-8 h-8 text-emerald-600" />
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-3">What's on your mind?</h2>
                          <p className="text-base text-slate-500 max-w-md leading-relaxed mb-8">Share what you're navigating, and I'll help you find clarity with calm and grounded guidance.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                            {QUICK_ACTIONS.map((action) => { const Icon = action.icon; return (
                              <motion.button key={action.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleQuickAction(action.id)} className="flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200/60 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left group">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center group-hover:from-emerald-100 group-hover:to-teal-50 transition-all"><Icon className="w-4 h-4 text-slate-600 group-hover:text-emerald-600 transition-colors" /></div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{action.label}</span>
                                <ChevronRight className="w-4 h-4 text-slate-400 ml-auto group-hover:text-emerald-600 transition-colors" />
                              </motion.button>
                            ); })}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="space-y-6">
                          {messages.map((msg: any, i: number) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
                              {msg.role === "user" ? (
                                <div className="max-w-[85%] rounded-2xl text-[15px] leading-relaxed bg-gradient-to-br from-slate-900 to-slate-800 text-white px-5 py-3.5 shadow-lg shadow-slate-900/10 whitespace-pre-wrap">{msg.content}</div>
                              ) : (
                                <>
                                  <div className="max-w-[85%] rounded-2xl text-[15px] leading-relaxed bg-white border border-slate-200/60 text-slate-700 px-5 py-3.5 shadow-sm m-md" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") }} />
                                  {msg.content && (
                                    <button onClick={() => copyToClipboard(msg.content, i)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-md transition-all mt-0.5">
                                      {copied === i ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                                    </button>
                                  )}
                                </>
                              )}
                            </motion.div>
                          ))}
                          {loading && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                              <div className="bg-white border border-slate-200/60 rounded-2xl px-5 py-3.5 shadow-sm">
                                <div className="flex gap-1.5">
                                  {[0, 0.2, 0.4].map((d) => <motion.div key={d} animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity, delay: d }} className="w-2 h-2 rounded-full bg-slate-400" />)}
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
                  <motion.div key="learn" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-24">
                    <div className="mb-6 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" placeholder="Search resources..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-6 px-6 scrollbar-hide">
                      {JOURNEY_PHASES.map((phase) => (
                        <button key={phase.id} onClick={() => setSelectedPhase(phase.id)} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0", selectedPhase === phase.id ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                          <span>{phase.emoji}</span><span>{phase.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {RESOURCE_TOPICS.map((topic) => { const Icon = topic.icon; return (
                        <button key={topic.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all">
                          <Icon className="w-3.5 h-3.5" />{topic.label}
                        </button>
                      ); })}
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-4">{JOURNEY_PHASES.find((p) => p.id === selectedPhase)?.label}</h3>
                      {(MOCK_RESOURCES[selectedPhase] || []).filter((r) => !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase())).map((resource, idx) => (
                        <motion.button key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="w-full bg-white border border-slate-200/60 rounded-xl p-4 hover:border-emerald-300 hover:shadow-md transition-all text-left group">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <h4 className="font-medium text-slate-900 mb-1 group-hover:text-emerald-700 transition-colors">{resource.title}</h4>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="px-2 py-0.5 bg-slate-100 rounded-md">{RESOURCE_TOPICS.find((t) => t.id === resource.topic)?.label}</span>
                                <span>•</span><span>{resource.readTime}</span>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors flex-shrink-0" />
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* PROFILE */}
                {activeTab === "profile" && (
                  <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-24">
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Profile</h2>

                    {/* Name */}
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Name</h3>
                      <input className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" value={editName || session?.user?.name || ""} onChange={(e) => setEditName(e.target.value)} onBlur={() => { if (editName.trim() && editName.trim() !== session?.user?.name) handleUpdateName(editName); }} onKeyDown={(e) => { if (e.key === "Enter") { handleUpdateName(editName); (e.target as HTMLInputElement).blur(); } }} />
                      {session?.user?.email && <div className="text-xs text-slate-400 mt-2">{session.user.email}</div>}
                    </div>

                    {/* Decree */}
                    <div className="mb-8">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Your Decree</h3>
                      {decreeFileName ? (
                        <div className="bg-white border border-slate-200/60 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FileText className="w-5 h-5 text-emerald-600" /></div>
                            <div className="flex-1"><div className="font-medium text-slate-900 text-sm">{decreeFileName}</div>{decreePages > 0 && <div className="text-xs text-slate-500">{decreePages} pages</div>}</div>
                            <button onClick={() => { setDecreeText(""); setDecreeFileName(""); setDecreePages(0); }} className="text-sm text-slate-500 hover:text-red-600 transition-colors">Remove</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => fileRef.current?.click()} className="w-full bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-emerald-400 hover:bg-emerald-50/30 transition-all">
                          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" /><div className="text-sm font-medium text-slate-600">Upload decree</div><div className="text-xs text-slate-400 mt-1">PDF or text file</div>
                        </button>
                      )}
                    </div>

                    {/* Conversations */}
                    {conversations.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-sm font-medium text-slate-700 mb-3">Recent Conversations</h3>
                        <div className="space-y-2">
                          {conversations.slice(0, 5).map((c) => (
                            <button key={c.id} onClick={() => { setActiveConvId(c.id); setActiveTab("chat"); }} className="w-full bg-white border border-slate-200/60 rounded-xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all text-left flex items-center gap-3">
                              <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="flex-1 min-w-0"><div className="text-sm text-slate-700 truncate">{c.title || "New conversation"}</div><div className="text-xs text-slate-400">{c.messages?.length || 0} messages</div></div>
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Settings */}
                    <div className="mb-8">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Settings</h3>
                      <div className="space-y-2">
                        {["Privacy & Data", "Help & Support", "About Meridian"].map((label) => (
                          <button key={label} className="w-full bg-white border border-slate-200/60 rounded-xl p-4 hover:border-slate-300 hover:bg-slate-50 transition-all text-left flex items-center justify-between">
                            <span className="text-sm text-slate-700">{label}</span><ChevronRight className="w-4 h-4 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sign out */}
                    <button onClick={() => setShowSignOutConfirm(true)} className="w-full py-3 border border-slate-200 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2">
                      <LogOut size={15} /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input - chat only */}
            {activeTab === "chat" && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }} className="px-6 py-5 border-t border-slate-100 bg-white/80 backdrop-blur-xl sticky bottom-16">
                <div className="flex items-end gap-3 bg-slate-50/80 rounded-2xl px-5 py-4 border border-slate-200/60 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all duration-200">
                  <Textarea ref={textareaRef} className="flex-1 border-0 bg-transparent p-0 text-[15px] text-slate-900 placeholder:text-slate-400 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[120px]" placeholder="What's on your mind?" value={input} onChange={(e) => { setInput(e.target.value); resizeTextarea(); }} onKeyDown={handleKeyDown} rows={1} />
                  {streaming ? (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" onClick={handleStop} className="rounded-xl bg-red-500 hover:bg-red-600 flex-shrink-0"><Square className="w-3 h-3" fill="currentColor" /></Button>
                    </motion.div>
                  ) : (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm flex-shrink-0" onClick={() => handleSend()} disabled={!input.trim() || loading}><Send className="w-4 h-4" /></Button>
                    </motion.div>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 text-center mt-3 flex items-center justify-center gap-0">
                  Not legal advice — always consult an attorney.
                  <span className="mx-1.5">·</span>
                  <button onClick={() => setShowFeedback(true)} className="text-slate-400 hover:text-slate-600 transition-colors">Feedback?</button>
                </div>
              </motion.div>
            )}

            {/* Bottom Nav */}
            <motion.nav initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }} className="border-t border-slate-100 bg-white/95 backdrop-blur-xl sticky bottom-0 z-10">
              <div className="flex items-center justify-around px-6 py-3">
                {([{ id: "chat" as Tab, icon: MessageSquare, label: "Chat" }, { id: "learn" as Tab, icon: BookOpen, label: "Learn" }, { id: "profile" as Tab, icon: User, label: "You" }]).map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-all", activeTab === tab.id ? "text-emerald-600" : "text-slate-400 hover:text-slate-600")}>
                    <tab.icon className="w-5 h-5" /><span className="text-[11px] font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
            </motion.nav>
          </motion.div>

          {/* History drawer */}
          <AnimatePresence>
            {showHistory && (<>
              <motion.div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowHistory(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div className="fixed top-0 left-0 bottom-0 w-[300px] max-w-[85vw] bg-white z-[51] flex flex-col shadow-xl" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={spring}>
                <div className="px-4 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
                  <span className="text-[15px] font-semibold text-slate-800">Conversations</span>
                  <button onClick={() => setShowHistory(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><X size={14} /></button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {conversations.map((c) => (
                    <button key={c.id} className={cn("w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors group relative pr-9", c.id === activeConvId && "bg-slate-50")} onClick={() => { setActiveConvId(c.id); setShowHistory(false); }}>
                      <div className="text-sm font-medium text-slate-700 truncate">{c.title || "New conversation"}</div>
                      <div className="text-[12px] text-slate-400">{c.messages?.length || 0} messages</div>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setConversations((prev) => prev.filter((x) => x.id !== c.id)); if (activeConvId === c.id) setActiveConvId(null); }}><X size={12} /></span>
                    </button>
                  ))}
                  {conversations.length === 0 && <div className="py-6 text-center text-sm text-slate-300">No conversations yet</div>}
                </div>
              </motion.div>
            </>)}
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
                    <textarea className="w-full border border-slate-200/60 rounded-xl px-4 py-3 text-sm text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none placeholder:text-slate-400" placeholder="Your feedback..." value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={4} autoFocus />
                    <Button onClick={handleFeedbackSubmit} disabled={!feedbackText.trim() || feedbackSending} className="w-full mt-3 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 disabled:opacity-40">{feedbackSending ? "Sending..." : "Submit Feedback"}</Button>
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
