import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Veloce AgenticOS — Mission Control",
  description: "Your command center for Claude, OpenClaw, Hermes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/*
          Midnight Aubergine design system — three voices:
          Bricolage Grotesque (display) · Manrope (body) · Caveat (hand-script
          numerals/emphasis) · JetBrains Mono (code).
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Caveat:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full">
        <Shell clientEdition={process.env.VELOCE_CLIENT_EDITION === "1"}>{children}</Shell>
      </body>
    </html>
  );
}
