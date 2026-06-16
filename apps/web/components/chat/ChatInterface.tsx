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
  // Pending photo: selected but not yet sent/identified
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef(false);
  const restoredRef = useRef(false);

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
        if (parsed.generatedSlug) setGeneratedSlug(parsed.generatedSlug);
        if (typeof parsed.previewVersion === "number") setPreviewVersion(parsed.previewVersion);
      }
    } catch { /* unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, context, generatedSlug, previewVersion }));
    } catch { /* quota */ }
  }, [messages, context, generatedSlug, previewVersion]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, generating, pendingPhotoDataUrl]);

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
      productUrl: ctx.productUrl ?? "",
      ...(isCollection && ctx.collectionProducts?.length
        ? {
            collectionProducts: ctx.collectionProducts.map((p) => ({
              name: p.name,
              price: Math.round(p.price * 100),
              maxPrice: p.maxPrice ? Math.round(p.maxPrice * 100) : undefined,
              description: p.description,
              imageUrl: p.imageUrl,
              badge: p.badge,
              bullets: p.bullets,
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
      const json = await res.json() as { data?: { slug?: string } };
      const slug = json.data?.slug;
      if (slug) {
        setGeneratedSlug(slug);
        setPreviewVersion(0);
        const preview = "Your page is live! Preview it below, or keep editing with me.";
        addMessage({ role: "assistant", content: preview });
        addMessage({ role: "preview", content: "", previewSlug: slug, previewVersion: 0 });
        void speak(preview);
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
        setPreviewVersion(nextVersion);
        const msg = "Done! Your page has been updated.";
        addMessage({ role: "assistant", content: msg });
        addMessage({ role: "preview", content: "", previewSlug: slug, previewVersion: nextVersion });
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
    // Allow sending with just a pending photo (no text required)
    if ((!trimmed && !pendingPhotoDataUrl) || inflightRef.current || generating) return;
    inflightRef.current = true;
    setError("");
    setInput("");

    // Capture and clear pending photo atomically
    const photoForThisMessage = pendingPhotoDataUrl;
    setPendingPhotoDataUrl(null);

    setLoading(true);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      imageUrl: photoForThisMessage ?? undefined,
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
          pendingPhotoUrl: photoForThisMessage ?? undefined,
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

      // Map the photo client-side using the AI's photoMapping directive
      if (photoForThisMessage) {
        if (json.photoMapping) {
          const targetName = json.photoMapping.toLowerCase();
          const updatedProducts = (json.context.collectionProducts ?? context.collectionProducts ?? []).map((p) => {
            const pLower = p.name.toLowerCase();
            if (pLower === targetName || targetName.includes(pLower) || pLower.includes(targetName)) {
              return { ...p, imageUrl: photoForThisMessage };
            }
            return p;
          });
          updatedCtx = { ...json.context, collectionProducts: updatedProducts };
        } else if (json.context.pageType !== "collection") {
          // Single product — assign directly
          updatedCtx = { ...json.context, productImageUrl: photoForThisMessage };
        }
      }

      setContext(updatedCtx);
      addMessage({ role: "assistant", content: json.reply });
      void speak(json.reply);

      // Don't trigger generation/update if the AI is still waiting for photos
      const stillNeedsPhotos = updatedCtx.pageType === "collection"
        && (updatedCtx.collectionProducts?.length ?? 0) > 0
        && (updatedCtx.collectionProducts?.some((p) => !p.imageUrl) ?? false)
        && json.action !== "generate"; // explicit "skip photos" path still goes through

      if (json.action === "generate" && !stillNeedsPhotos) setTimeout(() => void triggerGenerate(updatedCtx), 600);
      else if (json.action === "update" && generatedSlug && !stillNeedsPhotos) setTimeout(() => void triggerUpdate(updatedCtx, generatedSlug), 600);
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

  // ─── Photo upload ─────────────────────────────────────────────────────────

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingImage(true);
    try {
      const dataUrl = await processImageFile(file);
      setPendingPhotoDataUrl(dataUrl);
      // Focus the textarea so user can immediately type what the photo is for
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG under 10 MB.");
    } finally {
      setUploadingImage(false);
    }
  }

  const isCollection = context.pageType === "collection" && (context.collectionProducts?.length ?? 0) > 0;
  const collectionPhotoCount = context.collectionProducts?.filter((p) => p.imageUrl).length ?? 0;
  const canSend = (input.trim().length > 0 || !!pendingPhotoDataUrl) && !loading && !generating;

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-violet-600">
        <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-lg">✦</div>
        <div>
          <p className="text-sm font-semibold text-white">Smart Pages AI</p>
          <p className="text-xs text-indigo-200">by Razorpay</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-indigo-200">Ready</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 bg-gray-50/50">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {loading && <TypingIndicator />}

        {generating && (
          <div className="flex items-center gap-3 self-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm shrink-0">✦</div>
            <div className="bg-white border border-indigo-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2.5">
              <svg className="animate-spin w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-indigo-700 font-medium">{generatedSlug ? "Updating your page…" : "Building your page…"}</span>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 self-center py-1 bg-red-50 px-3 rounded-full">{error}</p>}
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
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* Pending photo preview strip — shows between pills and input */}
      {pendingPhotoDataUrl && (
        <div className="px-4 pt-3 pb-1 flex items-center gap-3 bg-indigo-50/70 border-t border-indigo-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingPhotoDataUrl}
            alt="pending upload"
            className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-md shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-700 mb-0.5">Photo ready</p>
            <p className="text-xs text-indigo-500 leading-snug">
              {isCollection
                ? "Type the product name below and hit send."
                : "Add a caption below, or just send it."}
            </p>
          </div>
          <button
            onClick={() => setPendingPhotoDataUrl(null)}
            className="w-7 h-7 rounded-full bg-white text-gray-400 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-colors shadow-sm shrink-0 text-sm font-bold"
            title="Remove photo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage || generating}
            title="Upload photo"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 relative"
          >
            {uploadingImage ? (
              <svg className="animate-spin w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
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
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
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
                : pendingPhotoDataUrl
                  ? (isCollection ? "Which product is this for?" : "What is this a photo of?")
                  : "Tell me about your brand…"
            }
            rows={1}
            style={{ resize: "none", minHeight: "36px", maxHeight: "120px" }}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none py-1 disabled:opacity-50"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <div className="flex items-center gap-1.5 pb-0.5 shrink-0">
            <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading || generating} />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={!canSend}
              className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-md shadow-indigo-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mt-1.5">
          Enter to send · Mic for voice · 📷 for photo
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: Message }) {
  if (message.role === "preview" && message.previewSlug) {
    return <PreviewCard slug={message.previewSlug} version={message.previewVersion ?? 0} />;
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] flex flex-col gap-1.5 items-end">
          {message.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.imageUrl} alt="uploaded" className="max-w-[200px] rounded-2xl rounded-tr-sm object-cover shadow-sm border border-white" />
          )}
          {message.content && (
            <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm shrink-0 mt-0.5 shadow-sm">✦</div>
      <div className="max-w-[78%] bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-800 leading-relaxed">
        {message.content}
      </div>
    </div>
  );
}

function PreviewCard({ slug, version }: { slug: string; version: number }) {
  return (
    <div className="self-start w-full max-w-sm flex flex-col gap-2 my-1">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎉</span>
          <p className="text-sm font-semibold">Your page is live!</p>
        </div>
        <div className="flex gap-2">
          <a href={`/p/${slug}`} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-sm font-bold bg-white text-indigo-700 rounded-xl px-3 py-2 hover:bg-indigo-50 transition-colors text-center">
            Preview →
          </a>
          <button
            onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`); }}
            className="text-sm font-medium text-white/80 bg-white/20 rounded-xl px-3 py-2 hover:bg-white/30 transition-colors"
            title="Copy link"
          >
            Copy
          </button>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
        <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">Live preview</span>
          <a href={`/p/${slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline">
            Open full page ↗
          </a>
        </div>
        <iframe key={version} src={`/p/${slug}`} className="w-full h-64 border-0" title="Page preview" />
      </div>
      <p className="text-xs text-gray-400 ml-1">Say "make it pink", "change price to ₹499", or describe any change.</p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm shrink-0 shadow-sm">✦</div>
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
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
    <div className="px-4 py-2.5 flex flex-wrap gap-1.5 border-t border-gray-100 bg-gray-50/50">
      {pills.map((p) => (
        <span key={p.label} className="text-xs bg-white border border-indigo-100 text-indigo-600 rounded-full px-2.5 py-0.5 font-medium shadow-sm flex items-center gap-1">
          {p.color && <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: p.color }} />}
          {p.label}
        </span>
      ))}
    </div>
  );
}
