import { expect, test } from "@playwright/test";
import { classroomLinksOn, classroomTabSources } from "../src/lib/classroomResearch";

test("classroom captures visible links and embedded media without secret URLs", async ({ page }) => {
  await page.setContent(`
    <base href="https://www.skool.com/approved-course/classroom">
    <main>
      <a href="https://www.skool.com/approved-course/classroom?md=lesson-1">Lesson one</a>
      <a href="https://video.example.org/private?token=hidden">Unsafe media link</a>
      <video src="https://video.example.org/watch/one.mp4" title="Demo one"></video>
      <video><source src="https://video.example.org/watch/two.mp4"></video>
      <iframe src="https://video.example.org/embed/three" title="Walkthrough"></iframe>
    </main>
  `);
  const links = await classroomLinksOn(page);
  expect(links.map((link) => link.url)).toEqual([
    "https://www.skool.com/approved-course/classroom?md=lesson-1",
    "https://video.example.org/watch/one.mp4",
    "https://video.example.org/watch/two.mp4",
    "https://video.example.org/embed/three",
  ]);
  expect(links.some((link) => link.text.includes("Embed: Walkthrough"))).toBe(true);
});

test("classroom retains tabs with identical text but different video embeds", async ({ page }) => {
  await page.route("https://video.example.org/**", (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.route("https://www.skool.com/approved-course/classroom", (route) => route.fulfill({
    contentType: "text/html",
    body: `<main><h1>Lesson</h1><p>Same description</p>
      <button role="tab" onclick="document.querySelector('iframe').src='https://video.example.org/embed/one'">Part one</button>
      <button role="tab" onclick="document.querySelector('iframe').src='https://video.example.org/embed/two'">Part two</button>
      <iframe src="https://video.example.org/embed/one" title="Lesson video"></iframe></main>`,
  }));
  await page.goto("https://www.skool.com/approved-course/classroom");
  const tabs = await classroomTabSources(page, 1, "https://www.skool.com", "/approved-course");
  expect(tabs.skipped).toEqual([]);
  expect(tabs.sources).toHaveLength(2);
  expect(tabs.sources.map((source) => source.tab)).toEqual(["Part one", "Part two"]);
  expect(tabs.sources.map((source) => source.links.find((link) => link.text.startsWith("Embed"))?.url)).toEqual([
    "https://video.example.org/embed/one",
    "https://video.example.org/embed/two",
  ]);
});
