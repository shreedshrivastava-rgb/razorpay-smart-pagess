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

