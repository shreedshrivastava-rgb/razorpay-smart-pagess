import { ChatInterface } from "@/components/chat/ChatInterface";

export const metadata = {
  title: "Create your payment page — Razorpay Smart Pages",
  description: "Just tell us what you sell. We'll build the rest.",
};

export default function ChatPage() {
  return (
    <div className="h-screen overflow-hidden">
      <ChatInterface />
    </div>
  );
}
