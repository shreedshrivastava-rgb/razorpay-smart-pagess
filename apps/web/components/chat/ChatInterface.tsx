"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VoiceButton } from "./VoiceButton";
import type { ChatContext } from "@/app/api/chat/route";
import type { PageSchema, WizardInput } from "@/lib/schema/page-schema";
import type { StoredChat } from "@/lib/store/pages";

// Reconstruct the chat context from a stored page so the AI can keep editing it
// faithfully (rather than regenerating from an empty context and losing fields).
function pageToContext(page: PageSchema): ChatContext {
  const grid = page.sections?.find((s) => s.type === "product-grid") as
    | { items?: Array<{ name: string; price: number; maxPrice?: number; imageUrl?: string }> }
    | undefined;
  const ctx: ChatContext = {
    brandName: page.brand?.name,
    primaryColor: page.brand?.primaryColor,
    secondaryColor: page.brand?.secondaryColor,
    pageType: page.pageType,
    productName: page.payment?.name,
    description: page.payment?.description,
    priceRupees: page.payment?.amount != null ? Math.round(page.payment.amount) / 100 : undefined,
    originalPriceRupees: page.payment?.originalAmount != null ? Math.round(page.payment.originalAmount) / 100 : undefined,
    productBullets: page.productBullets,
    productImageUrl: page.productImageUrl,
    productImages: page.productImages,
    variants: page.variants,
    maxQuantity: page.maxQuantity,
    urgencyEndsAt: page.urgencyEndsAt,
    stockCount: page.stockCount,
    isPreOrder: page.isPreOrder,
    deliveryLabel: page.deliveryLabel,
    reviewCount: page.reviewCount,
    averageRating: page.averageRating,
    customFields: page.payment?.customFields,
  };
  if (page.payment?.couponConfig) {
    ctx.couponCode = page.payment.couponConfig.code;
    ctx.couponDiscount = page.payment.couponConfig.discountPercent;
  }
  if (page.pageType === "collection" && grid?.items?.length) {
    ctx.collectionProducts = grid.items.map((it) => ({
      name: it.name,
      price: Math.round(it.price) / 100,
      maxPrice: it.maxPrice != null ? Math.round(it.maxPrice) / 100 : undefined,
      imageUrl: it.imageUrl,
    }));
  }
  return ctx;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "preview";
  content: string;
  imageUrl?: string;
  previewSlug?: string;
  previewVersion?: number;
}

