import HomeImmersive from "@/components/HomeImmersive";
import { clientAllowedRoutes } from "@/lib/clientRuntimePolicy";
import { connection } from "next/server";

export default async function Page() {
  const clientEdition = process.env.VELOCE_CLIENT_EDITION === "1";
  if (clientEdition) await connection();
  return <HomeImmersive clientEdition={clientEdition} allowedClientRoutes={clientEdition ? clientAllowedRoutes() : []} />;
}
