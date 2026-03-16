import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  Menu, X, Plus, Send, Mic, MicOff, Phone, PhoneOff,
  Copy, Check, Play, Volume2, VolumeX, Settings, Search,
  Trash2, ChevronDown, Image, FileText, Film, Bot, User,
  MessageSquarePlus, Sparkles, Zap, Code2, BookOpen, Lightbulb,
  RotateCcw, Edit3, ArrowDown, Globe, Brain, ChevronRight,
  Square, Clock, Hash, Star,
  Shield, Terminal, Palette
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: string[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  model: string;
}

interface AppSettings {
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
  voiceName: string;
  darkMode: boolean;
  fontSize: number;
  streamEnabled: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  desc: string;
  icon: ReactNode;
  ctx: string;
  vision?: boolean;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const DEFAULT_API_KEY = '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';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS: ModelInfo[] = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', desc: 'Most capable & versatile', icon: <Brain size={16} />, ctx: '128K' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', desc: 'Ultra fast responses', icon: <Zap size={16} />, ctx: '128K' },
  { id: 'llama3-70b-8192', name: 'Llama 3 70B', desc: 'Powerful reasoning', icon: <Star size={16} />, ctx: '8K' },
  { id: 'llama3-8b-8192', name: 'Llama 3 8B', desc: 'Quick & efficient', icon: <Sparkles size={16} />, ctx: '8K' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', desc: 'Expert mixture model', icon: <Globe size={16} />, ctx: '32K' },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B', desc: 'Google\'s compact model', icon: <Shield size={16} />, ctx: '8K' },
  { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', desc: 'Image understanding', icon: <Image size={16} />, ctx: '128K', vision: true },
  { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision', desc: 'Fast image analysis', icon: <Image size={16} />, ctx: '128K', vision: true },
];

const SUGGESTIONS = [
  { icon: <Code2 size={20} />, title: 'Write Code', desc: 'Build a React component', prompt: 'Write a React component for a beautiful animated card with hover effects' },
  { icon: <Lightbulb size={20} />, title: 'Creative Ideas', desc: 'Brainstorm with AI', prompt: 'Give me 5 innovative app ideas for 2024 with detailed descriptions' },
  { icon: <BookOpen size={20} />, title: 'Explain Concept', desc: 'Learn something new', prompt: 'Explain quantum computing in simple terms with examples' },
  { icon: <Terminal size={20} />, title: 'Debug Code', desc: 'Fix errors fast', prompt: 'Help me debug this code and explain the issue' },
  { icon: <Palette size={20} />, title: 'Design Help', desc: 'UI/UX suggestions', prompt: 'Suggest a modern color palette and typography for a fintech app' },
  { icon: <Globe size={20} />, title: 'Translate', desc: 'Any language', prompt: 'Translate the following text to 5 different languages' },
];

const DEFAULT_SYSTEM_PROMPT = `You are Zara AI, a highly intelligent, friendly, and helpful AI assistant. You provide clear, accurate, and well-formatted responses. When writing code, always use proper markdown code blocks with language specification. You can help with coding, writing, analysis, math, creative tasks, and much more. Be concise but thorough.`;

const DEFAULT_SETTINGS: AppSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.7,
  maxTokens: 4096,
  apiKey: DEFAULT_API_KEY,
  voiceName: '',
  darkMode: true,
  fontSize: 15,
  streamEnabled: true,
};

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
const genId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

// ═══════════════════════════════════════════
// GROQ API
// ═══════════════════════════════════════════
async function* streamChat(
  messages: Message[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  _images?: string[]
): AsyncGenerator<string> {
  const apiMessages: any[] = [{ role: 'system', content: systemPrompt }];

  for (const m of messages) {
    if (m.images && m.images.length > 0) {
      const content: any[] = [{ type: 'text', text: m.content }];
      for (const img of m.images) {
        content.push({ type: 'image_url', image_url: { url: img } });
      }
      apiMessages.push({ role: m.role, content });
    } else {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: apiMessages, stream: true, temperature, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const c = json.choices?.[0]?.delta?.content;
          if (c) yield c;
        } catch {}
      }
    }
  }
}

// ═══════════════════════════════════════════
// SPEECH UTILITIES
// ═══════════════════════════════════════════
const getVoices = (): SpeechSynthesisVoice[] => {
  return speechSynthesis.getVoices();
};

