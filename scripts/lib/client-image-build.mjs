export function clientImageBuildArgs(image, commit, clean) {
  if (typeof image !== "string" || !/^[a-z0-9][a-z0-9._:/@-]{7,500}$/i.test(image)) throw new Error("CLIENT_IMAGE must be an image reference without spaces or substitution separators");
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Client image build requires a resolved 40-character Git commit");
  if (!clean) throw new Error("Refusing to stamp a Git commit onto an image built from uncommitted files");
  return ["builds", "submit", "--config", "cloudbuild.client.yaml", `--substitutions=_IMAGE=${image},_SOURCE_COMMIT=${commit.toLowerCase()}`, "."];
}
