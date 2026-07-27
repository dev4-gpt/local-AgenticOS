const SECRET_LIKE = /(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b/i;

export function containsClientSecretLike(...values: unknown[]) {
  return SECRET_LIKE.test(values.map((value) => typeof value === "string" ? value : JSON.stringify(value ?? "")).join("\n"));
}
