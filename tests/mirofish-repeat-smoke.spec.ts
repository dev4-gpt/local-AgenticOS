import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { prepareRepeatSmoke, validReviewedProfileManifest } from "../scripts/prepare-mirofish-repeat-smoke.mjs";

const buyers = ["P00603", "P01315", "P02225", "P03040", "P04949", "P05453", "P06865", "P07078", "P08037", "P09494"];

test("repeat smoke preserves ten profiles and gives both buyers a bounded shared discussion round", () => {
  const source = {
    simulation_id: "sim_oldpilot000",
    agent_configs: buyers.map((entity_name, agent_id) => ({ entity_name, agent_id, active_hours: [1, 2], activity_level: 0.5 })),
    time_config: { total_simulation_hours: 72, minutes_per_round: 30 },
    event_config: { initial_posts: [{ poster_agent_id: 0, content: "old attribution" }] },
    reddit_config: null,
  };
  const next = prepareRepeatSmoke(source, "sim_123456abcdef");
  expect(source.event_config.initial_posts).toHaveLength(1);
  expect(next.simulation_id).toBe("sim_123456abcdef");
  expect(next.time_config).toMatchObject({ total_simulation_hours: 10, minutes_per_round: 60, agents_per_hour_min: 2, agents_per_hour_max: 2, peak_hours: [8] });
  expect(next.agent_configs.filter((agent: { activity_level: number }) => agent.activity_level === 1).map((agent: { entity_name: string; active_hours: number[] }) => [agent.entity_name, agent.active_hours])).toEqual([["P00603", [8]], ["P04949", [8]]]);
  expect(next.agent_configs.filter((agent: { activity_level: number }) => agent.activity_level === 0)).toHaveLength(8);
  expect(next.event_config.initial_posts).toHaveLength(2);
  const openingPosters: string[] = [];
  for (const post of next.event_config.initial_posts) {
    const assigned = next.agent_configs[post.poster_agent_id].entity_name;
    openingPosters.push(assigned);
    expect(post.content).toContain(assigned);
    expect(post.content.match(/P\d{5}/g)).toEqual([assigned]);
    expect(post.content).toContain("$2,500");
    expect(post.content).toContain("$1,250/month");
  }
  expect(openingPosters.sort()).toEqual(["P00603", "P04949"]);
  expect(next.event_config.initial_posts[0].content).toContain("it is unaffordable for us and I decline");
  expect(next.event_config.narrative_direction).toContain("must explicitly decline");
  expect(next.event_config.narrative_direction).toContain("do not request a demo");
  expect(next.event_config.narrative_direction).toContain("if affordability is not established, defer");
  expect(next.event_config.narrative_direction).toContain("same discussion round");
  expect(next.wait_for_commands).toBe(false);
});

test("repeat smoke refuses an incomplete or unexpected cohort", () => {
  const source = { agent_configs: buyers.slice(1).map((entity_name) => ({ entity_name })), reddit_config: null };
  expect(() => prepareRepeatSmoke(source, "sim_123456abcdef")).toThrow("buyer_cohort_invalid");
  expect(() => prepareRepeatSmoke({ agent_configs: buyers.map((entity_name) => ({ entity_name })), reddit_config: {} }, "sim_123456abcdef")).toThrow("buyer_cohort_invalid");
  expect(() => prepareRepeatSmoke(source, "sim_bad")).toThrow("simulation_id_invalid");
});

test("repeat smoke accepts only a reviewed profile file bound to the original cohort", () => {
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  const reviewed = "canonical buyer profiles";
  const cohort = "reviewed cohort";
  const brief = "current product evidence";
  const manifest = {
    schemaVersion: 2, preparation: "canonical-buyer-scenarios-v2", file: "profiles.csv",
    sourceSha256: "e47a927cb0b8e83cc16993388a8ab223ac35099ef8c31bb0e41ea916b113db0d",
    reviewedSha256: sha256(reviewed), cohortSha256: sha256(cohort), productBriefSha256: sha256(brief), profileCount: 10, providerCalls: 0,
  };
  const check = (candidate = manifest, profiles = reviewed, product = brief) => validReviewedProfileManifest(candidate, Buffer.from(profiles), Buffer.from(cohort), Buffer.from(product));
  expect(check()).toBe(true);
  expect(check({ ...manifest, file: "../secrets.csv" })).toBe(false);
  expect(check({ ...manifest, profileCount: 9 })).toBe(false);
  expect(check(manifest, "changed")).toBe(false);
  expect(check(manifest, reviewed, "new product evidence")).toBe(false);
  expect(check({ ...manifest, schemaVersion: 1, preparation: "canonical-buyer-scenarios-v1" })).toBe(false);
});
