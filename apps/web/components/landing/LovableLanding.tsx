"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PageSchema } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";
import { LiquidBackground } from "./LiquidBackground";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LandingUser {
  name: string;
  email: string;
  image?: string;
}

// ─── Static data ────────────────────────────────────────────────────────────

const TEMPLATES: {
  name: string;
  desc: string;
  from: string;
  to: string;
  emoji: string;
}[] = [
  { name: "Minimal", desc: "Clean, distraction-free checkout that puts the product first", from: "#60a5fa", to: "#2563eb", emoji: "◽️" },
  { name: "Modern", desc: "Bold gradients and big type for D2C brands that want to pop", from: "#38bdf8", to: "#3b82f6", emoji: "✦" },
  { name: "Premium", desc: "Editorial, high-end layout for luxury and considered purchases", from: "#3b82f6", to: "#1e3a8a", emoji: "♦︎" },
  { name: "Event", desc: "Registration-style page with agenda, speakers, and ticket tiers", from: "#22d3ee", to: "#2563eb", emoji: "🎟" },
  { name: "Collection", desc: "Multi-product storefront with a built-in cart and Razorpay checkout", from: "#818cf8", to: "#3b82f6", emoji: "🛍" },
];

// ─── Icons ──────────────────────────────────────────────────────────────────

