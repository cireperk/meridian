import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as pdfjsLib from "pdfjs-dist";
import { marked } from "marked";
import {
  MessageSquare,
  BookOpen,
  User,
  FileText,
  Sparkles,
  Heart,
  DollarSign,
  Baby,
  Users,
  Send,
  Plus,
  Upload,
  ChevronRight,
  X,
  Square,
  Check,
  Copy,
  Search,
  Clock,
  Trash2,
  LogOut,
  Shield,
  HelpCircle,
  Info,
  ArrowLeft,
  Play,
  Pause,
} from "lucide-react";

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
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || err.error_description || err.message || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const authSubmit = async (email: string, password: string) => {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Auth failed");
  return data;
};

const authRefreshToken = (refreshToken: string) =>
  sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });

const dbSelect = (table: string, query: string, token: string) =>
  sbFetch(`/rest/v1/${table}?${query}`, { token });

const dbUpdate = async (table: string, query: string, body: any, token: string) => {
  const headers: any = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
};

// --- System prompt ---
const SYSTEM_PROMPT = `You're Meridian — think of yourself as a calm, wise friend who's been through divorce and co-parenting. You talk like a real person, not a chatbot.

HOW YOU SOUND:
- Warm but direct. Say what needs to be said in 2-4 sentences, not paragraphs.
- Ask follow-up questions. Don't assume you have the full picture — dig in. "What did they actually say?" or "How old are the kids?" or "What does your decree say about that?"
- Use casual, natural language. Contractions. Short sentences. Like texting a thoughtful friend.
- Never use bullet points, numbered lists, headers, or bold text unless drafting a message. Just talk.
- Don't over-validate. Skip the "I hear you" and "That must be hard" — get to the useful part.
- No filler phrases like "Great question!" or "I understand your concern."
- One thought at a time. If you need more info, just ask — don't give a generic answer AND ask.

WHAT YOU DO:
- Help people understand their divorce decree in plain English
- Help them think through co-parenting conflicts without escalating
- Draft calm, neutral messages to their co-parent when asked

BOUNDARIES:
- You're not a lawyer. If something needs legal advice, say "That's a question for your attorney" and move on. Don't repeat this every message — once is enough.
- Never take sides against the co-parent. Stay neutral, stay focused on the kids.
- Don't be preachy. No lectures about "the high road."

End with a brief grounding thought when it feels natural — not every single time. Keep it real, like "You've got this" or "Focus on what you can control here."`;

// --- Constants ---
type Tab = "chat" | "learn" | "you";

const QUICK_ACTIONS = [
  { id: "decree", label: "Understand my decree", icon: FileText },
  { id: "draft", label: "Draft a message", icon: MessageSquare },
  { id: "situation", label: "Navigate a situation", icon: Sparkles },
  { id: "financial", label: "Financial planning", icon: DollarSign },
  { id: "children", label: "Talk to kids about divorce", icon: Heart },
];

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
];

const RESOURCE_TOPICS = [
  { id: "legal", label: "Legal Basics", icon: FileText, color: "from-blue-500 to-blue-600" },
  { id: "emotional", label: "Emotional Support", icon: Heart, color: "from-pink-500 to-rose-600" },
  { id: "financial", label: "Financial Planning", icon: DollarSign, color: "from-green-500 to-emerald-600" },
  { id: "children", label: "Children & Family", icon: Baby, color: "from-purple-500 to-purple-600" },
  { id: "coparenting", label: "Co-Parenting Tools", icon: Users, color: "from-teal-500 to-cyan-600" },
];

const MOCK_RESOURCES: Record<string, any[]> = {
  considering: [
    { id: "1", title: "What to Know Before Filing for Divorce", topic: "legal", readTime: "5 min" },
    { id: "2", title: "Managing Your Emotions During This Decision", topic: "emotional", readTime: "4 min" },
    { id: "3", title: "Financial Checklist Before Filing", topic: "financial", readTime: "7 min" },
    { id: "4", title: "How to Talk to Your Kids About Separation", topic: "children", readTime: "6 min" },
  ],
  during: [
    { id: "5", title: "Understanding the Divorce Process", topic: "legal", readTime: "8 min" },
    { id: "6", title: "Coping Strategies During Divorce", topic: "emotional", readTime: "5 min" },
    { id: "7", title: "Splitting Assets: What You Need to Know", topic: "financial", readTime: "6 min" },
    { id: "8", title: "Keeping Kids Out of the Middle", topic: "children", readTime: "4 min" },
  ],
  after: [
    { id: "9", title: "Rebuilding Your Life After Divorce", topic: "emotional", readTime: "6 min" },
    { id: "10", title: "Post-Divorce Financial Planning", topic: "financial", readTime: "7 min" },
    { id: "11", title: "Modifying Your Decree: When and How", topic: "legal", readTime: "5 min" },
    { id: "12", title: "Helping Kids Adjust to Two Homes", topic: "children", readTime: "5 min" },
  ],
  coparenting: [
    { id: "13", title: "Setting Boundaries with Your Co-Parent", topic: "coparenting", readTime: "5 min" },
    { id: "14", title: "Effective Communication Strategies", topic: "coparenting", readTime: "4 min" },
    { id: "15", title: "Handling Schedule Conflicts", topic: "coparenting", readTime: "6 min" },
    { id: "16", title: "When Your Co-Parent Won't Cooperate", topic: "coparenting", readTime: "5 min" },
  ],
};

