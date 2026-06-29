# Blade / brand-guideline alignment audit

Scope decision (locked with the team): **align brand tokens, do not swap in the
`@razorpay/blade` component library.** This keeps the existing component tree and
behaviour intact while giving the app a single, canonical source of truth for
Razorpay brand values so future UI work converges on the brand instead of
drifting further.

## What was added

| Token | Value | Purpose |
|-------|-------|---------|
| `--rzp-blue` / `bg-razorpay` | `#3395ff` | Primary brand blue (Razorpay) |
| `--rzp-blue-600/700` | `#1a73e8` / `#1559b8` | Hover / pressed states |
| `--rzp-blue-50/100/300` | tints | Surfaces, chips, focus rings |
| `--rzp-navy` / `text-razorpay-navy` | `#11103b` | Ink / headings |
| `--rzp-cloud` | `#f7f9fc` | Page surface |
| `--rzp-line` | `#e3e8ef` | Hairline borders |
| `--rzp-radius` | `0.75rem` | Blade default corner radius |
| `.rzp-btn` | — | Opt-in primary CTA utility (brand blue + Blade radius) |

- CSS variables live in [app/globals.css](app/globals.css) under `:root`.
- Tailwind exposes them as a `razorpay` colour scale in
  [tailwind.config.ts](tailwind.config.ts) (`bg-razorpay`, `text-razorpay-navy`,
  `border-razorpay-line`, …).

## Deviations found (current state)

1. **Primary colour is indigo/violet, not Razorpay blue.** The dashboard, chat
   shell, and several CTAs use Tailwind `indigo-600` (`#4f46e5`) /
   `violet-600`. The brand blue is `#3395ff`. ~16 files reference `indigo-600`.
2. **Mixed corner radii** — `rounded-xl`, `rounded-2xl`, `rounded-3xl`,
   `rounded-lg` are used interchangeably. Blade standardises on a base radius.
3. **Header ink** uses `text-gray-900` rather than the brand navy `#11103b`.
4. **Buttons** are styled ad hoc per component instead of a shared primitive.

## What changed now vs. what is intentionally deferred

- **Now:** canonical tokens + Tailwind scale + `.rzp-btn` primitive + this audit.
  These are additive and change no existing rendering — they unblock alignment.
- **Deferred (no component rewrite, per the locked decision):** migrating the
  ~16 `indigo-600` usages to `bg-razorpay`, normalising radii to `--rzp-radius`,
  and adopting `.rzp-btn` for CTAs. These are mechanical follow-ups that can be
  done incrementally without behavioural risk now that the tokens exist.

## How to align a component

```tsx
// before
<button className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-5 py-2.5 text-white font-semibold">

// after — token-aligned
<button className="rzp-btn">          {/* or: bg-razorpay hover:bg-razorpay-600 rounded-[var(--rzp-radius)] */}
```

Note: AI-generated buyer pages keep their own per-page brand palette
(`--brand-primary` etc.) — those are merchant brand colours and are deliberately
independent of the Razorpay app chrome tokens above.
