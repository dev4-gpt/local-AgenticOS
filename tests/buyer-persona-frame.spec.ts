import { expect, test } from "@playwright/test";
import { buyerPersonaFrame, pilotBuyerPersonas } from "../scripts/generate-buyer-persona-frame.mjs";

test("buyer sampling frame spans 10,000 unique field, posture, size, literacy, budget and privacy cells", () => {
  const rows = buyerPersonaFrame();
  expect(rows).toHaveLength(10_000);
  expect(new Set(rows.map((row) => [row.field, row.posture, row.orgSize, row.aiLiteracy, row.monthlyBudget, row.privacy].join("|"))).size).toBe(10_000);
  expect(new Set(rows.map((row) => row.id)).size).toBe(10_000);
  expect(new Set(rows.map((row) => row.region)).size).toBe(6);
});

test("pilot has one reproducible person per field and AI-literacy level", () => {
  const rows = pilotBuyerPersonas();
  expect(rows).toHaveLength(50);
  expect(new Set(rows.map((row) => `${row.field}|${row.aiLiteracy}`)).size).toBe(50);
  expect(pilotBuyerPersonas()).toEqual(rows);
  expect(pilotBuyerPersonas("different-seed")).not.toEqual(rows);
});
