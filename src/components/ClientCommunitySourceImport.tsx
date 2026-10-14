"use client";

import { useRef, useState } from "react";
import { Check, FileJson, LoaderCircle, Upload } from "lucide-react";
import { selectClientSourceBatches } from "@/lib/clientSourceBatchSelection";

type Preview = {
  artifactId: string;
  packSha256: string;
  sourceCount: number;
  linkCount: number;
  skippedCount: number;
  skipped: string[];
  sources: {
    title: string;
    url: string;
    tab: string | null;
    publishedAt: string | null;
    collectedAt: string | null;
    text: string;
    links: { url: string; text: string }[];
  }[];
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Source import failed.");
  return data;
}

async function postSourcePack(batch: { file: File; sha256: string | null }) {
  const form = new FormData();
  form.set("file", batch.file);
  form.set("permissionConfirmed", "true");
  if (batch.sha256) form.set("expectedSha256", batch.sha256);
  const response = await fetch("/api/client-runtime/source-import/upload", { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Source pack upload failed.");
  return data;
}

export default function ClientCommunitySourceImport({ onImported }: { onImported: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<{ file: File; sha256: string | null }[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [totals, setTotals] = useState({ sources: 0, links: 0, skipped: 0 });
  const [expected, setExpected] = useState<{ sources: number; links: number; skipped: number } | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function reviewBatch(batch: { file: File; sha256: string | null }) {
    const upload = await postSourcePack(batch);
    const data = await postJson("/api/client-runtime/source-import", { action: "preview", artifactId: upload.artifactId });
    if (batch.sha256 && data.packSha256 !== batch.sha256) throw new Error("The uploaded batch differs from the reviewed manifest.");
    setPreview({ artifactId: upload.artifactId, packSha256: data.packSha256, sourceCount: data.sourceCount, linkCount: data.linkCount, skippedCount: data.skippedCount, skipped: data.skipped, sources: data.sources });
  }

  async function prepare(files: File[]) {
    setPreview(null); setApproved(false); setResult(""); setError(""); setBatches([]); setBatchIndex(0); setCompleted(0); setTotals({ sources: 0, links: 0, skipped: 0 }); setExpected(null);
    if (!files.length) return;
    setBusy(true);
    try {
      const selected = await selectClientSourceBatches(files);
      setBatches(selected.batches);
      if (selected.sourceCount !== null && selected.linkCount !== null && selected.skippedCount !== null) setExpected({ sources: selected.sourceCount, links: selected.linkCount, skipped: selected.skippedCount });
    } catch (reason) { setError(selectionError(reason)); }
    finally { setBusy(false); }
  }

  async function retryReview() {
    if (busy || preview || !approved || !batches[batchIndex]) return;
    setBusy(true); setError("");
    try { await reviewBatch(batches[batchIndex]); }
    catch (reason) {
      if (reason instanceof Error && reason.message === "source_import_cleanup_pending") setCleanupPending(true);
      setError(selectionError(reason));
    }
    finally { setBusy(false); }
  }

  async function importPack() {
    if (!preview || !approved || busy) return;
    setBusy(true); setError("");
    try {
      const data = await postJson("/api/client-runtime/source-import", { action: "import", artifactId: preview.artifactId, previewSha256: preview.packSha256, permissionConfirmed: true });
      const nextIndex = batchIndex + 1;
      setCompleted(nextIndex);
      setTotals((current) => ({ sources: current.sources + preview.sourceCount, links: current.links + preview.linkCount, skipped: current.skipped + preview.skippedCount }));
      setResult(`${nextIndex}/${batches.length} batches imported · ${data.result?.imported ?? 0} added · ${data.result?.updated ?? 0} updated · ${data.result?.duplicates ?? 0} unchanged in this batch`);
      setPreview(null); setApproved(false);
      try { await onImported(); } catch { setError("The batch imported, but Memory did not refresh. Reload Memory to view it."); }
      if (nextIndex < batches.length) setBatchIndex(nextIndex);
    } catch (reason) { setError(selectionError(reason)); }
    finally { setBusy(false); }
  }

  return <section className="panel p-5">
    <div className="flex items-center gap-2"><FileJson size={16} color="var(--gold-deep)" /><h2 className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Community sources</h2></div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <input ref={inputRef} type="file" accept=".json,application/json" multiple disabled={busy} className="sr-only" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void prepare(files); }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}Review JSON source packs</button>
      {result && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check size={13} />{result}</span>}
    </div>
    {batches.length > 0 && <p className="mt-3 text-xs" style={{ color: "var(--cream-dim)" }}>{completed}/{batches.length} batches imported · {totals.sources} sources · {totals.links} links{expected && ` of ${expected.sources} sources and ${expected.links} links in the supplied manifest`}</p>}
    {completed < batches.length && batches[batchIndex] && <label className="mt-3 flex items-start gap-2 text-xs" style={{ color: "var(--cream-dim)" }}><input type="checkbox" checked={approved} disabled={busy} onChange={(event) => setApproved(event.target.checked)} />I have permission to upload and use this batch&apos;s content in this tenant.</label>}
    {!preview && completed < batches.length && batches[batchIndex] && <button type="button" onClick={() => void retryReview()} disabled={!approved || busy || cleanupPending} className="mt-3 text-xs underline disabled:opacity-40" style={{ color: "var(--cream-soft)" }}>Review batch {batchIndex + 1}</button>}
    {preview && <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
      <p className="text-xs break-words" style={{ color: "var(--cream-dim)" }}>Batch {batchIndex + 1}/{batches.length}: {batches[batchIndex]?.file.name} · {preview.sourceCount} sources · {preview.linkCount} links · {preview.skippedCount} skipped in export</p>
      {preview.skippedCount > 0 && <details className="mt-3 text-xs" style={{ color: "var(--cream-dim)" }}><summary className="cursor-pointer">Review skipped entries</summary><ul className="mt-2 max-h-36 list-disc overflow-auto pl-5">{preview.skipped.map((item, index) => <li key={`${index}-${item}`} className="py-0.5 break-words">{item}</li>)}</ul></details>}
      <div className="mt-3 max-h-80 overflow-auto border-y text-xs" style={{ borderColor: "var(--line-soft)", color: "var(--cream-soft)" }}>
        {preview.sources.map((source, index) => <details key={`${source.url}-${index}`} className="border-b py-2 last:border-b-0" style={{ borderColor: "var(--line-soft)" }}>
          <summary className="cursor-pointer break-words font-medium">{source.title} <span className="font-normal opacity-70">({source.links.length} links)</span></summary>
          <div className="mt-2 space-y-2 pl-4">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="block break-all underline">{source.url}</a>
            {(source.tab || source.publishedAt || source.collectedAt) && <p className="break-words opacity-70">{[source.tab, source.publishedAt && `Published ${source.publishedAt}`, source.collectedAt && `Collected ${source.collectedAt}`].filter(Boolean).join(" · ")}</p>}
            <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{source.text}</p>
            {source.links.length > 0 && <ul className="list-disc space-y-1 pl-4">{source.links.map((link, linkIndex) => <li key={`${link.url}-${linkIndex}`} className="break-words"><a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{link.text || link.url}</a></li>)}</ul>}
          </div>
        </details>)}
      </div>
      <button type="button" onClick={() => void importPack()} disabled={!approved || busy} className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "var(--gold-deep)", color: "#111827" }}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}Import sources</button>
    </div>}
    {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
  </section>;
}

