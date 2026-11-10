import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const seed = JSON.parse(readFileSync("docs/oneday-content-library-graph-seed.jsonld", "utf8"));

test("OneDay graph seed identifies its partial coverage and source policy", () => {
  expect(seed.metadata.coverage).toBe("partial");
  expect(seed.metadata.coverageNote).toContain("two lesson pages");
  expect(seed.metadata.contentPolicy).toContain("no lesson text or media copied");
  expect(seed.metadata.intendedStorage).toContain("reviewed import plan");
  expect(seed["@context"]["@vocab"]).toBe("https://schema.org/");
});

test("OneDay graph seed has unique nodes and resolves every internal edge", () => {
  const ids = seed["@graph"].map((node: { id: string }) => node.id);
  const nodeIds = new Set(ids);
  expect(nodeIds.size).toBe(ids.length);
  expect(seed["@graph"].filter((node: { type: string }) => node.type === "LearningResource")).toHaveLength(2);
  expect(seed["@graph"].filter((node: { type: string }) => node.type === "DefinedTerm")).toHaveLength(6);

  for (const node of seed["@graph"]) {
    for (const relation of ["partOf", "relatedTo", "teaches", "source"]) {
      const targets = node[relation] == null ? [] : Array.isArray(node[relation]) ? node[relation] : [node[relation]];
      for (const target of targets) expect(nodeIds.has(target)).toBe(true);
    }
  }
});
