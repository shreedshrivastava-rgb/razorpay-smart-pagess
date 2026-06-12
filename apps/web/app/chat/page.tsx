import { ChatInterface } from "@/components/chat/ChatInterface";

export const metadata = {
  title: "Create your payment page — Razorpay Smart Pages",
  description: "Just tell us what you sell. We'll build the rest.",
};

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg h-[min(700px,90vh)] flex flex-col">
        {/* Top brand bar */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">Smart</span>
            <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Pages</span>
          </div>
          <a
            href="/create"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Have a website? Import instead →
          </a>
        </div>

        {/* Chat UI */}
        <div className="flex-1 min-h-0">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
