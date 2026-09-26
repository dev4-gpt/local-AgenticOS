import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

test("controlled beta has one named accountable owner across its operating evidence", () => {
  const organization = read("docs/organizational-structure.md");
  const operations = read("docs/production-operations.md");
  const incident = read("docs/incident-response-plan.md");
  const contract = read("docs/public-beta-operating-contract-2026-09-25.md");

  expect(organization).toContain("## Interim controlled-beta operating ownership");
  for (const obligation of ["Incident classification", "Billing, refund review", "Access revocation", "Customer-data export"]) {
    expect(organization).toContain(obligation);
  }
  expect(organization).toContain("| Aryaman |");
  expect(operations).toContain("Aryaman is the accountable owner");
  expect(incident).toContain("Aryaman is the incident commander");
  expect(contract).toContain("The controlled-beta operational owner is Aryaman");
});
