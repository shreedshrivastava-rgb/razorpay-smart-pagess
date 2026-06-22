"use client";

import { useEffect, useState, useCallback } from "react";
import type { WizardInput, PageSchema, TemplateType } from "@/lib/schema/page-schema";
import { PageRenderer } from "@/components/templates/PageRenderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface Step4PreviewProps {
  input: WizardInput;
  generatedPage: PageSchema | null;
  onGenerated: (page: PageSchema) => void;
  onBack: () => void;
}

const TEMPLATES: { id: TemplateType; label: string; emoji: string }[] = [
  { id: "modern", label: "Modern", emoji: "✨" },
  { id: "minimal", label: "Minimal", emoji: "⬜" },
  { id: "premium", label: "Premium", emoji: "💎" },
  { id: "event", label: "Event", emoji: "🎤" },
  { id: "d2c", label: "D2C", emoji: "🛍️" },
];

type ViewMode = "desktop" | "mobile";

export function Step4Preview({ input, generatedPage, onGenerated, onBack }: Step4PreviewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!generatedPage);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>("modern");
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [publishing, setPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState("");

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Generation failed");
      onGenerated(json.data as PageSchema);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [input, onGenerated]);

  useEffect(() => {
    if (!generatedPage) generate();
  }, [generatedPage, generate]);

  async function handlePublish() {
    if (!generatedPage) return;
    setPublishing(true);
    const page = { ...generatedPage, template: selectedTemplate };
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(page),
      });
      const json = await res.json();
      if (json.success) {
        setPublishedSlug(json.data.slug);
      }
    } catch {
      alert("Publish failed. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  const displayPage = generatedPage
    ? { ...generatedPage, template: selectedTemplate }
    : null;

  if (publishedSlug) {
    const url = `${window.location.origin}/p/${publishedSlug}`;
    return (
      <div className="max-w-xl mx-auto text-center py-10">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Your page is live!</h2>
        <p className="text-gray-500 mb-8">Share this link with your customers.</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-2 items-center mb-6">
          <span className="text-sm text-gray-600 flex-1 truncate font-mono">{url}</span>
          <Button
            onClick={() => navigator.clipboard.writeText(url)}
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl"
          >
            Copy
          </Button>
        </div>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => window.open(url, "_blank")}
          >
            Open page →
          </Button>
          <Button
            onClick={() => router.push("/")}
            className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl"
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Template</span>
          <div className="flex gap-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                  selectedTemplate === t.id
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(["desktop", "mobile"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                viewMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              )}
            >
              {mode === "desktop" ? "🖥️ Desktop" : "📱 Mobile"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={loading}
            className="rounded-xl text-xs"
          >
            🔄 Regenerate
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={!generatedPage || loading || publishing}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4"
          >
            {publishing ? "Publishing…" : "Publish →"}
          </Button>
        </div>
      </div>

      {/* Preview area */}
      <div className="bg-gray-200 rounded-2xl p-3 min-h-[600px] flex items-start justify-center overflow-auto">
        {loading ? (
          <GeneratingAnimation />
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <span className="text-4xl">😕</span>
            <p className="text-gray-600 text-center max-w-sm">{error}</p>
            <Button onClick={generate} className="bg-indigo-600 text-white rounded-xl">
              Try again
            </Button>
          </div>
        ) : displayPage ? (
          <div
            className={cn(
              "bg-white shadow-2xl rounded-xl overflow-hidden transition-all duration-300",
              viewMode === "mobile" ? "w-[390px]" : "w-full max-w-5xl"
            )}
            style={{ minHeight: "600px" }}
          >
            <div className={cn(viewMode === "mobile" && "scale-[0.85] origin-top")}>
              <PageRenderer page={displayPage} isPreview isOwner />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="rounded-xl h-11">
          ← Back
        </Button>
        <Button
          onClick={handlePublish}
          disabled={!generatedPage || loading || publishing}
          className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
        >
          {publishing ? "Publishing…" : "🚀 Publish Page"}
        </Button>
      </div>
    </div>
  );
}

function GeneratingAnimation() {
  const steps = [
    "Writing your headline…",
    "Crafting benefits copy…",
    "Generating testimonials…",
    "Building FAQ section…",
    "Finalizing your page…",
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 1500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">✨</span>
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-1">AI is building your page</h3>
        <p className="text-gray-400 text-sm">{steps[step]}</p>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {steps.slice(0, step + 1).map((s, i) => (
          <div key={i} className={cn("flex items-center gap-2", i < step ? "text-gray-400" : "text-indigo-600 font-medium")}>
            <span>{i < step ? "✅" : "⏳"}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
