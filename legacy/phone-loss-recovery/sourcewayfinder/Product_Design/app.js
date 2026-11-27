"use strict";
const sources = {
  ssa: [
    {
      title: "SSA online replacement-card criteria",
      url: "https://secure.ssa.gov/POMS.NSF/LNX/0110205630",
      date: "November 20, 2026",
      note: "Review date carried from the existing demo. Fresh retrieval was unavailable during this design review.",
    },
    {
      title: "SSA replacement-card service",
      url: "https://www.ssa.gov/number-card/replace-card",
      date: null,
      note: "Official service link. Use SSA to confirm the route and current requirements.",
    },
  ],
  phone: [
    {
      title: "Verizon SIM Protection and Number Lock",
      url: "https://www.verizon.com/support/knowledge-base-309294/",
      date: "November 21, 2026",
      note: "Website controls require Account Owner or Manager access. The page also describes a delay after disabling SIM Protection.",
    },
    {
      title: "Verizon SIM-swapping guidance",
      url: "https://www.verizon.com/about/account-security/sim-swapping",
      date: "November 17, 2026",
      note: "Interpretation carried from the existing research demo; source page retrieved again during design review.",
    },
  ],
};
const procedures = {
  phone: {
    title: "Phone-number recovery",
    subtitle: "Verizon SIM Protection",
    scope:
      "This preview covers Verizon consumer postpaid SIM Protection. Coverage for the other studied carriers is planned.",
    questions: [
      {
        id: "postpaid",
        text: "Is this a Verizon consumer postpaid account?",
        help: "Prepaid and business accounts may have different procedures.",
      },
      {
        id: "role",
        text: "Are you the Account Owner or an Account Manager?",
        help: "Your account role determines whether you can manage this protection.",
      },
      {
        id: "signin",
        text: "Can you sign in to My Verizon?",
        help: "Answer for the app or website on a device you can currently use. Choose “I’m not sure” if you have not tried.",
      },
    ],
  },
  ssa: {
    title: "Replace a Social Security card",
    subtitle: "A replacement with no changes",
    scope:
      "This preview covers a replacement card with unchanged personal details, using the criteria in the existing demo.",
    questions: [
      {
        id: "nochange",
        text: "Are all your personal details staying the same?",
        help: "This route covers a straight replacement. A name or other record change needs a different assessment.",
      },
      {
        id: "adult",
        text: "Are you 18 or older?",
        help: "The online replacement route summarized here is for adults.",
      },
      {
        id: "citizen",
        text: "Are you a U.S. citizen with citizenship recorded by Social Security?",
        help: "Choose “I’m not sure” if you cannot confirm what is on your Social Security record.",
      },
      {
        id: "usmail",
        text: "Do you have a U.S. mailing address?",
        help: "The source criteria include APO, FPO, and DPO mailing addresses.",
      },
      {
        id: "stateid",
        text: "Do you have a current state ID accepted by SSA for online replacement?",
        help: "Participating states and document requirements can change. Confirm the current criteria with SSA, or choose “I’m not sure”.",
      },
      {
        id: "account",
        text: "Do you have a my Social Security online account?",
        help: "Use only the official SSA service to sign in or establish access.",
      },
    ],
  },
};
let flow = { topic: null, index: 0, answers: {} };
let initialized = false;
const main = document.querySelector("main");
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const link = (source) =>
  `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title} <span class="tiny">(opens a new tab)</span></a>`;
