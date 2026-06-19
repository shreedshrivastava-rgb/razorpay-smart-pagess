import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const metadata = {
  title: "Sign in — Smart Pages by Razorpay",
};

// Deterministic faint "code rain" backdrop (no Math.random → no hydration mismatch).
const MATRIX_CHARS = "アイウエ01<>*@#$%&XYZ.+=ABCΩ∆01ｦｱｳ";
const MATRIX = Array.from({ length: 44 }, (_, r) =>
  Array.from({ length: 90 }, (_, c) => MATRIX_CHARS[(r * 7 + c * 3) % MATRIX_CHARS.length]).join(" ")
).join("\n");

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const dest = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";

  if (session?.user) redirect(dest);

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black lg:grid-cols-2">
      {/* ─── Left: auth ─────────────────────────────────────────────── */}
      <div className="relative flex flex-col overflow-hidden bg-[#0a0a0b] px-6 py-6 text-white">
        {/* Code-rain texture */}
        <pre
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none whitespace-pre font-mono text-[11px] leading-[1.5] text-white/[0.05]"
        >
          {MATRIX}
        </pre>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% 40%, transparent 30%, #0a0a0b 95%)" }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/50">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">Smart Pages</span>
          <span className="text-sm text-white/30">by</span>
          <span className="text-sm font-semibold text-blue-400">Razorpay</span>
        </div>

        {/* Centered auth column */}
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-4">
          {/* 3D-ish glyph */}
          <div className="mb-8 flex justify-center">
            <div className="flex h-20 w-20 rotate-6 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-700 shadow-2xl shadow-blue-900/40 ring-1 ring-white/20">
              <svg className="h-9 w-9 -rotate-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          <h1 className="mb-10 text-center text-4xl font-bold leading-tight tracking-tight">
            Payment pages that
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">
              actually convert
            </span>
          </h1>

          {/* Google — the working provider */}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: dest });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-base font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" />
              </svg>
              Continue with Google
            </button>
          </form>

          {/* Secondary providers — visual parity, not yet enabled */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <ComingSoon label="GitHub (coming soon)">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.01 10.01 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" /></svg>
            </ComingSoon>
            <ComingSoon label="Apple (coming soon)">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 12.78c-.02-2.13 1.74-3.15 1.82-3.2-.99-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.57.77-3.24.77-.67 0-1.7-.75-2.8-.73-1.44.02-2.77.84-3.51 2.12-1.5 2.6-.38 6.44 1.07 8.55.71 1.03 1.55 2.19 2.66 2.15 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.88-1.05 2.58-2.09.82-1.2 1.16-2.36 1.18-2.42-.03-.01-2.26-.87-2.28-3.43zM14.3 6.25c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z" /></svg>
            </ComingSoon>
            <ComingSoon label="Facebook (coming soon)">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" /></svg>
            </ComingSoon>
          </div>

          {/* OR */}
          <div className="my-7 flex items-center gap-3 text-xs font-medium text-white/30">
            <span className="h-px flex-1 border-t border-dashed border-white/15" />
            OR
            <span className="h-px flex-1 border-t border-dashed border-white/15" />
          </div>

          {/* Email / Phone — placeholders for future providers */}
          <ComingSoonBar icon="mail" label="Continue with Email" />
          <div className="h-3" />
          <ComingSoonBar icon="phone" label="Continue with Phone" />

          <p className="mt-8 text-center text-xs leading-relaxed text-white/30">
            By continuing, you agree to our{" "}
            <span className="text-white/50 underline underline-offset-2">Terms of Service</span> and{" "}
            <span className="text-white/50 underline underline-offset-2">Privacy Policy</span>.
          </p>
        </div>
      </div>

      {/* ─── Right: showcase (desktop only) — rounded card inset on the dark bg ─── */}
      <div className="relative hidden bg-[#0a0a0b] p-4 lg:block">
        <div className="relative h-full w-full overflow-hidden rounded-3xl">
          {/* Animated colorful liquid backdrop */}
          <div className="liquid-stage" aria-hidden>
            <div className="lq-base" />
            <span className="lq lq-1" />
            <span className="lq lq-2" />
            <span className="lq lq-3" />
            <span className="lq lq-4" />
            <span className="lq lq-5" />
          </div>

          {/* Badge — pinned to the corner so it never overlaps the heading */}
          <div className="absolute right-8 top-8 z-20 rounded-xl bg-slate-900/90 px-3.5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur">
            <span className="mr-1.5">⚡</span> Powered by Claude AI
          </div>

          {/* Content — centered cluster, no trailing dead space */}
          <div className="relative z-10 flex h-full flex-col justify-center px-10 py-7">
            {/* Heading */}
            <div className="text-center">
              <h2 className="text-[40px] font-bold leading-tight tracking-tight text-slate-900">
                5 templates, infinite pages
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-lg font-medium leading-relaxed text-slate-600">
                Built for anything you sell — products, storefronts, events, subscriptions, and more.
              </p>
            </div>

            {/* 2×2 grid */}
            <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-2 gap-5">
              <ShowcaseCard emoji="📦" title="Product pages" desc="Sell a single product with fast, mobile-first Razorpay checkout." />
              <ShowcaseCard emoji="🛍️" title="Collection storefronts" desc="Many products, one page — with a built-in cart and checkout." />
              <ShowcaseCard emoji="🎟️" title="Events & tickets" desc="Registration pages with agenda, speakers, and ticket tiers." />
              <ShowcaseCard emoji="✨" title="And many more" desc="Services, courses, subscriptions, donations — your page, your way." />
            </div>

            {/* Carousel controls */}
            <div className="mt-9 flex items-center justify-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200">←</span>
              <span className="h-2 w-2 rounded-full bg-slate-400/60" />
              <span className="h-2 w-2 rounded-full bg-slate-400/60" />
              <span className="h-2 w-8 rounded-full bg-blue-600" />
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowcaseCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-slate-950/90 p-6 ring-1 ring-white/10 shadow-xl shadow-blue-950/40">
      <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-white/15 to-white/5 text-2xl ring-1 ring-white/15">
        {emoji}
      </div>
      <h3 className="text-xl font-bold text-white">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-white/55">{desc}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ComingSoon({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="flex h-12 flex-1 cursor-not-allowed items-center justify-center rounded-2xl bg-white/[0.06] text-white/40 ring-1 ring-white/10"
    >
      {children}
    </span>
  );
}

function ComingSoonBar({ icon, label }: { icon: "mail" | "phone"; label: string }) {
  const path =
    icon === "mail"
      ? "M3 8l9 6 9-6M3 8v8a2 2 0 002 2h14a2 2 0 002-2V8M3 8l2-2h14l2 2"
      : "M7 4h10v16H7zM11 18h2";
  return (
    <div
      title="Coming soon"
      className="flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-2xl bg-white/[0.04] px-5 py-3.5 text-sm font-semibold text-white/40 ring-1 ring-white/10"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
      {label}
    </div>
  );
}
