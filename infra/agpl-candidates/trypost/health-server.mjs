#!/usr/bin/env node
// Placeholder process for the `trypost` AGPL adapter candidate's empty shell (ADR-010, X-10).
// Answers only a health check. Carries no AGPL code, no adapter contract logic, and is not called by the app.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, shell: "trypost", status: "blocked-legal-review" }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port, () => {
  console.log(`trypost empty shell listening on ${port} (blocked-legal-review, no AGPL code present)`);
});
