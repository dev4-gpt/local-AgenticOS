import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  FILESYSTEM_LANE_MARKERS,
  LANE_PARITY,
  PARITY_PROTECTED_MODULES,
  laneParityFor,
  pairedLanes,
} from "../src/lib/laneParity";

/**
 * Resolves the module specifiers a file imports to repo-relative paths.
 * Handles the `@/` alias and relative specifiers; anything else (node builtins,
 * npm packages) is skipped because it cannot be a local lane.
 */
function importsOf(file: string): string[] {
  if (!existsSync(file)) return [];
  const source = readFileSync(file, "utf8");
  const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  const resolved: string[] = [];
  for (const specifier of specifiers) {
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) candidate = path.join("src", specifier.slice(2));
    else if (specifier.startsWith(".")) candidate = path.join(path.dirname(file), specifier);
    if (!candidate) continue;
    for (const extension of [".ts", ".tsx", "/index.ts"]) {
      const full = `${candidate}${extension}`;
      if (existsSync(full)) { resolved.push(full); break; }
    }
  }
  return resolved;
}

/** Every file reachable from `entry`, including `entry` itself. */
function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of importsOf(current)) if (!seen.has(next)) queue.push(next);
  }
  return [...seen];
}

function touchesFilesystem(file: string) {
  if (!existsSync(file)) return false;
  const source = readFileSync(file, "utf8");
  return FILESYSTEM_LANE_MARKERS.some((marker) => source.includes(marker));
}

test("no shared registry reaches an operator-filesystem lane", () => {
  // A playbook selected by the router runs in cloud. If any registry it reaches
  // transitively imports a lib that reads os.homedir() or ~/.hermes, that
  // playbook works on the author's laptop and fails for every tenant -- and the
  // asymmetry stays invisible until a client hits it.
  const violations: string[] = [];
  for (const entry of PARITY_PROTECTED_MODULES) {
    for (const file of importGraph(entry)) {
      if (touchesFilesystem(file)) violations.push(`${entry} -> ${file}`);
    }
  }
  expect(violations, `shared registries must not reach a filesystem lane:\n${violations.join("\n")}`).toEqual([]);
});

test("the marker set actually detects a known filesystem lane", () => {
  // A detector that never fires is not a detector. loopEngine is the documented
  // example of an operator lane that reads ~/.hermes.
  expect(touchesFilesystem("src/lib/loopEngine.ts")).toBe(true);
  // And it stays quiet on the hosted twin.
  expect(touchesFilesystem("src/lib/clientLoopAdapter.ts")).toBe(false);
});

test("the import walker actually traverses, rather than only reading the entry file", () => {
  // If importsOf silently resolved nothing, the violation scan above would pass
  // vacuously for every entry.
  const graph = importGraph("src/lib/clientPlaybooks.ts");
  expect(graph.length).toBeGreaterThan(1);
  expect(graph).toContain("src/lib/v96SkillPack.ts");
});

test("every declared lane module exists", () => {
  // A map naming a file that was renamed or deleted is worse than no map.
  for (const entry of LANE_PARITY) {
    if (entry.localLane) {
      expect(existsSync(`src/lib/${entry.localLane}.ts`), `${entry.capability}: local lane ${entry.localLane}`).toBe(true);
    }
    if (entry.hostedLane) {
      expect(existsSync(`src/lib/${entry.hostedLane}.ts`), `${entry.capability}: hosted lane ${entry.hostedLane}`).toBe(true);
    }
  }
});

test("lane statuses agree with what the map declares", () => {
  for (const entry of LANE_PARITY) {
    if (entry.status === "paired") {
      expect(entry.localLane, `${entry.capability} is paired`).toBeTruthy();
      expect(entry.hostedLane, `${entry.capability} is paired`).toBeTruthy();
    }
    if (entry.status === "hosted-only") expect(entry.localLane).toBeNull();
    if (entry.status === "local-only") expect(entry.hostedLane).toBeNull();
  }
  expect(pairedLanes().length).toBeGreaterThan(0);
  expect(laneParityFor("loop")?.hostedLane).toBe("clientLoopAdapter");
  expect(laneParityFor("not-a-capability")).toBeNull();
});

test("a paired capability's hosted lane is free of filesystem dependencies", () => {
  // The local half may read the machine -- that is what makes it the local half.
  // The hosted half may not, or the pairing is a lie.
  for (const entry of pairedLanes()) {
    expect(
      touchesFilesystem(`src/lib/${entry.hostedLane}.ts`),
      `${entry.capability}: hosted lane ${entry.hostedLane} touches the filesystem`,
    ).toBe(false);
  }
});
