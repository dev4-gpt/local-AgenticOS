import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veloce AgenticOS | Private Operator Edition",
  description:
    "A managed operating system for agencies and expert teams — six operating layers from Command to Deliver, private by default and human-governed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-nav-theme="light"
      data-sidebar-theme="light"
      data-title-theme="light"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
