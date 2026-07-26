import HomeImmersive from "@/components/HomeImmersive";

export default function Page() {
  return <HomeImmersive clientEdition={process.env.VELOCE_CLIENT_EDITION === "1"} />;
}
