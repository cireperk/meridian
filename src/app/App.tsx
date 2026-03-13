import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { marked } from "marked";
import { Upload, Check, Send, X, Edit3, Play, Pause, MessageSquare, User, BookOpen, ChevronRight, FileText, Heart, DollarSign, Users, Baby, Sparkles, Search, Square, Clock, Copy, Trash2, LogOut, Shield, HelpCircle, Info, ArrowLeft, Eye, EyeOff, ThumbsUp, ThumbsDown } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [viewingArticle, setViewingArticle] = useState<{ title: string; topic: string; readTime: string } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, "up" | "down">>({});

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
  const [videoMuted, setVideoMuted] = useState(true);
  const openVideo = () => { setShowVideo(true); setVideoProgress(0); setVideoEnded(false); setVideoPaused(false); setVideoMuted(true); };
  const dismissVideo = () => { if (videoRef.current) videoRef.current.pause(); setShowVideo(false); };
  const [videoPaused, setVideoPaused] = useState(false);
  const unmuteVideo = (e: React.MouseEvent) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = false; setVideoMuted(false); } };
  const togglePlayPause = () => { const v = videoRef.current; if (!v || videoEnded) return; if (v.paused) { v.play().catch(() => {}); setVideoPaused(false); } else { v.pause(); setVideoPaused(true); } };

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
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.6 }} className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-white via-emerald-50/20 to-white overflow-y-auto">
            {/* Soft ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-100/30 to-cyan-50/20 blur-3xl" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-xl mx-auto relative z-10">
              {/* Logo */}
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="mb-16">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/15" />
                  <span className="text-3xl font-semibold tracking-tight text-slate-800" style={{ fontFamily: "'Dancing Script', cursive" }}>Meridian</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="text-4xl sm:text-5xl font-light tracking-tight text-slate-800 text-center mb-5 leading-[1.15]">
                Navigate divorce<br />
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent font-normal">with calm and clarity</span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="text-base text-slate-500 text-center mb-14 max-w-sm leading-relaxed">
                A gentle companion for the journey ahead. Guidance, resources, and clarity — whenever you need it.
              </motion.p>

              {/* Feature cards — softer, more minimal */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col sm:flex-row gap-3.5 w-full max-w-md mb-14">
                {[
                  { icon: MessageSquare, title: "Guidance", desc: "Thoughtful support when it matters" },
                  { icon: BookOpen, title: "Resources", desc: "Articles and tools for clarity" },
                  { icon: FileText, title: "Decree Help", desc: "Your documents, in plain English" },
                ].map((card, idx) => (
                  <motion.div key={card.title} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + idx * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex-1 bg-white/70 backdrop-blur-sm border border-slate-200/40 rounded-2xl p-5 text-center">
                    <card.icon className="w-5 h-5 text-emerald-500 mx-auto mb-2.5" strokeWidth={1.5} />
                    <h3 className="text-sm font-medium text-slate-800 mb-1">{card.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-5 w-full max-w-xs">
                <Button size="lg" onClick={enterApp} className="w-full h-13 px-8 text-base font-medium bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-500 rounded-2xl">
                  Get Started
                </Button>
                <button onClick={openVideo} className="flex items-center gap-2.5 text-sm text-slate-400 hover:text-slate-600 transition-all duration-300 group">
                  <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:border-emerald-300 group-hover:bg-emerald-50 transition-all duration-300">
                    <Play className="w-3 h-3 ml-0.5 group-hover:text-emerald-600 transition-colors" />
                  </div>
                  Watch a message from our founder
                </button>
              </motion.div>
            </div>

            {/* Trust footer */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.8 }} className="pb-10 text-center relative z-10">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <span>Private & confidential</span>
                <span className="text-slate-300">·</span>
                <span>Not legal advice</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== VIDEO OVERLAY ==================== */}
      {showVideo && (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6" onClick={dismissVideo}>
          <button className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/50 hover:text-white/80 transition-all duration-300" onClick={dismissVideo}><X className="w-5 h-5" /></button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-medium tracking-[0.2em] uppercase text-white/30 text-center mb-5">A message from the founder</div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 shadow-2xl border border-white/10 cursor-pointer" onClick={togglePlayPause}>
              <video ref={videoRef} className="w-full block" src="/welcome.mp4" playsInline autoPlay muted onTimeUpdate={() => { const v = videoRef.current; if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100); }} onEnded={() => { setVideoProgress(100); setVideoEnded(true); }} />
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${videoProgress}%` }} />
              </div>
              {videoPaused && !videoEnded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              )}
              {videoMuted && !videoPaused && (
                <button className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs font-medium flex items-center gap-1.5 hover:bg-black/80 transition-colors z-10" onClick={unmuteVideo}>
                  🔇 Tap to unmute
                </button>
              )}
              {videoEnded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <button className="px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-sm font-medium hover:bg-white/20 transition-colors" onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.currentTime = 0; setVideoEnded(false); setVideoProgress(0); v.play().catch(() => {}); } }}>
                    Replay
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== AUTH ==================== */}
      {SUPABASE_URL && (!session?.user?.name || authView.startsWith("onboard-")) && !showSplash ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center px-8 bg-gradient-to-b from-white via-emerald-50/10 to-white overflow-hidden z-40">
          <motion.div className="max-w-[380px] w-full flex flex-col items-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-center gap-2.5 mb-12">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/10" />
              <span className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Dancing Script', cursive" }}>Meridian</span>
            </div>

            <AnimatePresence mode="wait">
              {authView === "onboarding" ? (
                <motion.div key="name" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">One more step</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">What should we call you?</p>
                  <div className="w-full flex flex-col gap-3">
                    <input className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" placeholder="Your first name" value={authName} onChange={(e) => setAuthName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleOnboarding()} autoFocus />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleOnboarding} disabled={!authName.trim() || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">{authLoading ? "Saving..." : "Continue"}</Button>
                  </div>
                </motion.div>
              ) : authView === "onboard-modes" ? (
                <motion.div key="modes" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="text-xs text-slate-400 mb-6">Step 1 of 3</div>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Where are you in your journey?</h2>
                  <p className="text-sm text-slate-400 mb-6 text-center">This helps us show you the most relevant resources.</p>
                  <div className="w-full flex flex-col gap-2.5 mb-6">
                    {[
                      { id: "considering", label: "Considering divorce", desc: "Exploring options and thinking about next steps" },
                      { id: "during", label: "Going through it now", desc: "Actively navigating the divorce process" },
                      { id: "after", label: "Recently divorced", desc: "Adjusting to life after separation" },
                      { id: "coparenting", label: "Focused on co-parenting", desc: "Building a healthy co-parenting relationship" },
                    ].map((option) => (
                      <button key={option.id} onClick={() => { setSelectedPhase(option.id); setAuthView("onboard-decree"); }} className="w-full flex items-start gap-3.5 p-4 rounded-xl bg-white border border-slate-200/60 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all text-left group">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                        <div><div className="text-sm font-medium text-slate-800 mb-0.5">{option.label}</div><div className="text-[13px] text-slate-400 leading-snug">{option.desc}</div></div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : authView === "onboard-decree" ? (
                <motion.div key="decree" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <button onClick={() => setAuthView("onboard-modes")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors mb-6 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Step 2 of 3</button>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-5"><FileText size={28} className="text-white" /></div>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Upload your decree</h2>
                  <p className="text-sm text-slate-500 mb-2 text-center leading-relaxed">This lets Meridian answer questions directly from your actual documents.</p>
                  <p className="text-xs text-slate-400 mb-6 text-center">You can always add it later from your profile.</p>
                  {decreeFileName ? (
                    <div className="w-full py-8 px-6 border-2 border-emerald-200 bg-emerald-50 rounded-2xl flex flex-col items-center gap-2 mb-4 text-emerald-700"><Check size={24} /><span className="text-sm font-medium">{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span></div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()} className="w-full py-8 px-6 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all mb-4 text-slate-400">
                      <Upload size={24} /><span className="text-sm font-medium text-slate-600">Tap to upload PDF or text file</span><span className="text-xs text-slate-400">.pdf, .txt, or .md</span>
                    </button>
                  )}
                  <Button onClick={() => setAuthView("onboard-ready")} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">{decreeFileName ? "Continue" : "Skip for now"}</Button>
                </motion.div>
              ) : authView === "onboard-ready" ? (
                <motion.div key="ready" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <button onClick={() => setAuthView("onboard-decree")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors mb-6 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Step 3 of 3</button>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-4 text-center">Just so you know</h2>
                  <p className="text-sm text-slate-400 mb-3 text-center leading-relaxed max-w-[280px]">Think of Meridian as a calm, thoughtful friend — always in your corner, always here to listen.</p>
                  <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed max-w-[280px]">For legal decisions, always loop in your attorney. For everything else, we're here.</p>
                  <Button onClick={finishOnboarding} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15">Let's go{firstName ? `, ${firstName}` : ""}</Button>
                </motion.div>
              ) : (
                <motion.div key="auth" className="w-full flex flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-2 text-center">Welcome to Meridian</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">Sign in or create an account to get started.</p>
                  <div className="w-full flex flex-col gap-3">
                    <div>
                      <label htmlFor="auth-email" className="sr-only">Email address</label>
                      <input id="auth-email" className="w-full pl-4 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type="email" placeholder="Email address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoFocus />
                    </div>
                    <div className="relative">
                      <label htmlFor="auth-password" className="sr-only">Password</label>
                      <input id="auth-password" className="w-full pl-4 pr-11 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" type={showPassword ? "text" : "password"} placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <Button onClick={handleAuth} disabled={!authEmail || !authPassword || authLoading} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md shadow-emerald-500/15 disabled:opacity-40">{authLoading ? "Continue" : "Continue"}</Button>
                  </div>
                  <button onClick={() => setShowSplash(true)} className="mt-6 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Back to home
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && (
        <>
          {/* ==================== MAIN APP ==================== */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="fixed inset-0 flex flex-col max-w-3xl mx-auto bg-white overflow-hidden">

            {/* Header */}
            <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }} className="flex items-center justify-between px-6 py-4 border-b border-slate-100/80 bg-white shrink-0 z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/10" />
                <span className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Dancing Script', cursive" }}>Meridian</span>
              </div>
              <AnimatePresence>
                {activeTab === "chat" && hasConversation && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Conversation history"><Clock className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (streaming) handleStop(); setActiveConvId(null); setShowHistory(false); }} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"><Edit3 className="w-4 h-4 mr-1.5" />New chat</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait">
                {/* CHAT */}
                {activeTab === "chat" && (
                  <motion.div key="chat" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
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
                        <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center justify-center text-center py-16">
                          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/60 flex items-center justify-center mb-8">
                            <MessageSquare className="w-6 h-6 text-emerald-500" strokeWidth={1.5} />
                          </motion.div>
                          <h2 className="text-xl font-light tracking-tight text-slate-700 mb-2">{firstName ? `Hi ${firstName}, what's on your mind?` : "What's on your mind?"}</h2>
                          <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-10">Take a breath. Share what you're navigating, and we'll work through it together.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
                            {QUICK_ACTIONS.map((action, idx) => { const Icon = action.icon; return (
                              <motion.button key={action.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + idx * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }} onClick={() => handleQuickAction(action.id)} className="flex items-center gap-3 px-4 py-3.5 bg-white/80 border border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/20 transition-all duration-300 text-left group">
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors duration-300"><Icon className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors duration-300" strokeWidth={1.5} /></div>
                                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">{action.label}</span>
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
                            <input type="text" placeholder="Search by topic, question, or keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-6 px-6 scrollbar-hide">
                            {JOURNEY_PHASES.map((phase) => (
                              <button key={phase.id} onClick={() => setSelectedPhase(phase.id)} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0", selectedPhase === phase.id ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/15" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                                <span>{phase.emoji}</span><span>{phase.label}</span>
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

                {/* PROFILE */}
                {activeTab === "profile" && (
                  <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 py-6 pb-6">
                    <h2 className="text-2xl font-light tracking-tight text-slate-700 mb-6">{firstName ? `Hi, ${firstName}` : "Profile"}</h2>

                    {/* Activity summary */}
                    <div className="flex gap-3 mb-6">
                      {[
                        { label: "Conversations", value: conversations.length },
                        { label: "Decree", value: decreeFileName ? "Uploaded" : "None" },
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
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }} className="px-6 py-4 border-t border-slate-100/60 bg-white shrink-0">
                <div className="flex items-end gap-3 bg-slate-50/60 rounded-2xl px-4 py-3 border border-slate-200/40 focus-within:border-emerald-400/60 focus-within:ring-4 focus-within:ring-emerald-500/8 transition-all duration-300">
                  <Textarea ref={textareaRef} className="flex-1 border-0 bg-transparent p-0 text-[15px] text-slate-800 placeholder:text-slate-400 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[120px]" placeholder={hasConversation ? "Reply..." : "What's on your mind?"} value={input} onChange={(e) => { setInput(e.target.value); resizeTextarea(); }} onKeyDown={handleKeyDown} rows={1} />
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
                {!hasConversation && (
                  <div className="text-[10px] text-slate-300 text-center mt-2.5 flex items-center justify-center">
                    Not legal advice
                    <span className="mx-1.5">·</span>
                    <button onClick={() => setShowFeedback(true)} className="text-slate-300 hover:text-slate-500 transition-colors">Share feedback</button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Bottom Nav */}
            <motion.nav initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }} className="border-t border-slate-100/60 bg-white shrink-0 z-10">
              <div className="flex items-center justify-around px-6 py-2.5 pb-3">
                {([{ id: "chat" as Tab, icon: MessageSquare, label: "Chat" }, { id: "learn" as Tab, icon: BookOpen, label: "Learn" }, { id: "profile" as Tab, icon: User, label: "You" }]).map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1 py-2 px-5 rounded-xl transition-all duration-300 relative", activeTab === tab.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-500")}>
                    <tab.icon className="w-5 h-5" strokeWidth={activeTab === tab.id ? 2 : 1.5} /><span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                    {activeTab === tab.id && <motion.div layoutId="nav-indicator" className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-emerald-500" transition={{ type: "spring", stiffness: 500, damping: 30 }} />}
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
