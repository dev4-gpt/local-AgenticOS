import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { prepareMirofishBuyerSeed } from "../scripts/prepare-mirofish-buyer-seed.mjs";

const fixture = JSON.parse(readFileSync("evaluations/mirofish-buyer-micro-v1.json", "utf8"));
const ontology = JSON.parse(readFileSync("evaluations/mirofish-buyer-ontology-v1.json", "utf8"));
const base = readFileSync("docs/mirofish-buyer-pilot-seed.md", "utf8");

test("micro buyer seed names ten framed fictional buyers without claiming a simulation", () => {
  const seed = prepareMirofishBuyerSeed(fixture, base);
  expect(seed.match(/^## Fictional buyer P\d{5}$/gm)).toHaveLength(10);
  expect(seed).toContain("AI literacy: new to AI");
  expect(seed).toContain("AI literacy: expert");
  expect(seed).toContain("may decline AgentOS");
  expect(seed).toContain("not generated MiroFish agents or actual customers");
});

test("micro buyer seed rejects a profile outside the audited 50-person frame", () => {
  const changed = structuredClone(fixture);
  changed.personas[0].id = "P99999";
  expect(() => prepareMirofishBuyerSeed(changed, base)).toThrow("mirofish_micro_persona_invalid");
});

test("micro buyer seed rejects lost sector and literacy coverage", () => {
  const changed = structuredClone(fixture);
  changed.personas[0] = { ...changed.personas[0], id: "P00135" };
  expect(() => prepareMirofishBuyerSeed(changed, base)).toThrow("mirofish_micro_coverage_invalid");
});

test("manual ontology stays within Zep Free limits and retains valid graph endpoints", () => {
  const names = ontology.entity_types.map((entity: { name: string }) => entity.name);
  expect(names).toHaveLength(3);
  expect(new Set(names).size).toBe(3);
  expect(names.slice(-2)).toEqual(["Person", "Organization"]);
  expect(names).toContain("Buyer");
  expect(ontology.entity_types.find((entity: { name: string }) => entity.name === "Buyer").attributes.map((attribute: { name: string }) => attribute.name)).toEqual(expect.arrayContaining(["decision_role", "ai_literacy", "privacy_posture", "monthly_budget", "first_workflow"]));
  expect(ontology.entity_types.length).toBeLessThanOrEqual(5);
  expect(ontology.edge_types).toHaveLength(4);
  expect(ontology.edge_types.length).toBeLessThanOrEqual(5);
  for (const edge of ontology.edge_types) {
    expect(edge.source_targets.length).toBeGreaterThan(0);
    for (const pair of edge.source_targets) {
      expect(names).toContain(pair.source);
      expect(names).toContain(pair.target);
    }
  }
});