const topicColors: Record<string, string> = {
  legal: "bg-blue-50 text-blue-700 border-blue-200/60",
  emotional: "bg-pink-50 text-pink-700 border-pink-200/60",
  financial: "bg-green-50 text-green-700 border-green-200/60",
  children: "bg-purple-50 text-purple-700 border-purple-200/60",
  coparenting: "bg-teal-50 text-teal-700 border-teal-200/60",
};

const topicLabels: Record<string, string> = {
  legal: "Legal Basics",
  emotional: "Emotional Support",
  financial: "Financial",
  children: "Children & Family",
  coparenting: "Co-Parenting",
};

// ============================================================
// APP
// ============================================================
export default function App() {
  // --- Auth ---
  const [session, setSession] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem("m_session") || "null"); } catch { return null; }
  });
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
      if (data?.access_token) {
        const s = { ...session, token: data.access_token, refresh_token: data.refresh_token };
        setSession(s);
        localStorage.setItem("m_session", JSON.stringify(s));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  const handleAuth = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await authSubmit(authEmail, authPassword);
      const token = data.access_token;
      if (data.isNew) {
        const s = { token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name: "" } };
        setSession(s);
        setAuthView("onboarding");
      } else {
        let name = "";
        try {
          const profiles = await dbSelect("profiles", `id=eq.${data.user.id}&select=name`, token);
          if (profiles?.length) name = profiles[0].name;
        } catch {}
        const s = { token, refresh_token: data.refresh_token, user: { id: data.user.id, email: authEmail, name } };
        setSession(s);
        localStorage.setItem("m_session", JSON.stringify(s));
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOnboarding = async () => {
    if (!authName.trim()) return;
    setAuthLoading(true);
    try {
      await sbFetch("/rest/v1/profiles", {
        method: "POST",
        body: { id: session.user.id, name: authName.trim(), email: session.user.email },
        token: session.token,
      });
      const s = { ...session, user: { ...session.user, name: authName.trim() } };
      setSession(s);
      localStorage.setItem("m_session", JSON.stringify(s));
      setAuthView("onboard-modes");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const finishOnboarding = () => setAuthView("main");

  const handleUpdateName = async (newName: string) => {
    if (!newName.trim() || !session?.token) return;
    try {
      await dbUpdate("profiles", `id=eq.${session.user.id}`, { name: newName.trim() }, session.token);
      const s = { ...session, user: { ...session.user, name: newName.trim() } };
      setSession(s);
      localStorage.setItem("m_session", JSON.stringify(s));
    } catch {}
  };

  const handleSignOut = () => {
    setSession(null);
    localStorage.removeItem("m_session");
    localStorage.removeItem("m_conversations");
    setConversations([]);
    setActiveConvId(null);
    setAuthView("main");
  };

  // --- Splash ---
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem("m_session"));
  const [splashFading, setSplashFading] = useState(false);
  const [splashView, setSplashView] = useState("text");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const enterApp = () => {
    if (videoRef.current) videoRef.current.pause();
    setSplashFading(true);
    setTimeout(() => setShowSplash(false), 900);
  };

  const openVideo = () => {
    setSplashView("video");
    setVideoEnded(false);
    setVideoProgress(0);
    setVideoPaused(false);
    setTimeout(() => {
      const v = videoRef.current;
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    }, 400);
  };

  const closeVideo = () => {
    if (videoRef.current) videoRef.current.pause();
    setSplashView("text");
  };

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v || videoEnded) return;
    if (v.paused) { v.play().catch(() => {}); setVideoPaused(false); }
    else { v.pause(); setVideoPaused(true); }
    setShowPauseIcon(true);
    setTimeout(() => setShowPauseIcon(false), 800);
  };

  // --- App state ---
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [conversations, setConversations] = useState<any[]>(() => {
    try {
      const convs = JSON.parse(localStorage.getItem("m_conversations") || "null");
      if (convs?.length) return convs;
      const old = JSON.parse(localStorage.getItem("m_messages") || "null");
      if (old?.length) {
        const migrated = [{ id: "conv_0", title: old[0]?.content?.slice(0, 50) || "Conversation", messages: old, createdAt: new Date().toISOString() }];
        localStorage.setItem("m_conversations", JSON.stringify(migrated));
        localStorage.removeItem("m_messages");
        return migrated;
      }
      return [];
    } catch { return []; }
  });
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    try {
      const convs = JSON.parse(localStorage.getItem("m_conversations") || "null");
      return convs?.length ? convs[0].id : null;
    } catch { return null; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const activeConv = conversations.find((c) => c.id === activeConvId);
  const messages = activeConv?.messages || [];

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Decree
  const [decreeText, setDecreeText] = useState(() => localStorage.getItem("m_decree_text") || "");
  const [decreeFileName, setDecreeFileName] = useState(() => localStorage.getItem("m_decree_name") || "");
  const [decreePages, setDecreePages] = useState(() => {
    try { return parseInt(localStorage.getItem("m_decree_pages") || "0") || 0; } catch { return 0; }
  });
  const [uploading, setUploading] = useState(false);

  // Feedback
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Learn tab
  const [selectedPhase, setSelectedPhase] = useState("considering");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // You tab
  const [editName, setEditName] = useState("");

  // Refs
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Effects ---
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { localStorage.setItem("m_conversations", JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    if (decreeText) localStorage.setItem("m_decree_text", decreeText); else localStorage.removeItem("m_decree_text");
    if (decreeFileName) localStorage.setItem("m_decree_name", decreeFileName); else localStorage.removeItem("m_decree_name");
    if (decreePages) localStorage.setItem("m_decree_pages", String(decreePages)); else localStorage.removeItem("m_decree_pages");
  }, [decreeText, decreeFileName, decreePages]);

  // --- Handlers ---
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setShowToast(true);
      setTimeout(() => setCopied(null), 1500);
      setTimeout(() => setShowToast(false), 1500);
    });
  };

  const extractPdfText = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    setDecreePages(pdf.numPages);
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(" "));
    }
    return pages.join("\n\n");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecreeFileName(file.name);
    setUploading(true);
    try {
      let text: string;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(file);
        });
      }
      setDecreeText(text);
    } catch (err) {
      console.error("Decree upload failed:", err);
      setDecreeText("");
      setDecreeFileName("");
      setDecreePages(0);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setLoading(false);
  };

  const handleSend = async (overrideMsg?: string) => {
    const userMsg = (overrideMsg || input).trim();
    if (!userMsg || loading || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "24px";

    let convId = activeConvId;
    if (!convId) {
      convId = `conv_${Date.now()}`;
      const newConv = { id: convId, title: userMsg.slice(0, 50), messages: [], createdAt: new Date().toISOString() };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(convId);
    }

    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { role: "user", content: userMsg }] } : c)
    );
    setLoading(true);

    const decreeContext = decreeText
      ? `\n\nDIVORCE DECREE CONTENT:\n${decreeText.slice(0, 8000)}`
      : "\n\nNo decree uploaded yet. Remind the user they can upload their decree for more personalized guidance.";

    const systemWithContext = `${SYSTEM_PROMPT}${decreeContext}`;
    const currentMsgs = conversations.find((c) => c.id === convId)?.messages || [];
    const history = [...currentMsgs, { role: "user", content: userMsg }].map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const updateConvMessages = (fn: any) => {
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, messages: typeof fn === "function" ? fn(c.messages) : fn } : c)
      );
    };

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemWithContext,
          messages: history,
        }),
        signal: abort.signal,
      });

      if (!res.ok) throw new Error("API error");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      updateConvMessages((prev: any[]) => [...prev, { role: "assistant", content: "" }]);
      setLoading(false);
      setStreaming(true);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                fullText += parsed.delta.text;
                updateConvMessages((prev: any[]) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullText };
                  return updated;
                });
              }
            } catch {}
          }
        }
      } catch (e: any) {
        if (e.name === "AbortError") { setStreaming(false); return; }
        throw e;
      }

      setStreaming(false);
      if (!fullText) {
        updateConvMessages((prev: any[]) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
          return updated;
        });
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      updateConvMessages((prev: any[]) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleQuickAction = (actionId: string) => {
    setInput(ACTION_PROMPTS[actionId] || "");
    textareaRef.current?.focus();
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || feedbackSending) return;
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText.trim(), userId: session?.user?.id, email: session?.user?.email }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackSent(true);
      setTimeout(() => { setShowFeedback(false); setFeedbackText(""); setFeedbackSent(false); }, 1800);
    } catch {
      alert("Failed to send feedback. Please try again.");
    } finally {
      setFeedbackSending(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = session?.user?.name?.split(" ")[0] || "";
  const hasConversation = messages.length > 0;

  // Filter resources
  const filteredResources = (MOCK_RESOURCES[selectedPhase] || []).filter((r: any) => {
    if (selectedTopic && r.topic !== selectedTopic) return false;
    if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ============================================================
  // RENDER
  // ============================================================

  const springTransition = { type: "spring", stiffness: 500, damping: 35 };
  const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.25 },
  };

  return (
    <>
      {/* Hidden file input (always in DOM) */}
      <input ref={fileRef} type="file" accept=".txt,.md,.pdf" className="hidden" onChange={handleFileUpload} />

      {/* ==================== SPLASH ==================== */}
      {showSplash && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-800 ${splashFading ? "opacity-0 pointer-events-none" : ""}`}
          style={{ background: "#FDFCFB" }}
        >
          {/* Water background */}
          <div className="absolute -inset-[40%] overflow-hidden animate-[fadeIn_3s_ease_0.2s_forwards] opacity-0">
            <div className="absolute w-[55%] h-[55%] top-[10%] right-[5%] rounded-full blur-[60px] animate-[waterDrift1_18s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(199,210,254,0.6) 0%, transparent 70%)" }} />
            <div className="absolute w-[50%] h-[50%] bottom-[5%] left-0 rounded-full blur-[60px] animate-[waterDrift2_22s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(167,243,208,0.5) 0%, transparent 70%)" }} />
            <div className="absolute w-[45%] h-[45%] top-[35%] left-[30%] rounded-full blur-[60px] animate-[waterDrift3_16s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(186,230,253,0.45) 0%, transparent 70%)" }} />
            <div className="absolute w-[40%] h-[40%] top-[15%] left-[10%] rounded-full blur-[60px] animate-[waterDrift4_20s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(167,243,208,0.35) 0%, transparent 70%)" }} />
          </div>

          {/* Splash content */}
          <div className="relative z-10 max-w-[420px] w-full px-8 flex flex-col items-center text-center">
            {splashView === "text" ? (
              <motion.div key="text" className="flex flex-col items-center w-full" {...fadeUp}>
                <div className="text-xs font-medium tracking-[2px] uppercase text-slate-400 mb-12 animate-[fadeIn_1s_ease_0.4s_forwards] opacity-0">Meridian</div>
                <h1 className="font-serif text-4xl font-medium italic leading-tight text-slate-800 mb-7 tracking-tight">
                  Navigate divorce with<br />calm and clarity.
                </h1>
                <p className="text-base leading-relaxed text-slate-400 mb-12 animate-[fadeIn_0.8s_ease_1.5s_forwards] opacity-0">
                  Your companion through every step —<br />from decree to co-parenting and beyond.
                </p>
                <button
                  onClick={enterApp}
                  className="px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-300 animate-[fadeIn_0.8s_ease_2s_forwards] opacity-0"
                >
                  Get Started
                </button>
                <button
                  onClick={openVideo}
                  className="mt-4 px-5 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-700 active:scale-[0.98] transition-all duration-200 flex items-center gap-2 animate-[fadeIn_0.8s_ease_2.4s_forwards] opacity-0"
                >
                  <Play size={12} fill="currentColor" />
                  Watch a message from our founder
                </button>
              </motion.div>
            ) : (
              <motion.div key="video" className="flex flex-col items-center w-full" {...fadeUp}>
                <div className="w-full flex items-center justify-center relative mb-5">
                  <button onClick={closeVideo} className="absolute left-0 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-[13px] font-medium text-slate-500 hover:bg-slate-100 transition-all flex items-center gap-1">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <span className="text-[11px] font-medium tracking-[1.2px] uppercase text-slate-400">From our founder</span>
                </div>
                <div className="w-full rounded-2xl overflow-hidden bg-slate-200 shadow-lg relative mb-5 cursor-pointer" onClick={togglePlayPause}>
                  <video
                    ref={videoRef}
                    className="w-full block object-contain bg-slate-200"
                    style={{ maxHeight: "calc(100vh - 280px)" }}
                    src="/welcome.mp4"
                    playsInline
                    onTimeUpdate={() => {
                      const v = videoRef.current;
                      if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
                    }}
                    onEnded={() => { setVideoProgress(100); setVideoEnded(true); }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/5">
                    <div className="h-full bg-slate-700/35 rounded-r transition-[width] duration-300 ease-linear" style={{ width: `${videoProgress}%` }} />
                  </div>
                  {/* Play/pause overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-14 h-14 rounded-full bg-black/50 flex items-center justify-center text-white transition-all duration-200 ${showPauseIcon ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
                      {videoPaused ? <Play size={24} fill="white" /> : <Pause size={24} />}
                    </div>
                  </div>
                  {videoPaused && !showPauseIcon && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/15">
                      <Play size={40} fill="white" className="opacity-70" />
                    </div>
                  )}
                </div>
                <button
                  onClick={enterApp}
                  className="px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                >
                  {videoEnded ? "Get Started" : "Begin"}
                </button>
              </motion.div>
            )}
          </div>
          <div className="absolute bottom-9 left-0 right-0 flex justify-center z-10 animate-[fadeIn_0.8s_ease_3s_forwards] opacity-0">
            <span className="px-5 py-2 bg-white/70 backdrop-blur-xl border border-black/[0.04] rounded-full text-[11px] font-medium text-slate-400 whitespace-nowrap tracking-wide">
              Private · Confidential · Not legal advice
            </span>
          </div>
        </div>
      )}

      {/* ==================== AUTH ==================== */}
      {SUPABASE_URL && (!session?.user?.name || authView.startsWith("onboard-")) && !showSplash ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden" style={{ background: "#FDFCFB" }}>
          {/* Water bg */}
          <div className="absolute -inset-[40%] overflow-hidden opacity-100">
            <div className="absolute w-[55%] h-[55%] top-[10%] right-[5%] rounded-full blur-[60px] animate-[waterDrift1_18s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(199,210,254,0.6) 0%, transparent 70%)" }} />
            <div className="absolute w-[50%] h-[50%] bottom-[5%] left-0 rounded-full blur-[60px] animate-[waterDrift2_22s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(167,243,208,0.5) 0%, transparent 70%)" }} />
            <div className="absolute w-[45%] h-[45%] top-[35%] left-[30%] rounded-full blur-[60px] animate-[waterDrift3_16s_ease-in-out_infinite]" style={{ background: "radial-gradient(circle, rgba(186,230,253,0.45) 0%, transparent 70%)" }} />
          </div>

          <motion.div className="relative z-10 max-w-[400px] w-full flex flex-col items-center" {...fadeUp}>
            <div className="text-xs font-medium tracking-[2px] uppercase text-slate-400 mb-8">Meridian</div>

            <AnimatePresence mode="wait">
              {authView === "onboarding" ? (
                <motion.div key="name" className="w-full flex flex-col items-center" {...fadeUp}>
                  <h2 className="font-serif text-[28px] font-medium italic text-slate-800 mb-2 text-center">One more step</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">What should we call you?</p>
                  <div className="w-full flex flex-col gap-3">
                    <input
                      className="w-full px-4 py-3.5 border border-slate-200/60 rounded-xl text-[15px] text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300"
                      placeholder="Your first name"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleOnboarding()}
                      autoFocus
                    />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <button
                      onClick={handleOnboarding}
                      disabled={!authName.trim() || authLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl disabled:opacity-40 disabled:shadow-none transition-all"
                    >
                      {authLoading ? "Saving..." : "Continue"}
                    </button>
                  </div>
                </motion.div>
              ) : authView === "onboard-modes" ? (
                <motion.div key="modes" className="w-full flex flex-col items-center" {...fadeUp}>
                  <div className="flex gap-1.5 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                  </div>
                  <h2 className="font-serif text-[24px] font-medium italic text-slate-800 mb-2 text-center">Three ways to help</h2>
                  <p className="text-[15px] text-slate-400 mb-6 text-center">Meridian works in three modes, each designed for a different moment.</p>
                  <div className="w-full flex flex-col gap-3 mb-6">
                    {[
                      { icon: MessageSquare, name: "Guidance", hint: "Talk through conflicts, boundaries, and tough co-parenting moments.", gradient: "from-emerald-600 to-teal-600" },
                      { icon: FileText, name: "Decree Q&A", hint: "Upload your decree and ask questions in plain English.", gradient: "from-emerald-600 to-teal-600" },
                      { icon: Sparkles, name: "Draft", hint: "Get help writing calm, neutral messages to your co-parent.", gradient: "from-emerald-600 to-teal-600" },
                    ].map((m) => (
                      <div key={m.name} className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200/60 bg-white/80">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shrink-0`}>
                          <m.icon size={18} className="text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800 mb-0.5">{m.name}</div>
                          <div className="text-[13px] text-slate-500 leading-snug">{m.hint}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setAuthView("onboard-decree")}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all"
                  >
                    Continue
                  </button>
                </motion.div>
              ) : authView === "onboard-decree" ? (
                <motion.div key="decree" className="w-full flex flex-col items-center" {...fadeUp}>
                  <div className="flex gap-1.5 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 cursor-pointer" onClick={() => setAuthView("onboard-modes")} />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center mb-5">
                    <FileText size={28} className="text-white" />
                  </div>
                  <h2 className="font-serif text-[24px] font-medium italic text-slate-800 mb-2 text-center">Upload your decree</h2>
                  <p className="text-[15px] text-slate-400 mb-6 text-center leading-relaxed">If you have your divorce decree handy, you can upload it now. You can always add it later.</p>
                  {decreeFileName ? (
                    <div className="w-full py-8 px-6 border-2 border-emerald-200 bg-emerald-50 rounded-2xl flex flex-col items-center gap-2 mb-4 text-emerald-700">
                      <Check size={24} />
                      <span className="text-sm font-medium">{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="w-full py-8 px-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all mb-4 text-slate-400"
                    >
                      <Upload size={24} />
                      <span className="text-sm font-medium text-slate-600">Tap to upload PDF or text file</span>
                      <span className="text-xs text-slate-300">.pdf, .txt, or .md</span>
                    </div>
                  )}
                  <button
                    onClick={() => setAuthView("onboard-ready")}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all"
                  >
                    {decreeFileName ? "Continue" : "Skip for now"}
                  </button>
                </motion.div>
              ) : authView === "onboard-ready" ? (
                <motion.div key="ready" className="w-full flex flex-col items-center" {...fadeUp}>
                  <div className="flex gap-1.5 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 cursor-pointer" onClick={() => setAuthView("onboard-modes")} />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 cursor-pointer" onClick={() => setAuthView("onboard-decree")} />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  </div>
                  <h2 className="font-serif text-[24px] font-medium italic text-slate-800 mb-4 text-center">Just so you know</h2>
                  <p className="text-[15px] text-slate-500 mb-3 text-center leading-relaxed max-w-[300px]">
                    Meridian is your companion through this — not a lawyer and not a therapist. Think of it as a calm, thoughtful friend who's always in your corner.
                  </p>
                  <p className="text-[15px] text-slate-500 mb-8 text-center leading-relaxed max-w-[300px]">
                    For real legal decisions, loop in your attorney. For everything else, we're here.
                  </p>
                  <button
                    onClick={finishOnboarding}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all"
                  >
                    Let's go{firstName ? `, ${firstName}` : ""}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="auth" className="w-full flex flex-col items-center" {...fadeUp}>
                  <h2 className="font-serif text-[28px] font-medium italic text-slate-800 mb-2 text-center">Welcome to Meridian</h2>
                  <p className="text-sm text-slate-400 mb-8 text-center">Sign in or create an account to continue.</p>
                  <div className="w-full flex flex-col gap-3">
                    <input
                      className="w-full px-4 py-3.5 border border-slate-200/60 rounded-xl text-[15px] text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300"
                      type="email"
                      placeholder="Email address"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="w-full px-4 py-3.5 border border-slate-200/60 rounded-xl text-[15px] text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300"
                      type="password"
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                    />
                    {authError && <div className="text-red-600 text-[13px] text-center py-2 bg-red-50 rounded-lg">{authError}</div>}
                    <button
                      onClick={handleAuth}
                      disabled={!authEmail || !authPassword || authLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl disabled:opacity-40 disabled:shadow-none transition-all"
                    >
                      {authLoading ? "Loading..." : "Continue"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : !showSplash && (
        <>
          {/* ==================== MAIN APP ==================== */}
          <div className="h-dvh flex flex-col max-w-3xl mx-auto bg-white relative">

            {/* --- Header --- */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
              <span className="text-[17px] font-semibold tracking-tight text-slate-800">Meridian</span>
              <div className="flex items-center gap-1">
                {hasConversation && activeTab === "chat" && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all"
                    title="History"
                  >
                    <Clock size={16} />
                  </button>
                )}
                {activeTab === "chat" && (
                  <button
                    onClick={() => { if (streaming) handleStop(); setActiveConvId(null); setShowHistory(false); }}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all"
                    title="New chat"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </header>

            {/* --- Content --- */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {/* ============ CHAT TAB ============ */}
                {activeTab === "chat" && (
                  <motion.div
                    key="chat"
                    className="absolute inset-0 flex flex-col"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
                      {/* Decree chip */}
                      {decreeFileName ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 mb-4">
                          {uploading ? <span className="text-xs">Loading…</span> : <Check size={14} />}
                          <span>{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span>
                          <button
                            onClick={() => { setDecreeText(""); setDecreeFileName(""); setDecreePages(0); }}
                            className="ml-1 hover:text-emerald-900 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all mb-4"
                        >
                          <Upload size={14} />
                          <span>Upload your decree</span>
                        </button>
                      )}

                      {/* Empty state or messages */}
                      {!hasConversation ? (
                        <motion.div className="flex-1 flex flex-col items-center justify-center text-center py-8" {...fadeUp}>
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 flex items-center justify-center mb-4">
                            <Sparkles size={24} className="text-emerald-600" />
                          </div>
                          <h2 className="font-serif text-[26px] font-medium italic text-slate-800 mb-2">
                            {getGreeting()}{firstName ? `, ${firstName}` : ""}.
                          </h2>
                          <p className="text-sm text-slate-400 mb-8 max-w-[260px]">How can I help you today?</p>

                          <div className="w-full flex flex-col gap-2">
                            {QUICK_ACTIONS.map((action) => (
                              <button
                                key={action.id}
                                onClick={() => handleQuickAction(action.id)}
                                className="flex items-center gap-3 px-4 py-3.5 bg-slate-50/80 border border-slate-200/60 rounded-2xl text-sm text-slate-600 text-left hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-slate-800 active:scale-[0.99] transition-all group"
                              >
                                <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 group-hover:border-emerald-200 transition-colors">
                                  <action.icon size={15} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                                </div>
                                <span className="flex-1">{action.label}</span>
                                <ChevronRight size={14} className="text-slate-300 group-hover:text-emerald-400 transition-colors" />
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col gap-5">
                          {messages.map((msg: any, i: number) => (
                            <motion.div
                              key={i}
                              className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
                              initial={i === messages.length - 1 ? { opacity: 0, y: 8 } : false}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25 }}
                            >
                              {msg.role === "user" ? (
                                <div className="max-w-[88%] bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-3 rounded-2xl rounded-br-sm text-[15px] leading-relaxed whitespace-pre-wrap">
                                  {msg.content}
                                </div>
                              ) : (
                                <>
                                  <div className="max-w-[88%] text-[15px] leading-relaxed text-slate-600 py-1 m-md" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") }} />
                                  {msg.content && (
                                    <button
                                      onClick={() => copyToClipboard(msg.content, i)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-md transition-all mt-0.5"
                                    >
                                      {copied === i ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                                    </button>
                                  )}
                                </>
                              )}
                            </motion.div>
                          ))}
                          {loading && (
                            <div className="flex items-start">
                              <div className="flex gap-1.5 py-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                              </div>
                            </div>
                          )}
                          <div ref={bottomRef} />
                        </div>
                      )}
                    </div>

                    {/* Input area */}
                    <div className="px-6 pb-2 pt-3 bg-white border-t border-slate-100 sticky bottom-[72px]">
                      <div className="flex items-end gap-2.5 bg-slate-50/80 rounded-2xl px-4 py-2.5 border border-slate-200/60 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                        <textarea
                          ref={textareaRef}
                          className="flex-1 bg-transparent text-[15px] text-slate-800 placeholder:text-slate-300 outline-none resize-none leading-relaxed min-h-[24px] max-h-[120px]"
                          placeholder="Ask anything about divorce or co-parenting..."
                          value={input}
                          onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
                          onKeyDown={handleKeyDown}
                          rows={1}
                        />
                        {streaming ? (
                          <button onClick={handleStop} className="w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 hover:bg-red-600 transition-colors">
                            <Square size={12} fill="currentColor" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || loading}
                            className="w-9 h-9 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:shadow-md hover:shadow-emerald-500/20 transition-all"
                          >
                            <Send size={15} />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-300 text-center mt-2 flex items-center justify-center gap-0">
                        Not legal advice — always consult an attorney.
                        <span className="mx-1.5">·</span>
                        <button onClick={() => setShowFeedback(true)} className="text-slate-300 hover:text-slate-500 transition-colors">Feedback?</button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ============ LEARN TAB ============ */}
                {activeTab === "learn" && (
                  <motion.div
                    key="learn"
                    className="absolute inset-0 flex flex-col overflow-y-auto px-6 py-4 scrollbar-hide"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Search */}
                    <div className="flex items-center gap-2.5 bg-slate-50/80 rounded-2xl px-4 py-3 border border-slate-200/60 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all mb-4">
                      <Search size={16} className="text-slate-300 shrink-0" />
                      <input
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-300 outline-none"
                        placeholder="Search resources..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    {/* Journey phases */}
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
                      {JOURNEY_PHASES.map((phase) => (
                        <button
                          key={phase.id}
                          onClick={() => setSelectedPhase(phase.id)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap border transition-all shrink-0 ${
                            selectedPhase === phase.id
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-white border-slate-200/60 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          <span>{phase.emoji}</span>
                          <span>{phase.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Topic filters */}
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 -mx-1 px-1">
                      {RESOURCE_TOPICS.map((topic) => (
                        <button
                          key={topic.id}
                          onClick={() => setSelectedTopic(selectedTopic === topic.id ? null : topic.id)}
                          className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all shrink-0 ${
                            selectedTopic === topic.id
                              ? topicColors[topic.id]
                              : "bg-white border-slate-200/60 text-slate-400 hover:border-slate-300"
                          }`}
                        >
                          {topic.label}
                        </button>
                      ))}
                    </div>

                    {/* Resource cards */}
                    <div className="flex flex-col gap-3">
                      {filteredResources.map((resource: any) => (
                        <motion.button
                          key={resource.id}
                          className="flex items-center gap-3.5 p-4 bg-white border border-slate-200/60 rounded-2xl text-left hover:border-emerald-300 hover:shadow-sm active:scale-[0.99] transition-all group"
                          whileHover={{ y: -1 }}
                          transition={springTransition}
                        >
                          <div className="flex-1">
                            <h3 className="text-sm font-semibold text-slate-800 mb-1.5 group-hover:text-emerald-700 transition-colors">{resource.title}</h3>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${topicColors[resource.topic]}`}>
                                {topicLabels[resource.topic]}
                              </span>
                              <span className="text-[11px] text-slate-300">{resource.readTime}</span>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-400 transition-colors shrink-0" />
                        </motion.button>
                      ))}
                      {filteredResources.length === 0 && (
                        <div className="py-12 text-center text-sm text-slate-300">No resources match your filters.</div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ============ YOU TAB ============ */}
                {activeTab === "you" && (
                  <motion.div
                    key="you"
                    className="absolute inset-0 flex flex-col overflow-y-auto px-6 py-6 scrollbar-hide"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Profile header */}
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg font-semibold">
                        {firstName ? firstName[0].toUpperCase() : "?"}
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-slate-800">{session?.user?.name || "User"}</div>
                        <div className="text-sm text-slate-400">{session?.user?.email}</div>
                      </div>
                    </div>

                    {/* Decree section */}
                    <div className="mb-6">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Decree</h3>
                      {decreeFileName ? (
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200/60 rounded-2xl">
                          <FileText size={18} className="text-emerald-600 shrink-0" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-emerald-800">{decreeFileName}</div>
                            {decreePages > 0 && <div className="text-xs text-emerald-600">{decreePages} pages</div>}
                          </div>
                          <button onClick={() => { setDecreeText(""); setDecreeFileName(""); setDecreePages(0); }} className="text-emerald-400 hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="w-full p-4 border border-dashed border-slate-200 rounded-2xl text-sm text-slate-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center gap-2"
                        >
                          <Upload size={16} />
                          Upload your decree
                        </button>
                      )}
                    </div>

                    {/* Recent conversations */}
                    {conversations.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Recent Conversations</h3>
                        <div className="flex flex-col gap-2">
                          {conversations.slice(0, 5).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setActiveConvId(c.id); setActiveTab("chat"); }}
                              className="flex items-center gap-3 p-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-left hover:border-emerald-300 transition-all"
                            >
                              <MessageSquare size={14} className="text-slate-300 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-700 truncate">{c.title || "New conversation"}</div>
                                <div className="text-[11px] text-slate-300">{c.messages?.length || 0} messages</div>
                              </div>
                              <ChevronRight size={14} className="text-slate-300 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Settings links */}
                    <div className="mb-6">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Settings</h3>
                      <div className="flex flex-col gap-1">
                        {[
                          { icon: Shield, label: "Privacy & Data" },
                          { icon: HelpCircle, label: "Help & Support" },
                          { icon: Info, label: "About Meridian" },
                        ].map((item) => (
                          <button key={item.label} className="flex items-center gap-3 p-3 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all">
                            <item.icon size={16} className="text-slate-400" />
                            <span className="flex-1 text-left">{item.label}</span>
                            <ChevronRight size={14} className="text-slate-300" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Name edit */}
                    <div className="mb-6">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Name</h3>
                      <input
                        className="w-full px-3.5 py-2.5 border border-slate-200/60 rounded-xl text-sm text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                        value={editName || session?.user?.name || ""}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => { if (editName.trim() && editName.trim() !== session?.user?.name) handleUpdateName(editName); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleUpdateName(editName); (e.target as HTMLInputElement).blur(); } }}
                      />
                    </div>

                    {/* Sign out */}
                    <button
                      onClick={() => setShowSignOutConfirm(true)}
                      className="w-full py-3 border border-slate-200 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* --- Bottom Nav --- */}
            <nav className="flex items-center justify-around px-6 py-3 border-t border-slate-100 bg-white sticky bottom-0 z-10">
              {([
                { id: "chat" as Tab, icon: MessageSquare, label: "Chat" },
                { id: "learn" as Tab, icon: BookOpen, label: "Learn" },
                { id: "you" as Tab, icon: User, label: "You" },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all ${
                    activeTab === tab.id
                      ? "text-emerald-600"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.2 : 1.6} />
                  <span className="text-[11px] font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* --- History drawer --- */}
          <AnimatePresence>
            {showHistory && (
              <>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/20"
                  onClick={() => setShowHistory(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                <motion.div
                  className="fixed top-0 left-0 bottom-0 w-[300px] max-w-[85vw] bg-white z-[51] flex flex-col shadow-xl"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={springTransition}
                >
                  <div className="px-4 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
                    <span className="text-[15px] font-semibold text-slate-800">Conversations</span>
                    <button onClick={() => setShowHistory(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto py-2">
                    {conversations.map((c) => (
                      <button
                        key={c.id}
                        className={`w-full px-4 py-3 text-left relative pr-9 hover:bg-slate-50 transition-colors ${c.id === activeConvId ? "bg-slate-50" : ""}`}
                        onClick={() => { setActiveConvId(c.id); setShowHistory(false); }}
                      >
                        <div className="text-sm font-medium text-slate-700 truncate">{c.title || "New conversation"}</div>
                        <div className="text-[12px] text-slate-400">{c.messages?.length || 0} messages</div>
                        <span
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConversations((prev) => prev.filter((x) => x.id !== c.id));
                            if (activeConvId === c.id) setActiveConvId(null);
                          }}
                        >
                          <X size={12} />
                        </span>
                      </button>
                    ))}
                    {conversations.length === 0 && (
                      <div className="py-6 text-center text-sm text-slate-300">No conversations yet</div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* --- Feedback modal --- */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                className="fixed inset-0 z-[200] bg-black/30 flex items-end justify-center"
                onClick={() => !feedbackSending && setShowFeedback(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="w-full max-w-[480px] bg-white rounded-t-2xl px-6 pb-8 pt-3"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={springTransition}
                >
                  <div className="w-9 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
                  {feedbackSent ? (
                    <div className="flex flex-col items-center py-6">
                      <Check size={32} className="text-emerald-500 mb-3" />
                      <span className="text-base font-semibold text-slate-800">Thank you!</span>
                      <span className="text-sm text-slate-400">Your feedback helps us improve.</span>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-slate-800 mb-1">Send Feedback</h3>
                      <p className="text-sm text-slate-400 mb-4">Tell us what's working, what's not, or what you'd love to see.</p>
                      <textarea
                        className="w-full border border-slate-200/60 rounded-xl px-3.5 py-3 text-[15px] text-slate-800 bg-slate-50/80 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none placeholder:text-slate-300"
                        placeholder="Your feedback..."
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        rows={4}
                        autoFocus
                      />
                      <button
                        onClick={handleFeedbackSubmit}
                        disabled={!feedbackText.trim() || feedbackSending}
                        className="w-full mt-3 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[15px] font-medium shadow-lg shadow-emerald-500/20 hover:shadow-xl disabled:opacity-40 disabled:shadow-none transition-all"
                      >
                        {feedbackSending ? "Sending..." : "Submit Feedback"}
                      </button>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* --- Sign out confirm --- */}
          <AnimatePresence>
            {showSignOutConfirm && (
              <motion.div
                className="fixed inset-0 z-[9999] bg-black/35 flex items-center justify-center px-6"
                onClick={() => setShowSignOutConfirm(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="bg-white rounded-2xl p-7 max-w-[300px] w-full text-center"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={springTransition}
                >
                  <h3 className="text-[17px] font-semibold text-slate-800 mb-1.5">Sign out?</h3>
                  <p className="text-sm text-slate-400 mb-6 leading-snug">You'll need to sign back in to continue your conversations.</p>
                  <div className="flex gap-2.5">
                    <button onClick={() => setShowSignOutConfirm(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-[15px] font-medium hover:bg-slate-200 transition-colors">Cancel</button>
                    <button onClick={() => { setShowSignOutConfirm(false); handleSignOut(); }} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[15px] font-medium hover:shadow-lg transition-all">Sign Out</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toast */}
          <AnimatePresence>
            {showToast && (
              <motion.div
                className="fixed bottom-[100px] left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-2 rounded-full text-[13px] font-medium z-[200] pointer-events-none"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                Copied!
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn {
          to { opacity: 1; }
        }
        @keyframes waterDrift1 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-60px, 40px) scale(1.08); }
          50% { transform: translate(-20px, 80px) scale(0.95); }
          75% { transform: translate(40px, 30px) scale(1.05); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes waterDrift2 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(50px, -30px) scale(1.1); }
          50% { transform: translate(80px, 20px) scale(0.92); }
          75% { transform: translate(20px, -50px) scale(1.06); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes waterDrift3 {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, -50px) scale(1.12); }
          66% { transform: translate(50px, 30px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes waterDrift4 {
          0% { transform: translate(0, 0) scale(1); }
          20% { transform: translate(30px, 60px) scale(1.05); }
          40% { transform: translate(70px, 20px) scale(0.95); }
          60% { transform: translate(40px, -40px) scale(1.1); }
          80% { transform: translate(-20px, -20px) scale(0.98); }
          100% { transform: translate(0, 0) scale(1); }
        }
      `}</style>
    </>
  );
}
