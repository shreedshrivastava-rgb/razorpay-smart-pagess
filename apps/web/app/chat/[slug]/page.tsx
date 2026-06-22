import { Suspense } from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit your payment page — Razorpay Smart Pages",
  description: "Keep refining your page with AI.",
};

// Per-project chat URL: /chat/<slug>. ChatInterface reads the slug from the
// route via useParams() and loads that page's saved conversation + preview.
export default function ChatProjectPage() {
  return (
    <div className="h-screen overflow-hidden">
      <Suspense fallback={null}>
        <ChatInterface />
      </Suspense>
    </div>
  );
}
