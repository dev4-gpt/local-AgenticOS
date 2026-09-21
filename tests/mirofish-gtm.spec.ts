import { expect, test } from "@playwright/test";
import { MIROFISH_GTM_METHOD_VERSION, mirofishGtmFallbackPlan, mirofishGtmMethodology, shouldRunMirofishGtmTest } from "../src/lib/mirofishGtm";

test("GTM detection is scoped to market-facing work", () => {
  expect(shouldRunMirofishGtmTest({ title: "GTM launch", idea: "Validate our positioning" })).toBe(true);
  expect(shouldRunMirofishGtmTest({ title: "Status board", idea: "Show system health" })).toBe(false);
});

test("the methodology is an evidence-bound scenario test", () => {
  const method = mirofishGtmMethodology();
  expect(method).toContain(MIROFISH_GTM_METHOD_VERSION);
  expect(method).toContain("rather than a forecast");
  expect(method).toContain("consent-based validation experiment");
  expect(method).toContain("kill, iterate, or scale");
});

test("local planning instructions target the local plan sections", () => {
  const method = mirofishGtmMethodology("local");
  expect(method).toContain("In the Approach section");
  expect(method).toContain("In First milestones");
  expect(method).not.toContain("In TASKS");
  expect(method).toContain("hypotheses, not customer facts or forecasts");
});

test("model outages produce an explicitly untested GTM template", () => {
  const plan = mirofishGtmFallbackPlan("Launch a service");
  expect(plan).toContain("model generation was unavailable");
  expect(plan).toContain("No customer evidence or scenario results have been generated");
  expect(plan).toContain("- [ ] Gather customer evidence with consent");
  expect(plan).toContain("human reviewer");
});
