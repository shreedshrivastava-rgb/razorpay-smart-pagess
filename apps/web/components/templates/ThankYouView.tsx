"use client";

import { formatCurrency } from "@/lib/utils";
import type { Brand, ThankYouConfig } from "@/lib/schema/page-schema";

// Customizable post-payment thank-you screen, shared by the inline checkout card
// and the cart drawer. Falls back to sensible defaults when no config is set.

const SHARE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  twitter: "X",
  facebook: "Facebook",
};

function shareUrl(network: string, text: string, url: string): string {
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  switch (network) {
    case "whatsapp": return `https://wa.me/?text=${t}%20${u}`;
    case "linkedin": return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "twitter": return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    default: return url;
  }
}

export interface ThankYouViewProps {
  brand: Brand;
  config?: ThankYouConfig;
  isFree: boolean;
  customerName: string;
  productName: string;
  amount: number;        // paise
  currency: string;
  paymentId?: string;
  shareUrlOverride?: string; // defaults to the current page URL
}

export default function ThankYouView({
  brand, config, isFree, customerName, productName, amount, currency, paymentId, shareUrlOverride,
}: ThankYouViewProps) {
  const primary = brand.primaryColor;
  const firstName = customerName.trim().split(/\s+/)[0] || "there";

  const title = config?.title
    || (isFree ? "You’re registered!" : "Payment successful!");
  const message = config?.message
    || (isFree
      ? `Welcome, ${firstName}! Your spot is confirmed.`
      : `Thank you, ${firstName}. A confirmation is on its way to your email.`);

  const showSummary = config?.showOrderSummary !== false && !isFree;
  const networks = config?.socialShare ?? [];
  const pageUrl = shareUrlOverride
    ?? (typeof window !== "undefined" ? window.location.href : "");
  const shareText = `I just got ${productName || "this"} from ${brand.name}!`;

  return (
    <div className="flex flex-col items-center text-center gap-5 py-10" id="pay">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
        style={{ backgroundColor: `${primary}18`, color: primary }}
        role="img"
        aria-label="Order confirmed"
      >
        ✓
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">{message}</p>
      </div>

      {showSummary && (
        <div className="w-full max-w-sm rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-left">
          <div className="flex justify-between py-1">
            <span className="text-gray-500">{productName || "Order"}</span>
            <span className="font-semibold text-gray-900">{formatCurrency(amount, currency)}</span>
          </div>
          {paymentId && (
            <div className="flex justify-between py-1 border-t border-gray-100 mt-1 pt-2">
              <span className="text-gray-500">Payment ID</span>
              <span className="font-mono text-xs text-gray-600">{paymentId}</span>
            </div>
          )}
        </div>
      )}

      {config?.nextSteps?.text && (
        <div className="w-full max-w-sm rounded-xl p-4 text-sm" style={{ backgroundColor: `${primary}10` }}>
          <p className="text-gray-700">{config.nextSteps.text}</p>
          {config.nextSteps.url && (
            <a
              href={config.nextSteps.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 font-semibold"
              style={{ color: primary }}
            >
              Continue →
            </a>
          )}
        </div>
      )}

      {config?.reviewUrl && (
        <a
          href={config.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white text-sm"
          style={{ backgroundColor: primary }}
        >
          ★ Leave a review
        </a>
      )}

      {networks.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-gray-400">Share your purchase</span>
          <div className="flex gap-2 flex-wrap justify-center">
            {networks.map((n) => (
              <a
                key={n}
                href={shareUrl(n, shareText, pageUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors hover:bg-gray-50"
                style={{ borderColor: `${primary}40`, color: primary }}
              >
                {SHARE_LABELS[n] ?? n}
              </a>
            ))}
          </div>
        </div>
      )}

      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full"
        style={{ backgroundColor: `${primary}12`, color: primary }}
      >
        {isFree ? "Spot confirmed" : "Payment verified by Razorpay"}
      </span>
    </div>
  );
}
