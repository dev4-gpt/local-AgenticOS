"use client";
import { useEffect, useMemo, useState } from "react";

type Component = { id: string; label: string; kind: string; department: string; availability: string; implementationScope: string; unavailableReason: string | null; dependencies: string[]; cost: string; sourceRepository: string; sourceCommit: string; sourcePath: string; adapterId: string | null };
export default function EccCatalogPanel() {
  const [components, setComponents] = useState<Component[]>([]); const [departments, setDepartments] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(""); const [department, setDepartment] = useState(""); const [state, setState] = useState(""); const [notice, setNotice] = useState("Loading pinned catalog…");
  useEffect(() => { let active = true; void fetch("/api/client-runtime/skills", { cache: "no-store" }).then(async response => {
    const data = await response.json(); if (!response.ok || !data.ecc) throw new Error();
    if (active) { setComponents(data.ecc.components); setDepartments(data.ecc.departments); setNotice(""); }
  }).catch(() => { if (active) setNotice("Sign in to a tenant runtime to view catalog availability."); }); return () => { active = false; }; }, []);
  const filtered = useMemo(() => components.filter(item => (!department || item.department === department) && (!state || item.availability === state) && `${item.label} ${item.kind} ${item.implementationScope}`.toLowerCase().includes(query.toLowerCase())), [components, department, query, state]);
  return <section className="panel p-5 space-y-4" aria-labelledby="ecc-catalog-title" style={{ color: "var(--cream)" }}>
    <div><p className="eyebrow">Capabilities</p><h2 id="ecc-catalog-title" className="text-xl">Skills &amp; Specialists</h2><p className="mt-2 text-sm opacity-70">Explore the pinned ECC catalog. Availability describes a bounded Veloce adaptation; listing a component does not enable its upstream tools.</p></div>
    <div className="flex gap-3 flex-wrap">
      <label className="text-xs">Search<input aria-label="Search ECC catalog" value={query} onChange={e => setQuery(e.target.value)} className="block mt-1 rounded border border-[var(--line)] bg-black/20 p-2 text-sm" /></label>
      <label className="text-xs">Department<select aria-label="Catalog department" value={department} onChange={e => setDepartment(e.target.value)} className="runtime-request-select block mt-1 rounded border border-[var(--line)] p-2 text-sm"><option value="">All departments</option>{Object.entries(departments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Availability<select aria-label="Catalog availability" value={state} onChange={e => setState(e.target.value)} className="runtime-request-select block mt-1 rounded border border-[var(--line)] p-2 text-sm"><option value="">All states</option>{["available", "awaiting-adaptation", "requires-configuration", "unavailable-under-cost-policy"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    {notice && <p role="status" className="text-sm text-amber-200">{notice}</p>}
    {!!components.length && <p className="text-xs opacity-70">{filtered.length} matching components of {components.length}. Showing the first 60; narrow your search to explore more.</p>}
    <div className="grid gap-3 md:grid-cols-2">{filtered.slice(0, 60).map(item => <article key={item.id} className="rounded-lg border border-[var(--line-soft)] p-4 text-sm space-y-2">
      <div className="flex justify-between gap-3"><h3 className="font-medium capitalize">{item.label}</h3><span className="text-xs text-amber-200">{item.availability}</span></div>
      <p className="text-xs opacity-60">{departments[item.department] ?? item.department} · {item.kind}</p><p>{item.implementationScope}</p>
      {item.unavailableReason && <p className="opacity-70">{item.unavailableReason}</p>}
      <details className="text-xs opacity-80"><summary className="cursor-pointer">Prerequisites and provenance</summary><p className="mt-2">{item.dependencies.join("; ")}</p><p className="mt-1">Cost: {item.cost}</p><a className="mt-2 inline-block underline" href={`${item.sourceRepository}/blob/${item.sourceCommit}/${item.sourcePath}`} target="_blank" rel="noreferrer">Pinned upstream source · MIT</a></details>
      {item.adapterId && <a className="text-xs underline text-emerald-200" href="/orchestrate#department-workflows">Open department workflows</a>}
    </article>)}</div>
  </section>;
}