function Icon({ path, className = "w-[18px] h-[18px]" }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICONS = {
  grid: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z",
  star: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3z",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
  signout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  plus: "M12 5v14M5 12h14",
  mic: "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 10v2a7 7 0 01-14 0v-2M12 19v3",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  chevDown: "M6 9l6 6 6-6",
  sidebar: "M4 5h16v14H4V5zm5 0v14",
  receipt: "M9 14h6m-6-4h6m-7 8l-2 2V6a2 2 0 012-2h8a2 2 0 012 2v14l-2-2-2 2-2-2-2 2-2-2z",
  card: "M3 10h18M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
};

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = "projects" | "templates";

export function LovableLanding({ user }: { user: LandingUser }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<Tab>("projects");
  const [pages, setPages] = useState<PageSchema[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  const initial = (firstName[0] || user.email[0] || "U").toUpperCase();

  useEffect(() => {
    let active = true;
    fetch("/api/pages")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (active) setPages((j.data as PageSchema[]) ?? []); })
      .catch(() => { if (active) setPages([]); });
    return () => { active = false; };
  }, []);

  function submitPrompt() {
    const text = prompt.trim();
    router.push(text ? `/chat?prompt=${encodeURIComponent(text)}` : "/chat");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  }

  // Auto-grow the textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const recents = (pages ?? []).slice(0, 5);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
      <Sidebar
        recents={recents}
        firstName={firstName}
        initial={initial}
        image={user.image}
        email={user.email}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {/* Main panel — curved card head (rounded top, small gutter above) */}
      <main className="relative flex-1 overflow-y-auto bg-white md:mt-3 md:rounded-t-3xl md:shadow-sm md:ring-1 md:ring-slate-200/70">
        {/* Expand button — shown when the sidebar is collapsed */}
        <AnimatePresence>
          {collapsed && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={() => setCollapsed(false)}
              className="absolute left-3 top-3 z-30 hidden rounded-lg bg-white/80 p-1.5 text-slate-500 ring-1 ring-slate-200 backdrop-blur transition-colors hover:bg-white hover:text-slate-800 md:block"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <Icon path={ICONS.sidebar} className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Interactive liquid water backdrop — flows toward the cursor on hover */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden md:rounded-t-3xl">
          <div className="aurora-base absolute inset-0" />
          <LiquidBackground />
        </div>

        {/* Hero */}
        <section className="relative flex min-h-[78vh] flex-col items-center justify-center px-6 pt-20 pb-10">
          <Link
            href="/dashboard"
            className="group mb-9 inline-flex items-center gap-2.5 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-blue-200/70 shadow-sm backdrop-blur-md transition hover:bg-white"
          >
            <span className="flex -space-x-1.5">
              <Dot color="#3395ff" />
              <Dot color="#60a5fa" />
              <Dot color="#1d4ed8" />
            </span>
            Check all your Websites
            <Icon path={ICONS.arrowRight} className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>

          <h1 className="mb-9 text-center text-4xl font-semibold tracking-tight text-slate-900 md:text-[44px]">
            Ready to build, {firstName}?
          </h1>

          {/* Prompt composer */}
          <div className="w-full max-w-3xl">
            <div className="rounded-[26px] bg-white p-2 shadow-xl shadow-blue-900/5 ring-1 ring-slate-200">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Ask Smart Pages to create a payment page for…"
                className="block w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <button
                  type="button"
                  onClick={submitPrompt}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Add context"
                >
                  <Icon path={ICONS.plus} className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    Build
                    <Icon path={ICONS.chevDown} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/chat")}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Voice input"
                  >
                    <Icon path={ICONS.mic} className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={submitPrompt}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition hover:scale-105 hover:bg-blue-700"
                    aria-label="Send"
                  >
                    <Icon path={ICONS.arrowUp} className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Projects / templates panel */}
        <section className="relative mx-auto mb-20 max-w-6xl rounded-3xl bg-white/80 px-6 py-7 ring-1 ring-slate-200 backdrop-blur-md md:px-8">
          <div className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <TabButton active={tab === "projects"} onClick={() => setTab("projects")}>My pages</TabButton>
              <TabButton active={tab === "templates"} onClick={() => setTab("templates")}>Templates</TabButton>
            </div>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              Browse all
              <Icon path={ICONS.arrowRight} className="h-4 w-4" />
            </Link>
          </div>

          {tab === "templates" ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.map((t) => (
                <TemplateCard key={t.name} {...t} />
              ))}
            </div>
          ) : pages === null ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : pages.length === 0 ? (
            <EmptyProjects />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((p) => <ProjectCard key={p.id} page={p} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  recents, firstName, initial, image, email, collapsed, onToggle,
}: {
  recents: PageSchema[]; firstName: string; initial: string; image?: string; email: string;
  collapsed: boolean; onToggle: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : 256 }}
      transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
      className="hidden shrink-0 overflow-hidden md:flex"
    >
      {/* Fixed-width inner keeps content from reflowing while the rail animates */}
      <div className="flex h-full w-64 flex-col px-3 py-4">
      {/* Logo row */}
      <div className="mb-5 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-300/50">
            <Icon path={ICONS.bolt} className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">Smart Pages</span>
        </div>
        <button
          onClick={onToggle}
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <Icon path={ICONS.sidebar} className="h-5 w-5" />
        </button>
      </div>

      <Section label="Projects" />
      <nav className="space-y-0.5">
        <NavItem icon={ICONS.grid} label="All projects" href="/dashboard" />
        <NavItem icon={ICONS.star} label="Starred" href="/dashboard" />
        <NavItem icon={ICONS.receipt} label="Order records" href="/orders" />
        <NavItem icon={ICONS.card} label="Payment settings" href="/settings" />
      </nav>

      {recents.length > 0 && (
        <>
          <Section label="Recents" />
          <nav className="space-y-0.5">
            {recents.map((p) => (
              <Link
                key={p.id}
                href={`/chat/${encodeURIComponent(p.slug)}`}
                className="block truncate rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-blue-50 hover:text-slate-900"
              >
                {p.brand?.name || p.payment?.name || "Untitled page"}
              </Link>
            ))}
          </nav>
        </>
      )}

      <div className="flex-1" />

      {/* Bottom row: signed-in user + sign out */}
      <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
        <Avatar image={image} initial={initial} className="h-8 w-8 rounded-full text-sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700" title={email}>{email}</span>
        <button
          onClick={() => void signOut({ callbackUrl: "/signin" })}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-slate-700"
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon path={ICONS.signout} className="h-5 w-5" />
        </button>
      </div>
      </div>
    </motion.aside>
  );
}

