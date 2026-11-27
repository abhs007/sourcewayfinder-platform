import { landingHTML } from "./landing.js";
import { quickHelp } from "./quick-help.js";
import { evaluateRecovery, validateCatalog, STATUSES } from "./engine.js";
import { studySchedule, seededShuffle, toCSV } from "./study.js";
export const escapeHTML = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const h = escapeHTML;
const resourceNames = {
  session: "An existing signed-in account session",
  password: "The account password is remembered",
  email: "Email accessible without the lost phone",
  authenticator: "An independent authenticator or configured second factor",
  sms: "SMS to the affected line is reachable",
  activeDevice: "Another active eligible account device",
};
const link = (s) =>
  `<a href="${h(s.url)}" target="_blank" rel="noopener noreferrer">${h(s.title)} ↗</a>`;
const options = (items, value) =>
  items
    .map(
      ([id, label]) =>
        `<option value="${h(id)}" ${id === value ? "selected" : ""}>${h(label)}</option>`,
    )
    .join("");
const tri = (name, label, value = "unknown") =>
  `<label>${h(label)}<select name="${h(name)}">${options(
    [
      ["unknown", "Not sure"],
      ["yes", "Yes"],
      ["no", "No"],
    ],
    value,
  )}</select></label>`;
export async function mountRecoveryModule(
  root,
  {
    basePath = "/",
    view = "home",
    dataPath = basePath + "data/",
    brand = "Phone-Loss Recovery",
    initialContext,
  } = {},
) {
  let catalog, tasks, historical;
  const lifecycle = new AbortController();
  const defaultContext = () => ({
      goal: "restore",
      provider: "tmobile",
      plan: "postpaid",
      role: "owner",
      resources: Object.fromEntries(
        Object.keys(resourceNames).map((k) => [k, "unknown"]),
      ),
      protections: { sim: "unknown", port: "unknown" },
    });
  let context = initialContext || defaultContext();
  let step = 0, large = false;
  // Browser history carries only opaque keys. Drafts and answers live in this mount.
  const screens = new Map();
  const firstScreen = () => view === "navigator"
    ? { kind: "checklist", step: 0, context: structuredClone(initialContext || defaultContext()) }
    : { kind: "home" };
  let screen = firstScreen();
  let screenLife = new AbortController();
  function show(next, moveFocus = true) {
    screenLife.abort();
    screenLife = new AbortController();
    screen = next;
    if (screen.kind === "home") home();
    else if (screen.kind === "checklist") {
      step = screen.step;
      context = screen.context;
      navigator();
    } else openHelp();
    if (moveFocus) focus();
  }
  function visit(next, { reset = false } = {}) {
    if (reset) screens.clear();
    const key = crypto.randomUUID();
    history.pushState({ ...history.state, plrScreen: key }, "");
    screens.set(key, next);
    show(next);
  }
  function enableHistory() {
    const key = crypto.randomUUID();
    history.replaceState({ ...history.state, plrScreen: key }, "");
    screens.set(key, screen);
    window.addEventListener("popstate", (event) => {
      const target = screens.get(event.state?.plrScreen) || firstScreen();
      if (screen.kind === "home" && target.kind === "home") return;
      show(target);
      if (target.kind === "home" && location.hash === "#plr-finders")
        root.querySelector("#plr-finders")?.focus();
    }, { signal: lifecycle.signal });
  }
  let taskIndex = 0,
    practiceAnswer = null,
    study = null,
    taskStarted = 0,
    helpRequests = 0,
    selectedAnswer = null;
  root.classList.add("plr");
  const closedForPrint = [];
  const beforePrint = () => {
    closedForPrint.length = 0;
    for (const d of root.querySelectorAll("details:not([open])")) {
      closedForPrint.push(d);
      d.open = true;
    }
  };
  const afterPrint = () => {
    for (const d of closedForPrint) d.open = false;
    closedForPrint.length = 0;
  };
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  const route = (p) => basePath + (p ? p + "/" : "");
  function shell(body) {
    root.classList.remove("plr-landing");
    root.innerHTML = `<header class="plr-header"><a class="plr-brand" href="${h(route(""))}">${h(brand)}</a><button type="button" data-size aria-pressed="${large}">Larger text</button><nav aria-label="Recovery navigation">${[
      ["navigator", "Navigator"],
      ["practice", "Practice"],
      ["evidence", "Evidence"],
      ["study", "Study"],
      ["methodology", "Methodology"],
    ]
      .map(
        ([p, n]) =>
          `<a href="${h(route(p))}" ${view === p ? 'aria-current="page"' : ""}>${n}</a>`,
      )
      .join(
        "",
      )}</nav></header><div class="plr-content">${body}</div><footer class="plr-footer">Independent educational project by Abhishek Vaishnav. No carrier affiliation or account actions. <a href="https://doi.org/10.5281/zenodo.24301157">Research preprint</a> · <a href="https://github.com/abhs007/phone-loss-recovery">Source and contributions</a><p>Code MIT · Original educational content CC BY 4.0 · Third-party rights retained.</p></footer>`;
    for (const label of root.querySelectorAll("label")) {
      const select = label.querySelector("select");
      if (select)
        select.setAttribute(
          "aria-label",
          [...label.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .trim(),
        );
    }
    bindSize();
  }
  function bindSize() {
    const button = root.querySelector("[data-size]");
    button.hidden = false;
    button.setAttribute("aria-pressed", String(large));
    root.classList.toggle("plr-large", large);
    root.querySelector("[data-size]").onclick = () => {
      large = !large;
      root.classList.toggle("plr-large", large);
      root
        .querySelector("[data-size]")
        .setAttribute("aria-pressed", String(large));
    };
  }
  const focus = () => {
    const t = root.querySelector("h1");
    if (t) {
      t.tabIndex = -1;
      t.focus({ preventScroll: true });
    }
  };
  function reportHTML(report) {
    const context = report.context;
    return `<section class="plr-print-summary"><h2>Your selected context</h2><p>${h(report.provider)} · ${h(context.plan)} · ${h(context.role)} · ${h(context.goal)}</p><dl>${Object.entries(
      context.resources,
    )
      .map(([k, v]) => `<dt>${h(resourceNames[k])}</dt><dd>${h(v)}</dd>`)
      .join(
        "",
      )}<dt>SIM/device protection active</dt><dd>${h(context.protections.sim)}</dd><dt>Port-out protection active</dt><dd>${h(context.protections.port)}</dd></dl></section><p class="plr-note">Catalog ${h(report.catalogVersion)} · Sources checked ${h(catalog.reviewed)}. These are operation-specific instructions and questions, not a guarantee or a required universal sequence.</p><div class="plr-results">${report.results
      .map(
        (r) =>
          `<article class="plr-card"><span class="plr-status ${h(r.status)}">${STATUSES[r.status]}</span><h2>${h(r.title)}</h2><p>${h(r.summary)}</p>${
            r.missing.length
              ? `<p><strong>Not confirmed available:</strong> ${h(
                  r.missing
                    .map((g) =>
                      g
                        .split(" or ")
                        .map((k) => resourceNames[k] || k)
                        .join(" or "),
                    )
                    .join("; "),
                )}.</p>`
              : ""
          }${r.warnings.map((w) => `<p class="plr-warning">${h(w)}</p>`).join("")}<p class="plr-muted">${h(r.limitations)}</p><details><summary>Evidence and scope</summary><p>${h(r.scope)}</p>${r.sources.map((s) => `<p>${link(s)}<br>${h(s.locator)} · Checked ${h(s.reviewed)}</p>`).join("")}</details><p><strong>Ask the provider:</strong> Which proof, account authority and channel apply to this operation with my remaining resources?</p></article>`,
      )
      .join("")}</div>`;
  }
  function navigator() {
    const p = catalog.providers.find((p) => p.id === context.provider);
    let body = "";
    if (step === 0)
      body = `<h1>What do you need to do?</h1><p>Use categories only. This tool never needs your phone number, password, verification code or identity documents.</p><label>My goal<select name="goal">${options(
        [
          ["restore", "Restore service on a replacement phone"],
          ["secure", "Secure a lost phone or line"],
          ["transfer", "Transfer my number to another carrier"],
        ],
        context.goal,
      )}</select></label>`;
    if (step === 1)
      body = `<h1>Your provider and account scope</h1><label>Provider<select name="provider">${options(
        catalog.providers.map((p) => [p.id, p.name]),
        context.provider,
      )}</select></label><label>Plan<select name="plan">${options([...p.plans.map((v) => [v, v === "consumer" ? "Consumer plan" : v[0].toUpperCase() + v.slice(1)]), ["business", "Business / enterprise"], ["unknown", "Not sure"]], context.plan)}</select></label><label>Account role<select name="role">${options(
        [
          ["owner", "Owner / Primary Account Holder / Primary Line"],
          ["manager", "Manager / Admin / Secondary access"],
          ["member", "Other member / Authorized User"],
          ["unknown", "Not sure"],
        ],
        context.role,
      )}</select></label><p class="plr-note" data-role-note>${h(p.roleNote)}</p>`;
    if (step === 2)
      body = `<h1>What can you still access?</h1><p>A resource counts only if it is available without the lost phone. Do not turn off a protection merely to try this tool.</p><div class="plr-fields">${Object.entries(
        resourceNames,
      )
        .map(([k, v]) => tri(k, v, context.resources[k]))
        .join(
          "",
        )}${tri("sim", "SIM/device protection is active", context.protections.sim)}${tri("port", "Port-out protection is active", context.protections.port)}</div>`;
    if (step === 3)
      body = `<h1>Your recovery checklist</h1><div class="plr-actions plr-no-print"><button type="button" data-edit>Edit answers</button><button type="button" data-print>Print checklist</button></div>${reportHTML(evaluateRecovery(context, catalog))}`;
    shell(
      `<p class="plr-eyebrow">Your resources, your next questions · Step ${step + 1} of 4</p><form data-navigator>${body}<div class="plr-actions plr-no-print">${step > 0 ? '<button type="button" data-back>Back</button>' : ""}${step < 3 ? `<button class="plr-primary" type="submit">${step === 2 ? "Show my checklist" : "Continue"}</button>` : ""}<button type="button" data-reset>Start over</button></div></form>`,
    );
    root.querySelector("[name=provider]")?.addEventListener("change", (e) => {
      save();
      context.provider = e.target.value;
      const selected = catalog.providers.find((p) => p.id === context.provider);
      context.plan = selected.plans[0];
      root.querySelector("[name=plan]").innerHTML = options(
        [
          ...selected.plans.map((v) => [v, v]),
          ["business", "Business / enterprise"],
          ["unknown", "Not sure"],
        ],
        context.plan,
      );
      root.querySelector("[data-role-note]").textContent = selected.roleNote;
    });
    root.querySelector("form").onchange = save;
    root.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      save();
      visit({ kind: "checklist", step: step + 1, context });
    };
    root.querySelector("[data-back]")?.addEventListener("click", () => {
      save();
      history.back();
    });
    root.querySelector("[data-edit]")?.addEventListener("click", () => {
      visit({ kind: "checklist", step: 1, context });
    });
    root
      .querySelector("[data-print]")
      ?.addEventListener("click", () => window.print());
    root.querySelector("[data-reset]").onclick = () => {
      visit({ kind: "checklist", step: 0, context: defaultContext() }, { reset: true });
    };
  }
  function save() {
    for (const select of root.querySelectorAll("select[name]")) {
      const k = select.name;
      if (k in context.resources) context.resources[k] = select.value;
      else if (k === "sim" || k === "port")
        context.protections[k] = select.value;
      else context[k] = select.value;
    }
  }
  function evidence() {
    shell(
      `<h1>Evidence you can inspect</h1><p>Current guidance was checked ${h(catalog.reviewed)}. Published research is a separate historical collection. Neither collection establishes live carrier enforcement.</p><form class="plr-filters"><label>Collection<select name="collection"><option value="current">Current guidance</option><option value="historical">Published corpus · November 2026</option></select></label><label>Provider<select name="provider"><option value="">All providers</option>${options(
        catalog.providers.map((p) => [p.id, p.name]),
        "",
      )}</select></label><label>Operation<select name="operation"><option value="">All operations</option>${options(Object.entries(awaitlessOperations()), "")}</select></label><label>Scope<select name="scope"><option value="">All scopes</option>${options(
        ["consumer", "postpaid", "prepaid"].map((x) => [x, x]),
        "",
      )}</select></label><label>Evidence status<select name="status"><option value="">All statuses</option>${options([...Object.entries(STATUSES), ["documented", "Historical: documented"], ["unknown", "Historical: unknown"], ["announced", "Historical: announced"]], "")}</select></label></form><p data-count role="status"></p><div data-evidence></div>`,
    );
    const render = () => {
      const f = new FormData(root.querySelector("form"));
      const provider = catalog.providers.find(
        (p) => p.id === f.get("provider"),
      );
      const old = f.get("collection") === "historical";
      let rows = old ? historical.observations : catalog.rules;
      rows = rows.filter(
        (r) =>
          (!provider ||
            (old
              ? r.provider === provider.name
              : r.provider === provider.id)) &&
          (!f.get("operation") ||
            (old
              ? (r.property + " " + r.scope)
                  .toLowerCase()
                  .includes(f.get("operation"))
              : r.operation === f.get("operation"))) &&
          (!f.get("scope") ||
            (old
              ? r.scope.toLowerCase().includes(f.get("scope"))
              : r.plans.includes(f.get("scope")))) &&
          (!f.get("status") || r.status === f.get("status")),
      );
      root.querySelector("[data-count]").textContent =
        `${rows.length} ${old ? "historical observations" : "current guidance entries"}`;
      root.querySelector("[data-evidence]").innerHTML = old
        ? `<p class="plr-note">Unmodified deposited observations. Historical status/provenance wording is preserved. These fifty records are not independent measurements or current policy. <a href="${h(basePath + "research/Scenario_Definitions.md")}">Published scenario definitions</a></p>` +
          rows
            .map(
              (r) =>
                `<article class="plr-card"><h2>${h(r.id)} · ${h(r.provider)}</h2><p>${h(r.scope)} · ${h(r.property)} · ${h(r.status)}</p><p>${h(r.value)}</p><p>${h(r.caveat)}</p>${historical.sources
                  .filter((s) => s.id === r.source)
                  .map(link)
                  .join("")}</article>`,
            )
            .join("")
        : rows
            .map(
              (r) =>
                `<article class="plr-card"><h2>${h(r.id)}</h2><p>${h(r.scope)} · ${h(STATUSES[r.status])}</p><p>${h(r.summary)}</p><p>${h(r.limitations)}</p>${catalog.sources
                  .filter((s) => r.sourceIds.includes(s.id))
                  .map(
                    (s) =>
                      `<p>${link(s)}<br>${h(s.locator)} · Checked ${h(s.reviewed)}<br>${h(s.reviewMethod)}</p>`,
                  )
                  .join("")}</article>`,
            )
            .join("");
    };
    root.querySelector("form").onchange = render;
    render();
  }
  function awaitlessOperations() {
    return {
      suspension: "Line suspension",
      device_block: "Handset blocking",
      credentials: "Credential recovery",
      access: "Account access",
      protection: "Protection removal",
      sim: "SIM/eSIM replacement",
      port: "Number transfer",
    };
  }
  function choices(task, selected) {
    return seededShuffle(task.choices, task.id)
      .map(
        (c) =>
          `<label class="plr-choice"><input type="radio" name="answer" value="${h(c.id)}" ${selected === c.id ? "checked" : ""} required> ${h(c.label)}</label>`,
      )
      .join("");
  }
  function practice() {
    const task = tasks[taskIndex];
    shell(
      `<h1>Practice a phone-loss decision</h1><p>Fictional task ${taskIndex + 1} of ${tasks.length}. Your choices stay in this tab.</p><label>Choose a task<select data-task>${options(
        tasks.map((t, i) => [
          String(i),
          catalog.providers.find((p) => p.id === t.provider).name +
            " · " +
            t.variant,
        ]),
        String(taskIndex),
      )}</select></label><article class="plr-card"><h2>${h(task.question)}</h2><form><fieldset><legend>Which claim is supported?</legend>${choices(task, practiceAnswer)}</fieldset><button class="plr-primary" type="submit">Check my answer</button></form>${
        practiceAnswer
          ? `<div role="status" class="plr-note"><strong>${practiceAnswer === task.correctAnswer ? "Supported interpretation." : "Revisit the evidence."}</strong> ${h(task.explanation)}<p>This describes task comprehension, not personal security.</p>${catalog.sources
              .filter((s) => task.sourceIds.includes(s.id))
              .map(link)
              .join(
                "<br>",
              )}</div><button type="button" data-next>Next task</button>`
          : ""
      }</article>`,
    );
    root.querySelector("[data-task]").onchange = (e) => {
      taskIndex = Number(e.target.value);
      practiceAnswer = null;
      practice();
    };
    root.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      practiceAnswer = new FormData(e.target).get("answer");
      practice();
      root.querySelector("[role=status]").scrollIntoView({ block: "nearest" });
    };
    root.querySelector("[data-next]")?.addEventListener("click", () => {
      taskIndex = (taskIndex + 1) % tasks.length;
      practiceAnswer = null;
      practice();
      focus();
    });
  }
  function exportSession(type) {
    const text =
      type === "json" ? JSON.stringify(study, null, 2) : toCSV(study);
    const url = URL.createObjectURL(
      new Blob([text], {
        type: type === "json" ? "application/json" : "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `phone-loss-session-${study.sessionId}.${type}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function studyView() {
    if (!study) {
      shell(
        `<h1>Local study session</h1><p>This is an instrument for a facilitator-led fictional study, not recruitment or research approval. Follow the protocol and any required ethics determination before involving participants.</p><p>Six tasks compare the navigator with official-source links. Answers, elapsed time and help requests stay in this tab; nothing is uploaded. Results exist only until deletion or leaving this page. Downloaded files remain on the device until you delete them.</p><form><label>Counterbalance schedule<select name="schedule">${options(
          [1, 2, 3, 4].map((x) => [String(x), "Schedule " + x]),
          "1",
        )}</select></label><label class="plr-choice"><input name="synthetic" type="checkbox" checked> Development / synthetic session</label><label class="plr-choice"><input name="consent" type="checkbox" required> I understand the local data handling and agree to begin this fictional session.</label><button type="submit" class="plr-primary">Begin local session</button></form>`,
      );
      root.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target),
          seed = crypto.randomUUID();
        study = {
          sessionId: crypto.randomUUID(),
          seed,
          schedule: Number(f.get("schedule")),
          catalogVersion: catalog.version,
          synthetic: f.has("synthetic"),
          results: [],
          tasks: studySchedule(tasks, Number(f.get("schedule")), seed),
        };
        taskStarted = performance.now();
        studyView();
        focus();
      };
      return;
    }
    const complete = study.results.length === study.tasks.length;
    if (complete) {
      shell(
        `<h1>Session complete</h1><p>${study.results.filter((r) => r.correct).length} of 6 task interpretations matched the rubric. This is a small fictional-task record, not recovery success or fraud reduction.</p><div class="plr-actions"><button data-json>Download JSON</button><button data-csv>Download CSV</button><button data-delete>Delete this session</button></div><p>No upload has occurred. Exports include the random session ID, schedule, seed, catalog version, task answers, rubric matches, elapsed milliseconds and help requests.</p>${study.results.map((r) => `<article class="plr-card"><h2>${h(r.taskId)} · ${r.correct ? "Matched rubric" : "Review needed"}</h2><p>${h(tasks.find((t) => t.id === r.taskId).explanation)}</p></article>`).join("")}`,
      );
      root.querySelector("[data-json]").onclick = () => exportSession("json");
      root.querySelector("[data-csv]").onclick = () => exportSession("csv");
    } else {
      const slot = study.tasks[study.results.length],
        task = tasks.find((t) => t.id === slot.taskId);
      shell(
        `<h1>Study task ${study.results.length + 1} of 6</h1><p>Condition: <strong>${h(slot.condition)}</strong>. No correctness feedback appears until the session ends.</p><article class="plr-card"><h2>${h(task.question)}</h2>${
          slot.condition === "navigator"
            ? `<details><summary>Open navigator guidance for this fictional context</summary>${reportHTML(evaluateRecovery(task.context, catalog))}</details>`
            : `<div class="plr-note"><h3>Official source material</h3>${catalog.sources
                .filter((s) => task.sourceIds.includes(s.id))
                .map(link)
                .join(
                  "<br>",
                )}<p>Read the official instructions in a new tab, then return to answer.</p></div>`
        }<form><fieldset><legend>Which claim is supported?</legend>${choices(task, selectedAnswer)}</fieldset><button class="plr-primary" type="submit">Submit task answer</button></form><button type="button" data-help>Request help</button><p data-help-status role="status"></p></article><button type="button" data-delete>Delete this session</button>`,
      );
      root.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        const answer = new FormData(e.target).get("answer");
        study.results.push({
          taskId: task.id,
          condition: slot.condition,
          answer,
          correct: answer === task.correctAnswer,
          elapsedMs: Math.max(0, Math.round(performance.now() - taskStarted)),
          helpRequests,
        });
        helpRequests = 0;
        selectedAnswer = null;
        taskStarted = performance.now();
        studyView();
        focus();
      };
      root.querySelector("[data-help]").onclick = () => {
        helpRequests++;
        root.querySelector("[data-help-status]").textContent =
          "Help request recorded. You can ask the facilitator to clarify the task wording. No correctness feedback is provided yet.";
      };
    }
    root.querySelector("[data-delete]").onclick = () => {
      study = null;
      selectedAnswer = null;
      helpRequests = 0;
      studyView();
      focus();
    };
  }
  function methodology() {
    shell(
      `<h1>How this guidance is built</h1><section class="plr-card"><h2>Evidence and its boundaries</h2><p>The published documentation study examines sixteen official pages, fifty observations and twelve hypothetical states. Its frozen collection is available in the evidence explorer. Current guidance is versioned separately and was reinspected on ${h(catalog.reviewed)}. Reinspection and software testing are not independent human coding or live carrier validation.</p><p>Credential recovery, account access, protection removal and operation completion have different endpoints. Unknown means the inspected evidence does not establish a step; it does not mean recovery is impossible. Sources can omit exceptions or disagree.</p><h2>Maintenance and corrections</h2><p>Review target: 90 days. Weekly monitoring checks availability and content changes without rewriting rules. Confirmed material changes withdraw affected guidance pending review. Open a source-correction issue with a public URL and scope, never account information.</p><h2>Research use</h2><p>Study mode compares fictional-task comprehension with official-source links. Before recruitment, follow the facilitator protocol, consent process and any required research review. Small feasibility results do not establish population effectiveness.</p><h2>Open contribution</h2><p>See the repository’s contribution guide, study protocol and source-review process. Original code uses MIT and original educational content uses CC BY 4.0; carrier material and trademarks retain their own rights. Contributions must cite official sources and preserve plan, role, channel and endpoint distinctions.</p><a href="https://github.com/abhs007/phone-loss-recovery">Repository and research materials</a></section>`,
    );
  }
  function home() {
    root.classList.add("plr-landing");
    const paths = Object.fromEntries(["home", "navigator", "practice", "evidence", "methodology", "study"]
      .map(key => [key, h(route(key === "home" ? "" : key))]));
    root.innerHTML = landingHTML({ ...paths, brand: h(brand) });
    bindSize();
    const entries = root.querySelectorAll("[data-entry]");
    for (const button of entries) {
      button.disabled = false;
      button.onclick = async () => {
        for (const entry of entries) entry.disabled = true;
        const status = root.querySelector(".plr-load-status");
        status.textContent = "Opening guidance…";
        try {
          if (!catalog) await loadData();
          if (lifecycle.signal.aborted || !button.isConnected) return;
          visit(button.dataset.entry === "story" ? { kind: "story" } : { kind: "quick", need: "secure" });
        } catch {
          catalog = null;
          if (lifecycle.signal.aborted) return;
          status.textContent = "Guided help couldn’t load. Try again or open an official device finder below.";
          for (const entry of entries) entry.disabled = false;
          button.focus();
        }
      };
    }
  }
  function openHelp() {
    quickHelp({
      screen,
      visit,
      root,
      catalog,
      shell,
      route,
      escape: h,
      link,
      signal: screenLife.signal,
      openChecklist(provider, need, missingSMS) {
        const draft = defaultContext();
        draft.resources.sms = missingSMS ? "no" : "unknown";
        draft.provider = provider;
        draft.goal = need === "access" ? "restore" : need;
        draft.plan = draft.role = "unknown";
        visit({ kind: "checklist", step: 1, context: draft });
      },
    });
  }
  async function loadData() {
      const fetchJSON = async (n) => {
        const r = await fetch(dataPath + n, { cache: "no-store" });
        if (!r.ok) throw Error("A required guidance file could not be loaded.");
        return r.json();
      };
      [catalog, tasks, historical] = await Promise.all(
        ["catalog.json", "tasks.json", "historical.json"].map(fetchJSON),
      );
      validateCatalog(catalog);
      if (
        !Array.isArray(tasks) ||
        tasks.length !== 12 ||
        !Array.isArray(historical.observations) ||
        tasks.some((t) => !t.choices?.some((c) => c.id === t.correctAnswer))
      )
        throw Error("The practice or research data is incomplete.");
  }
  async function load() {
    if (view === "home") { enableHistory(); show(screen, false); return; }
    try {
      root.innerHTML = '<p role="status">Loading the guidance catalog…</p>';
      await loadData();
      if (view === "navigator") { enableHistory(); show(screen, false); return; }
      (
        ({
          navigator,
          practice,
          evidence,
          study: studyView,
          methodology,
          home,
        })[view] || home
      )();
    } catch {
      shell(
        '<h1>Guidance is unavailable</h1><p role="alert">The required guidance could not be loaded or validated. Reconnect and try again. No recovery result has been inferred.</p><button data-retry>Try again</button>',
      );
      root.querySelector("[data-retry]").onclick = load;
    }
  }
  await load();
  return {
    destroy() {
      lifecycle.abort();
      screenLife.abort();
      screens.clear();
      study = null;
      context = null;
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      root.replaceChildren();
    },
  };
}