const getPreferredVoice = (preferredName?: string): SpeechSynthesisVoice | null => {
  const voices = getVoices();
  if (!voices.length) return null;
  if (preferredName) {
    const found = voices.find(v => v.name === preferredName);
    if (found) return found;
  }
  const preferred = ['Microsoft Zira', 'Google UK English Female', 'Samantha', 'Karen', 'Fiona', 'Google US English'];
  for (const name of preferred) {
    const v = voices.find(v2 => v2.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en')) || voices[0];
};

const speakText = (text: string, voiceName?: string, onEnd?: () => void) => {
  speechSynthesis.cancel();
  const clean = text.replace(/```[\s\S]*?```/g, ' code block ').replace(/[#*`_~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = getPreferredVoice(voiceName);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.volume = 1;
  if (onEnd) utterance.onend = onEnd;
  speechSynthesis.speak(utterance);
};

// ═══════════════════════════════════════════
// CODE BLOCK COMPONENT
// ═══════════════════════════════════════════
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    if (language === 'javascript' || language === 'js' || language === 'typescript' || language === 'ts') {
      try {
        const logs: string[] = [];
        const origLog = console.log;
        const origError = console.error;
        console.log = (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
        console.error = (...args: any[]) => logs.push('Error: ' + args.map(a => String(a)).join(' '));
        const result = new Function(code)();
        console.log = origLog;
        console.error = origError;
        const out = logs.join('\n') + (result !== undefined ? (logs.length ? '\n' : '') + '→ ' + JSON.stringify(result) : '');
        setOutput(out || '(No output)');
      } catch (e: any) {
        setOutput('❌ Error: ' + e.message);
      }
    } else if (language === 'html') {
      const blob = new Blob([code], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
      setOutput('✅ Opened in new tab');
    } else if (language === 'python' || language === 'py') {
      setOutput('⚠️ Python execution requires a server runtime');
    } else {
      setOutput('⚠️ Cannot run ' + (language || 'this') + ' code in browser');
    }
    setShowOutput(true);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-200 shadow-lg animate-fadeIn">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
          <Code2 size={12} /> {language || 'code'}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={handleRun} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-green-500 hover:bg-green-600 text-white transition-all hover:scale-105 active:scale-95 font-medium">
            <Play size={11} /> Run
          </button>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-all hover:scale-105 active:scale-95 font-medium">
            {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>
      <div className="bg-white p-4 overflow-x-auto">
        <pre className="text-sm leading-relaxed"><code className="text-gray-800 font-mono whitespace-pre">{code}</code></pre>
      </div>
      {showOutput && output && (
        <div className="bg-gray-900 border-t border-gray-700 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Output</span>
            <button onClick={() => setShowOutput(false)} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
          </div>
          <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// MARKDOWN RENDERER
// ═══════════════════════════════════════════
function MarkdownRenderer({ content }: { content: string }) {
  const parts: ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let match;
  let key = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<InlineMarkdown key={key++} text={content.slice(lastIdx, match.index)} />);
    }
    parts.push(<CodeBlock key={key++} language={match[1]} code={match[2].trim()} />);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    parts.push(<InlineMarkdown key={key++} text={content.slice(lastIdx)} />);
  }
  return <div className="markdown-content">{parts}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={key++} className="ml-5 my-2 space-y-1 list-disc">{listItems.map((li, i) => <li key={i} className="text-gray-200">{processInline(li)}</li>)}</ul>);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(<ol key={key++} className="ml-5 my-2 space-y-1 list-decimal">{orderedItems.map((li, i) => <li key={i} className="text-gray-200">{processInline(li)}</li>)}</ol>);
      orderedItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) { flushList(); elements.push(<h3 key={key++} className="text-lg font-bold text-white mt-4 mb-1">{processInline(trimmed.slice(4))}</h3>); }
    else if (trimmed.startsWith('## ')) { flushList(); elements.push(<h2 key={key++} className="text-xl font-bold text-white mt-4 mb-1">{processInline(trimmed.slice(3))}</h2>); }
    else if (trimmed.startsWith('# ')) { flushList(); elements.push(<h1 key={key++} className="text-2xl font-bold text-white mt-4 mb-2">{processInline(trimmed.slice(2))}</h1>); }
    else if (trimmed.match(/^[-*•]\s/)) { listItems.push(trimmed.replace(/^[-*•]\s/, '')); }
    else if (trimmed.match(/^\d+\.\s/)) { orderedItems.push(trimmed.replace(/^\d+\.\s/, '')); }
    else if (trimmed.startsWith('> ')) { flushList(); elements.push(<blockquote key={key++} className="border-l-4 border-violet-500 pl-4 my-2 py-1 text-gray-300 italic bg-violet-500/5 rounded-r-lg">{processInline(trimmed.slice(2))}</blockquote>); }
    else if (trimmed === '---' || trimmed === '***') { flushList(); elements.push(<hr key={key++} className="border-gray-700 my-3" />); }
    else if (trimmed === '') { flushList(); elements.push(<div key={key++} className="h-2" />); }
    else { flushList(); elements.push(<p key={key++} className="text-gray-200 leading-relaxed my-0.5">{processInline(trimmed)}</p>); }
  }
  flushList();
  return <>{elements}</>;
}

function processInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-bold text-white italic">{m[2]}</strong>);
    else if (m[3]) parts.push(<strong key={k++} className="font-bold text-white">{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++} className="italic text-violet-300">{m[4]}</em>);
    else if (m[5]) parts.push(<code key={k++} className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[0.85em] font-mono border border-violet-500/20">{m[5]}</code>);
    else if (m[6] && m[7]) parts.push(<a key={k++} href={m[7]} target="_blank" rel="noopener" className="text-violet-400 underline hover:text-violet-300">{m[6]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ═══════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════
function MessageBubble({ message, isLast, speaking, onSpeak, onStop, onCopy, onRegenerate }: {
  message: Message; isLast: boolean; speaking: boolean;
  onSpeak: () => void; onStop: () => void; onCopy: () => void; onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 animate-fadeIn ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20 mt-1">
          <Bot size={16} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] md:max-w-[75%] ${isUser ? 'msg-user px-4 py-3' : 'msg-ai px-4 py-3'}`}>
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, i) => (
              <img key={i} src={img} alt="uploaded" className="w-32 h-32 object-cover rounded-lg border border-white/10" />
            ))}
          </div>
        )}
        {isUser ? (
          <p className="text-white text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
        <div className={`flex items-center gap-1 mt-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-400 mr-2">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {!isUser && (
            <>
              <button onClick={speaking ? onStop : onSpeak} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-gray-400 hover:text-violet-400" title={speaking ? "Stop" : "Speak"}>
                {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-gray-400 hover:text-violet-400" title="Copy">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              {isLast && onRegenerate && (
                <button onClick={onRegenerate} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-gray-400 hover:text-violet-400" title="Regenerate">
                  <RotateCcw size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg mt-1">
          <User size={16} className="text-white" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════
function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fadeIn">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
        <Bot size={16} className="text-white" />
      </div>
      <div className="msg-ai px-5 py-4">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 bg-violet-400 rounded-full typing-dot" />
          <div className="w-2.5 h-2.5 bg-violet-400 rounded-full typing-dot" />
          <div className="w-2.5 h-2.5 bg-violet-400 rounded-full typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// SUGGESTIONS COMPONENT
// ═══════════════════════════════════════════
function Suggestions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <div className="animate-float mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-2xl shadow-violet-500/30 animate-glow">
          <Sparkles size={36} className="text-white" />
        </div>
      </div>
      <h1 className="text-3xl font-bold text-white mb-2 text-center">
        Hello! I'm <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">Zara AI</span>
      </h1>
      <p className="text-gray-400 text-center mb-8 max-w-md">Your all-in-one AI assistant. Ask me anything — code, create, learn, or just chat!</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl w-full">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} onClick={() => onSelect(s.prompt)}
            className="glass-light p-4 rounded-2xl text-left hover:border-violet-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] group"
            style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center mb-2.5 text-violet-400 group-hover:bg-violet-500/30 transition-colors">
              {s.icon}
            </div>
            <h3 className="text-sm font-semibold text-white mb-0.5">{s.title}</h3>
            <p className="text-xs text-gray-400">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// UPLOAD MENU
// ═══════════════════════════════════════════
function UploadMenu({ onClose, onUpload }: { onClose: () => void; onUpload: (files: FileList, type: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  const items = [
    { icon: <Image size={18} />, label: 'Upload Image', accept: 'image/*', ref: imgRef, type: 'image' },
    { icon: <FileText size={18} />, label: 'Upload File', accept: '.txt,.pdf,.csv,.json,.md,.py,.js,.ts,.html,.css', ref: fileRef, type: 'file' },
    { icon: <Film size={18} />, label: 'Upload Media', accept: 'audio/*,video/*', ref: mediaRef, type: 'media' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 mb-2 glass-strong rounded-2xl p-2 min-w-[200px] z-50 animate-slideUp shadow-2xl">
        {items.map((item, i) => (
          <div key={i}>
            <input ref={item.ref} type="file" accept={item.accept} multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) { onUpload(e.target.files, item.type); onClose(); } }} />
            <button onClick={() => item.ref.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-violet-500/15 transition-all text-gray-300 hover:text-white group">
              <span className="text-violet-400 group-hover:scale-110 transition-transform">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// MODEL QUICK SWITCH
// ═══════════════════════════════════════════
function ModelQuickSwitch({ current, onSelect, onClose }: { current: string; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full right-0 mb-2 glass-strong rounded-2xl p-2 min-w-[280px] max-h-[360px] overflow-y-auto z-50 animate-slideUp shadow-2xl">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 py-2">Switch Model</h3>
        {MODELS.map(m => (
          <button key={m.id} onClick={() => { onSelect(m.id); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${current === m.id ? 'bg-violet-500/20 border border-violet-500/30' : 'hover:bg-white/5'}`}>
            <span className={`${current === m.id ? 'text-violet-400' : 'text-gray-400'}`}>{m.icon}</span>
            <div className="text-left flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${current === m.id ? 'text-violet-300' : 'text-gray-200'}`}>{m.name}</div>
              <div className="text-[10px] text-gray-500">{m.desc} • {m.ctx}</div>
            </div>
            {current === m.id && <Check size={14} className="text-violet-400 flex-shrink-0" />}
          </button>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════
function SettingsModal({ settings, onUpdate, onClose, onClearAll }: {
  settings: AppSettings; onUpdate: (s: AppSettings) => void; onClose: () => void; onClearAll: () => void;
}) {
  const [tab, setTab] = useState<'general' | 'model' | 'voice' | 'about'>('general');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.onvoiceschanged = load;
  }, []);

  const tabs = [
    { id: 'general' as const, label: 'General', icon: <Settings size={16} /> },
    { id: 'model' as const, label: 'Model', icon: <Brain size={16} /> },
    { id: 'voice' as const, label: 'Voice', icon: <Volume2 size={16} /> },
    { id: 'about' as const, label: 'About', icon: <Sparkles size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative glass-strong rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col animate-bounceIn overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings size={20} className="text-violet-400" /> Settings</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all"><X size={20} /></button>
        </div>

        <div className="flex border-b border-white/10">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all ${tab === t.id ? 'text-violet-400 border-b-2 border-violet-400' : 'text-gray-400 hover:text-gray-200'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'general' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">System Prompt</label>
                <textarea value={settings.systemPrompt} onChange={e => onUpdate({ ...settings, systemPrompt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 resize-none h-32 focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">API Key</label>
                <input type="password" value={settings.apiKey} onChange={e => onUpdate({ ...settings, apiKey: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-violet-500/50 transition-colors font-mono" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Font Size: {settings.fontSize}px</label>
                <input type="range" min={12} max={20} value={settings.fontSize} onChange={e => onUpdate({ ...settings, fontSize: +e.target.value })} className="w-full" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Stream Responses</span>
                <button onClick={() => onUpdate({ ...settings, streamEnabled: !settings.streamEnabled })}
                  className={`w-12 h-7 rounded-full transition-all ${settings.streamEnabled ? 'bg-violet-500' : 'bg-gray-600'} relative`}>
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${settings.streamEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <button onClick={() => { if (confirm('Clear all chats? This cannot be undone.')) onClearAll(); }}
                className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium flex items-center justify-center gap-2">
                <Trash2 size={16} /> Clear All Chats
              </button>
            </>
          )}

          {tab === 'model' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">Select Model</label>
                <div className="space-y-2">
                  {MODELS.map(m => (
                    <button key={m.id} onClick={() => onUpdate({ ...settings, model: m.id })}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${settings.model === m.id ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                      <span className={settings.model === m.id ? 'text-violet-400' : 'text-gray-400'}>{m.icon}</span>
                      <div className="text-left flex-1">
                        <div className={`text-sm font-medium ${settings.model === m.id ? 'text-violet-300' : 'text-gray-200'}`}>{m.name}</div>
                        <div className="text-[11px] text-gray-500">{m.desc} • Context: {m.ctx} {m.vision ? '• 👁️ Vision' : ''}</div>
                      </div>
                      {settings.model === m.id && <Check size={16} className="text-violet-400" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Temperature: {settings.temperature.toFixed(1)}</label>
                <input type="range" min={0} max={2} step={0.1} value={settings.temperature}
                  onChange={e => onUpdate({ ...settings, temperature: +e.target.value })} className="w-full" />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>Precise</span><span>Creative</span></div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Max Tokens: {settings.maxTokens}</label>
                <input type="range" min={256} max={32768} step={256} value={settings.maxTokens}
                  onChange={e => onUpdate({ ...settings, maxTokens: +e.target.value })} className="w-full" />
              </div>
            </>
          )}

          {tab === 'voice' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">Voice Selection</label>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {voices.filter(v => v.lang.startsWith('en')).map((v, i) => (
                    <button key={i} onClick={() => { onUpdate({ ...settings, voiceName: v.name }); speakText('Hello! I am Zara AI, your personal assistant.', v.name); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left ${settings.voiceName === v.name ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                      <Volume2 size={14} className={settings.voiceName === v.name ? 'text-violet-400' : 'text-gray-500'} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 truncate">{v.name}</div>
                        <div className="text-[10px] text-gray-500">{v.lang}</div>
                      </div>
                      {settings.voiceName === v.name && <Check size={14} className="text-violet-400" />}
                    </button>
                  ))}
                  {voices.filter(v => v.lang.startsWith('en')).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">No English voices found. Voices load async — try reopening settings.</p>
                  )}
                </div>
              </div>
              <button onClick={() => speakText('Hello! I am Zara AI. I can speak in a beautiful voice. How can I help you today?', settings.voiceName)}
                className="w-full py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all text-sm font-medium flex items-center justify-center gap-2">
                <Volume2 size={16} /> Test Voice
              </button>
            </>
          )}

          {tab === 'about' && (
            <div className="text-center py-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-2xl mb-4 animate-glow">
                <Sparkles size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Zara AI</h2>
              <p className="text-violet-400 text-sm mb-4">All-in-One AI Assistant v2.0</p>
              <div className="space-y-3 text-sm text-gray-400 text-left glass-light rounded-2xl p-4">
                <p>✨ Multiple AI Models (Groq)</p>
                <p>🎙️ Voice Input & Output</p>
                <p>📞 Live Call Mode</p>
                <p>💻 Code Execution</p>
                <p>📷 Image Understanding</p>
                <p>💾 Chat History</p>
                <p>⚡ Streaming Responses</p>
                <p>🎨 Beautiful Dark UI</p>
              </div>
              <p className="text-[11px] text-gray-600 mt-4">Powered by Groq API • Built with React</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// CALL MODE
// ═══════════════════════════════════════════
function CallMode({ settings, onEnd }: { settings: AppSettings; onEnd: () => void }) {
  const [status, setStatus] = useState<'listening' | 'thinking' | 'speaking' | 'idle'>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(true);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    activeRef.current = true;
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    startListening();
    return () => {
      activeRef.current = false;
      clearInterval(timerRef.current);
      speechSynthesis.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const startListening = () => {
    if (!activeRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setResponse('Speech recognition not supported in this browser'); return; }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setStatus('listening');
    recognition.onresult = (event: any) => {
      const t = Array.from(event.results).map((r: any) => r[0].transcript).join('');
      setTranscript(t);
    };
    recognition.onend = async () => {
      if (!activeRef.current) return;
      const finalTranscript = transcript;
      if (finalTranscript.trim()) {
        await processVoice(finalTranscript.trim());
      } else {
        if (activeRef.current && !muted) startListening();
      }
    };
    recognition.onerror = () => {
      if (activeRef.current && !muted) setTimeout(startListening, 1000);
    };
    if (!muted) recognition.start();
  };

  const processVoice = async (text: string) => {
    if (!activeRef.current) return;
    setStatus('thinking');
    setResponse('');
    try {
      const msgs: Message[] = [{ id: '1', role: 'user', content: text, timestamp: Date.now() }];
      let full = '';
      for await (const chunk of streamChat(msgs, settings.model, settings.apiKey, settings.systemPrompt, settings.temperature, settings.maxTokens)) {
        if (!activeRef.current) return;
        full += chunk;
        setResponse(full);
      }
      setStatus('speaking');
      speakText(full, settings.voiceName, () => {
        if (activeRef.current) {
          setTranscript('');
          startListening();
        }
      });
    } catch (err: any) {
      setResponse('Error: ' + err.message);
      if (activeRef.current) setTimeout(startListening, 2000);
    }
  };

  const formatElapsed = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a1a] via-[#0f0f2a] to-[#0a0a1a]">
      <div className="absolute top-6 left-0 right-0 text-center">
        <p className="text-violet-400 text-sm font-medium">Zara AI Call</p>
        <p className="text-gray-400 text-xs mt-1">{formatElapsed(elapsed)}</p>
      </div>

      <div className="relative mb-8">
        {status === 'listening' && (
          <>
            <div className="absolute inset-0 rounded-full bg-violet-500/20 pulse-ring" />
            <div className="absolute inset-0 rounded-full bg-violet-500/10 pulse-ring" style={{ animationDelay: '0.5s' }} />
          </>
        )}
        <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
          status === 'listening' ? 'bg-gradient-to-br from-violet-600 to-purple-700 shadow-2xl shadow-violet-500/40' :
          status === 'thinking' ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-2xl shadow-amber-500/40 animate-spin-slow' :
          status === 'speaking' ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-2xl shadow-green-500/40' :
          'bg-gradient-to-br from-gray-600 to-gray-700'
        }`}>
          {status === 'listening' ? <Mic size={40} className="text-white" /> :
           status === 'thinking' ? <Brain size={40} className="text-white" /> :
           status === 'speaking' ? <Volume2 size={40} className="text-white" /> :
           <Bot size={40} className="text-white" />}
        </div>
      </div>

      <p className="text-white text-lg font-semibold mb-2 capitalize">{status === 'idle' ? 'Connecting...' : status + '...'}</p>

      {status === 'listening' && (
        <div className="flex items-center gap-1.5 mb-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1 bg-violet-400 rounded-full wave-bar" style={{ height: '12px' }} />
          ))}
        </div>
      )}

      {transcript && <p className="text-gray-300 text-center max-w-sm mb-4 px-4 text-sm">"{transcript}"</p>}
      {response && <p className="text-gray-400 text-center max-w-sm mb-4 px-4 text-xs max-h-32 overflow-y-auto">{response.slice(0, 300)}{response.length > 300 ? '...' : ''}</p>}

      <div className="flex gap-6 mt-8">
        <button onClick={() => setMuted(!muted)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'}`}>
          {muted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button onClick={onEnd}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 shadow-2xl shadow-red-500/40">
          <PhoneOff size={28} />
        </button>
        <button onClick={() => speechSynthesis.cancel()}
          className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white transition-all">
          <VolumeX size={24} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════
function Sidebar({ chats, currentId, onSelect, onNew, onDelete, onRename, onOpenSettings, onClose }: {
  chats: Chat[]; currentId: string | null;
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void; onOpenSettings: () => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filtered = chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);

  const grouped = filtered.reduce<Record<string, Chat[]>>((acc, chat) => {
    const now = new Date();
    const d = new Date(chat.createdAt);
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const group = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This Week' : diff < 30 ? 'This Month' : 'Older';
    (acc[group] = acc[group] || []).push(chat);
    return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 w-[300px] glass-strong z-40 flex flex-col animate-slideInLeft">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-none">Zara AI</h1>
                <p className="text-[10px] text-violet-400">All-in-One Assistant</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 md:hidden"><X size={20} /></button>
          </div>
          <button onClick={() => { onNew(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium text-sm hover:from-violet-500 hover:to-purple-500 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-violet-500/20">
            <MessageSquarePlus size={18} /> New Chat
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search chats..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {Object.entries(grouped).map(([group, groupChats]) => (
            <div key={group} className="mb-4">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                <Clock size={10} />{group}
              </h3>
              {groupChats.map(chat => (
                <div key={chat.id} className={`group flex items-center rounded-xl mb-0.5 transition-all ${currentId === chat.id ? 'bg-violet-500/15 border border-violet-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
                  {editingId === chat.id ? (
                    <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => { onRename(chat.id, editTitle); setEditingId(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { onRename(chat.id, editTitle); setEditingId(null); } }}
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none" />
                  ) : (
                    <button onClick={() => { onSelect(chat.id); onClose(); }} className="flex-1 text-left px-3 py-2.5 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{chat.title}</div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Hash size={8} />{chat.messages.length} messages • {formatTime(chat.createdAt)}
                      </div>
                    </button>
                  )}
                  <div className="hidden group-hover:flex items-center pr-1.5 gap-0.5">
                    <button onClick={() => { setEditingId(chat.id); setEditTitle(chat.title); }} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"><Edit3 size={12} /></button>
                    <button onClick={() => { if (confirm('Delete this chat?')) onDelete(chat.id); }} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <MessageSquarePlus size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{search ? 'No chats found' : 'No chats yet'}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-white/10">
          <button onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-300 hover:text-white transition-all">
            <Settings size={18} /> <span className="text-sm font-medium">Settings</span>
            <ChevronRight size={14} className="ml-auto text-gray-600" />
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [chats, setChats] = useLocalStorage<Chat[]>('zara-chats', []);
  const [currentChatId, setCurrentChatId] = useLocalStorage<string | null>('zara-current', null);
  const [settings, setSettings] = useLocalStorage<AppSettings>('zara-settings', DEFAULT_SETTINGS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callMode, setCallMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [input, setInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showModelSwitch, setShowModelSwitch] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  // abort ref for future cancellation support
  void useRef<AbortController | null>(null);

  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const currentModel = MODELS.find(m => m.id === settings.model);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [currentChat?.messages?.length, streamingContent]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentChatId]);

  const createChat = useCallback(() => {
    const newChat: Chat = { id: genId(), title: 'New Chat', messages: [], createdAt: Date.now(), model: settings.model };
    setChats(prev => [...prev, newChat]);
    setCurrentChatId(newChat.id);
    setInput('');
    setStreamingContent('');
    return newChat.id;
  }, [settings.model, setChats, setCurrentChatId]);

  const sendMessage = async (text: string, images?: string[]) => {
    if (!text.trim() && (!images || images.length === 0)) return;
    if (isLoading) return;

    let chatId = currentChatId;
    if (!chatId) chatId = createChat();

    const userMsg: Message = { id: genId(), role: 'user', content: text.trim(), timestamp: Date.now(), images };

    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const updated = { ...c, messages: [...c.messages, userMsg] };
      if (c.messages.length === 0) updated.title = text.trim().slice(0, 50) || 'New Chat';
      return updated;
    }));

    setInput('');
    setUploadedImages([]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const chat = chats.find(c => c.id === chatId);
      const allMsgs = [...(chat?.messages || []), userMsg];

      let model = settings.model;
      if (images && images.length > 0) {
        const visionModel = MODELS.find(m => m.vision);
        if (visionModel) model = visionModel.id;
      }

      let fullContent = '';
      for await (const chunk of streamChat(allMsgs, model, settings.apiKey, settings.systemPrompt, settings.temperature, settings.maxTokens)) {
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      const aiMsg: Message = { id: genId(), role: 'assistant', content: fullContent, timestamp: Date.now() };
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c));
      setStreamingContent('');
    } catch (err: any) {
      const errMsg: Message = { id: genId(), role: 'assistant', content: `❌ **Error:** ${err.message}\n\nPlease check your API key in Settings.`, timestamp: Date.now() };
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, errMsg] } : c));
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const regenerate = async () => {
    if (!currentChat || currentChat.messages.length < 2) return;
    const msgs = currentChat.messages.slice(0, -1);
    setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: msgs } : c));
    setIsLoading(true);
    setStreamingContent('');

    try {
      let full = '';
      for await (const chunk of streamChat(msgs, settings.model, settings.apiKey, settings.systemPrompt, settings.temperature, settings.maxTokens)) {
        full += chunk;
        setStreamingContent(full);
      }
      const aiMsg: Message = { id: genId(), role: 'assistant', content: full, timestamp: Date.now() };
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...c.messages, aiMsg] } : c));
      setStreamingContent('');
    } catch (err: any) {
      const errMsg: Message = { id: genId(), role: 'assistant', content: `❌ **Error:** ${err.message}`, timestamp: Date.now() };
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...c.messages, errMsg] } : c));
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser. Try Chrome or Edge.'); return; }
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  };

  const handleSpeak = (msg: Message) => {
    if (speakingMsgId === msg.id) {
      speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    setSpeakingMsgId(msg.id);
    speakText(msg.content, settings.voiceName, () => setSpeakingMsgId(null));
  };

  const handleUpload = async (files: FileList, type: string) => {
    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (type === 'image' || file.type.startsWith('image/')) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newImages.push(dataUrl);
      } else if (type === 'file' || file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|csv|py|js|ts|html|css|java|cpp|c|rb|go|rs|xml|yaml|yml)$/)) {
        const text = await file.text();
        setInput(prev => prev + `\n\n📎 File: ${file.name}\n\`\`\`\n${text}\n\`\`\``);
      } else {
        setInput(prev => prev + `\n\n📎 Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      }
    }
    if (newImages.length) setUploadedImages(prev => [...prev, ...newImages]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input, uploadedImages.length ? uploadedImages : undefined);
    }
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    }
  };

  useEffect(() => { autoResize(); }, [input]);

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ fontSize: settings.fontSize + 'px' }}>
      {/* HEADER */}
      <header className="glass flex items-center justify-between px-4 py-3 z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition-all">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Zara AI</h1>
              <p className="text-[10px] text-gray-400 flex items-center gap-1">
                {currentModel?.icon}
                {currentModel?.name || settings.model}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => createChat()} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="New Chat">
            <MessageSquarePlus size={20} />
          </button>
          <button onClick={() => setCallMode(true)} className="p-2.5 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 transition-all hover:scale-105 active:scale-95" title="Call Mode">
            <Phone size={20} />
          </button>
        </div>
      </header>

      {/* CHAT AREA */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {!currentChat || currentChat.messages.length === 0 ? (
          <Suggestions onSelect={(prompt) => { if (!currentChatId) createChat(); setInput(prompt); }} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {currentChat.messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={i === currentChat.messages.length - 1 && msg.role === 'assistant'}
                speaking={speakingMsgId === msg.id}
                onSpeak={() => handleSpeak(msg)}
                onStop={() => { speechSynthesis.cancel(); setSpeakingMsgId(null); }}
                onCopy={() => navigator.clipboard.writeText(msg.content)}
                onRegenerate={msg.role === 'assistant' && i === currentChat.messages.length - 1 ? regenerate : undefined}
              />
            ))}
            {isLoading && streamingContent && (
              <div className="flex gap-3 animate-fadeIn">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20 mt-1">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="msg-ai px-4 py-3 max-w-[85%] md:max-w-[75%]">
                  <MarkdownRenderer content={streamingContent} />
                  <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-1 rounded-sm" />
                </div>
              </div>
            )}
            {isLoading && !streamingContent && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showScrollBtn && (
        <button onClick={scrollToBottom} className="absolute bottom-28 right-4 p-2.5 rounded-full glass text-gray-300 hover:text-white shadow-lg animate-bounceIn z-10">
          <ArrowDown size={18} />
        </button>
      )}

      {/* UPLOADED IMAGES PREVIEW */}
      {uploadedImages.length > 0 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-white/5">
          {uploadedImages.map((img, i) => (
            <div key={i} className="relative flex-shrink-0 animate-bounceIn">
              <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-violet-500/30" />
              <button onClick={() => setUploadedImages(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* INPUT BAR */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        <div className="glass rounded-2xl max-w-3xl mx-auto">
          <div className="flex items-end gap-1.5 p-2">
            {/* Plus / Upload */}
            <div className="relative">
              <button onClick={() => setShowUpload(!showUpload)}
                className={`p-2.5 rounded-xl transition-all ${showUpload ? 'bg-violet-500/20 text-violet-400 rotate-45' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                <Plus size={20} />
              </button>
              {showUpload && <UploadMenu onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Zara AI..."
              rows={1}
              className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 resize-none outline-none py-2.5 px-2 text-[15px] leading-relaxed max-h-[150px]"
              style={{ minHeight: '44px' }}
            />

            {/* Mic */}
            <button onClick={toggleMic}
              className={`p-2.5 rounded-xl transition-all ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              title={isListening ? 'Stop Listening' : 'Voice Input'}>
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Model Switch */}
            <div className="relative">
              <button onClick={() => setShowModelSwitch(!showModelSwitch)}
                className={`p-2.5 rounded-xl transition-all flex items-center gap-1 ${showModelSwitch ? 'bg-violet-500/20 text-violet-400' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="Switch Model">
                <Brain size={18} />
                <ChevronDown size={12} className={`transition-transform ${showModelSwitch ? 'rotate-180' : ''}`} />
              </button>
              {showModelSwitch && (
                <ModelQuickSwitch current={settings.model} onSelect={(id) => setSettings(prev => ({ ...prev, model: id }))} onClose={() => setShowModelSwitch(false)} />
              )}
            </div>

            {/* Call */}
            <button onClick={() => setCallMode(true)}
              className="p-2.5 rounded-xl text-green-400 hover:bg-green-500/15 transition-all"
              title="Voice Call">
              <Phone size={20} />
            </button>

            {/* Send */}
            <button onClick={() => sendMessage(input, uploadedImages.length ? uploadedImages : undefined)}
              disabled={isLoading || (!input.trim() && uploadedImages.length === 0)}
              className={`p-2.5 rounded-xl transition-all ${
                input.trim() || uploadedImages.length ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95' : 'text-gray-600 cursor-not-allowed'
              }`}>
              {isLoading ? <Square size={20} /> : <Send size={20} />}
            </button>
          </div>
          <div className="px-4 pb-2 flex items-center justify-between">
            <p className="text-[10px] text-gray-600">{currentModel?.name} • {currentModel?.ctx} context</p>
            {isListening && <p className="text-[10px] text-red-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Listening...</p>}
          </div>
        </div>
      </div>

      {/* SIDEBAR */}
      {sidebarOpen && (
        <Sidebar
          chats={chats}
          currentId={currentChatId}
          onSelect={(id) => { setCurrentChatId(id); setStreamingContent(''); }}
          onNew={() => { createChat(); }}
          onDelete={(id) => {
            setChats(prev => prev.filter(c => c.id !== id));
            if (currentChatId === id) setCurrentChatId(null);
          }}
          onRename={(id, title) => setChats(prev => prev.map(c => c.id === id ? { ...c, title } : c))}
          onOpenSettings={() => { setSidebarOpen(false); setSettingsOpen(true); }}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* SETTINGS */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={setSettings}
          onClose={() => setSettingsOpen(false)}
          onClearAll={() => { setChats([]); setCurrentChatId(null); setSettingsOpen(false); }}
        />
      )}

      {/* CALL MODE */}
      {callMode && <CallMode settings={settings} onEnd={() => setCallMode(false)} />}
    </div>
  );
}
