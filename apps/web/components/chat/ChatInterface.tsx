"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceButton } from "./VoiceButton";
import type { ChatContext } from "@/app/api/chat/route";
import type { WizardInput } from "@/lib/schema/page-schema";

interface Message {
  id: string;
  role: "user" | "assistant" | "preview";
  content: string;
  imageUrl?: string;
  previewSlug?: string;
  previewVersion?: number;
}

async function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 900;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

const GREETING: Message = {
  id: "greeting",
  role: "assistant",
  content: "Hi! I'll build you a payment page in minutes. Tell me about your brand — what do you sell?",
};

// ─── TTS ─────────────────────────────────────────────────────────────────────

function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); audioRef.current = null; }
  }, []);
  useEffect(() => () => { stop(); }, [stop]);
  const speak = useCallback(async (text: string) => {
    stop();
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch { /* TTS optional */ }
  }, [stop]);
  return { speak, stop };
}

// ─── ChatInterface ────────────────────────────────────────────────────────────

const STORAGE_KEY = "razorpay_chat_state";

export function ChatInterface() {
  const { speak, stop: stopAudio } = useTTS();
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [context, setContext] = useState<ChatContext>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedSlug, setGeneratedSlug] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingPhotoDataUrls, setPendingPhotoDataUrls] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [editToolActive, setEditToolActive] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inflightRef = useRef(false);
  const restoredRef = useRef(false);
  const storageWarnedRef = useRef(false);

  const pageUrl = generatedSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${generatedSlug}`
    : "";

  // Restore from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          messages?: Message[]; context?: ChatContext;
          generatedSlug?: string | null; previewVersion?: number;
        };
        if (parsed.messages?.length) { setMessages(parsed.messages); restoredRef.current = true; }
        if (parsed.context) setContext(parsed.context);
        if (parsed.generatedSlug) { setGeneratedSlug(parsed.generatedSlug); setPreviewReady(true); }
        if (typeof parsed.previewVersion === "number") setPreviewVersion(parsed.previewVersion);
      }
    } catch { /* unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, context, generatedSlug, previewVersion }));
    } catch {
      if (!storageWarnedRef.current) {
        storageWarnedRef.current = true;
        setError("Your browser storage is almost full — progress may not save on refresh.");
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          messages: messages.slice(-10),
          context,
          generatedSlug,
          previewVersion,
        }));
      } catch { /* storage fully unavailable */ }
    }
  }, [messages, context, generatedSlug, previewVersion]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, generating, pendingPhotoDataUrls]);

  useEffect(() => { if (!restoredRef.current) void speak(GREETING.content); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addMessage = useCallback((msg: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
  }, []);

  function buildWizardInput(ctx: ChatContext): WizardInput {
    const isCollection = ctx.pageType === "collection";
    return {
      brand: { name: ctx.brandName ?? "My Brand", primaryColor: ctx.primaryColor ?? "#6366F1", secondaryColor: ctx.secondaryColor ?? "#0f172a" },
      pageType: (ctx.pageType as WizardInput["pageType"]) ?? "product",
      businessDescription: ctx.description ?? "",
      productName: ctx.productName ?? (isCollection ? (ctx.brandName ?? "Our Collection") : ""),
      productDescription: ctx.description ?? "",
      price: ctx.priceRupees ? ctx.priceRupees * 100 : 0,
      currency: "INR",
      productBullets: ctx.productBullets ?? [],
      productImageUrl: ctx.productImageUrl ?? "",
      productImages: ctx.productImages?.length ? ctx.productImages : undefined,
      productUrl: ctx.productUrl ?? "",
      ...(isCollection && ctx.collectionProducts?.length
        ? {
            collectionProducts: ctx.collectionProducts.map((p) => ({
              name: p.name,
              price: Math.round(p.price * 100),
              maxPrice: p.maxPrice ? Math.round(p.maxPrice * 100) : undefined,
              imageUrl: p.imageUrl,
            })),
          }
        : {}),
    };
  }

  async function triggerGenerate(ctx: ChatContext) {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildWizardInput(ctx)),
      });
      if (!res.ok) throw new Error("Generation failed");
      const json = await res.json() as { data?: { slug?: string; editToken?: string } };
      const slug = json.data?.slug;
      const editToken = json.data?.editToken;
      if (slug) {
        setGeneratedSlug(slug);
        setPreviewVersion(0);
        setPreviewReady(false);
        setTimeout(() => setPreviewReady(true), 2500);
        try {
          const owned = JSON.parse(localStorage.getItem("owned_pages") ?? "{}") as Record<string, boolean>;
          owned[slug] = true;
          localStorage.setItem("owned_pages", JSON.stringify(owned));
          if (editToken) localStorage.setItem(`edit_token_${slug}`, editToken);
        } catch { /* localStorage unavailable */ }
        addMessage({ role: "assistant", content: "Your page is live! 🎉" });
        addMessage({ role: "preview", content: "", previewSlug: slug, previewVersion: 0 });
        void speak("Your page is live! The link is ready to share.");
      }
    } catch {
      setError("Couldn't generate the page. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function triggerUpdate(ctx: ChatContext, slug: string) {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildWizardInput(ctx), existingSlug: slug }),
      });
      if (!res.ok) throw new Error("Update failed");
      const json = await res.json() as { data?: { slug?: string } };
      if (json.data?.slug) {
        const nextVersion = previewVersion + 1;
        setPreviewReady(false);
        setPreviewVersion(nextVersion);
        setTimeout(() => setPreviewReady(true), 2000);
        const msg = "Done! Your page has been updated.";
        addMessage({ role: "assistant", content: msg });
        void speak(msg);
      }
    } catch {
      setError("Couldn't update the page. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && pendingPhotoDataUrls.length === 0) || inflightRef.current || generating) return;
    inflightRef.current = true;
    setError("");
    setInput("");

    const photosForThisMessage = [...pendingPhotoDataUrls];
    setPendingPhotoDataUrls([]);

    setLoading(true);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      imageUrl: photosForThisMessage[0] ?? undefined,
    };
    const snapshot = [...messages, userMsg];
    setMessages(snapshot);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: snapshot
            .filter((m) => m.id !== "greeting" && m.role !== "preview")
            .map((m) => ({ role: m.role, content: m.content })),
          context,
          generatedSlug: generatedSlug ?? undefined,
          pendingPhotoUrl: photosForThisMessage[0] ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const json = await res.json() as {
        reply: string;
        context: ChatContext;
        action: "ask" | "generate" | "update";
        photoMapping?: string | null;
      };

      let updatedCtx = json.context;

      if (photosForThisMessage.length > 0) {
        if (json.photoMapping) {
          const targetName = json.photoMapping.toLowerCase();
          const updatedProducts = (json.context.collectionProducts ?? context.collectionProducts ?? []).map((p) => {
            const pLower = p.name.toLowerCase();
            if (pLower === targetName || targetName.includes(pLower) || pLower.includes(targetName)) {
              return { ...p, imageUrl: photosForThisMessage[0] };
            }
            return p;
          });
          updatedCtx = { ...json.context, collectionProducts: updatedProducts };
        } else if (json.context.pageType !== "collection") {
          updatedCtx = {
            ...json.context,
            productImageUrl: photosForThisMessage[0],
            productImages: photosForThisMessage,
          };
        }
      }

      setContext(updatedCtx);
      addMessage({ role: "assistant", content: json.reply });
      void speak(json.reply);

      const stillNeedsPhotos = updatedCtx.pageType === "collection"
        && (updatedCtx.collectionProducts?.length ?? 0) > 0
        && (updatedCtx.collectionProducts?.some((p) => !p.imageUrl) ?? false)
        && json.action !== "generate";

      if (!stillNeedsPhotos && (json.action === "generate" || json.action === "update")) {
        if (generatedSlug) setTimeout(() => void triggerUpdate(updatedCtx, generatedSlug), 600);
        else setTimeout(() => void triggerGenerate(updatedCtx), 600);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
  }

  function handleVoiceTranscript(text: string) { stopAudio(); void sendMessage(text); }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    const MAX_FILE_BYTES = 20 * 1024 * 1024;
    const MAX_DATA_URL_BYTES = 2_000_000;
    setUploadingImage(true);
    const results: string[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError(`"${file.name}" is too large. Please use photos under 20 MB.`);
          continue;
        }
        try {
          const dataUrl = await processImageFile(file);
          if (dataUrl.length > MAX_DATA_URL_BYTES) {
            setError(`"${file.name}" is too large after processing. Try a smaller photo.`);
            continue;
          }
          results.push(dataUrl);
        } catch {
          setError(`Couldn't read "${file.name}". Try a JPG or PNG.`);
        }
      }
      if (results.length > 0) {
        setPendingPhotoDataUrls((prev) => [...prev, ...results]);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } finally {
      setUploadingImage(false);
    }
  }

  function copyLink() {
    if (!pageUrl) return;
    void navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function refreshPreview() {
    setPreviewReady(false);
    setPreviewVersion((v) => v + 1);
    setTimeout(() => setPreviewReady(true), 1500);
  }

  function handleEditTool(active: boolean) {
    setEditToolActive(active);
    if (active) {
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "SMART_PAGES_EDIT", enabled: true },
          window.location.origin
        );
      }, 50);
    }
  }

  const isCollection = context.pageType === "collection" && (context.collectionProducts?.length ?? 0) > 0;
  const collectionPhotoCount = context.collectionProducts?.filter((p) => p.imageUrl).length ?? 0;
  const canSend = (input.trim().length > 0 || pendingPhotoDataUrls.length > 0) && !loading && !generating;

  function handleNewChat() {
    stopAudio();
    setMessages([GREETING]);
    setContext({});
    setInput("");
    setGeneratedSlug(null);
    setPreviewVersion(0);
    setPreviewReady(false);
    setEditToolActive(false);
    setError("");
    setPendingPhotoDataUrls([]);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* unavailable */ }
    restoredRef.current = false;
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0f172a]">

      {/* ─── Left: Chat sidebar ─────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] lg:shrink-0 flex flex-col h-full border-r border-white/10">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-base">✦</div>
          <div>
            <p className="text-sm font-semibold text-white">Smart Pages AI</p>
            <p className="text-xs text-white/40">by Razorpay</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              title="Start a new chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {loading && <TypingIndicator />}

          {generating && (
            <div className="flex items-center gap-2 self-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs shrink-0">✦</div>
              <div className="bg-white/10 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
                <svg className="animate-spin w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-indigo-300 font-medium">{generatedSlug ? "Updating your page…" : "Building your page…"}</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 self-center py-1 bg-red-900/30 px-3 rounded-full">{error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Context pills */}
        {Object.values(context).some(Boolean) && (
          <ContextPills context={context} collectionPhotoCount={collectionPhotoCount} />
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Pending photo preview strip */}
        {pendingPhotoDataUrls.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-3 bg-white/5 border-t border-white/10">
            <div className="flex gap-1.5 shrink-0">
              {pendingPhotoDataUrls.slice(0, 4).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`pending upload ${i + 1}`}
                  className="w-10 h-10 rounded-lg object-cover border-2 border-white/20 shadow-md"
                />
              ))}
              {pendingPhotoDataUrls.length > 4 && (
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/60 text-xs font-bold">
                  +{pendingPhotoDataUrls.length - 4}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-indigo-300 mb-0.5">
                {pendingPhotoDataUrls.length === 1 ? "1 photo ready" : `${pendingPhotoDataUrls.length} photos ready`}
              </p>
              <p className="text-xs text-white/40 leading-snug">
                {isCollection ? "Type the product name below and hit send." : "Add a caption below, or just send it."}
              </p>
            </div>
            <button
              onClick={() => setPendingPhotoDataUrls([])}
              className="w-7 h-7 rounded-full bg-white/10 text-white/40 hover:text-red-400 hover:bg-red-900/30 flex items-center justify-center transition-colors shrink-0 text-sm font-bold"
              title="Remove photos"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-white/10">
          <div className="flex items-end gap-2 bg-white/10 rounded-2xl border border-white/10 px-3 py-2 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage || generating}
              title="Upload photo"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all text-white/40 hover:text-indigo-400 hover:bg-white/10 disabled:opacity-40 relative"
            >
              {uploadingImage ? (
                <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {isCollection && collectionPhotoCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {collectionPhotoCount}
                    </span>
                  )}
                </>
              )}
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || generating}
              placeholder={
                generating
                  ? "Building your page…"
                  : pendingPhotoDataUrls.length > 0
                    ? (isCollection ? "Which product is this for?" : "Add a caption, or just send it.")
                    : "Tell me about your brand…"
              }
              rows={1}
              style={{ resize: "none", minHeight: "36px", maxHeight: "120px" }}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none py-1 disabled:opacity-50"
              onInput={(e) => {
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                });
              }}
            />
            <div className="flex items-center gap-1.5 pb-0.5 shrink-0">
              <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading || generating} />
              <button
                type="button"
                onClick={() => void sendMessage(input)}
                disabled={!canSend}
                className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-indigo-900/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-xs text-white/25 text-center mt-1.5">Enter to send · Mic for voice · 📷 for photo</p>
        </div>
      </div>

      {/* ─── Right: Preview panel (desktop only) ────────────────────────── */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden bg-slate-100">
        {generatedSlug ? (
          <>
            {/* Browser chrome bar */}
            <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-3 px-4 shrink-0">
              <div className="flex gap-1.5 shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-300" />
                <div className="w-3 h-3 rounded-full bg-yellow-300" />
                <div className="w-3 h-3 rounded-full bg-green-300" />
              </div>
              <div className="flex-1 min-w-0 bg-gray-100 rounded-lg px-3 py-1.5">
                <p className="text-xs font-mono text-gray-400 truncate">{pageUrl}</p>
              </div>
              <button
                onClick={refreshPreview}
                title="Reload preview"
                className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100 shrink-0"
              >
                ↺
              </button>
              <a
                href={`/p/${generatedSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100"
              >
                Open
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <button
                onClick={copyLink}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 shrink-0"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
            {/* Full page iframe or loading state */}
            {previewReady ? (
              <iframe
                ref={iframeRef}
                key={`${generatedSlug}-${previewVersion}`}
                src={`/p/${generatedSlug}`}
                className="flex-1 w-full border-0"
                title="Page preview"
                onLoad={() => {
                  if (editToolActive) {
                    setTimeout(() => {
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "SMART_PAGES_EDIT", enabled: true },
                        window.location.origin
                      );
                    }, 150);
                  }
                }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
                <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-500">Loading preview…</p>
              </div>
            )}
            {/* Bottom editing toolbar */}
            <div className="h-12 bg-white border-t border-gray-200 flex items-center justify-center gap-1 shrink-0 px-4">
              <button
                onClick={() => handleEditTool(false)}
                title="Navigate"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${!editToolActive ? "bg-gray-900 text-white" : "text-gray-400 hover:bg-gray-100"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 3l14 9-7 1-4 7z" />
                </svg>
              </button>
              <button
                onClick={() => handleEditTool(true)}
                title="Edit text"
                className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${editToolActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                T
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-white shadow-md flex items-center justify-center text-4xl text-indigo-200 border border-gray-100">✦</div>
            <div>
              <p className="font-semibold text-gray-700 text-xl">Your page will appear here</p>
              <p className="text-sm mt-2 text-gray-400 leading-relaxed max-w-xs">
                Tell the AI about your brand and it will build a full payment page in seconds.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: Message }) {
  if (message.role === "preview" && message.previewSlug) {
    return <PreviewCard slug={message.previewSlug} />;
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] flex flex-col gap-1.5 items-end">
          {message.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.imageUrl} alt="uploaded" className="max-w-[160px] rounded-2xl rounded-tr-sm object-cover shadow-sm border border-white/10" />
          )}
          {message.content && (
            <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs shrink-0 mt-0.5">✦</div>
      <div className="max-w-[82%] bg-white/10 border border-white/5 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-200 leading-relaxed">
        <MessageText content={message.content} />
      </div>
    </div>
  );
}

function MessageText({ content }: { content: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 underline break-all font-medium">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function PreviewCard({ slug }: { slug: string }) {
  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    void navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="self-start max-w-[90%] bg-indigo-950/60 border border-indigo-500/30 rounded-2xl p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-base">🎉</span>
        <p className="text-sm font-semibold text-white">Page is live!</p>
      </div>
      <div className="bg-white/10 rounded-xl px-2.5 py-1.5">
        <p className="text-xs font-mono text-white/60 break-all">{pageUrl}</p>
      </div>
      <div className="flex gap-2">
        <a href={`/p/${slug}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-xs font-bold bg-white text-indigo-700 rounded-xl px-3 py-2 hover:bg-indigo-50 transition-colors text-center">
          Open →
        </a>
        <button onClick={copyLink}
          className="text-xs font-medium text-white bg-white/20 rounded-xl px-3 py-2 hover:bg-white/30 transition-colors min-w-[80px]">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <p className="text-xs text-white/30 lg:hidden">Preview visible on larger screens →</p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs shrink-0">✦</div>
      <div className="bg-white/10 border border-white/5 rounded-2xl rounded-tl-sm px-3.5 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

function ContextPills({ context, collectionPhotoCount }: { context: ChatContext; collectionPhotoCount: number }) {
  const pills: { label: string; color?: string }[] = [];
  if (context.brandName) pills.push({ label: `🏷 ${context.brandName}` });
  if (context.pageType === "collection" && context.collectionProducts?.length) {
    pills.push({ label: `🛍 ${context.collectionProducts.length} products` });
    if (collectionPhotoCount > 0) pills.push({ label: `📸 ${collectionPhotoCount}/${context.collectionProducts.length} photos` });
  } else {
    if (context.productName) pills.push({ label: `📦 ${context.productName}` });
    if (context.priceRupees) pills.push({ label: `₹${context.priceRupees}` });
    if (context.productImageUrl) pills.push({ label: "📸 Photo added" });
  }
  if (context.primaryColor) pills.push({ label: context.primaryColor, color: context.primaryColor });
  if (!pills.length) return null;
  return (
    <div className="px-4 py-2.5 flex flex-wrap gap-1.5 border-t border-white/10">
      {pills.map((p) => (
        <span key={p.label} className="text-xs bg-white/10 text-gray-300 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-1">
          {p.color && <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: p.color }} />}
          {p.label}
        </span>
      ))}
    </div>
  );
}
