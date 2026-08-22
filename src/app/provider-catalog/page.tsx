import PublicProviderCatalogView from "@/components/PublicProviderCatalogView";

export const metadata = {
  title: "Provider catalog · Veloce AgenticOS",
  description: "A transparent map of Veloce tools, provider adapters, repository references, costs, and activation boundaries.",
};

export default function ProviderCatalogPage() {
  return <PublicProviderCatalogView />;
}