function navigate(route) {
  if (location.hash === "#" + route) render();
  else location.hash = route;
}
function start(topic) {
  flow = { topic, index: 0, answers: {} };
  navigate("questions");
}
function breadcrumb(label) {
  return `<div class="breadcrumbs"><a href="#home">All guidance</a><span aria-hidden="true">/</span><span>${label}</span></div>`;
}
function evidence(topic) {
  return `<aside class="aside"><h2>Evidence behind this guidance</h2><p>${procedures[topic].scope}</p>${sources[topic].map((s) => link(s)).join("")}<div class="meta">${topic === "ssa" ? "Source summary from the November 20 demo. A fresh source review is required before public release." : "Source page checked November 21, 2026. This preview uses a fixed set of rules."}</div><a href="#sources">View source details</a></aside>`;
}
function home() {
  return `<div class="home-layout"><div class="intro"><p class="eyebrow">Guidance for everyday procedures</p><h1>Understand your options.<br>Find your next step.</h1><p class="lede">Find the steps official sources support for your situation, with the conditions and open questions explained.</p><p class="tiny">An independent research prototype. Answers stay in this page for the current session.</p></div><section class="task-panel" aria-labelledby="task-title"><h2 id="task-title">What do you need help with?</h2><button class="task" data-start="phone"><span class="tag">Phone & account access</span><strong>Recover access to my phone number</strong><span>Start with Verizon SIM Protection and account access.</span></button><button class="task" data-start="ssa"><span class="tag">Identity documents</span><strong>Replace my Social Security card</strong><span>Check the route for a replacement with no changes.</span></button><p class="tiny">Choose a topic, answer a few questions, and see your options.</p><p><a href="survey.html">Help shape this tool — share your experience</a></p></section></div><section class="principles" aria-label="What to expect"><div><h3>Sources alongside the answer</h3><p>Follow links to the official instructions behind each route.</p></div><div><h3>Uncertainty made visible</h3><p>See which conditions still need clarification before proceeding.</p></div><div><h3>Your next step, in context</h3><p>Understand what a step enables and what you still need to check.</p></div></section>`;
}
function questions() {
  const p = procedures[flow.topic],
    q = p.questions[flow.index];
  return `${breadcrumb(p.title)}<div class="work-layout"><section><p class="eyebrow">${p.subtitle}</p><h1>Let’s check your situation.</h1><div class="step-meta"><span>Question ${flow.index + 1} of ${p.questions.length}</span><span>Choose what you know</span></div><div class="progress" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${p.questions.length}" aria-valuenow="${flow.index}"><span style="width:${(flow.index / p.questions.length) * 100}%"></span></div><form id="question-form"><fieldset class="question"><legend>${q.text}</legend><p class="help" id="question-help">${q.help}</p><div class="options">${[
    ["yes", "Yes"],
    ["no", "No"],
    ["unknown", "I’m not sure"],
  ]
    .map(
      ([v, t]) =>
        `<label class="option"><input type="radio" name="answer" value="${v}" aria-describedby="question-help" ${flow.answers[q.id] === v ? "checked" : ""} required><span>${t}</span></label>`,
    )
    .join(
      "",
    )}</div></fieldset><div class="actions">${flow.index ? '<button class="secondary" type="button" id="back">Previous question</button>' : ""}<button class="primary" id="continue" ${flow.answers[q.id] ? "" : "disabled"}>${flow.index === p.questions.length - 1 ? "See my guidance" : "Continue"}</button></div></form><p class="tiny" style="margin-top:24px">Answer only these general questions. Keep account numbers, passwords, and identity documents private.</p></section>${evidence(flow.topic)}</div>`;
}
function resultData() {
  const a = flow.answers,
    p = procedures[flow.topic];
  const unknown = p.questions.filter((q) => a[q.id] === "unknown");
  if (flow.topic === "phone") {
    const ready = p.questions.every((q) => a[q.id] === "yes");
    return {
      ready,
      title: ready
        ? "An account-control route is documented."
        : "Your recovery route needs clarification.",
      summary: ready
        ? "Verizon describes a way for an Account Owner or Manager to manage SIM Protection after signing in. Check the current instructions and any additional conditions."
        : "Your answers do not establish that you can use the documented account-control route. Recovery options for your situation need clarification from Verizon.",
      steps: ready
        ? [
            [
              "Open the official Verizon instructions",
              "Review the current SIM Protection procedure for the account and line you intend to manage.",
            ],
            [
              "Check your account’s security settings",
              "The website instructions direct you to Account, Account settings, then Security settings. Review any prompts before making a change.",
            ],
            [
              "Confirm the remaining conditions",
              "The source describes a delay after disabling protection. A SIM replacement or number transfer is a separate operation.",
            ],
          ]
        : [
            [
              "Identify the unresolved prerequisite",
              a.postpaid !== "yes"
                ? "Confirm which instructions apply to your account type."
                : a.role !== "yes"
                  ? "Confirm who has Account Owner or Manager access."
                  : "Ask Verizon what account-access options apply when you cannot sign in.",
            ],
            [
              "Ask through the official support channel",
              "Explain the missing prerequisite. The reviewed guidance states that retail and support staff cannot directly disable SIM Protection for you.",
            ],
            [
              "Confirm the next operation separately",
              "Ask which steps remain for a replacement SIM or number transfer once account access and protection settings are addressed.",
            ],
          ],
      uncertainty: ready
        ? "Additional security conditions and the outcome of a later SIM change need confirmation."
        : "The available rules cannot determine a complete recovery route for this situation.",
      url: sources.phone[0].url,
      action: "Open Verizon guidance",
      unknown,
    };
  }
  const ready = p.questions.every((q) => a[q.id] === "yes");
  return {
    ready,
    title: ready
      ? "Your answers match the summarized online criteria."
      : "SSA needs to confirm the applicable route.",
    summary: ready
      ? "The existing source summary describes an online replacement route for these conditions. Confirm the current criteria with SSA before applying."
      : "One or more conditions for this particular online replacement route remain unmet or uncertain. SSA can identify the applicable replacement or record-change process.",
    steps: ready
      ? [
          [
            "Check SSA’s current replacement service",
            "Confirm that the current identity-document and participating-state requirements apply to you.",
          ],
          [
            "Continue through the official SSA service",
            "Sign in only through SSA’s official website and follow its instructions.",
          ],
          [
            "Confirm the application outcome with SSA",
            "The official service will tell you whether the request can be completed online and what follow-up is needed.",
          ],
        ]
      : [
          [
            "Review the conditions that need attention",
            p.questions
              .filter((q) => a[q.id] !== "yes")
              .map((q) => q.text)
              .join(" "),
          ],
          [
            "Use SSA’s replacement-card service",
            "SSA can determine whether you can finish online, start online and follow up, or need an office visit.",
          ],
          [
            "Confirm documents and appointment requirements",
            "Use the route SSA provides for your situation before preparing or submitting documents.",
          ],
        ],
    uncertainty:
      "The SSA criteria were carried from the existing demo. Fresh retrieval was unavailable during this design review, so current eligibility remains subject to SSA confirmation.",
    url: sources.ssa[1].url,
    action: "Open SSA replacement service",
    unknown,
  };
}
function results() {
  const p = procedures[flow.topic],
    r = resultData();
  return `${breadcrumb(p.title)}<div class="work-layout"><section><span class="status ${r.ready ? "" : "warn"}">${r.ready ? "Documented route · conditions apply" : "Clarification needed"}</span><h1>${r.title}</h1><p class="result-intro">${r.summary}</p><ol class="steps-list">${r.steps.map(([t, d]) => `<li><div><h2>${t}</h2><p>${escapeHTML(d)}</p></div></li>`).join("")}</ol><div class="notice"><strong>What remains uncertain</strong><p>${r.uncertainty}</p></div><div class="actions"><a class="primary" href="${r.url}" target="_blank" rel="noopener noreferrer">${r.action}</a><button class="secondary" id="save">Download my guidance</button></div><p class="tiny" style="margin-top:12px">The official service opens in a new tab.</p><details><summary>Your answers</summary>${p.questions.map((q) => `<p><strong>${q.text}</strong><br>${{ yes: "Yes", no: "No", unknown: "I’m not sure" }[flow.answers[q.id]]}</p>`).join("")}<button class="secondary" id="edit">Edit my answers</button></details><details><summary>Does something look inconsistent?</summary><p>Create a report with the source and the detail that needs clarification. This preview prepares a downloadable draft for review.</p><a class="secondary" href="#report">Prepare an issue report</a></details><p id="download-status" class="tiny" role="status"></p></section>${evidence(flow.topic)}</div>`;
}
function sourcePage() {
  return `${breadcrumb("Source library")}<div class="page-head"><p class="eyebrow">Evidence & coverage</p><h1>Know where the guidance comes from.</h1><p class="lede">Official source links, review dates, and limitations for the two procedures in this preview.</p></div><div class="content">${Object.entries(
    sources,
  )
    .map(
      ([topic, list]) =>
        `<h2>${procedures[topic].title}</h2>${list.map((s) => `<article class="source"><h3>${link(s)}</h3><p class="tiny">${s.date ? "Recorded review date · " + s.date : "Official service destination"}</p><p>${s.note}</p></article>`).join("")}`,
    )
    .join(
      "",
    )}<div class="notice">This prototype uses a fixed source set. Automated discovery, scheduled synchronization, and owner notifications are proposed production capabilities.</div></div>`;
}
function method() {
  return `${breadcrumb("How it works")}<div class="page-head"><p class="eyebrow">Scope & privacy</p><h1>Guidance you can trace.</h1><p class="lede">A research prototype for turning official procedures into conditional, source-linked guidance.</p></div><div class="content"><h2>Start with your situation</h2><p>Choose a procedure and answer general questions about the conditions it requires. You can always select “I’m not sure”.</p><h2>See what the sources establish</h2><p>The preview evaluates a small set of explicit rules. It shows a documented route when the stated conditions match, and identifies the unresolved prerequisite when they do not.</p><h2>Use the official service to act</h2><p>Official organizations control their procedures and determine actual outcomes. This independent prototype has no agency or carrier endorsement.</p><h2>Your guidance answers stay in this session</h2><p>Guidance answers are held in this page’s memory. Refreshing clears them. Downloads are created locally when you choose to save guidance or an issue report.</p><p>The separate <a href="survey.html">experience survey</a> stores responses only after you agree to participate and submit through the survey service. Its own notice explains how responses are used.</p><h2>What is being developed</h2><p>Automatic source discovery, document-change monitoring, validated rule updates, issue delivery and tracking, and developer access are planned capabilities. The current interface demonstrates guidance and local report preparation.</p><a class="secondary" href="#sources">Review the source library</a></div>`;
}
function report() {
  return `${breadcrumb("Issue report")}<div class="page-head"><p class="eyebrow">Help clarify the guidance</p><h1>Document a potential issue.</h1><p class="lede">Include the official page and the detail that appears inconsistent. Keep personal and account information out of your report.</p></div><div class="content"><form id="report-form"><label class="report-label" for="report-url">Official source URL</label><input id="report-url" class="report-input" type="url" required value="${flow.topic ? sources[flow.topic][0].url : ""}" placeholder="https://"><label class="report-label" for="report-detail">What needs clarification?</label><textarea id="report-detail" class="report-input" required minlength="20" maxlength="4000" placeholder="Describe the relevant passages and the decision they leave unclear."></textarea><p class="tiny">Include at least 20 characters. Add a second source URL here if you are comparing two pages.</p><div class="actions"><button class="primary">Download report draft</button><a class="secondary" href="${flow.topic ? "#results" : "#home"}">Return to guidance</a></div><p class="tiny" style="margin-top:20px">Delivery to the source owner is planned for a future version. This action downloads a draft to your device.</p><p id="report-status" role="status"></p></form></div>`;
}
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bind() {
  document
    .querySelectorAll("[data-start]")
    .forEach((b) => b.addEventListener("click", () => start(b.dataset.start)));
  const form = document.querySelector("#question-form");
  if (form) {
    form.addEventListener("change", (e) => {
      flow.answers[procedures[flow.topic].questions[flow.index].id] =
        e.target.value;
      document.querySelector("#continue").disabled = false;
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (flow.index < procedures[flow.topic].questions.length - 1) {
        flow.index++;
        render();
      } else navigate("results");
    });
    document.querySelector("#back")?.addEventListener("click", () => {
      flow.index--;
      render();
    });
  }
  document.querySelector("#edit")?.addEventListener("click", () => {
    flow.index = 0;
    navigate("questions");
  });
  document.querySelector("#save")?.addEventListener("click", () => {
    const r = resultData();
    download(
      "guidance-summary.txt",
      [
        procedures[flow.topic].title,
        "Research prototype",
        r.title,
        r.summary,
        ...r.steps.map(([t, d]) => t + "\n" + d),
        "Uncertainty\n" + r.uncertainty,
        "Sources",
        ...sources[flow.topic].map(
          (s) =>
            s.title +
            "\n" +
            s.url +
            "\nRecorded review: " +
            (s.date || "Not recorded"),
        ),
      ].join("\n\n"),
    );
    document.querySelector("#download-status").textContent =
      "Guidance download prepared.";
  });
  document.querySelector("#report-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    const url = document.querySelector("#report-url").value;
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      document
        .querySelector("#report-url")
        .setCustomValidity("Enter an HTTP or HTTPS source URL.");
      document.querySelector("#report-url").reportValidity();
      return;
    }
    download(
      "guidance-issue-draft.txt",
      [
        "Potential guidance issue — draft for review",
        "Prepared " + new Date().toISOString(),
        "Source: " + url,
        "Procedure: " +
          (flow.topic ? procedures[flow.topic].title : "Not specified"),
        document.querySelector("#report-detail").value,
        "Status: prepared locally. Owner and delivery channel require verification.",
      ].join("\n\n"),
    );
    const status = document.querySelector("#report-status");
    status.className = "feedback";
    status.textContent =
      "Your report draft is ready to download. Review its evidence and recipient before sending.";
  });
  document
    .querySelector("#report-url")
    ?.addEventListener("input", (e) => e.target.setCustomValidity(""));
}
function render() {
  let route = location.hash.slice(1) || "home";
  if (["questions", "results"].includes(route) && !flow.topic) route = "home";
  if (
    route === "results" &&
    procedures[flow.topic].questions.some((q) => !flow.answers[q.id])
  )
    route = "questions";
  const pages = {
    home,
    questions,
    results,
    sources: sourcePage,
    method,
    report,
  };
  main.innerHTML = (pages[route] || home)();
  main.classList.remove("view-enter");
  void main.offsetWidth;
  main.classList.add("view-enter");
  bind();
  window.scrollTo(0, 0);
  if (initialized) main.focus({ preventScroll: true });
  initialized = true;
}
window.addEventListener("hashchange", render);
render();
