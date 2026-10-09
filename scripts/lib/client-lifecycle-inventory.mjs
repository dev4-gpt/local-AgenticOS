export function bucketListingHasObjects(result) {
  if (result?.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Unable to enumerate client objects");
  }
  return result.stdout.trim().length > 0;
}

export function queueListingContains(result, queue) {
  if (result?.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Unable to enumerate client task queues");
  }
  return result.stdout.split(/\r?\n/).some((name) => {
    const value = name.trim();
    return value === queue || value.endsWith(`/queues/${queue}`);
  });
}

export function reviewedClientSecretNames(manifest, slug) {
  const prefix = `veloce-${slug}-`;
  const safeName = (value) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,120}$/.test(value)) {
      throw new Error("Reviewed client secret reference is invalid");
    }
    return value;
  };
  const scopedName = (value) => {
    const name = safeName(value);
    return name.startsWith(prefix) ? name : `${prefix}${name}`;
  };
  const refs = manifest.secretEnv ?? manifest.secretRefs ?? {};
  if (!Array.isArray(refs) && (!refs || typeof refs !== "object")) throw new Error("Reviewed client secret references are invalid");
  const values = Array.isArray(refs) ? refs : Object.values(refs);
  const names = new Set(values.filter((value) => typeof value === "string").map((value) => `${prefix}${safeName(value)}`));
  const runtime = manifest.runtimeEnv ?? {};
  const credentialInbox = scopedName(runtime.CLIENT_CREDENTIAL_INBOX_SECRET || "client-credential-inbox");
  const requestInbox = scopedName(runtime.CLIENT_REQUEST_INBOX_SECRET || credentialInbox);
  names.add(credentialInbox);
  names.add(requestInbox);
  return names;
}

export function requireReviewedSecretInventory(discovered, reviewed) {
  if (!Array.isArray(discovered) || discovered.some((name) => !reviewed.has(name))) {
    throw new Error("Unreviewed client secret found; refusing deletion");
  }
  return discovered;
}
