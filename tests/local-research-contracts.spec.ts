import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { answerViolations, type ClassroomSource } from "../src/lib/classroomResearch";
import { isLocalOnlyRequest } from "../src/lib/localOnlyRequest";

const sources: ClassroomSource[] = [{
  id: "S1",
  title: "Approved source",
  url: "https://example.edu/course",
  text: "Course material",
  collectedAt: "2026-09-25T00:00:00.000Z",
  links: [],
}];

test("local research routes reject non-loopback callers", () => {
  expect(isLocalOnlyRequest(new Request("http://127.0.0.1/api/research", { headers: { host: "127.0.0.1:3939" } }))).toBe(true);
  expect(isLocalOnlyRequest(new Request("http://localhost/api/research", { headers: { host: "localhost" } }))).toBe(true);
  expect(isLocalOnlyRequest(new Request("http://[::1]/api/research", { headers: { host: "[::1]:3939" } }))).toBe(true);
  expect(isLocalOnlyRequest(new Request("https://app.veloceos.cloud/api/research", { headers: { host: "app.veloceos.cloud" } }))).toBe(false);
});

test("citation answers reject unsupported claims and unknown source IDs", () => {
  expect(answerViolations("The course begins next week. [S1]", sources)).toEqual([]);
  expect(answerViolations("The course begins next week.", sources)).toEqual(["Line 1 has no citation."]);
  expect(answerViolations("The course begins next week. [S99]", sources)).toEqual(["Line 1 cites an unknown source: S99."]);
});

test("research routes retain local-only and bounded collection controls", () => {
  const classroomRoute = readFileSync("src/app/api/classroom-research/route.ts", "utf8");
  const socialRoute = readFileSync("src/app/api/social-research/route.ts", "utf8");
  expect(classroomRoute).toContain("isLocalOnlyRequest");
  expect(socialRoute).toContain("isLocalOnlyRequest");
  expect(socialRoute).toContain("shell: false");
  expect(socialRoute).toContain("const SNSCRAPE_MODES");
  expect(socialRoute).toContain("Math.min(100");
  expect(socialRoute).toContain("Veloce-AgenticOS/0.1");
});
