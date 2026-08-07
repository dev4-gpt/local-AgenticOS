"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import Sidebar, { MobileNav } from "./Sidebar";
import TopBar from "./TopBar";
import ClientCapabilityGate from "./ClientCapabilityGate";
import ClientAgentConsole from "./ClientAgentConsole";
import ClientDataWorkspace from "./ClientDataWorkspace";
import ClientExecutionWorkspace from "./ClientExecutionWorkspace";
import { CLIENT_AGENT_BY_ROUTE } from "@/lib/clientAgentCatalog";
import type { ClientWorkspaceSurface } from "@/lib/clientWorkspaceExecution";

const ROUTE_LENS: Array<[string[], string]> = [
  [["/context", "/memory", "/notebook", "/goals", "/journal"], "context"],
  [["/orchestrate", "/paperclip", "/room", "/pipeline", "/agent-kanban", "/kanban", "/loop", "/ruflo"], "orchestrate"],
  [["/create", "/flow-lab", "/web-studio", "/opendesign", "/video", "/openmontage", "/music", "/games", "/thumbnails", "/studio"], "create"],
  [["/integrations", "/capabilities", "/credentials", "/seo", "/seo-guide", "/guide"], "govern"],
  [["/deliver", "/leads", "/radar"], "deliver"],
];

function lensFor(pathname: string) {
  return ROUTE_LENS.find(([routes]) => routes.some((route) => pathname.startsWith(route)))?.[1] ?? "command";
}

const CLIENT_SURFACE_ROUTES = new Set(["/", "/context", "/orchestrate", "/create", "/capabilities", "/credentials", "/deliver"]);
const CLIENT_EXECUTION_ROUTES: Record<string, ClientWorkspaceSurface> = {
  "/orchestrate": "orchestrate", "/paperclip": "paperclip", "/room": "room", "/pipeline": "pipeline",
  "/agent-kanban": "agent-kanban", "/kanban": "kanban", "/loop": "loop", "/ruflo": "ruflo",
  "/create": "create", "/opendesign": "opendesign", "/web-studio": "web-studio", "/flow-lab": "flow-lab",
  "/video": "video", "/studio": "studio", "/openmontage": "openmontage", "/music": "music", "/games": "games",
  "/thumbnails": "thumbnails", "/integrations": "integrations", "/seo": "seo", "/seo-guide": "seo-guide",
  "/guide": "guide", "/deliver": "deliver", "/leads": "leads", "/radar": "radar",
};
const CLIENT_DATA_ROUTES: Record<string, "memory" | "journal" | "goals" | "notebook"> = {
  "/memory": "memory",
  "/journal": "journal",
  "/goals": "goals",
  "/notebook": "notebook",
};
// The cloud edition exposes the same agent destinations through an approved
// provider adapter; this map intentionally contains no localhost transport.
const CLIENT_HOSTED_PROVIDER_ROUTES: Record<string, { provider: "openrouter" }> = {
  "/local": { provider: "openrouter" },
  "/engine": { provider: "openrouter" },
};

export default function Shell({ children, clientEdition = false }: { children: ReactNode; clientEdition?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/client-unavailable") return <>{children}</>;
  const isHome = pathname === "/";
  const reduceMotion = useReducedMotion();
  const lens = lensFor(pathname);
  const gatedClientRoute = clientEdition && !CLIENT_SURFACE_ROUTES.has(pathname);
  const agentWorkspace = clientEdition ? CLIENT_AGENT_BY_ROUTE[pathname] : null;
  const hostedProviderRoute = clientEdition ? CLIENT_HOSTED_PROVIDER_ROUTES[pathname] : null;
  const executionWorkspace = clientEdition ? CLIENT_EXECUTION_ROUTES[pathname] : null;
  const dataWorkspace = clientEdition ? CLIENT_DATA_ROUTES[pathname] : null;

  return (
    <div className={`workspace-shell workspace-shell--${lens}`} data-lens={lens}>
      <div className="workspace-shell__field" aria-hidden="true">
        <span className="workspace-shell__horizon" />
        <span className="workspace-shell__signal workspace-shell__signal--a" />
        <span className="workspace-shell__signal workspace-shell__signal--b" />
      </div>
      <div className="relative z-10 h-screen flex overflow-hidden">
        <Sidebar />
        <main className="workspace-shell__main flex-auto w-full min-w-0 overflow-y-auto pb-20 md:pb-0" data-scroll-root>
          <motion.div
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={isHome ? "min-h-full w-full" : "workspace-shell__page max-w-[1500px] mx-auto px-5 md:px-10 py-7 md:py-9"}
          >
            {!isHome && <TopBar />}
            {agentWorkspace ? <ClientAgentConsole agent={agentWorkspace} /> : hostedProviderRoute ? <ClientCapabilityGate pathname={pathname} /> : executionWorkspace ? <ClientExecutionWorkspace surface={executionWorkspace} /> : dataWorkspace ? <ClientDataWorkspace surface={dataWorkspace} /> : gatedClientRoute ? <ClientCapabilityGate pathname={pathname} /> : children}
          </motion.div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
