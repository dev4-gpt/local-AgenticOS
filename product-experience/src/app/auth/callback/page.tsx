"use client";

import { useEffect, useState } from "react";

// The public control plane is the allow-listed Supabase redirect. It never
// stores the session: it resolves the verified user's one active runtime and
// transfers credentials in a URL fragment, which is not sent to servers.
export default function OnboardingAuthCallback() {
  const [message, setMessage] = useState("Opening your isolated tenant runtime…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";
    window.history.replaceState(null, "", "/auth/callback");
    if (!accessToken || !refreshToken) { setMessage("This sign-in link is invalid or expired."); return; }
    fetch("/api/onboarding/runtime-destination", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || typeof body?.runtimeUrl !== "string") throw new Error("destination_unavailable");
        const target = new URL("/auth/callback", body.runtimeUrl);
        target.hash = new URLSearchParams({ access_token: accessToken, refresh_token: refreshToken }).toString();
        window.location.replace(target.toString());
      }).catch(() => setMessage("Your tenant runtime is not available for this sign-in link."));
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]"><p>{message}</p></main>;
}
