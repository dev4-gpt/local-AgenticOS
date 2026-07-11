"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { MobileNav } from "./Sidebar";
import TopBar from "./TopBar";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <>
      <div className="h-screen flex overflow-hidden">
        <Sidebar />
        <main className="flex-auto w-full min-w-0 overflow-y-auto">
          <div className={isHome ? "min-h-full w-full" : "max-w-[1500px] mx-auto px-6 md:px-10 py-8"}>
            {!isHome && <TopBar />}
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </>
  );
}
