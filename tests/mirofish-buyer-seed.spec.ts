import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { prepareFocusedMirofishBuyerSeed, prepareMirofishBuyerSeed } from "../scripts/prepare-mirofish-buyer-seed.mjs";

const fixture = JSON.parse(readFileSync("evaluations/mirofish-buyer-micro-v1.json", "utf8"));
const focusedFixture = JSON.parse(readFileSync("evaluations/mirofish-buyer-micro-v2.json", "utf8"));
const ontology = JSON.parse(readFileSync("evaluations/mirofish-buyer-ontology-v1.json", "utf8"));
const base = readFileSync("docs/mirofish-buyer-pilot-seed.md", "utf8");
const focusedBase = readFileSync("docs/mirofish-buyer-pilot-seed-v2.md", "utf8");

test("buyer scenario uses the published base price and keeps low-budget nonbuyers", () => {
  const commercial = readFileSync("docs/commercial-model.md", "utf8");
  const publicPricing = readFileSync("product-experience/src/app/credits/page.tsx", "utf8");
  for (const price of ["$2,500", "$1,250/month"]) {
    expect(commercial).toContain(price);
    expect(publicPricing).toContain(price);
    expect(base).toContain(price);
  }
  expect(publicPricing).toContain("Illustrative first month");
  expect(publicPricing).toContain("$3,750");
  expect(publicPricing).toContain("provider usage");
  expect(publicPricing).toContain("separate prepaid wallet");
  expect(base).toContain("provider usage billed separately");
  expect(base).toContain("should normally reject or defer");
  expect(base).not.toContain("Public pricing and scope are not guaranteed by this seed");
});

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

test("focused buyer seed tests the consultancy workflow hypothesis without claiming demand", () => {
  const seed = prepareFocusedMirofishBuyerSeed(focusedFixture, focusedBase);
  expect(seed.match(/^## Fictional buyer P\d{5}$/gm)).toHaveLength(10);
  expect(seed.match(/ in a small AI automation or development consultancy/g)).toHaveLength(10);
  expect(seed.match(/AI literacy: new to AI/g)).toHaveLength(2);
  expect(seed.match(/AI literacy: expert/g)).toHaveLength(2);
  expect(seed.match(/^P\d{5} is a workflow owner/gm)).toHaveLength(5);
  expect(seed.match(/^P\d{5} is a security reviewer/gm)).toHaveLength(5);
  expect(seed).toContain("hypothesis generation, not market validation");
  expect(seed).toContain("may not experience it");
});

test("focused buyer seed rejects broad-industry and oversized-company drift", () => {
  const changed = structuredClone(focusedFixture);
  changed.personas[0].id = "P09601";
  expect(() => prepareFocusedMirofishBuyerSeed(changed, focusedBase)).toThrow("mirofish_focused_persona_invalid");
});

test("focused buyer seed rejects missing literacy or posture balance", () => {
  const changed = structuredClone(focusedFixture);
  changed.personas[0] = { id: changed.personas[2].id };
  expect(() => prepareFocusedMirofishBuyerSeed(changed, focusedBase)).toThrow("mirofish_focused_coverage_invalid");
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
