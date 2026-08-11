export interface OutputQualityReport {
  policyVersion: "v96-output-quality-1";
  passed: boolean;
  score: number;
  changed: boolean;
  optOut: boolean;
  findings: readonly { code: string; count: number; message: string }[];
}

export function applyOutputQualityPolicy(input: string, options: { optOut?: boolean } = {}) {
  const original = input.slice(0, 80_000);
  if (options.optOut) {
    return { output: original, report: emptyReport(true, false) };
  }

  const protectedBlocks: string[] = [];
  let output = original.replace(/```[\s\S]*?```/g, (block) => {
    protectedBlocks.push(block);
    return `\u0000CODE_${protectedBlocks.length - 1}\u0000`;
  });
  const findings: Array<{ code: string; count: number; message: string }> = [];
  const remove = (code: string, pattern: RegExp, message: string) => {
    let count = 0;
    output = output.replace(pattern, () => { count += 1; return ""; });
    if (count) findings.push({ code, count, message });
  };
  remove("meta-filler", /\b(?:as an ai language model|it is important to note that|it is worth noting that)\s*/gi, "Removed generic meta-filler.");
  remove("inflated-transition", /^\s*(?:in conclusion|to summarize|in today's fast-paced world),?\s*/gim, "Removed an unnecessary transition.");

  const lines = output.split("\n");
  const deduped: string[] = [];
  for (const line of lines) {
    if (line.trim() && deduped.at(-1)?.trim() === line.trim()) {
      findings.push({ code: "repeated-line", count: 1, message: "Removed an adjacent repeated line." });
      continue;
    }
    deduped.push(line);
  }
  output = deduped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  output = output.replace(/\u0000CODE_(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)] ?? "");
  const changed = output !== original;
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + finding.count * 5, 0));
  return { output, report: { policyVersion: "v96-output-quality-1" as const, passed: true, score, changed, optOut: false, findings } satisfies OutputQualityReport };
}

function emptyReport(optOut: boolean, changed: boolean): OutputQualityReport {
  return { policyVersion: "v96-output-quality-1", passed: true, score: 100, changed, optOut, findings: [] };
}
