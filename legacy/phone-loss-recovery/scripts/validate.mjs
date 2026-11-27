import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { validateCatalog } from "../src/engine.js";
const catalog = validateCatalog(
  JSON.parse(readFileSync("content/catalog.json")),
);
const tasks = JSON.parse(readFileSync("content/tasks.json"));
assert.equal(tasks.length, 12);
assert.equal(new Set(tasks.map((t) => t.id)).size, 12);
for (const p of catalog.providers) {
  assert.equal(tasks.filter((t) => t.provider === p.id).length, 2);
  for (const op of [
    "suspension",
    "device_block",
    "credentials",
    "access",
    "protection",
    "sim",
    "port",
  ])
    assert(
      catalog.rules.some((r) => r.provider === p.id && r.operation === op),
    );
}
for (const t of tasks) {
  assert(t.question && t.explanation && t.context);
  assert(t.choices.some((c) => c.id === t.correctAnswer));
  assert.equal(new Set(t.choices.map((c) => c.id)).size, t.choices.length);
  assert(t.sourceIds.every((id) => catalog.sources.some((s) => s.id === id)));
}
console.log(
  `Validated ${catalog.providers.length} providers, ${catalog.rules.length} rules and ${tasks.length} tasks.`,
);
