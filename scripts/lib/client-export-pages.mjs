export async function readClientExportPages({ table, filter, columns, request }) {
  const fields = columns.split(",");
  const order = fields.includes("id") ? "id" : fields.includes("slug") ? "slug" : fields.includes("user_id") ? "tenant_slug,user_id" : "tenant_slug";
  const rows = [];
  let previousFirst = null;
  for (;;) {
    const response = await request(`${table}?${filter}&select=${encodeURIComponent(columns)}&order=${order}&limit=500&offset=${rows.length}`);
    if (!response.ok) throw new Error(`Export failed for ${table} (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Export returned invalid rows for ${table}`);
    if (!page.length) return rows;
    const first = JSON.stringify(page[0]);
    if (first === previousFirst) throw new Error(`Export pagination did not advance for ${table}`);
    previousFirst = first;
    rows.push(...page);
  }
}
