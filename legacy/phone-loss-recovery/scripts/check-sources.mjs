import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const catalog = JSON.parse(readFileSync("content/catalog.json"));
const baseline = existsSync("content/source-monitor-baseline.json")
  ? JSON.parse(readFileSync("content/source-monitor-baseline.json"))
  : {};
const rows = [];
for (const s of catalog.sources) {
  try {
    const response = await fetch(s.url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "PhoneLossRecovery/0.1 source availability check",
      },
    });
    const body = await response.text();
    const hash = createHash("sha256").update(body).digest("hex");
    rows.push({
      id: s.id,
      url: s.url,
      status: response.status,
      bytes: body.length,
      sha256: hash,
      changed: baseline[s.id] ? baseline[s.id] !== hash : null,
      reviewNeeded: !response.ok || (baseline[s.id] && baseline[s.id] !== hash),
      note: "Response hash changes can be navigation or dynamic content; inspect the cited passage before deciding materiality.",
    });
  } catch (e) {
    rows.push({ id: s.id, url: s.url, error: e.name, reviewNeeded: true });
  }
}
mkdirSync("source-reports", { recursive: true });
writeFileSync(
  "source-reports/latest.json",
  JSON.stringify(
    { checked: new Date().toISOString(), rulesModified: false, sources: rows },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error,
      reviewNeeded: r.reviewNeeded,
    })),
  ),
);
if (rows.some((r) => r.reviewNeeded)) process.exitCode = 1;
