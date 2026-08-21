import { Suspense } from "react";
import ClientLogin from "@/components/ClientLogin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen grid place-items-center bg-[var(--bg-deep)] text-[var(--fg-dim)]">Loading sign-in...</main>}><ClientLogin /></Suspense>;
}
