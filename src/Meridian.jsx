import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

// --- Supabase raw fetch helpers ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sbFetch = async (path, { method = "GET", body, token } = {}) => {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
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

const authSignUp = (email, password) =>
  sbFetch("/auth/v1/signup", { method: "POST", body: { email, password } });

const authSignIn = (email, password) =>
  sbFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });

const authGetUser = (token) =>
  sbFetch("/auth/v1/user", { token });

const dbSelect = (table, query, token) =>
  sbFetch(`/rest/v1/${table}?${query}`, { token });

const dbUpsert = (table, body, token) =>
  sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    body,
    token,
  });

// Patch headers need Prefer: return=representation
const dbUpdate = async (table, query, body, token) => {
  const headers = {
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

const SYSTEM_PROMPT = `You are Meridian, a calm and grounding AI companion for divorced parents navigating co-parenting. You help users understand their divorce decree, handle conflict situations, and draft neutral, child-focused communications.

IMPORTANT RULES:
- You are NOT a lawyer and never provide legal advice
- Always remind users to consult their attorney for legal decisions
- Keep responses calm, neutral, and child-focused
- Never take sides or fuel conflict
- When drafting messages, make them brief, factual, and non-inflammatory
- Always ground your guidance in what the user has shared about their decree
- Format responses clearly with sections when helpful

Your three core capabilities:
1. DECREE QUESTIONS - Help users understand what their decree says about a topic
2. SITUATION GUIDANCE - Help users navigate a specific conflict or situation
3. DRAFT A MESSAGE - Help users write a calm, neutral message to their co-parent

Always end responses with a brief grounding reminder like "Stay focused on [child's wellbeing / the long game / what you can control]."`;

const MODES = [
  { id: "guidance", label: "Guidance" },
  { id: "decree", label: "Decree Q&A" },
  { id: "draft", label: "Draft" },
];

const MODE_HINTS = {
  guidance: "Describe what's happening. I'll help you think it through.",
  decree: "What would you like to know about your decree?",
  draft: "What do you need to say to your co-parent?",
};

const STARTERS = {
  guidance: [
    "My co-parent won't follow the schedule",
    "How do I handle a disagreement about rules?",
    "My kids seem stressed after transitions",
  ],
  decree: [
    "What does my decree say about holidays?",
    "Explain the custody schedule",
    "What are the rules around relocation?",
  ],
  draft: [
    "Request a schedule change",
    "Respond to a difficult message",
    "Propose a holiday arrangement",
  ],
};

// --- Icons (inline SVG for zero dependencies) ---
const IconUpload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconNew = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export default function Meridian() {
  // --- Auth state ---
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("m_session")); } catch { return null; }
  });
  const [authView, setAuthView] = useState("signup"); // "login" | "signup" | "onboarding"
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Check for OAuth callback (hash token)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("access_token");
      if (token) {
        window.history.replaceState(null, "", window.location.pathname);
        authGetUser(token).then(async (user) => {
          // Check if profile exists
          try {
            const profiles = await dbSelect("profiles", `id=eq.${user.id}&select=*`, token);
            if (profiles?.length) {
              const s = { token, user: { id: user.id, email: user.email, name: profiles[0].name } };
              setSession(s);
              localStorage.setItem("m_session", JSON.stringify(s));
            } else {
              // New OAuth user — needs onboarding
              setSession({ token, user: { id: user.id, email: user.email, name: "" } });
              setAuthView("onboarding");
            }
          } catch {
            const s = { token, user: { id: user.id, email: user.email, name: user.user_metadata?.full_name || "" } };
            setSession(s);
            localStorage.setItem("m_session", JSON.stringify(s));
          }
        }).catch(() => {});
      }
    }
  }, []);

  const handleSignUp = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await authSignUp(authEmail, authPassword);
      if (data?.access_token) {
        const s = { token: data.access_token, user: { id: data.user.id, email: authEmail, name: "" } };
        setSession(s);
        setAuthView("onboarding");
      } else if (data?.id) {
        // Email confirmation required
        setAuthError("Check your email for a confirmation link.");
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await authSignIn(authEmail, authPassword);
      const token = data.access_token;
      let name = "";
      try {
        const profiles = await dbSelect("profiles", `id=eq.${data.user.id}&select=name`, token);
        if (profiles?.length) name = profiles[0].name;
      } catch {}
      const s = { token, user: { id: data.user.id, email: authEmail, name } };
      setSession(s);
      localStorage.setItem("m_session", JSON.stringify(s));
    } catch (err) {
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
      setAuthView("login");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${window.location.origin}`;
  };

  const handleSignOut = () => {
    setSession(null);
    localStorage.removeItem("m_session");
    localStorage.removeItem("m_messages");
    setMessages([]);
  };

  // --- App state ---
  const [showSplash, setShowSplash] = useState(() => {
    // Skip splash if returning from OAuth callback
    if (window.location.hash.includes("access_token=")) return false;
    try { return !localStorage.getItem("m_session"); } catch { return true; }
  });
  const [splashFading, setSplashFading] = useState(false);
  const [splashView, setSplashView] = useState("text"); // "text" | "video"
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const [mode, setMode] = useState("guidance");
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem("m_messages")) || []; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [decreeText, setDecreeText] = useState(() => localStorage.getItem("m_decree_text") || "");
  const [decreeFileName, setDecreeFileName] = useState(() => localStorage.getItem("m_decree_name") || "");
  const [decreePages, setDecreePages] = useState(() => {
    try { return parseInt(localStorage.getItem("m_decree_pages")) || 0; } catch { return 0; }
  });
  const [copied, setCopied] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const videoRef = useRef(null);

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
    if (v.paused) {
      v.play().catch(() => {});
      setVideoPaused(false);
    } else {
      v.pause();
      setVideoPaused(true);
    }
    setShowPauseIcon(true);
    setTimeout(() => setShowPauseIcon(false), 800);
  };

  const handleVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
  };

  const handleVideoEnded = () => {
    setVideoProgress(100);
    setVideoEnded(true);
  };
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Persist messages
  useEffect(() => {
    localStorage.setItem("m_messages", JSON.stringify(messages));
  }, [messages]);

  // Persist decree
  useEffect(() => {
    if (decreeText) localStorage.setItem("m_decree_text", decreeText);
    else localStorage.removeItem("m_decree_text");
    if (decreeFileName) localStorage.setItem("m_decree_name", decreeFileName);
    else localStorage.removeItem("m_decree_name");
    if (decreePages) localStorage.setItem("m_decree_pages", String(decreePages));
    else localStorage.removeItem("m_decree_pages");
  }, [decreeText, decreeFileName, decreePages]);

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  const [uploading, setUploading] = useState(false);

  const extractPdfText = async (file) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    setDecreePages(pdf.numPages);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
    return pages.join("\n\n");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecreeFileName(file.name);
    setUploading(true);
    try {
      let text;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
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

  const handleSend = async (overrideMsg) => {
    const userMsg = (overrideMsg || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "24px";
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    const modeContext = {
      decree: "The user is asking about their divorce decree. Help them understand what it says.",
      guidance: "The user is describing a co-parenting situation. Provide calm, grounded guidance.",
      draft: "The user needs to send a message to their co-parent. Draft a neutral, brief, child-focused message.",
    };

    const decreeContext = decreeText
      ? `\n\nDIVORCE DECREE CONTENT:\n${decreeText.slice(0, 8000)}`
      : "\n\nNo decree uploaded yet. Remind the user they can upload their decree for more personalized guidance.";

    const systemWithContext = `${SYSTEM_PROMPT}\n\nCURRENT MODE: ${modeContext[mode]}${decreeContext}`;
    const history = [...messages, { role: "user", content: userMsg }].map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
      });

      if (!res.ok) {
        throw new Error("API error");
      }

      // Stream the response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setLoading(false);

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
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullText };
                return updated;
              });
            }
          } catch { /* skip non-JSON lines */ }
        }
      }

      if (!fullText) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || feedbackSending) return;
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackSent(true);
      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackText("");
        setFeedbackSent(false);
      }, 1800);
    } catch {
      alert("Failed to send feedback. Please try again.");
    } finally {
      setFeedbackSending(false);
    }
  };

  const hasConversation = messages.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { background: #FAFAFA; -webkit-font-smoothing: antialiased; }

        .m-app {
          height: 100vh;
          display: flex;
          flex-direction: column;
          max-width: 480px;
          margin: 0 auto;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #1A1A1A;
          background: #fff;
          position: relative;
        }

        /* --- Header --- */
        .m-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #F0F0F0;
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .m-wordmark {
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.3px;
          color: #1A1A1A;
        }
        .m-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .m-icon-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          color: #999;
          cursor: pointer;
          border-radius: 10px;
          transition: background 0.15s, color 0.15s;
        }
        .m-icon-btn:hover { background: #F5F5F5; color: #666; }

        /* --- Segmented Control --- */
        .m-modes {
          display: flex;
          gap: 4px;
          padding: 12px 20px;
          background: #fff;
        }
        .m-mode-btn {
          flex: 1;
          padding: 8px 0;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          background: transparent;
          color: #999;
        }
        .m-mode-btn[data-active="true"] {
          background: #F5F5F5;
          color: #1A1A1A;
        }
        .m-mode-btn:hover:not([data-active="true"]) {
          color: #666;
        }

        /* --- Scroll area --- */
        .m-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px 20px 20px;
          display: flex;
          flex-direction: column;
        }
        .m-scroll::-webkit-scrollbar { width: 0; }

        /* --- Decree chip --- */
        .m-decree-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          border: 1px dashed #D4D4D4;
          color: #999;
          background: none;
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.15s, color 0.15s;
          align-self: flex-start;
          margin-bottom: 16px;
        }
        .m-decree-chip:hover { border-color: #AAA; color: #666; }
        .m-decree-chip[data-loaded="true"] {
          border-style: solid;
          border-color: #D1FAE5;
          background: #F0FDF4;
          color: #16A34A;
          cursor: default;
        }
        .m-decree-remove {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: none;
          background: rgba(0,0,0,0.06);
          color: #16A34A;
          cursor: pointer;
          margin-left: 2px;
          transition: background 0.15s;
        }
        .m-decree-remove:hover { background: rgba(0,0,0,0.1); }

        /* --- Empty state --- */
        .m-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 0;
          text-align: center;
        }
        .m-welcome {
          animation: m-fade-up 0.4s ease both;
        }
        .m-welcome-icon {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          background: linear-gradient(135deg, #F0EEFF 0%, #E8F4FD 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          color: #8B7CF6;
        }
        .m-welcome-title {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.3px;
          color: #1A1A1A;
          margin-bottom: 6px;
        }
        .m-welcome-sub {
          font-size: 14px;
          line-height: 1.5;
          color: #999;
          max-width: 260px;
          margin: 0 auto 24px;
        }
        .m-starters {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          animation: m-fade-up 0.4s ease 0.1s both;
        }
        .m-starter {
          padding: 12px 16px;
          background: #FAFAFA;
          border: 1px solid #F0F0F0;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 400;
          font-family: inherit;
          color: #555;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .m-starter:hover {
          background: #F5F5F5;
          border-color: #E5E5E5;
          color: #333;
        }
        .m-starter:active { transform: scale(0.99); }
        .m-starter-arrow {
          margin-left: auto;
          color: #CCC;
          flex-shrink: 0;
        }
        /* Mode transition */
        .m-modes-content {
          animation: m-mode-fade 0.25s ease both;
        }
        @keyframes m-mode-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* --- Messages --- */
        .m-messages {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .m-msg {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .m-msg[data-role="user"] { align-items: flex-end; }
        .m-msg[data-role="assistant"] { align-items: flex-start; }

        .m-bubble {
          max-width: 88%;
          font-size: 15px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .m-msg[data-role="user"] .m-bubble {
          background: #1A1A1A;
          color: #fff;
          padding: 12px 16px;
          border-radius: 20px 20px 4px 20px;
        }
        .m-msg[data-role="assistant"] .m-bubble {
          color: #374151;
          padding: 4px 0;
        }

        /* --- Markdown inside assistant bubbles --- */
        .m-md { white-space: normal; }
        .m-md p { margin-bottom: 10px; }
        .m-md p:last-child { margin-bottom: 0; }
        .m-md strong { font-weight: 600; color: #1A1A1A; }
        .m-md em { font-style: italic; }
        .m-md ul, .m-md ol { margin: 8px 0; padding-left: 20px; }
        .m-md li { margin-bottom: 4px; }
        .m-md h1, .m-md h2, .m-md h3 {
          font-weight: 600;
          color: #1A1A1A;
          margin: 14px 0 6px;
          line-height: 1.3;
        }
        .m-md h1 { font-size: 17px; }
        .m-md h2 { font-size: 16px; }
        .m-md h3 { font-size: 15px; }
        .m-md code {
          background: #F5F5F5;
          padding: 2px 5px;
          border-radius: 4px;
          font-size: 13px;
          font-family: 'SF Mono', 'Menlo', monospace;
        }
        .m-md pre {
          background: #F5F5F5;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .m-md pre code {
          background: none;
          padding: 0;
        }
        .m-md blockquote {
          border-left: 3px solid #E5E5E5;
          padding-left: 12px;
          color: #777;
          margin: 8px 0;
        }
        .m-md hr {
          border: none;
          border-top: 1px solid #F0F0F0;
          margin: 12px 0;
        }

        /* --- Copy button --- */
        .m-copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: none;
          background: none;
          color: #BCBCBC;
          font-size: 11px;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          margin-top: 2px;
        }
        .m-copy-btn:hover { color: #888; background: #F5F5F5; }

        /* --- Typing dots --- */
        .m-typing {
          display: flex;
          gap: 5px;
          padding: 8px 0;
        }
        .m-typing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #CCC;
          animation: m-bounce 1.4s ease-in-out infinite;
        }
        .m-typing-dot:nth-child(2) { animation-delay: 0.16s; }
        .m-typing-dot:nth-child(3) { animation-delay: 0.32s; }
        @keyframes m-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }

        /* --- Input --- */
        .m-input-area {
          padding: 12px 20px 24px;
          background: #fff;
          border-top: 1px solid #F0F0F0;
          position: sticky;
          bottom: 0;
        }
        .m-input-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background: #F5F5F5;
          border-radius: 16px;
          padding: 10px 10px 10px 16px;
          transition: box-shadow 0.2s;
        }
        .m-input-row:focus-within {
          box-shadow: 0 0 0 2px rgba(0,0,0,0.06);
        }
        .m-textarea {
          flex: 1;
          border: none;
          background: none;
          color: #1A1A1A;
          font-size: 15px;
          font-family: inherit;
          line-height: 1.5;
          resize: none;
          outline: none;
          min-height: 24px;
          max-height: 120px;
        }
        .m-textarea::placeholder { color: #BCBCBC; }
        .m-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
          flex-shrink: 0;
          background: #1A1A1A;
          color: #fff;
        }
        .m-send-btn:disabled {
          background: #E5E5E5;
          color: #BCBCBC;
          cursor: default;
        }
        .m-send-btn:not(:disabled):hover { background: #333; }

        .m-disclaimer {
          font-size: 11px;
          color: #CCC;
          text-align: center;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
        }
        .m-disclaimer-sep {
          margin: 0 6px;
        }
        .m-feedback-link {
          background: none;
          border: none;
          font-size: 11px;
          font-family: inherit;
          color: #BCBCBC;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .m-feedback-link:hover { color: #999; }

        /* --- Splash --- */
        .m-splash {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #FDFCFB;
          overflow: hidden;
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .m-splash[data-fading="true"] {
          opacity: 0;
          pointer-events: none;
        }

        /* Fluid water background */
        .m-splash-bg {
          position: absolute;
          inset: -40%;
          overflow: hidden;
          opacity: 0;
          animation: m-ambient-in 3s ease 0.2s forwards;
          filter: url(#m-water-filter);
        }
        .m-splash-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          will-change: transform;
        }
        .m-splash-glow-1 {
          width: 55%;
          height: 55%;
          top: 10%;
          right: 5%;
          background: radial-gradient(circle, rgba(199, 210, 254, 0.6) 0%, rgba(199, 210, 254, 0) 70%);
          animation: m-water-1 18s ease-in-out infinite;
        }
        .m-splash-glow-2 {
          width: 50%;
          height: 50%;
          bottom: 5%;
          left: 0%;
          background: radial-gradient(circle, rgba(221, 214, 254, 0.5) 0%, rgba(221, 214, 254, 0) 70%);
          animation: m-water-2 22s ease-in-out infinite;
        }
        .m-splash-glow-3 {
          width: 45%;
          height: 45%;
          top: 35%;
          left: 30%;
          background: radial-gradient(circle, rgba(186, 230, 253, 0.45) 0%, rgba(186, 230, 253, 0) 70%);
          animation: m-water-3 16s ease-in-out infinite;
        }
        .m-splash-glow-4 {
          width: 40%;
          height: 40%;
          top: 15%;
          left: 10%;
          background: radial-gradient(circle, rgba(196, 181, 253, 0.35) 0%, rgba(196, 181, 253, 0) 70%);
          animation: m-water-4 20s ease-in-out infinite;
        }
        .m-splash-glow-5 {
          width: 35%;
          height: 35%;
          bottom: 20%;
          right: 15%;
          background: radial-gradient(circle, rgba(165, 214, 243, 0.4) 0%, rgba(165, 214, 243, 0) 70%);
          animation: m-water-5 24s ease-in-out infinite;
        }

        .m-splash-content {
          position: relative;
          z-index: 1;
          max-width: 420px;
          width: 100%;
          padding: 0 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        /* Splash inner layer (text or video) */
        .m-splash-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          animation: m-fade-up 0.5s ease both;
        }
        @keyframes m-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Wordmark */
        .m-splash-mark {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #BCBCBC;
          margin-bottom: 48px;
          opacity: 0;
          animation: m-reveal 1s cubic-bezier(0.25, 0.1, 0, 1) 0.4s forwards;
        }

        /* Headline — smooth flow-in reveal */
        .m-splash-h {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 36px;
          font-weight: 500;
          font-style: italic;
          line-height: 1.35;
          color: #2A2A2A;
          margin-bottom: 28px;
          letter-spacing: -0.3px;
        }
        .m-splash-line {
          display: block;
          overflow: hidden;
        }
        .m-splash-line-text {
          display: inline-block;
          clip-path: inset(0 100% 0 0);
          opacity: 0;
        }
        .m-splash-line:nth-child(1) .m-splash-line-text {
          animation: m-flow-in 1.4s cubic-bezier(0.25, 0.1, 0, 1) 0.5s forwards;
        }
        .m-splash-line:nth-child(2) .m-splash-line-text {
          animation: m-flow-in 1.2s cubic-bezier(0.25, 0.1, 0, 1) 1.6s forwards;
        }
        @keyframes m-flow-in {
          0% {
            opacity: 1;
            clip-path: inset(0 100% 0 0);
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0% 0 0);
          }
        }

        .m-splash-sub {
          font-size: 16px;
          line-height: 1.7;
          color: #999;
          margin-bottom: 48px;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 3.0s forwards;
        }

        /* CTA */
        .m-splash-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 16px 40px;
          background: #1A1A1A;
          color: #fff;
          border: none;
          border-radius: 100px;
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          letter-spacing: -0.1px;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 3.4s forwards;
          transition: transform 0.3s cubic-bezier(0.25, 0.1, 0, 1), box-shadow 0.3s ease;
        }
        .m-splash-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        }
        .m-splash-cta:active {
          transform: translateY(0) scale(0.98);
          box-shadow: none;
        }

        .m-splash-video-link {
          margin-top: 16px;
          padding: 10px 20px;
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid #E0E0E0;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          color: #777;
          cursor: pointer;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 3.8s forwards;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .m-splash-video-link:hover {
          background: rgba(0, 0, 0, 0.06);
          border-color: #CCC;
          color: #555;
        }
        .m-splash-video-link:active {
          transform: scale(0.98);
        }

        .m-splash-footer {
          position: absolute;
          bottom: 36px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          z-index: 2;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 4.0s forwards;
        }
        .m-splash-footer span {
          padding: 8px 18px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
          color: #BCBCBC;
          white-space: nowrap;
          letter-spacing: 0.2px;
        }

        @keyframes m-reveal {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes m-ambient-in {
          to { opacity: 1; }
        }
        @keyframes m-water-1 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-60px, 40px) scale(1.08); }
          50% { transform: translate(-20px, 80px) scale(0.95); }
          75% { transform: translate(40px, 30px) scale(1.05); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes m-water-2 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(50px, -30px) scale(1.1); }
          50% { transform: translate(80px, 20px) scale(0.92); }
          75% { transform: translate(20px, -50px) scale(1.06); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes m-water-3 {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, -50px) scale(1.12); }
          66% { transform: translate(50px, 30px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes m-water-4 {
          0% { transform: translate(0, 0) scale(1); }
          20% { transform: translate(30px, 60px) scale(1.05); }
          40% { transform: translate(70px, 20px) scale(0.95); }
          60% { transform: translate(40px, -40px) scale(1.1); }
          80% { transform: translate(-20px, -20px) scale(0.98); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes m-water-5 {
          0% { transform: translate(0, 0) scale(1); }
          30% { transform: translate(-50px, 40px) scale(1.08); }
          60% { transform: translate(30px, -60px) scale(0.94); }
          100% { transform: translate(0, 0) scale(1); }
        }

        /* --- Video view (inside splash) --- */
        .m-sv-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          margin-bottom: 20px;
        }
        .m-sv-back {
          position: absolute;
          left: 0;
          padding: 8px 14px 8px 8px;
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid #E8E8E8;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          color: #888;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .m-sv-back:hover { background: rgba(0, 0, 0, 0.07); color: #555; }
        .m-sv-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: #BCBCBC;
        }
        .m-sv-card {
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          background: #E8E8E8;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
          position: relative;
          margin-bottom: 20px;
          cursor: pointer;
        }
        .m-sv-video {
          width: 100%;
          max-height: calc(100vh - 280px);
          display: block;
          object-fit: contain;
          background: #E8E8E8;
        }
        .m-sv-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(0, 0, 0, 0.06);
        }
        .m-sv-progress-bar {
          height: 100%;
          background: #2A2A2A;
          transition: width 0.3s linear;
          border-radius: 0 2px 2px 0;
          opacity: 0.35;
        }

        /* Tap-to-pause overlay */
        .m-sv-play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .m-sv-play-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          opacity: 0;
          transform: scale(0.8);
          transition: opacity 0.2s, transform 0.2s;
        }
        .m-sv-play-icon[data-visible="true"] {
          opacity: 1;
          transform: scale(1);
        }
        /* Persistent pause state indicator */
        .m-sv-paused-indicator {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          background: rgba(0, 0, 0, 0.15);
        }
        .m-sv-paused-indicator svg {
          opacity: 0.7;
        }

        /* --- Feedback modal --- */
        .m-fb-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: m-fb-fade-in 0.2s ease;
        }
        @keyframes m-fb-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .m-fb-sheet {
          width: 100%;
          max-width: 480px;
          background: #fff;
          border-radius: 20px 20px 0 0;
          padding: 12px 24px 32px;
          animation: m-fb-slide-up 0.3s cubic-bezier(0.25, 0.1, 0, 1);
        }
        @keyframes m-fb-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .m-fb-handle {
          width: 36px;
          height: 4px;
          border-radius: 2px;
          background: #E0E0E0;
          margin: 0 auto 20px;
        }
        .m-fb-title {
          font-size: 18px;
          font-weight: 600;
          color: #1A1A1A;
          margin-bottom: 4px;
        }
        .m-fb-sub {
          font-size: 14px;
          color: #999;
          margin-bottom: 16px;
        }
        .m-fb-input {
          width: 100%;
          border: 1px solid #E5E5E5;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 15px;
          font-family: inherit;
          color: #1A1A1A;
          resize: none;
          outline: none;
          transition: border-color 0.15s;
          background: #FAFAFA;
        }
        .m-fb-input:focus { border-color: #BCBCBC; }
        .m-fb-input::placeholder { color: #CCC; }
        .m-fb-submit {
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          background: #1A1A1A;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
        }
        .m-fb-submit:hover { background: #333; }
        .m-fb-submit:disabled { background: #E5E5E5; color: #BCBCBC; cursor: default; }
        .m-fb-sent {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 0;
          animation: m-fade-up 0.3s ease both;
        }

        /* --- Auth screen --- */
        .m-auth {
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          max-width: 400px;
          margin: 0 auto;
          padding: 24px;
          font-family: 'Inter', -apple-system, sans-serif;
          animation: m-fade-up 0.4s ease both;
        }
        .m-auth-mark {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #BCBCBC;
          margin-bottom: 32px;
        }
        .m-auth-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 28px;
          font-weight: 500;
          font-style: italic;
          color: #2A2A2A;
          margin-bottom: 8px;
          text-align: center;
        }
        .m-auth-sub {
          font-size: 14px;
          color: #999;
          margin-bottom: 32px;
          text-align: center;
        }
        .m-auth-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .m-auth-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid #E5E5E5;
          border-radius: 12px;
          font-size: 15px;
          font-family: inherit;
          color: #1A1A1A;
          background: #FAFAFA;
          outline: none;
          transition: border-color 0.15s;
        }
        .m-auth-input:focus { border-color: #BCBCBC; }
        .m-auth-input::placeholder { color: #CCC; }
        .m-auth-btn {
          width: 100%;
          padding: 14px;
          background: #1A1A1A;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
        }
        .m-auth-btn:hover { background: #333; }
        .m-auth-btn:disabled { background: #E5E5E5; color: #BCBCBC; cursor: default; }
        .m-auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #CCC;
          font-size: 12px;
          margin: 4px 0;
        }
        .m-auth-divider::before,
        .m-auth-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #F0F0F0;
        }
        .m-auth-google {
          width: 100%;
          padding: 14px;
          background: #fff;
          border: 1px solid #E5E5E5;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          color: #555;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .m-auth-google:hover { background: #FAFAFA; border-color: #DDD; }
        .m-auth-error {
          color: #DC2626;
          font-size: 13px;
          text-align: center;
          padding: 8px;
          background: #FEF2F2;
          border-radius: 8px;
        }
        .m-auth-switch {
          margin-top: 20px;
          font-size: 13px;
          color: #999;
        }
        .m-auth-switch button {
          background: none;
          border: none;
          color: #1A1A1A;
          font-weight: 500;
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .m-auth-switch button:hover { color: #555; }
      `}</style>

      {/* Splash shows first, then auth gate, then app */}
      {showSplash ? (
        <div className="m-splash" data-fading={splashFading}>
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <filter id="m-water-filter">
                <feTurbulence type="fractalNoise" baseFrequency="0.008 0.006" numOctaves="3" seed="2" result="noise">
                  <animate attributeName="baseFrequency" dur="30s" values="0.008 0.006;0.012 0.009;0.006 0.008;0.008 0.006" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="45" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
          </svg>
          <div className="m-splash-bg">
            <div className="m-splash-glow m-splash-glow-1" />
            <div className="m-splash-glow m-splash-glow-2" />
            <div className="m-splash-glow m-splash-glow-3" />
            <div className="m-splash-glow m-splash-glow-4" />
            <div className="m-splash-glow m-splash-glow-5" />
          </div>
          <div className="m-splash-content">
            {splashView === "text" ? (
              <div className="m-splash-inner" key="text">
                <div className="m-splash-mark">Meridian</div>
                <h1 className="m-splash-h">
                  <span className="m-splash-line"><span className="m-splash-line-text">Finally, someone</span></span>
                  <span className="m-splash-line"><span className="m-splash-line-text">on your side.</span></span>
                </h1>
                <p className="m-splash-sub">
                  Divorce is hard. Co-parenting is hard.<br />
                  We'll help you through it with calm, and clarity.
                </p>
                <button className="m-splash-cta" onClick={enterApp}>
                  Begin
                </button>
                <button className="m-splash-video-link" onClick={openVideo}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  Watch a message from our founder
                </button>
              </div>
            ) : (
              <div className="m-splash-inner" key="video">
                <div className="m-sv-header">
                  <button className="m-sv-back" onClick={closeVideo}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Back
                  </button>
                  <div className="m-sv-label">From our founder</div>
                </div>
                <div className="m-sv-card" onClick={togglePlayPause}>
                  <video
                    ref={videoRef}
                    className="m-sv-video"
                    src="/welcome.mp4"
                    playsInline
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={handleVideoEnded}
                  />
                  <div className="m-sv-progress">
                    <div className="m-sv-progress-bar" style={{ width: `${videoProgress}%` }} />
                  </div>
                  {/* Tap feedback icon */}
                  <div className="m-sv-play-overlay">
                    <div className="m-sv-play-icon" data-visible={showPauseIcon}>
                      {videoPaused ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      )}
                    </div>
                  </div>
                  {/* Persistent paused state */}
                  {videoPaused && !showPauseIcon && (
                    <div className="m-sv-paused-indicator">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </div>
                  )}
                </div>
                <button className="m-splash-cta" style={{ opacity: 1, animation: "none" }} onClick={enterApp}>
                  {videoEnded ? "Get Started" : "Begin"}
                </button>
              </div>
            )}
          </div>
          <div className="m-splash-footer"><span>Private · Confidential · Not legal advice</span></div>
        </div>
      ) : SUPABASE_URL && !session?.user?.name ? (
        <div className="m-auth">
          <div className="m-auth-mark">Meridian</div>
          {authView === "onboarding" ? (
            <>
              <div className="m-auth-title">One more step</div>
              <div className="m-auth-sub">What should we call you?</div>
              <div className="m-auth-form">
                <input
                  className="m-auth-input"
                  type="text"
                  placeholder="Your first name"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleOnboarding()}
                  autoFocus
                />
                {authError && <div className="m-auth-error">{authError}</div>}
                <button className="m-auth-btn" onClick={handleOnboarding} disabled={!authName.trim() || authLoading}>
                  {authLoading ? "Saving..." : "Continue"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="m-auth-title">
                {authView === "login" ? "Welcome back" : "Create your account"}
              </div>
              <div className="m-auth-sub">
                {authView === "login" ? "Sign in to pick up where you left off." : "Your conversations stay private and secure."}
              </div>
              <div className="m-auth-form">
                <input
                  className="m-auth-input"
                  type="email"
                  placeholder="Email address"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoFocus
                />
                <input
                  className="m-auth-input"
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (authView === "login" ? handleSignIn() : handleSignUp())}
                />
                {authError && <div className="m-auth-error">{authError}</div>}
                <button
                  className="m-auth-btn"
                  onClick={authView === "login" ? handleSignIn : handleSignUp}
                  disabled={!authEmail || !authPassword || authLoading}
                >
                  {authLoading ? "Loading..." : authView === "login" ? "Sign In" : "Create Account"}
                </button>
                <div className="m-auth-divider">or</div>
                <button className="m-auth-google" onClick={handleGoogleLogin}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </button>
              </div>
              <div className="m-auth-switch">
                {authView === "login" ? (
                  <>Don't have an account? <button onClick={() => { setAuthView("signup"); setAuthError(""); }}>Sign up</button></>
                ) : (
                  <>Already have an account? <button onClick={() => { setAuthView("login"); setAuthError(""); }}>Sign in</button></>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      <div className="m-app">
        {/* Header */}
        <header className="m-header">
          <span className="m-wordmark">Meridian</span>
          <div className="m-header-actions">
            {hasConversation && (
              <button
                className="m-icon-btn"
                onClick={() => { setMessages([]); localStorage.removeItem("m_messages"); }}
                title="New conversation"
              >
                <IconNew />
              </button>
            )}
            {session?.user?.name && (
              <button
                className="m-icon-btn"
                onClick={handleSignOut}
                title={`Signed in as ${session.user.name} — tap to sign out`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Mode selector */}
        <div className="m-modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="m-mode-btn"
              data-active={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Scroll area */}
        <div className="m-scroll">
          {/* Decree upload — minimal chip */}
          {decreeFileName ? (
            <button className="m-decree-chip" data-loaded="true">
              {uploading ? <span style={{ fontSize: "12px" }}>Loading…</span> : <IconCheck />}
              <span>{decreeFileName}{decreePages > 0 ? ` · ${decreePages} pages` : ""}</span>
              <span
                className="m-decree-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  setDecreeText("");
                  setDecreeFileName("");
                  setDecreePages(0);
                }}
                title="Remove decree"
              >
                <IconX />
              </span>
            </button>
          ) : (
            <button className="m-decree-chip" onClick={() => fileRef.current?.click()}>
              <IconUpload />
              <span>Upload your decree</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />

          {/* Empty state or messages */}
          {!hasConversation ? (
            <div className="m-empty">
              <div className="m-modes-content" key={mode}>
                <div className="m-welcome">
                  <div className="m-welcome-icon">
                    {mode === "guidance" && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>}
                    {mode === "decree" && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                    {mode === "draft" && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
                  </div>
                  <div className="m-welcome-title">
                    {mode === "guidance" && "What's going on?"}
                    {mode === "decree" && "Ask about your decree"}
                    {mode === "draft" && "Draft a message"}
                  </div>
                  <div className="m-welcome-sub">{MODE_HINTS[mode]}</div>
                </div>
                <div className="m-starters">
                  {STARTERS[mode].map((s) => (
                    <button key={s} className="m-starter" onClick={() => handleSend(s)}>
                      {s}
                      <span className="m-starter-arrow">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="m-messages">
              {messages.map((msg, i) => (
                <div key={i} className="m-msg" data-role={msg.role}>
                  {msg.role === "assistant" ? (
                    <>
                      <div className="m-bubble m-md" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") }} />
                      {msg.content && (
                        <button className="m-copy-btn" onClick={() => copyToClipboard(msg.content, i)}>
                          {copied === i ? (
                            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied</>
                          ) : (
                            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="m-bubble">{msg.content}</div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="m-msg" data-role="assistant">
                  <div className="m-typing">
                    <div className="m-typing-dot" />
                    <div className="m-typing-dot" />
                    <div className="m-typing-dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="m-input-area">
          <div className="m-input-row">
            <textarea
              ref={textareaRef}
              className="m-textarea"
              placeholder={MODE_HINTS[mode]}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className="m-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              <IconSend />
            </button>
          </div>
          <div className="m-disclaimer">
            Not legal advice — always consult an attorney.
            <span className="m-disclaimer-sep">·</span>
            <button className="m-feedback-link" onClick={() => setShowFeedback(true)}>Feedback?</button>
          </div>
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedback && (
        <div className="m-fb-overlay" onClick={() => !feedbackSending && setShowFeedback(false)}>
          <div className="m-fb-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="m-fb-handle" />
            {feedbackSent ? (
              <div className="m-fb-sent">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: "#1A1A1A" }}>Thank you!</span>
                <span style={{ fontSize: 14, color: "#999" }}>Your feedback helps us improve.</span>
              </div>
            ) : (
              <>
                <div className="m-fb-title">Send Feedback</div>
                <div className="m-fb-sub">Tell us what's working, what's not, or what you'd love to see.</div>
                <textarea
                  className="m-fb-input"
                  placeholder="Your feedback..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  autoFocus
                />
                <button
                  className="m-fb-submit"
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || feedbackSending}
                >
                  {feedbackSending ? "Sending..." : "Submit Feedback"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </>
  );
}
