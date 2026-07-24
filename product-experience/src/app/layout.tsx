import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Target site uses Inter-Variable (UI/body), NeueMontreal (bold headlines),
// and HWCigars (display serif accent). NeueMontreal/HWCigars are commercial
// fonts we can't redistribute — Bricolage Grotesque and Instrument Serif are
// the closest free substitutes for the same roles.
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontHeading = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const fontDisplay = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

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
      className={`${fontSans.variable} ${fontHeading.variable} ${fontDisplay.variable} h-full antialiased`}
      data-nav-theme="light"
      data-sidebar-theme="light"
      data-title-theme="light"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
