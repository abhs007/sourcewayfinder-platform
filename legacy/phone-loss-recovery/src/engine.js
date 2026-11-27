export const OPERATIONS = {
  suspension: "Suspend the lost line",
  device_block: "Block the lost handset",
  credentials: "Recover credentials",
  access: "Access the account",
  protection: "Manage the relevant protection",
  sim: "Replace a SIM or eSIM",
  port: "Transfer the number",
};
export const STATUSES = {
  documented_step: "Documented step",
  conditional: "Conditions remain",
  unresolved: "Not established",
  conflicting: "Sources disagree",
  out_of_scope: "Outside this guidance",
  withdrawn: "Guidance withdrawn",
};
const TRI = new Set(["yes", "no", "unknown"]);
export function validateCatalog(catalog) {
  if (
    !catalog ||
    !Array.isArray(catalog.providers) ||
    catalog.providers.length !== 6 ||
    !Array.isArray(catalog.sources) ||
    !Array.isArray(catalog.rules)
  )
    throw new Error("The guidance catalog is incomplete.");
  const unique = (a) => new Set(a.map((x) => x.id)).size === a.length;
  if (
    !unique(catalog.providers) ||
    !unique(catalog.sources) ||
    !unique(catalog.rules)
  )
    throw new Error("Duplicate catalog identifiers.");
  for (const s of catalog.sources)
    if (
      !/^https:\/\//.test(s.url) ||
      !s.title ||
      !s.locator ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.reviewed) ||
      !Number.isFinite(Date.parse(s.reviewed)) ||
      !s.summary
    )
      throw new Error("Invalid source record.");
  for (const p of catalog.providers)
    if (!p.plans?.length || !p.roles?.length)
      throw new Error("Missing provider scope.");
  for (const r of catalog.rules) {
    if (
      !catalog.providers.some((p) => p.id === r.provider) ||
      !OPERATIONS[r.operation] ||
      !STATUSES[r.status] ||
      !r.summary ||
      !r.scope ||
      !r.limitations ||
      !r.sourceIds?.length ||
      !r.plans?.length ||
      !r.roles?.length
    )
      throw new Error("Invalid guidance rule.");
    if (r.sourceIds.some((id) => !catalog.sources.some((s) => s.id === id)))
      throw new Error("Missing source reference.");
    if (r.requirements?.some((g) => !Array.isArray(g) || !g.length))
      throw new Error("Invalid prerequisite group.");
  }
  return catalog;
}
export function evaluateRecovery(
  context,
  catalog,
  { asOf = new Date().toISOString().slice(0, 10) } = {},
) {
  validateCatalog(catalog);
  const provider = catalog.providers.find((p) => p.id === context?.provider);
  if (!provider) throw new Error("Choose a supported provider.");
  if (!["secure", "restore", "transfer"].includes(context.goal))
    throw new Error("Choose a recovery goal.");
  for (const v of [
    ...Object.values(context.resources || {}),
    ...Object.values(context.protections || {}),
  ])
    if (!TRI.has(v)) throw new Error("Answers must be Yes, No or Not sure.");
  const results = Object.entries(OPERATIONS).map(([operation, title]) => {
    const candidates = catalog.rules.filter(
      (r) => r.provider === provider.id && r.operation === operation,
    );
    const r = candidates.find(
      (r) =>
        r.plans.includes(context.plan) &&
        r.roles.includes(context.role) &&
        (!r.goal || r.goal === context.goal),
    );
    const fallback = candidates[0];
    if (!r)
      return {
        operation,
        title,
        status: "out_of_scope",
        summary:
          "The selected plan or account role is outside the scope established by these instructions.",
        limitations:
          "Ask the provider which procedure and authority apply. This is not a finding that recovery is unavailable.",
        sources: catalog.sources.filter((s) =>
          fallback?.sourceIds.includes(s.id),
        ),
        warnings: [],
        missing: [],
      };
    const sources = catalog.sources.filter((s) => r.sourceIds.includes(s.id));
    const warnings = sources.flatMap((s) =>
      s.availability === "unavailable"
        ? [
            `${s.title}: source unavailable; current instructions need checking.`,
          ]
        : !Number.isFinite(Date.parse(asOf)) ||
            Date.parse(asOf) - Date.parse(s.reviewed) > 90 * 86400000
          ? [`${s.title}: source review is overdue.`]
          : [],
    );
    let status = r.withdrawn ? "withdrawn" : r.status;
    const missing = (r.requirements || [])
      .filter(
        (group) => !group.some((key) => context.resources?.[key] === "yes"),
      )
      .map((group) => group.join(" or "));
    if (
      missing.length &&
      !["conflicting", "withdrawn", "unresolved"].includes(status)
    )
      status = "conditional";
    if (warnings.length && status === "documented_step") status = "conditional";
    let summary = r.summary;
    if (operation === "protection") {
      const protection =
        context.protections?.[context.goal === "transfer" ? "port" : "sim"] ||
        "unknown";
      if (protection === "no")
        summary +=
          " You reported that the relevant protection is off; confirm its current state with the provider before relying on that answer.";
      if (protection === "unknown")
        summary +=
          " You are not sure whether this protection is active; verify its state through an official channel.";
    }
    return {
      operation,
      title,
      status,
      summary,
      scope: r.scope,
      limitations: r.limitations,
      sources,
      missing,
      warnings,
      ruleId: r.id,
    };
  });
  return {
    catalogVersion: catalog.version,
    asOf,
    provider: provider.name,
    context: structuredClone(context),
    results,
  };
}
