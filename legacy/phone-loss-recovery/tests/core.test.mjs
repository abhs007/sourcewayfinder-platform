import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { evaluateRecovery, validateCatalog } from "../src/engine.js";
import { studySchedule, toCSV } from "../src/study.js";
const catalog = JSON.parse(readFileSync("content/catalog.json"));
const tasks = JSON.parse(readFileSync("content/tasks.json"));
for (const p of catalog.providers)
  for (const available of [true, false])
    test(`${p.name}: ${available ? "normal" : "limited"} resources retain endpoint boundaries`, () => {
      const report = evaluateRecovery(
        {
          provider: p.id,
          plan: p.plans[0],
          role: p.roles[0],
          goal: "restore",
          resources: {
            session: available ? "yes" : "no",
            password: "yes",
            email: "yes",
            sms: available ? "yes" : "no",
            authenticator: available ? "yes" : "no",
            activeDevice: available ? "yes" : "no",
          },
          protections: { sim: "yes", port: "yes" },
        },
        catalog,
        { asOf: "2026-11-17" },
      );
      assert.equal(report.results.length, 7);
      assert.equal(
        report.results.find((r) => r.operation === "sim").status,
        "unresolved",
      );
      assert(report.results.every((r) => r.sources.length));
      assert(!JSON.stringify(report).includes("guaranteed"));
    });
test("roles and plans cannot inherit unsupported authority", () => {
  for (const p of catalog.providers) {
    const report = evaluateRecovery(
      {
        provider: p.id,
        plan: "business",
        role: "member",
        goal: "restore",
        resources: {},
      },
      catalog,
    );
    assert(report.results.every((r) => r.status === "out_of_scope"));
  }
});
test("Visible conflict survives supplying both channels", () => {
  const r = evaluateRecovery(
    {
      provider: "visible",
      plan: "consumer",
      role: "owner",
      goal: "transfer",
      resources: { session: "yes", email: "yes", sms: "yes" },
    },
    catalog,
  );
  assert.equal(
    r.results.find((r) => r.operation === "protection").status,
    "conflicting",
  );
});
test("stale, unavailable and withdrawn guidance cannot become documented certainty", () => {
  const c = structuredClone(catalog);
  c.sources.forEach((s) => (s.availability = "unavailable"));
  let r = evaluateRecovery(tasks.find((t) => t.provider === "fi").context, c, {
    asOf: "2028-01-01",
  });
  assert(r.results.some((r) => r.warnings.length));
  c.rules
    .filter((r) => r.provider === "fi")
    .forEach((r) => (r.withdrawn = true));
  r = evaluateRecovery(tasks.find((t) => t.provider === "fi").context, c);
  assert(r.results.every((r) => r.status === "withdrawn"));
});
test("malformed catalogs and invalid answers are rejected", () => {
  assert.throws(() => validateCatalog({}));
  assert.throws(() =>
    evaluateRecovery(
      { ...tasks[0].context, resources: { password: "secret" } },
      catalog,
    ),
  );
  const c = structuredClone(catalog);
  c.rules[0].sourceIds = ["missing"];
  assert.throws(() => validateCatalog(c));
});
test("all four study schedules balance conditions and variants reproducibly", () => {
  for (let s = 1; s <= 4; s++) {
    const a = studySchedule(tasks, s, "seed");
    assert.deepEqual(a, studySchedule(tasks, s, "seed"));
    assert.equal(
      new Set(a.map((x) => tasks.find((t) => t.id === x.taskId).provider)).size,
      6,
    );
    assert.equal(a.filter((x) => x.condition === "navigator").length, 3);
    assert(a.every((x) => x.taskId.endsWith(s > 2 ? "B" : "A")));
  }
});
test("CSV preserves quotes and uses only the explicit session record", () => {
  const csv = toCSV({
    sessionId: "random",
    schedule: 1,
    seed: "seed",
    catalogVersion: "0.1.0",
    synthetic: true,
    results: [
      {
        taskId: "att-A",
        condition: "navigator",
        answer: 'a"b',
        correct: false,
        elapsedMs: 100,
        helpRequests: 1,
      },
    ],
  });
  assert(csv.includes('a""b'));
  assert(!csv.includes("password"));
});
test("deposited research files retain exact hashes", () => {
  const m = JSON.parse(readFileSync("research/manifest.json"));
  for (const f of m.files)
    assert.equal(
      createHash("sha256")
        .update(readFileSync("research/" + f.name))
        .digest("hex"),
      f.sha256,
    );
});
for (const fixture of JSON.parse(
  readFileSync("tests/fixtures/published-states.json"),
))
  test(`published resource assumptions ${fixture.id}: current interpretation remains bounded`, () => {
    const report = evaluateRecovery(fixture.context, catalog, {
      asOf: "2026-11-17",
    });
    assert.equal(
      report.results.find((r) => r.operation === "protection").status,
      fixture.expectedProtectionStatus,
    );
    assert.equal(
      report.results.find((r) => r.operation === "port").status,
      "unresolved",
    );
  });
