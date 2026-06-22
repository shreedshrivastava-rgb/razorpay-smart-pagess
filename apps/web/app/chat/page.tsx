import { Suspense } from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create your payment page — Razorpay Smart Pages",
  description: "Just tell us what you sell. We'll build the rest.",
};

export default function ChatPage() {
  return (
    <div className="h-screen overflow-hidden">
      <Suspense fallback={null}>
        <ChatInterface />
      </Suspense>
    </div>
  );
}
