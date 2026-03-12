import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

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
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [splashView, setSplashView] = useState("text"); // "text" | "video"
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [mode, setMode] = useState("guidance");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [decreeText, setDecreeText] = useState("");
  const [decreeFileName, setDecreeFileName] = useState("");
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
    setTimeout(() => {
      const v = videoRef.current;
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    }, 400); // wait for crossfade to mostly finish
  };

  const closeVideo = () => {
    if (videoRef.current) videoRef.current.pause();
    setSplashView("text");
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
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const text = await extractPdfText(file);
        setDecreeText(text);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => setDecreeText(ev.target.result);
        reader.readAsText(file);
      }
    } catch {
      setDecreeText("");
      setDecreeFileName("");
    }
    setUploading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
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
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasConversation = messages.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
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
          padding: 40px 20px;
          text-align: center;
        }
        .m-empty-title {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.4px;
          color: #1A1A1A;
          margin-bottom: 8px;
        }
        .m-empty-body {
          font-size: 15px;
          line-height: 1.5;
          color: #999;
          max-width: 280px;
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
        }

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

        /* Ambient background glow */
        .m-splash-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          opacity: 0;
          animation: m-ambient-in 2s ease 0.2s forwards;
        }
        .m-splash-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
        }
        .m-splash-glow-1 {
          width: 400px;
          height: 400px;
          top: -10%;
          right: -20%;
          background: rgba(199, 210, 254, 0.5);
          animation: m-drift-1 12s ease-in-out infinite;
        }
        .m-splash-glow-2 {
          width: 350px;
          height: 350px;
          bottom: -5%;
          left: -15%;
          background: rgba(221, 214, 254, 0.4);
          animation: m-drift-2 14s ease-in-out infinite;
        }
        .m-splash-glow-3 {
          width: 250px;
          height: 250px;
          top: 40%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(186, 230, 253, 0.3);
          animation: m-drift-3 10s ease-in-out infinite;
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

        /* Headline — handwritten reveal */
        .m-splash-h {
          font-family: 'Dancing Script', cursive;
          font-size: 40px;
          font-weight: 600;
          line-height: 1.25;
          color: #2A2A2A;
          margin-bottom: 28px;
          position: relative;
        }
        .m-splash-line {
          display: block;
          position: relative;
          overflow: hidden;
        }
        .m-splash-line-text {
          display: inline-block;
          clip-path: inset(0 100% 0 0);
          opacity: 0;
        }
        /* Line 1: starts at 0.5s, takes 1.2s to write */
        .m-splash-line:nth-child(1) .m-splash-line-text {
          animation: m-write-in 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) 0.5s forwards;
        }
        /* Line 2: starts right after line 1 + brief pause */
        .m-splash-line:nth-child(2) .m-splash-line-text {
          animation: m-write-in 1s cubic-bezier(0.22, 0.61, 0.36, 1) 1.9s forwards;
        }
        @keyframes m-write-in {
          0% {
            opacity: 1;
            clip-path: inset(0 100% 0 0);
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0% 0 0);
          }
        }

        /* Pen cursor that traces along */
        .m-splash-line::after {
          content: '';
          position: absolute;
          top: 15%;
          width: 1.5px;
          height: 70%;
          background: #2A2A2A;
          opacity: 0;
          border-radius: 1px;
          left: 0;
        }
        .m-splash-line:nth-child(1)::after {
          animation: m-pen-move 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) 0.5s forwards,
                     m-cursor-fade 0.3s ease 1.7s forwards;
        }
        .m-splash-line:nth-child(2)::after {
          animation: m-pen-move 1s cubic-bezier(0.22, 0.61, 0.36, 1) 1.9s forwards,
                     m-cursor-fade 0.3s ease 2.9s forwards;
        }
        @keyframes m-pen-move {
          0% { opacity: 1; left: 0%; }
          100% { opacity: 1; left: 100%; }
        }
        @keyframes m-cursor-fade {
          to { opacity: 0; }
        }

        .m-splash-sub {
          font-size: 16px;
          line-height: 1.7;
          color: #999;
          margin-bottom: 48px;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 3.2s forwards;
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
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 3.6s forwards;
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
          margin-top: 20px;
          padding: 0;
          background: none;
          border: none;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          color: #BCBCBC;
          cursor: pointer;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 4.0s forwards;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .m-splash-video-link:hover { color: #888; }

        .m-splash-footer {
          font-size: 11px;
          color: #D4D4D4;
          margin-top: 32px;
          opacity: 0;
          animation: m-reveal 0.8s cubic-bezier(0.25, 0.1, 0, 1) 4.4s forwards;
          letter-spacing: 0.2px;
        }

        @keyframes m-reveal {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes m-ambient-in {
          to { opacity: 1; }
        }
        @keyframes m-drift-1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, 20px); }
        }
        @keyframes m-drift-2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(25px, -15px); }
        }
        @keyframes m-drift-3 {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -20px); }
        }

        /* --- Video card (inside splash) --- */
        .m-sv-card {
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          background: #F0F0F0;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
          position: relative;
          margin-bottom: 24px;
        }
        .m-sv-video {
          width: 100%;
          display: block;
          object-fit: contain;
          background: #F0F0F0;
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
          opacity: 0.4;
        }
        .m-sv-label {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #BCBCBC;
          margin-bottom: 16px;
        }
        .m-sv-back {
          padding: 0;
          background: none;
          border: none;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          color: #BCBCBC;
          cursor: pointer;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .m-sv-back:hover { color: #888; }
      `}</style>

      {showSplash && (
        <div className="m-splash" data-fading={splashFading}>
          <div className="m-splash-bg">
            <div className="m-splash-glow m-splash-glow-1" />
            <div className="m-splash-glow m-splash-glow-2" />
            <div className="m-splash-glow m-splash-glow-3" />
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
                <div className="m-splash-footer">Private. Confidential. Not legal advice.</div>
              </div>
            ) : (
              <div className="m-splash-inner" key="video">
                <div className="m-sv-label">A message from our founder</div>
                <div className="m-sv-card">
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
                </div>
                <button className="m-splash-cta" style={{ opacity: 1, animation: "none" }} onClick={enterApp}>
                  {videoEnded ? "Get Started" : "Begin"}
                </button>
                <button className="m-sv-back" onClick={closeVideo}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="m-app">
        {/* Header */}
        <header className="m-header">
          <span className="m-wordmark">Meridian</span>
          <div className="m-header-actions">
            {hasConversation && (
              <button
                className="m-icon-btn"
                onClick={() => setMessages([])}
                title="New conversation"
              >
                <IconNew />
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
              <span>{decreeFileName}</span>
              <span
                className="m-decree-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  setDecreeText("");
                  setDecreeFileName("");
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
              <div className="m-empty-title">{MODE_HINTS[mode]}</div>
            </div>
          ) : (
            <div className="m-messages">
              {messages.map((msg, i) => (
                <div key={i} className="m-msg" data-role={msg.role}>
                  <div className="m-bubble">{msg.content}</div>
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
          </div>
        </div>
      </div>
    </>
  );
}