function Avatar({ image, initial, className }: { image?: string; initial: string; className: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={`${className} object-cover`} />;
  }
  return (
    <span className={`${className} flex items-center justify-center bg-blue-600 font-bold text-white`}>
      {initial}
    </span>
  );
}

// ─── Sidebar primitives ────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, href, trailing,
}: { icon: string; label: string; active?: boolean; href?: string; trailing?: React.ReactNode }) {
  const cls = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active ? "bg-blue-600 text-white shadow-sm shadow-blue-300/50" : "text-slate-600 hover:bg-blue-50 hover:text-slate-900"
  }`;
  const inner = (
    <>
      <Icon path={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1">{label}</span>
      {trailing}
    </>
  );
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button className={cls}>{inner}</button>;
}

function Section({ label }: { label: string }) {
  return <p className="px-3 pb-1 pt-5 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>;
}

// ─── Hero primitives ────────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return <span className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: color }} />;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────────

function TemplateCard({ name, desc, from, to, emoji }: { name: string; desc: string; from: string; to: string; emoji: string }) {
  return (
    <Link href="/chat" className="group block">
      <div
        className="relative mb-3 flex h-44 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-slate-200 transition group-hover:ring-blue-300"
        style={{ background: `radial-gradient(120% 120% at 30% 20%, ${from} 0%, ${to} 70%, #1e3a8a 130%)` }}
      >
        <span className="text-2xl font-semibold text-white drop-shadow">{emoji} {name}</span>
      </div>
      <h3 className="font-semibold text-slate-900">{name}</h3>
      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{desc}</p>
    </Link>
  );
}

function ProjectCard({ page }: { page: PageSchema }) {
  const pageUrl = `/p/${page.slug}`;
  const isDraft = page.status === "draft";
  return (
    <Link href={`/chat/${encodeURIComponent(page.slug)}`} className="group block">
      {/* Scaled-down live preview of the actual page */}
      <div className="relative mb-3 h-44 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 transition group-hover:ring-blue-300">
        <iframe
          src={pageUrl}
          className="absolute top-0 left-0 border-0 pointer-events-none select-none"
          style={{
            width: 1280,
            height: 960,
            transform: "scale(0.28)",
            transformOrigin: "top left",
          }}
          loading="lazy"
          tabIndex={-1}
          title={page.brand?.name}
        />
        <div className="absolute inset-0 group-hover:bg-black/5 transition-colors" />
        <span
          className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur ${
            isDraft
              ? "bg-white/90 text-amber-600 ring-1 ring-amber-200"
              : "bg-white/90 text-emerald-600 ring-1 ring-emerald-200"
          }`}
        >
          {isDraft ? "Draft" : "Live"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-semibold text-slate-900">{page.brand?.name || page.payment?.name}</h3>
        <span className="shrink-0 text-sm font-medium text-slate-600">
          {formatCurrency(page.payment.amount, page.payment.currency)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{page.payment?.description}</p>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 h-44 rounded-2xl bg-slate-100" />
      <div className="mb-2 h-4 w-2/3 rounded bg-slate-100" />
      <div className="h-3 w-full rounded bg-slate-100" />
    </div>
  );
}

function EmptyProjects() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
        <Icon path={ICONS.bolt} className="h-7 w-7 text-blue-500" />
      </div>
      <h3 className="mb-1.5 text-lg font-semibold text-slate-900">No pages yet</h3>
      <p className="mb-6 max-w-xs text-sm text-slate-500">
        Describe what you sell above and we&apos;ll build your first Razorpay payment page in under 2 minutes.
      </p>
      <Link
        href="/chat"
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:scale-105 hover:bg-blue-700"
      >
        Create your first page
      </Link>
    </div>
  );
}
