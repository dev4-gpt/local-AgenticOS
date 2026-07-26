import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { BLOG_POST_SKILL } from "@/lib/seoPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!existsSync(BLOG_POST_SKILL)) {
    return new Response(
      `# SEO content skill\n\nThe private blog-post skill is not installed in this runtime, so the tab is showing the built-in safe contract instead.\n\n## Workflow\n\n1. Choose a target site and keyword.\n2. Research the current search intent and competing pages.\n3. Draft an original article with clear source notes and internal links.\n4. Review claims, links, metadata, and conversion path.\n5. Publish only after human approval.\n\n## Boundary\n\nThis fallback does not publish, scrape private sources, or access credentials. Install the operator skill at:\n\n\`${BLOG_POST_SKILL}\``,
      { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8" } }
    );
  }
  const content = await readFile(BLOG_POST_SKILL, "utf8");
  return new Response(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
