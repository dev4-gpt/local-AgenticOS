#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const [roleYaml, provisioner] = await Promise.all([
  readFile(join(root, "iam/veloce-gcp-provisioner-role.yaml"), "utf8"),
  readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8"),
]);

const requiredPermissions = [
  "artifactregistry.dockerimages.get",
  "artifactregistry.repositories.downloadArtifacts",
  "iam.serviceAccounts.actAs",
  "iam.serviceAccounts.create",
  "iam.serviceAccounts.get",
  "iam.serviceAccounts.getIamPolicy",
  "iam.serviceAccounts.setIamPolicy",
  "storage.buckets.create",
  "storage.buckets.get",
  "storage.buckets.getIamPolicy",
  "storage.buckets.setIamPolicy",
  "storage.buckets.update",
  "secretmanager.secrets.create",
  "secretmanager.secrets.get",
  "secretmanager.secrets.getIamPolicy",
  "secretmanager.secrets.setIamPolicy",
  "secretmanager.versions.list",
  "cloudtasks.queues.create",
  "cloudtasks.queues.get",
  "cloudtasks.queues.getIamPolicy",
  "cloudtasks.queues.setIamPolicy",
  "run.jobs.create",
  "run.jobs.get",
  "run.jobs.getIamPolicy",
  "run.jobs.setIamPolicy",
  "run.jobs.update",
  "run.operations.get",
  "run.services.create",
  "run.services.get",
  "run.services.getIamPolicy",
  "run.services.setIamPolicy",
  "run.services.update",
  "resourcemanager.projects.get",
];

const forbiddenPermissions = [
  "serviceusage.services.enable",
  "resourcemanager.projects.setIamPolicy",
  "secretmanager.versions.access",
  "secretmanager.versions.add",
  "secretmanager.secrets.delete",
  "artifactregistry.repositories.create",
  "artifactregistry.repositories.delete",
  "run.services.delete",
  "run.jobs.delete",
  "storage.buckets.delete",
  "iam.serviceAccounts.delete",
  "*",
];

const failures = [
  ...requiredPermissions.filter((permission) => !roleYaml.includes(`- ${permission}`)).map((permission) => `missing role permission: ${permission}`),
  ...forbiddenPermissions.filter((permission) => roleYaml.includes(`- ${permission}`)).map((permission) => `forbidden role permission: ${permission}`),
];

if (provisioner.includes('"services", "enable"') || provisioner.includes('"artifacts", "repositories", "create"')) {
  failures.push("tenant provisioner contains a project bootstrap operation");
}

if (failures.length) {
  console.error("GCP provisioner role verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GCP provisioner role contract passed.");
