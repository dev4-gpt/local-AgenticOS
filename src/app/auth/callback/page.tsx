"use client";

import { useEffect, useState } from "react";

// Supabase returns implicit-flow credentials in the URL fragment. Fragments do
// not reach a server or a referrer header; exchange them only with this tenant
// runtime, then immediately remove them from browser history.
export default function ClientAuthCallback() {
  const [message, setMessage] = useState("Completing your secure sign-in…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";
    window.history.replaceState(null, "", "/auth/callback");
    if (!accessToken || !refreshToken) { setMessage("This sign-in link is invalid or expired."); return; }
    fetch("/api/client-auth/magic-link", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("session_rejected");
      window.location.replace("/");
    }).catch(() => setMessage("This sign-in link could not be accepted for this tenant runtime."));
  }, []);
  return <main className="min-h-screen grid place-items-center bg-[var(--bg-deep)] px-5 text-[var(--fg-dim)]"><p>{message}</p></main>;
}
