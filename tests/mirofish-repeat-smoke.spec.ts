import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { prepareRepeatSmoke, validReviewedProfileManifest } from "../scripts/prepare-mirofish-repeat-smoke.mjs";

const buyers = ["P00603", "P01315", "P02225", "P03040", "P04949", "P05453", "P06865", "P07078", "P08037", "P09494"];

test("repeat smoke preserves the ten-buyer frame but activates only two in one round", () => {
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
  expect(next.time_config).toMatchObject({ total_simulation_hours: 10, minutes_per_round: 60, agents_per_hour_min: 2, agents_per_hour_max: 2 });
  expect(next.agent_configs.filter((agent: { activity_level: number }) => agent.activity_level === 1).map((agent: { entity_name: string }) => agent.entity_name)).toEqual(["P00603", "P04949"]);
  expect(next.agent_configs.filter((agent: { activity_level: number }) => agent.activity_level === 0)).toHaveLength(8);
  expect(next.event_config.initial_posts).toHaveLength(2);
  for (const post of next.event_config.initial_posts) {
    const assigned = next.agent_configs[post.poster_agent_id].entity_name;
    expect(post.content).toContain(assigned);
    expect(post.content.match(/P\d{5}/g)).toEqual([assigned]);
  }
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
  const manifest = {
    schemaVersion: 1, preparation: "canonical-buyer-scenarios-v1", file: "profiles.csv",
    sourceSha256: "6ef07dc0fec27cc15f30dc5afe71ad1a6b855c6fd6e6f9e90ef2075f7d0e704c",
    reviewedSha256: sha256(reviewed), cohortSha256: sha256(cohort), profileCount: 10, providerCalls: 0,
  };
  expect(validReviewedProfileManifest(manifest, Buffer.from(reviewed), Buffer.from(cohort))).toBe(true);
  expect(validReviewedProfileManifest({ ...manifest, file: "../secrets.csv" }, Buffer.from(reviewed), Buffer.from(cohort))).toBe(false);
  expect(validReviewedProfileManifest({ ...manifest, profileCount: 9 }, Buffer.from(reviewed), Buffer.from(cohort))).toBe(false);
  expect(validReviewedProfileManifest(manifest, Buffer.from("changed"), Buffer.from(cohort))).toBe(false);
});
