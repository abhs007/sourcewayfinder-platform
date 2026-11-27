export function seededShuffle(items, seed) {
  let n = 2166136261;
  for (const c of String(seed))
    n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function studySchedule(tasks, schedule, seed) {
  if (!Number.isInteger(schedule) || schedule < 1 || schedule > 4)
    throw new Error("Choose schedule 1–4.");
  const providers = [...new Set(tasks.map((t) => t.provider))];
  return seededShuffle(
    providers.map((p, i) => ({
      taskId: tasks.find(
        (t) => t.provider === p && t.variant === (schedule > 2 ? "B" : "A"),
      ).id,
      condition:
        i < 3 === (schedule % 2 === 1) ? "navigator" : "official-links",
    })),
    seed,
  );
}
export function toCSV(session) {
  const cell = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  const columns = [
    "sessionId",
    "schedule",
    "seed",
    "catalogVersion",
    "synthetic",
    "taskId",
    "condition",
    "answer",
    "correct",
    "elapsedMs",
    "helpRequests",
  ];
  return [
    columns.join(","),
    ...session.results.map((r) =>
      columns.map((k) => cell(r[k] ?? session[k])).join(","),
    ),
  ].join("\r\n");
}
