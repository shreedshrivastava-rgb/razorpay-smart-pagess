"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Status {
  connected: boolean;
  method?: "keys" | "oauth";
  mode?: "test" | "live";
  keyIdMasked?: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/merchant", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json() as { status: Status; oauthAvailable: boolean };
      setStatus(j.status);
      setOauthAvailable(j.oauthAvailable);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void load();
    const p = new URLSearchParams(window.location.search).get("connect");
    if (p === "ok") setMsg("Razorpay account connected.");
    if (p === "error") setErr("Couldn't connect your Razorpay account. Please try again.");
  }, []);

  async function saveKeys(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(""); setErr("");
    try {
      const res = await fetch("/api/merchant/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: keyId.trim(), keySecret: keySecret.trim() }),
      });
      const j = await res.json() as { error?: string; mode?: string };
      if (!res.ok) { setErr(j.error ?? "Couldn't save keys."); return; }
      setMsg(`Connected in ${j.mode} mode. Payments will now go to your account.`);
      setKeyId(""); setKeySecret("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setMsg(""); setErr("");
    try {
      const res = await fetch("/api/merchant", { method: "DELETE" });
      if (res.ok) { setMsg("Disconnected. Payments fall back to the platform account."); await load(); }
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-3xl h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Smart Pages</span>
            <span className="text-gray-300 mx-1">by</span>
            <span className="font-semibold text-blue-600">Razorpay</span>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">← My Pages</Link>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-3xl py-10">
        <h1 className="text-2xl font-bold text-gray-900">Payment settings</h1>
        <p className="text-gray-500 text-sm mt-0.5 mb-6">
          Connect your own Razorpay account so payments from your pages go straight to you.
        </p>

        {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">{msg}</div>}
        {err && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{err}</div>}

        {/* Current status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {status?.connected
                ? <>Connected · {status.method === "oauth" ? "Razorpay account" : "API keys"} · {status.mode} mode</>
                : "Not connected"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {status?.connected
                ? <>Key {status.keyIdMasked} — your pages collect into this account.</>
                : "Payments currently use the platform account. Connect to receive them yourself."}
            </p>
          </div>
          {status?.connected && (
            <button onClick={disconnect} className="text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 shrink-0">
              Disconnect
            </button>
          )}
        </div>

        {/* Option A: Connect with Razorpay (OAuth) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <h2 className="font-semibold text-gray-900">Connect with Razorpay</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">One click — authorize with your Razorpay login. No keys to copy.</p>
          {oauthAvailable ? (
            <a href="/api/razorpay/oauth/start" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              Connect with Razorpay
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold cursor-not-allowed" title="Requires Razorpay Partner setup on the server">
              Connect with Razorpay (setup required)
            </span>
          )}
        </div>

        {/* Option B: BYO keys */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900">Or paste your Razorpay API keys</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            From your Razorpay Dashboard → Settings → API Keys. Use a <strong>live</strong> key to take real payments.
          </p>
          <form onSubmit={saveKeys} className="flex flex-col gap-3">
            <input
              value={keyId} onChange={(e) => setKeyId(e.target.value)}
              placeholder="Key ID (rzp_live_… or rzp_test_…)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-indigo-400 focus:bg-white outline-none"
            />
            <input
              value={keySecret} onChange={(e) => setKeySecret(e.target.value)}
              type="password" placeholder="Key Secret"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-indigo-400 focus:bg-white outline-none"
            />
            <button
              type="submit" disabled={saving || !keyId || !keySecret}
              className="self-start px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save keys"}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-3">🔒 Your secret is encrypted and never shown back or sent to the browser.</p>
        </div>
      </main>
    </div>
  );
}
