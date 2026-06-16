"use client";

import { useState } from "react";
import type { ExtractedBrand } from "@/lib/schema/page-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChatInterface } from "@/components/chat/ChatInterface";

interface Step1ImportProps {
  onExtracted: (data: ExtractedBrand) => void;
  onSkip: () => void;
}

type Tab = "url" | "chat";

export function Step1Import({ onExtracted, onSkip }: Step1ImportProps) {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const steps = [
    "Reading your website…",
    "Extracting brand colors…",
    "Finding your logo…",
    "Analyzing content…",
    "Almost there…",
  ];
  const [progressStep, setProgressStep] = useState(0);

  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setProgress(0);
    setProgressStep(0);

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) { clearInterval(interval); return p; }
        setProgressStep((s) => Math.min(s + 1, steps.length - 1));
        return p + 18;
      });
    }, 1200);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      clearInterval(interval);

      if (!res.ok || !json.success) {
        setError(json.error || "Could not extract data. Please continue manually.");
        setLoading(false);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        onExtracted(json.data as ExtractedBrand);
      }, 400);
    } catch {
      clearInterval(interval);
      setError("Network error. Please check your URL and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 mb-4">
          <span className="text-3xl">🚀</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Build your page in 2 minutes
        </h1>
        <p className="text-gray-500 text-lg">
          Import from your website — or just describe your business.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-6 gap-1">
        <button
          onClick={() => setTab("url")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
            tab === "url"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          I have a website
        </button>
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
            tab === "chat"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <span className="text-base leading-none">✦</span>
          Describe my business
        </button>
      </div>

      {tab === "url" && (
        loading ? (
          <ImportingAnimation steps={steps} currentStep={progressStep} progress={progress} />
        ) : (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700 mb-1.5 block">
                  Your website URL
                </span>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://yourbusiness.com"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleImport()}
                    className="h-12 text-base rounded-xl border-gray-200 flex-1"
                  />
                  <Button
                    onClick={handleImport}
                    disabled={!url.trim()}
                    className="h-12 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold whitespace-nowrap"
                  >
                    Import →
                  </Button>
                </div>
                {error && (
                  <p className="text-red-500 text-sm mt-2 flex items-center gap-1.5">
                    <span>⚠️</span> {error}
                  </p>
                )}
              </label>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <button
                onClick={onSkip}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors text-center underline-offset-2 hover:underline"
              >
                Skip — I&apos;ll fill everything in manually
              </button>
            </div>

            {/* Social proof */}
            <div className="mt-8 pt-6 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
              {[
                { value: "2 min", label: "Average setup time" },
                { value: "10K+", label: "Pages created" },
                { value: "38%", label: "Avg. conversion lift" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {tab === "chat" && (
        <div className="h-[600px]">
          <ChatInterface />
        </div>
      )}
    </div>
  );
}

function ImportingAnimation({
  steps,
  currentStep,
  progress,
}: {
  steps: string[];
  currentStep: number;
  progress: number;
}) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="#6366f1"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
            className="transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-indigo-600">
          {Math.round(progress)}%
        </span>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {steps[currentStep]}
      </h3>
      <p className="text-sm text-gray-400">
        Reading your website and extracting your brand automatically
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {steps.slice(0, currentStep + 1).map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2.5 text-sm px-4 py-2 rounded-xl transition-all",
              i === currentStep
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-gray-400"
            )}
          >
            <span>{i === currentStep ? "⏳" : "✅"}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
