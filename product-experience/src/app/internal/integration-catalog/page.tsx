import { loadIntegrationCatalog, isIntegrationActivatable, type IntegrationRiskTier } from "@/lib/integrationCatalogBroker";

export const dynamic = "force-static";

const RISK_TIER_LABEL: Record<IntegrationRiskTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export default function IntegrationCatalogPage() {
  const entries = loadIntegrationCatalog();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Governed integration catalog</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        Read-only registry for pipeline planning, backend status, and infrastructure review. Source of truth:
        {" "}<code>infrastructure/integration-control-plane.manifest.json</code>.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "0.5rem" }}>Integration</th>
              <th style={{ padding: "0.5rem" }}>State</th>
              <th style={{ padding: "0.5rem" }}>Risk tier</th>
              <th style={{ padding: "0.5rem" }}>Activatable</th>
              <th style={{ padding: "0.5rem" }}>SBOM</th>
              <th style={{ padding: "0.5rem" }}>Provenance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const activatable = isIntegrationActivatable(entry.id);
              return (
                <tr key={entry.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <strong>{entry.name}</strong>
                    <div style={{ color: "#777", fontSize: "0.8rem" }}>{entry.id}</div>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{entry.state}</td>
                  <td style={{ padding: "0.5rem" }}>{RISK_TIER_LABEL[entry.riskTier]}</td>
                  <td style={{ padding: "0.5rem" }}>{activatable.ok ? "Yes" : `No (${activatable.reason})`}</td>
                  <td style={{ padding: "0.5rem", color: entry.sbomReference?.startsWith("pending") ? "#b45309" : "#333" }}>
                    {entry.sbomReference ?? "n/a"}
                  </td>
                  <td style={{ padding: "0.5rem", color: entry.provenanceReference?.startsWith("pending") ? "#b45309" : "#333" }}>
                    {entry.provenanceReference ?? "n/a"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
