import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-6xl h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-lg">Smart Pages</span>
            <span className="hidden sm:inline text-gray-300 mx-1 text-sm">by</span>
            <span className="hidden sm:inline font-semibold text-blue-600 text-sm">Razorpay</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/chat"
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Create page →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-violet-900 to-indigo-900 text-white">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, #818cf8 0%, transparent 70%)",
          }}
        />
        <div className="relative container mx-auto px-4 max-w-5xl py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm font-medium text-indigo-200 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Now in beta · Powered by Claude AI
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight mb-6">
            Payment pages that
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-violet-300 to-pink-300">
              actually convert
            </span>
          </h1>

          <p className="text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            No website? No problem. Just tell us what you sell — by typing or speaking —
            and we'll build a beautiful Razorpay checkout page in under 2 minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-900 rounded-2xl font-bold text-lg hover:bg-indigo-50 transition-all hover:scale-105 shadow-2xl shadow-indigo-900/50"
            >
              🎙️ Just tell me what you sell
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 text-white rounded-2xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              I have a website →
            </Link>
          </div>

          <div className="flex items-center justify-center gap-8 mt-14 text-sm text-white/40">
            <span>No website needed</span>
            <span className="text-white/20">·</span>
            <span>Voice enabled</span>
            <span className="text-white/20">·</span>
            <span>Ready in 2 minutes</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-gray-500 text-lg">Describe your brand — we build the rest</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: "1", emoji: "🎙️", title: "Tell us what you sell", desc: "Type or speak — 'I make homemade jams, my brand is Nani's Kitchen'" },
              { step: "2", emoji: "🤖", title: "AI asks a few things", desc: "Price, color preferences. Takes 30 seconds max." },
              { step: "3", emoji: "✨", title: "Checkout page generated", desc: "Claude writes copy, picks colors, and builds your payment page" },
              { step: "4", emoji: "🚀", title: "Share & collect", desc: "Send the link. Customers pay via UPI, cards, wallets — instantly." },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-4">
                  <span className="text-2xl">{item.emoji}</span>
                </div>
                <div className="text-xs font-bold text-indigo-500 mb-1">STEP {item.step}</div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything a great payment page needs
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { emoji: "🤖", title: "AI copywriting", desc: "Headlines, benefits, FAQs, testimonials — all written by Claude AI using your brand voice" },
              { emoji: "🎨", title: "Auto brand import", desc: "Paste your URL. We extract logo, colors, images, and product descriptions automatically" },
              { emoji: "💳", title: "Razorpay embedded", desc: "Payment form included on every page. Supports UPI, cards, wallets, and EMI" },
              { emoji: "📐", title: "5 templates", desc: "Minimal, Modern, Premium, Event, and D2C templates. Switch instantly, no regeneration" },
              { emoji: "📱", title: "Mobile optimized", desc: "Every page is fully responsive. Looks perfect on phones, tablets, and desktops" },
              { emoji: "⚡", title: "Live in 2 min", desc: "Fastest setup in the industry. From idea to live payment page in under 2 minutes" },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                <span className="text-3xl mb-3 block">{f.emoji}</span>
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-indigo-700 transition-colors">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-indigo-600">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Ready to build your page?
          </h2>
          <p className="text-indigo-200 text-xl mb-10">
            Free to use. No account required for demo.
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-10 py-5 bg-white text-indigo-700 rounded-2xl font-bold text-xl hover:bg-indigo-50 transition-all hover:scale-105 shadow-2xl shadow-indigo-900/30"
          >
            🎙️ Create your Smart Page
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-white py-10">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold">Razorpay Smart Pages</span>
          </div>
          <p className="text-white/30 text-sm">© 2026 Razorpay. Built with ❤️ and Claude AI.</p>
        </div>
      </footer>
    </div>
  );
}