// Drop inline base64 image data (huge) before persisting a conversation to the
// server — the photo is already baked into the generated page.
function stripDataUrls(messages: Message[]): Message[] {
  return messages.map((m) => (m.imageUrl?.startsWith("data:") ? { ...m, imageUrl: undefined } : m));
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
const HISTORY_KEY = "razorpay_page_history";

interface ChatSession {
  id: string;
  slug: string;
  brandName: string;
  timestamp: number;
  messages: Message[];
  context: ChatContext;
  previewVersion: number;
}

export function ChatInterface() {
  const searchParams = useSearchParams();
  const slugParam = searchParams.get("slug");
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
  const [previewReady, setPreviewReady] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generatedEditToken, setGeneratedEditToken] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishSlug, setPublishSlug] = useState("");
  const [publishSlugError, setPublishSlugError] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const inflightRef = useRef(false);
  const sessionIdRef = useRef(0);
  const restoredRef = useRef(false);
  const storageWarnedRef = useRef(false);
  const initialPromptSentRef = useRef(false);
  const chatSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageUrl = generatedSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${generatedSlug}`
    : "";

  // Load page history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setChatHistory(JSON.parse(saved) as ChatSession[]);
    } catch { /* localStorage unavailable */ }
  }, []);

  // Close history dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Restore from sessionStorage; fall back to most recent history entry when opening a fresh tab
  useEffect(() => {
    if (slugParam) return;
    // ?prompt= means the user is starting a new chat — don't restore a previous session
    if (new URLSearchParams(window.location.search).get("prompt")) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          messages?: Message[]; context?: ChatContext;
          generatedSlug?: string | null; previewVersion?: number;
        };
        if (parsed.messages?.length) { setMessages(parsed.messages); restoredRef.current = true; }
        if (parsed.context) setContext(parsed.context);
        if (parsed.generatedSlug) {
          setGeneratedSlug(parsed.generatedSlug);
          setPreviewReady(true);
          try {
            const token = localStorage.getItem(`edit_token_${parsed.generatedSlug}`);
            if (token) setGeneratedEditToken(token);
          } catch { /* ignore */ }
        }
        if (typeof parsed.previewVersion === "number") setPreviewVersion(parsed.previewVersion);
      } else {
        // No current tab session — try localStorage history first, then API
        let restoredFromHistory = false;
        try {
          const histStr = localStorage.getItem(HISTORY_KEY);
          if (histStr) {
            const hist = JSON.parse(histStr) as ChatSession[];
            const latest = hist[0];
            if (latest) {
              setMessages(latest.messages?.length ? latest.messages : [GREETING]);
              setContext(latest.context ?? {});
              setGeneratedSlug(latest.slug);
              setPreviewVersion(latest.previewVersion ?? 0);
              setPreviewReady(true);
              setIsPublished(true);
              try {
                const token = localStorage.getItem(`edit_token_${latest.slug}`);
                if (token) setGeneratedEditToken(token);
              } catch { /* ignore */ }
              restoredRef.current = true;
              restoredFromHistory = true;
            }
          }
        } catch { /* ignore */ }

        if (!restoredFromHistory) {
          // No localStorage history — fetch the most recent page from the API
          void (async () => {
            try {
              const listRes = await fetch("/api/pages", { cache: "no-store" });
              if (!listRes.ok) return;
              const listJson = await listRes.json() as { data?: PageSchema[] };
              const recent = listJson.data?.[0];
              if (!recent || restoredRef.current) return;

              const pageRes = await fetch(`/api/pages/${encodeURIComponent(recent.slug)}?withToken=1`, { cache: "no-store" });
              if (!pageRes.ok) return;
              const pageJson = await pageRes.json() as { data?: PageSchema; editToken?: string | null; chat?: StoredChat | null };
              const page = pageJson.data;
              if (!page || restoredRef.current) return;

              const token = pageJson.editToken ?? null;
              try {
                if (!token) {
                  const stored = localStorage.getItem(`edit_token_${page.slug}`);
                  if (stored) { setGeneratedEditToken(stored); }
                } else {
                  localStorage.setItem(`edit_token_${page.slug}`, token);
                  setGeneratedEditToken(token);
                }
              } catch { /* ignore */ }

              const serverChat = pageJson.chat ?? null;
              const restoredVersion = serverChat?.previewVersion ?? 0;
              const serverMessages = serverChat?.messages as Message[] | undefined;
              setContext((serverChat?.context as ChatContext) ?? pageToContext(page));
              setGeneratedSlug(page.slug);
              setIsPublished(page.status !== "draft");
              setPreviewVersion(restoredVersion);
              setPreviewReady(true);
              setMessages(serverMessages?.length ? serverMessages : [
                { id: "greeting", role: "assistant", content: `Here's **${page.brand?.name ?? "your page"}**. Tell me what you'd like to change — copy, price, colours, products — and I'll update it live.` },
                { id: `prev-${Date.now()}`, role: "preview", content: "", previewSlug: page.slug, previewVersion: restoredVersion },
              ]);
              restoredRef.current = true;
            } catch { /* ignore */ }
          })();
        }
      }
    } catch { /* unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Don't persist the pristine initial state. On mount this effect fires with
    // [GREETING]/null *before* the restore effect's setState commits — persisting
    // here would clobber a saved session (and with React StrictMode's double
    // effect-invoke, the second restore pass would then read empty storage).
    // handleNewChat clears storage explicitly, so skipping pristine state is safe.
    const isPristine = !generatedSlug && messages.length <= 1;
    if (isPristine) return;
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

  // Persist the conversation server-side (debounced) so it survives across tabs,
  // browsers and devices. Owner-scoped via the page; keyed by slug.
  useEffect(() => {
    if (!generatedSlug) return;
    if (messages.length <= 1) return; // nothing meaningful yet
    const slug = generatedSlug;
    const payload = JSON.stringify({
      messages: stripDataUrls(messages),
      context,
      previewVersion,
      brandName: context.brandName ?? "",
    });
    if (chatSaveTimerRef.current) clearTimeout(chatSaveTimerRef.current);
    chatSaveTimerRef.current = setTimeout(() => {
      void fetch(`/api/pages/${encodeURIComponent(slug)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => { /* best-effort; sessionStorage still has it */ });
    }, 900);
    return () => { if (chatSaveTimerRef.current) clearTimeout(chatSaveTimerRef.current); };
  }, [messages, context, generatedSlug, previewVersion]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, generating, pendingPhotoDataUrls]);


  // Auto-send an initial prompt handed off from the landing page (/chat?prompt=...)
  useEffect(() => {
    if (initialPromptSentRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("slug")) return; // slug deep-links are handled separately
    const initial = params.get("prompt");
    if (initial && initial.trim()) {
      initialPromptSentRef.current = true;
      restoredRef.current = true; // prevent API auto-restore from overriding this fresh chat
      window.history.replaceState({}, "", window.location.pathname);
      void sendMessage(initial.trim());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open an existing page in the chat + preview interface (/chat?slug=...)
  useEffect(() => {
    if (!slugParam) return;
    restoredRef.current = true; // suppress greeting TTS and prompt auto-send
    stopAudio();
    window.history.replaceState({}, "", window.location.pathname);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pages/${encodeURIComponent(slugParam)}?withToken=1`, { cache: "no-store" });
        if (!res.ok) throw new Error("not found");
        const json = await res.json() as { data?: PageSchema; editToken?: string | null; chat?: StoredChat | null };
        const page = json.data;
        if (!page || cancelled) return;
        const serverChat = json.chat ?? null;
        const restoredVersion = serverChat?.previewVersion ?? 0;
        setContext((serverChat?.context as ChatContext) ?? pageToContext(page));
        setGeneratedSlug(page.slug);
        setIsPublished(page.status !== "draft");
        setPreviewReady(true);
        setPreviewVersion(restoredVersion);
        // Prefer the server-provided token (works for drafts in any browser); fall back to localStorage.
        let token = json.editToken ?? null;
        try {
          if (!token) token = localStorage.getItem(`edit_token_${page.slug}`);
          if (token) localStorage.setItem(`edit_token_${page.slug}`, token);
        } catch { /* localStorage unavailable */ }
        if (token) setGeneratedEditToken(token);
        const brandName = page.brand?.name ?? "your page";
        // Restore the saved conversation: server first (cross-device), then the
        // local history cache, then a fresh greeting + preview.
        const serverMessages = serverChat?.messages as Message[] | undefined;
        let restored: Message[] | null = serverMessages?.length ? serverMessages : null;
        if (!restored) {
          try {
            const histStr = localStorage.getItem(HISTORY_KEY);
            const hist = histStr ? (JSON.parse(histStr) as ChatSession[]) : [];
            const past = hist.find((s) => s.slug === page.slug);
            if (past?.messages?.length) restored = past.messages;
          } catch { /* ignore */ }
        }
        setMessages(restored ?? [
          { id: "greeting", role: "assistant", content: `Here's **${brandName}**. Tell me what you'd like to change — copy, price, colours, products — and I'll update it live.` },
          { id: `prev-${Date.now()}`, role: "preview", content: "", previewSlug: page.slug, previewVersion: restoredVersion },
        ]);
      } catch {
        if (!cancelled) setError("Couldn't load that page. It may have been deleted.");
      }
    })();
    return () => { cancelled = true; };
  }, [slugParam]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function saveToHistory(slug: string, brandName: string, sessionMessages: Message[], ctx: ChatContext, version: number) {
    const session: ChatSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slug,
      brandName: brandName || "My Page",
      timestamp: Date.now(),
      messages: sessionMessages,
      context: ctx,
      previewVersion: version,
    };
    setChatHistory((prev) => {
      const updated = [session, ...prev.filter((s) => s.slug !== slug)].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }

  function restoreSession(session: ChatSession) {
    stopAudio();
    sessionIdRef.current += 1;
    inflightRef.current = false;
    setMessages(session.messages?.length ? session.messages : [GREETING]);
    setContext(session.context ?? {});
    setGeneratedSlug(session.slug);
    setPreviewVersion(session.previewVersion ?? 0);
    setPreviewReady(true);
    setIsPublished(true);
    setInput("");
    setLoading(false);
    setGenerating(false);
    setError("");
    setPendingPhotoDataUrls([]);
    setHistoryOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: session.messages?.length ? session.messages : [GREETING],
        context: session.context ?? {},
        generatedSlug: session.slug,
        previewVersion: session.previewVersion ?? 0,
      }));
    } catch { /* unavailable */ }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function pollUntilReady(slug: string, mySession: number, previewToken?: string | null): Promise<void> {
    const url = previewToken ? `/p/${slug}?preview=${previewToken}` : `/p/${slug}`;
    const MAX = 20;
    for (let i = 0; i < MAX; i++) {
      await new Promise<void>((r) => setTimeout(r, 600));
      if (sessionIdRef.current !== mySession) return;
      try {
        const check = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (check.ok) { setPreviewReady(true); return; }
      } catch { /* network hiccup — retry */ }
    }
    if (sessionIdRef.current === mySession) setPreviewReady(true);
  }

  async function triggerGenerate(ctx: ChatContext) {
    const mySession = sessionIdRef.current;
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
      if (sessionIdRef.current !== mySession) return;
      const slug = json.data?.slug;
      const editToken = json.data?.editToken;
      if (slug) {
        setGeneratedSlug(slug);
        setGeneratedEditToken(editToken ?? null);
        setPreviewVersion(0);
        setPreviewReady(false);
        void pollUntilReady(slug, mySession, editToken);
        try {
          const owned = JSON.parse(localStorage.getItem("owned_pages") ?? "{}") as Record<string, boolean>;
          owned[slug] = true;
          localStorage.setItem("owned_pages", JSON.stringify(owned));
          if (editToken) localStorage.setItem(`edit_token_${slug}`, editToken);
        } catch { /* localStorage unavailable */ }
        addMessage({ role: "assistant", content: "Looking good! Preview is ready — hit **Publish** when you're happy to share it." });
        void speak("Preview is ready. Make any changes you want, then hit Publish to share your page.");
      }
    } catch {
      setError("Couldn't generate the page. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function triggerUpdate(ctx: ChatContext, slug: string) {
    const mySession = sessionIdRef.current;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildWizardInput(ctx), existingSlug: slug }),
      });
      if (!res.ok) throw new Error("Update failed");
      const json = await res.json() as { data?: { slug?: string; editToken?: string } };
      if (sessionIdRef.current !== mySession) return;
      if (json.data?.slug) {
        const nextVersion = previewVersion + 1;
        const updatedToken = json.data.editToken ?? generatedEditToken;
        setPreviewReady(false);
        setPreviewVersion(nextVersion);
        if (json.data.editToken) setGeneratedEditToken(json.data.editToken);
        void pollUntilReady(slug, mySession, updatedToken);
        try {
          if (json.data.editToken) localStorage.setItem(`edit_token_${slug}`, json.data.editToken);
        } catch { /* ignore */ }
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
    restoredRef.current = true; // prevent API auto-restore from overriding an active conversation
    inflightRef.current = true;
    const mySession = sessionIdRef.current;
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

      if (sessionIdRef.current !== mySession) return;

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
        const sessionAtSchedule = mySession;
        if (generatedSlug) {
          setTimeout(() => {
            if (sessionIdRef.current !== sessionAtSchedule) return;
            void triggerUpdate(updatedCtx, generatedSlug);
          }, 600);
        } else {
          setTimeout(() => {
            if (sessionIdRef.current !== sessionAtSchedule) return;
            void triggerGenerate(updatedCtx);
          }, 600);
        }
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


  function openPublishModal() {
    if (!generatedSlug) return;
    setPublishSlug(generatedSlug);
    setPublishSlugError("");
    setPublishModalOpen(true);
  }

  // Asks the preview iframe to PATCH any pending inline edits before we publish the URL
  function triggerIframeSave(): Promise<boolean> {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(true), 6000);
      function onMessage(event: MessageEvent) {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "SMART_PAGES_SAVE_DONE") return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve((event.data as { success?: boolean }).success !== false);
      }
      window.addEventListener("message", onMessage);
      iframe.contentWindow!.postMessage({ type: "SMART_PAGES_SAVE" }, window.location.origin);
    });
  }

  async function confirmPublish(chosenSlug: string) {
    if (!generatedSlug) return;
    const clean = chosenSlug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!clean) { setPublishSlugError("Enter a valid page name."); return; }
    setPublishLoading(true);
    setPublishSlugError("");
    // Save any pending inline edits in the preview iframe first
    await triggerIframeSave();
    try {
      // Always call rename/publish — even same slug — so the draft moves to the live namespace
      const res = await fetch("/api/pages/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSlug: generatedSlug, toSlug: clean }),
      });
      const json = await res.json() as { success?: boolean; data?: { slug?: string }; error?: string };
      if (!res.ok || !json.success) { setPublishSlugError(json.error ?? "That name is taken — try another."); return; }
      const finalSlug = json.data?.slug ?? clean;
      if (finalSlug !== generatedSlug) {
        setGeneratedSlug(finalSlug);
        // Update localStorage ownership keys
        try {
          const token = localStorage.getItem(`edit_token_${generatedSlug}`);
          if (token) localStorage.setItem(`edit_token_${finalSlug}`, token);
          const owned = JSON.parse(localStorage.getItem("owned_pages") ?? "{}") as Record<string, boolean>;
          owned[finalSlug] = true;
          localStorage.setItem("owned_pages", JSON.stringify(owned));
          if (token) localStorage.removeItem(`edit_token_${generatedSlug}`);
          delete owned[generatedSlug];
          localStorage.setItem("owned_pages", JSON.stringify(owned));
        } catch { /* ignore */ }
      }
      setGeneratedEditToken(null);
      setIsPublished(true);
      setPublishModalOpen(false);
      const liveUrl = `${window.location.origin}/p/${finalSlug}`;
      const liveId = `live-${Date.now()}`;
      const prevId = `prev-${Date.now()}`;
      const newMessages: Message[] = [
        ...messages,
        { id: liveId, role: "assistant", content: `Your page is live at ${liveUrl} 🎉` },
        { id: prevId, role: "preview", content: "", previewSlug: finalSlug, previewVersion },
      ];
      setMessages(newMessages);
      saveToHistory(finalSlug, context.brandName ?? "My Page", newMessages, context, previewVersion);
      void navigator.clipboard.writeText(liveUrl).catch(() => undefined);
      void speak("Your page is live! The link has been copied.");
    } finally {
      setPublishLoading(false);
    }
  }

  function refreshPreview() {
    if (!generatedSlug) return;
    setPreviewReady(false);
    setPreviewVersion((v) => v + 1);
    void pollUntilReady(generatedSlug, sessionIdRef.current, generatedEditToken);
  }

  const isCollection = context.pageType === "collection" && (context.collectionProducts?.length ?? 0) > 0;
  const collectionPhotoCount = context.collectionProducts?.filter((p) => p.imageUrl).length ?? 0;
  const canSend = (input.trim().length > 0 || pendingPhotoDataUrls.length > 0) && !loading && !generating;

  function handleNewChat() {
    stopAudio();
    sessionIdRef.current += 1;
    inflightRef.current = false;
    setMessages([GREETING]);
    setContext({});
    setInput("");
    setLoading(false);
    setGenerating(false);
    setGeneratedSlug(null);
    setGeneratedEditToken(null);
    setPreviewVersion(0);
    setPreviewReady(false);
    setIsPublished(false);
    setPublishModalOpen(false);
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
            {chatHistory.length > 0 && (
              <div className="relative" ref={historyRef}>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  title="Your pages"
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${historyOpen ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20 text-white/50 hover:text-white"}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {historyOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-[#1e293b] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10">
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Your pages</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {chatHistory.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => restoreSession(session)}
                          className="w-full px-3 py-2.5 hover:bg-white/5 flex items-center justify-between gap-2 border-b border-white/5 last:border-0 text-left transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white font-medium truncate">{session.brandName}</p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {new Date(session.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <a
                            href={`/p/${session.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-white/30 hover:text-indigo-400 shrink-0 transition-colors px-1"
                            title="Open page in new tab"
                          >
                            ↗
                          </a>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
              {isPublished ? (
                <>
                  <div className="flex-1 min-w-0 bg-gray-100 rounded-lg px-3 py-1.5">
                    <p className="text-xs font-mono text-gray-400 truncate">{pageUrl}</p>
                  </div>
                  <button onClick={refreshPreview} title="Reload preview" className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100 shrink-0">↺</button>
                  <a href={`/p/${generatedSlug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100">
                    Open
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                  <button
                    onClick={openPublishModal}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-1.5 rounded-lg shrink-0 shadow-sm"
                  >
                    Publish
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-xs text-amber-600 font-medium truncate">Draft preview — not shared yet</p>
                  </div>
                  <button onClick={refreshPreview} title="Reload preview" className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100 shrink-0">↺</button>
                  <button
                    onClick={openPublishModal}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-1.5 rounded-lg shrink-0 shadow-sm"
                  >
                    Publish
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  </button>
                </>
              )}
            </div>
            {/* Full page iframe or loading state */}
            <div className="relative flex-1 overflow-hidden">
              {previewReady ? (
                <iframe
                  ref={iframeRef}
                  key={`${generatedSlug}-${previewVersion}`}
                  src={`/p/${generatedSlug}${generatedEditToken ? `?preview=${generatedEditToken}` : ""}`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Page preview"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
                  <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm text-gray-500">Loading preview…</p>
                </div>
              )}
              {/* Publish modal overlay */}
              {publishModalOpen && generatedSlug && (
                <PublishModal
                  initialSlug={publishSlug}
                  error={publishSlugError}
                  loading={publishLoading}
                  onSlugChange={(s: string) => { setPublishSlug(s); setPublishSlugError(""); }}
                  onConfirm={() => void confirmPublish(publishSlug)}
                  onCancel={() => setPublishModalOpen(false)}
                />
              )}
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

// ─── PublishModal ─────────────────────────────────────────────────────────────

function PublishModal({
  initialSlug, error, loading, onSlugChange, onConfirm, onCancel,
}: {
  initialSlug: string;
  error: string;
  loading: boolean;
  onSlugChange: (s: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const preview = initialSlug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "my-page";

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Publish your page</h2>
          <button onClick={onCancel} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg">×</button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Your page URL</label>
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <span className="text-xs text-gray-400 pl-3 pr-1 shrink-0 whitespace-nowrap">{origin}/p/</span>
            <input
              type="text"
              value={initialSlug}
              onChange={(e) => onSlugChange(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-gray-800 py-2.5 pr-3 focus:outline-none min-w-0"
              placeholder="my-page"
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : (
            <p className="text-xs text-gray-400">Preview: <span className="text-gray-600 font-medium">{origin}/p/{preview}</span></p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : "Publish & Copy Link"}
          </button>
        </div>
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
