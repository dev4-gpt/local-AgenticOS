"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The public control plane is the allow-listed Supabase redirect. It never
// stores the session: it resolves the verified user's one active runtime and
// transfers credentials in a URL fragment, which is not sent to servers.
export default function OnboardingAuthCallback() {
  const [message, setMessage] = useState("Opening your isolated tenant runtime…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";
    window.history.replaceState(null, "", "/auth/callback");
    // The fragment is available only after mount; this is the invalid-link UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!accessToken || !refreshToken) { setMessage("This sign-in link is invalid or expired."); setFailed(true); return; }
    fetch("/api/onboarding/runtime-destination", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || typeof body?.runtimeUrl !== "string") throw new Error("destination_unavailable");
        const runtime = new URL(body.runtimeUrl);
        if (runtime.protocol !== "https:" || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(runtime.hostname)
          || runtime.username || runtime.password || runtime.port || runtime.pathname !== "/" || runtime.search || runtime.hash) throw new Error("destination_unavailable");
        const target = new URL("/auth/callback", runtime.origin);
        target.hash = new URLSearchParams({ access_token: accessToken, refresh_token: refreshToken }).toString();
        window.location.replace(target.toString());
      }).catch(() => { setMessage("Your tenant runtime is not available for this sign-in link."); setFailed(true); });
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]">
    <div className="max-w-md text-center">
      <p role={failed ? "alert" : "status"}>{message}</p>
      {failed && <nav aria-label="Sign-in recovery" className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold">
        <Link href="/login" className="underline underline-offset-2">Request a new sign-in link</Link>
        <Link href="/support" className="underline underline-offset-2">Contact support</Link>
      </nav>}
    </div>
  </main>;
}
