// Text detection supplements review; it is not a permission boundary. Keep
// authorization independent of all lesson, brief and evidence text.
export function eccSecretLike(value: string) {
  return /(?:api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token|authorization|cookie)\s*[:=]\s*\S{4,}|\b(?:sk|rk|xai)-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAIza[A-Za-z0-9_-]{25,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value);
}

export function eccInstructionRisk(value: string) {
  return /ignore (?:all |the |previous |prior )*(?:instructions|rules)|(?:system|developer)\s*(?:prompt|message)\s*:|(?:disable|bypass|override)\s+(?:authorization|permissions|approval|budget|safety)|(?:exfiltrate|reveal credentials)/i.test(value);
}