function selectionError(reason: unknown) {
  const code = reason instanceof Error ? reason.message : "";
  if (code === "storage_not_configured") return "Your source pack has not been uploaded. File storage needs to be configured for this workspace.";
  if (code === "storage_identity_unavailable") return "Your source pack has not been uploaded. This runtime could not obtain its approved cloud-storage identity. Ask the workspace administrator to check the runtime identity configuration.";
  if (code === "source_import_verifier_unavailable") return "Your source pack has not been uploaded. The guarded importer is not configured for this workspace; ask the workspace administrator to finish its setup.";
  if (code === "source_import_permission_required") return "Confirm permission before uploading this batch.";
  if (code === "source_import_manifest_mismatch") return "The uploaded batch differs from the reviewed manifest.";
  if (code === "source_import_upload_failed") return "The source pack could not be stored and was not imported. Check the workspace storage configuration, then retry.";
  if (code === "source_import_cleanup_pending") return "The upload failed and cleanup could not be confirmed. It remains pending and was not imported; contact the workspace administrator before retrying.";
  if (code === "source_batch_manifest_required") return "Select the manifest and every numbered part together.";
  if (code === "source_batch_manifest_mismatch" || code === "source_batch_manifest_invalid") return "The selected parts do not match the export manifest.";
  if (code === "source_batch_duplicate_source") return "Two parts describe the same source and tab. Correct the export before importing so one lesson cannot replace another.";
  if (code === "source_batch_files_invalid" || code === "source_batch_files_duplicate") return "Choose up to 100 distinct JSON parts, each no larger than 1 MB.";
  if (code === "source_batch_json_invalid") return "The selected JSON file is malformed or not UTF-8.";
  if (code === "source_batch_content_invalid") return "A selected source pack contains invalid content. Correct the export and select all files again; nothing was uploaded.";
  if (code === "source_batch_size_changed") return "A selected file changed while it was being checked. Select the complete export again.";
  if (code === "runtime_rate_limited") return "Import limit reached. Wait about 15 minutes, then retry this batch. Previously imported batches remain saved.";
  return code || "Source pack review failed.";
}
