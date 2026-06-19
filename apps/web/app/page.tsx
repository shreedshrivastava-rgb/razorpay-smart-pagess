import { LovableLanding } from "@/components/landing/LovableLanding";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Smart Pages by Razorpay — Build payment pages that convert",
  description:
    "Tell us what you sell — by typing or speaking — and we'll build a beautiful Razorpay checkout page in under 2 minutes.",
};

export default async function LandingPage() {
  const session = await auth();
  const user = {
    name: session?.user?.name ?? "there",
    email: session?.user?.email ?? "",
    image: session?.user?.image ?? "",
  };
  return <LovableLanding user={user} />;
}
