import { NextResponse } from "next/server";
import { savePage, getPage } from "@/lib/store/pages";
import type { PageSchema } from "@/lib/schema/page-schema";

const DEMO_PAGE: PageSchema = {
  id: "pg_demo_01",
  slug: "demo-workshop",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  brand: {
    name: "DevCraft Academy",
    primaryColor: "#6366f1",
    secondaryColor: "#0f172a",
    accentColor: "#f59e0b",
    tagline: "Learn by building real things",
  },
  template: "modern",
  pageType: "workshop",
  sections: [
    {
      id: "s1", type: "hero", visible: true, background: "gradient", variant: "centered",
      headline: "Master Next.js 15 in One Weekend",
      subheadline: "A hands-on workshop for developers who want to ship faster. Build a production app from zero to deployed in 2 days — with a senior engineer guiding every line.",
      ctaText: "Secure Your Spot — ₹4,999",
      badge: "🔥 Only 8 seats left",
      urgency: "Next batch: June 21–22. Last batch sold out in 48 hours.",
    },
    {
      id: "s2", type: "trust", visible: true, background: "white",
      items: [
        { icon: "✅", label: "Live sessions" },
        { icon: "🎓", label: "Certificate included" },
        { icon: "💻", label: "Hands-on projects" },
        { icon: "♾️", label: "Lifetime recordings" },
      ],
    },
    {
      id: "s3", type: "stats", visible: true, background: "brand",
      items: [
        { value: "500+", label: "Developers trained" },
        { value: "4.9★", label: "Average rating" },
        { value: "92%", label: "Job placement rate" },
        { value: "48h", label: "Zero to deployed" },
      ],
    },
    {
      id: "s4", type: "features", visible: true, background: "light",
      headline: "What You'll Walk Away With",
      subheadline: "Not just theory — real skills you can use on Monday morning.",
      layout: "grid-3",
      items: [
        { icon: "⚡", title: "App Router mastery", description: "Server components, streaming, parallel routes — the modern Next.js way" },
        { icon: "🗄️", title: "Full-stack in one repo", description: "Auth, database, API routes, and server actions all in one project" },
        { icon: "🚀", title: "Deploy to production", description: "CI/CD, Vercel, monitoring — your app live in the world" },
        { icon: "🎨", title: "UI without the pain", description: "shadcn/ui, Tailwind, and component patterns that scale" },
        { icon: "🔒", title: "Auth that just works", description: "NextAuth, sessions, middleware, role-based access in under an hour" },
        { icon: "📊", title: "Performance mastery", description: "Caching strategies, ISR, Core Web Vitals — fast pages by default" },
      ],
    },
    {
      id: "s5", type: "agenda", visible: true, background: "white",
      headline: "Workshop Agenda",
      date: "June 21–22, 2026 · 10 AM – 6 PM IST",
      items: [
        { time: "Day 1 · 10:00 AM", title: "Next.js 15 App Router Deep Dive", description: "Server components, streaming, suspense boundaries", speaker: "Arjun Mehta" },
        { time: "Day 1 · 1:00 PM", title: "Build a Full-Stack App from Scratch", description: "Auth, Postgres, API routes, server actions in one afternoon" },
        { time: "Day 1 · 4:30 PM", title: "UI Systems & Component Architecture", description: "shadcn/ui, Tailwind patterns, design system in 90 min" },
        { time: "Day 2 · 10:00 AM", title: "Performance & Caching Deep Dive", description: "ISR, Edge runtime, streaming — and how to measure what matters" },
        { time: "Day 2 · 2:00 PM", title: "Deploy & Monitor Like a Senior Engineer", description: "Vercel, CI/CD, Sentry, and Grafana in one afternoon" },
        { time: "Day 2 · 5:00 PM", title: "Live Demo + Q&A", description: "Everyone ships their app to production." },
      ],
    },
    {
      id: "s6", type: "testimonials", visible: true, background: "light",
      headline: "What Past Students Say",
      layout: "grid",
      items: [
        { name: "Priya Sharma", title: "Senior Engineer", company: "Razorpay", rating: 5, text: "Best technical workshop I've attended. Built something real on day 2 and shipped it to production before I left." },
        { name: "Rohan Kapoor", title: "Founder", company: "YC W25", rating: 5, text: "Went from Next.js beginner to shipping my startup MVP in a weekend. The App Router section alone was worth 10x the price." },
        { name: "Meera Nair", title: "Full-stack Developer", company: "Swiggy", rating: 5, text: "Arjun explains things in a way that just clicks. The auth section finally made sense after years of cargo-culting setups." },
      ],
    },
    {
      id: "s7", type: "faq", visible: true, background: "white",
      headline: "Frequently Asked Questions",
      items: [
        { question: "Do I need prior React experience?", answer: "Yes — basic React (components, hooks, state) is recommended. If you're comfortable with JSX and useEffect, you're ready." },
        { question: "Will sessions be recorded?", answer: "Yes. All sessions are recorded in full HD and available in your student portal immediately after each day." },
        { question: "What if I can't attend a session live?", answer: "Watch the recording and submit questions async. The instructor responds to all student questions within 24 hours." },
        { question: "What tools do I need?", answer: "A laptop (Mac/Windows/Linux), Node.js 20+, and VS Code. We'll set up everything else on day 1." },
        { question: "Is there a refund policy?", answer: "Full refund if you cancel 7+ days before. No refunds within 7 days, but you can transfer your seat to the next batch." },
      ],
    },
    {
      id: "s8", type: "cta", visible: true, background: "gradient", variant: "banner",
      headline: "Only 8 seats in this batch",
      subheadline: "Small cohort = more 1:1 time with the instructor. This is not a recorded course — it's a live, intimate workshop.",
      ctaText: "Secure My Seat for ₹4,999",
      urgency: "Price increases to ₹6,999 after June 14",
      offer: "Early bird: Save ₹2,000 when you register today",
    },
  ],
  payment: {
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
    amount: 499900,
    currency: "INR",
    name: "Next.js 15 Weekend Workshop",
    description: "2-day intensive Next.js 15 workshop — June 21–22, 2026",
    theme: { color: "#6366f1" },
  },
  seo: {
    title: "Next.js 15 Workshop — Master Modern React in One Weekend | DevCraft Academy",
    description: "Hands-on 2-day workshop. Build and deploy a production Next.js app. Small cohort, live sessions. Only 8 seats.",
  },
  maxQuantity: 1,
  isPreOrder: false,
};

export async function GET() {
  const existing = await getPage("demo-workshop");
  if (existing) {
    return NextResponse.json({ success: true, message: "Demo already seeded", slug: "demo-workshop" });
  }
  await savePage(DEMO_PAGE);
  return NextResponse.json({ success: true, message: "Demo seeded", slug: "demo-workshop" });
}
