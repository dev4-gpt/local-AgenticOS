import { PublicBetaCatalog } from "@/components/PublicBetaCatalog";

export const metadata = {
  title: "Public provider catalog · Veloce AgenticOS",
  description: "A transparent, governed map of Veloce capabilities, providers, and repository provenance.",
};

export default function ProviderCatalogPage() {
  return <PublicBetaCatalog />;
}
