// These links open official support. They do not establish authorization for any account action.
const carriers = {
  att: [
    /\b(?:at\s*(?:&|and)\s*t|att)\b/i,
    "https://www.att.com/support/wireless/",
  ],
  tmobile: [/\bt[ -]?mobile\b/i, "https://www.t-mobile.com/contact-us"],
  verizon: [/\bverizon\b/i, "https://www.verizon.com/support/contact-us/"],
  fi: [/\bgoogle fi\b/i, "https://support.google.com/fi/"],
  visible: [/\bvisible\b/i, "https://www.visible.com/m/help/contact-us"],
  usmobile: [/\bu\.?s\.?[ -]?mobile\b/i, "https://www.usmobile.com/help/"],
};
const needs = {
  secure: {
    choice: "Protect my missing phone",
    match: /\b(stolen|stole|suspend|block my phone|protect my (phone|line))\b/i,
    operation: "suspension",
    title: "Ask about protecting your line",
    question:
      "My phone is missing. How can I suspend this line, and how would that affect getting my number back? If I also need to block the handset, what should I do?",
  },
  restore: {
    choice: "Get my number working again",
    match:
      /\b(replacement|restore|new phone|(?:get|need|want) my (?:service|number) (?:back|working))\b/i,
    operation: "sim",
    title: "Ask how to activate a replacement SIM",
    question:
      "I need my number working on a replacement phone. What verification can I use without the missing phone, and who on my account is authorized to make this change?",
  },
  access: {
    choice: "I can’t sign in",
    match:
      /\b(sign in|log in|locked out|verification code|one.time code|can.?t get (?:the |a )?code)\b/i,
    operation: "access",
    title: "Ask how to verify your account",
    question:
      "I need to access my account without my usual phone. Which verification options apply to my plan and account role?",
  },
  transfer: {
    choice: "Move my number to another carrier",
    match:
      /\b(port out|port my number|switch carriers?|transfer my number|another carrier)\b/i,
    operation: "port",
    title: "Check the requirements for moving your number",
    question:
      "I want to transfer this number. Which account permissions, transfer credentials and protection settings do I need to check?",
  },
};

export function readSituation(text) {
  const normalized = text.replace(/[’‘]/g, "'").replace(/[‐‑–]/g, "-");
  const uncertainCarrier =
    /\b(?:not (?:on|with)|used to (?:use|have)|switched from|borrowed (?:a |an )?(?:t-mobile|verizon|at&t|visible|google fi|us mobile))\b/i.test(
      normalized,
    );
  const matches = Object.entries(carriers).filter(([, [pattern]]) =>
    pattern.test(normalized),
  );
  const goals = Object.keys(needs).filter((key) =>
    needs[key].match.test(normalized),
  );
  return {
    provider: !uncertainCarrier && matches.length === 1 ? matches[0][0] : "",
    need:
      goals.length === 1 &&
      !/\b(?:don't|do not|never) (?:want to )?(?:suspend|block|transfer|port|switch|restore)\b/i.test(
        normalized,
      )
        ? goals[0]
        : "",
    missingSMS:
      /\b(?:can't|cannot|unable to) (?:get|receive) (?:any |my |a |the )?(?:text messages?|texts|sms|text codes?)\b/i.test(
        normalized,
      ),
  };
}

// Recognition must stay on the device, including when the browser offers a remote fallback.
function enableDictation(form, signal) {
  const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Speech?.available || !("processLocally" in Speech.prototype)) return;
  const button = form.querySelector("[data-dictate]");
  const input = form.querySelector("textarea");
  const status = form.querySelector("[role=status]");
  let recognition;
  button.hidden = false;
  const stop = () => {
    recognition?.abort();
    recognition = null;
  };
  form.addEventListener("submit", stop, { capture: true });
  form.addEventListener("click", (e) => {
    if (e.target !== button) stop();
  });
  window.addEventListener("pagehide", stop, {
    once: true,
    signal,
  });
  signal.addEventListener("abort", stop, { once: true });
  button.onclick = async () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    try {
      button.disabled = true;
      const availability = await Speech.available({
        langs: ["en-US"],
        processLocally: true,
      });
      if (signal.aborted || !form.isConnected) return;
      if (availability !== "available") {
        status.textContent =
          "On-device English dictation is unavailable here. Type or choose from the list.";
        return;
      }
      const active = new Speech();
      recognition = active;
      active.lang = "en-US";
      active.processLocally = true;
      active.onresult = (e) => {
        if (recognition !== active) return;
        input.value = (input.value + " " + e.results[0][0].transcript)
          .trim()
          .slice(0, input.maxLength);
        input.dispatchEvent(new Event("input"));
        status.textContent = "Check the words, then choose Find my next step.";
      };
      active.onerror = () => {
        status.textContent =
          "Dictation stopped. You can type or choose an option.";
      };
      active.onend = () => {
        recognition = null;
        button.textContent = "Dictate on this device";
        if (status.textContent === "Listening…")
          status.textContent = "Dictation ended.";
      };
      button.textContent = "Stop dictation";
      status.textContent = "Listening…";
      active.start();
    } catch {
      stop();
      status.textContent =
        "Dictation is unavailable. You can type or choose an option.";
    } finally {
      button.disabled = false;
    }
  };
}

export function quickHelp({
  root,
  catalog,
  shell,
  route,
  escape,
  link,
  signal,
  openChecklist,
  screen,
  visit,
}) {
  const { provider = "", need = "", missingSMS = false } = screen;
  const next = (changes) => visit({ kind: "quick", provider, need, missingSMS, ...changes });
  const goalButtons = () =>
    Object.entries(needs)
      .map(
        ([key, item]) =>
          `<button type="button" data-need="${key}">${item.choice}</button>`,
      )
      .join("");
  const frame = (html) => {
    shell(`<section class="plr-help"><button type="button" data-help-back><span aria-hidden="true">← </span>Back</button>${html}</section>`);
    root.querySelector("[data-help-back]").onclick = () => history.back();
  };
  function bindNeeds() {
    for (const button of root.querySelectorAll("[data-need]"))
      button.onclick = () => {
        const input = root.querySelector("#plr-story");
        next({ ...(input ? readSituation(input.value) : {}), need: button.dataset.need });
      };
  }
  function advance() {
    if (!need) {
      frame(
        `<h1>What do you need help with first?</h1><div class="plr-choices">${goalButtons()}</div>`,
      );
      bindNeeds();
    } else if (!provider) {
      frame(
        `<h1>Which carrier serves the missing phone?</h1><div class="plr-choices">${catalog.providers
          .map(
            (p) =>
              `<button type="button" data-provider="${escape(p.id)}">${escape(p.name)}</button>`,
          )
          .join(
            "",
          )}<button type="button" data-provider="other">Another carrier or not sure</button></div>`,
      );
      for (const b of root.querySelectorAll("[data-provider]"))
        b.onclick = () => {
          next({ provider: b.dataset.provider });
        };
    } else {
      const company = catalog.providers.find((p) => p.id === provider);
      const task = needs[need];
      const lossGuide =
        need === "secure" &&
        {
          att: [
            "AT&T lost or stolen device guide",
            "https://www.att.com/support/article/wireless/KM1042422/",
          ],
          tmobile: [
            "T-Mobile lost or stolen device guide",
            "https://www.t-mobile.com/support/account/lost-or-stolen-device-help",
          ],
          verizon: [
            "Verizon lost-device suspension guide",
            "https://www.verizon.com/support/knowledge-base-220988/",
          ],
          visible: [
            "Visible lost-phone and account access guide",
            "https://www.visible.com/m/help/your-account/multi-factor-authentication",
          ],
        }[provider];
      const sourceIDs = new Set(
        catalog.rules
          .filter(
            (r) =>
              r.provider === provider &&
              r.operation === task.operation &&
              !r.withdrawn,
          )
          .flatMap((r) => r.sourceIds),
      );
      const sources = catalog.sources.filter(
        (s) => sourceIDs.has(s.id) && s.availability !== "unavailable",
      );
      frame(`<p class="plr-context">${escape(company?.name ?? "Carrier unknown")} · ${task.choice}</p><h1>${task.title}</h1><p>${lossGuide ? "Open your carrier’s instructions for a missing phone. If you need help from support, you can ask:" : company ? "Contact your carrier through its official support page. You can ask:" : "Check a bill or ask the account holder for the carrier name and its official support contact. Once you reach them, ask:"}</p><blockquote>${missingSMS ? "I can’t receive text messages on the missing line. " : ""}${task.question}</blockquote>
      ${company ? `<a class="plr-primary" href="${escape(lossGuide ? lossGuide[1] : carriers[provider][1])}" target="_blank" rel="noopener noreferrer">${lossGuide ? escape(lossGuide[0]) : "Open " + escape(company.name) + " support"} ↗</a>` : ""}
      ${sources.length ? `<details><summary>Carrier guidance behind this question</summary>${sources.map((s) => `<p>${link(s)}<br>${escape(s.locator)} · Reviewed ${escape(s.reviewed)}</p>`).join("")}</details>` : ""}
      <p>${company ? '<button type="button" data-checklist>Personalize my checklist</button>' : ""} <button type="button" data-change>Change my goal</button></p>`);
      root.querySelector("[data-change]").onclick = () => {
        next({ need: "" });
      };
      const personalize = root.querySelector("[data-checklist]");
      if (personalize)
        personalize.onclick = () => openChecklist(provider, need, missingSMS);
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Start over";
    reset.onclick = () => {
      visit({ kind: "story" }, { reset: true });
    };
    root.querySelector(".plr-help").append(reset);
  }
  function start() {
    frame(`<h1>What happened to your phone?</h1><p>Tell us which carrier you use and what you need to do. A sentence is enough.</p>
    <form data-quick><label for="plr-story">Your situation</label><textarea id="plr-story" rows="3" maxlength="600" aria-describedby="plr-story-tip" autocomplete="off" spellcheck="false" placeholder="My T-Mobile phone was stolen. I’m using my sister’s laptop."></textarea>
    <small id="plr-story-tip">Leave out phone numbers, passwords and verification codes. The text stays in this tab.</small>
    <div class="plr-actions"><button class="plr-primary" type="submit">Find my next step</button><button type="button" data-dictate hidden>Dictate on this device</button></div><div role="status"></div></form>
    <details><summary>Choose from a list instead</summary><div class="plr-choices">${goalButtons()}</div></details>
    <p class="plr-secondary"><a href="${escape(route("navigator"))}">Detailed checklist</a> · <a href="${escape(route("practice"))}">Practice a fictional situation</a></p>`);
    const form = root.querySelector("[data-quick]");
    const input = form.querySelector("textarea");
    input.value = screen.draft || "";
    input.oninput = () => { screen.draft = input.value; };
    const list = root.querySelector(".plr-help details");
    list.open = Boolean(screen.listOpen);
    list.ontoggle = () => { screen.listOpen = list.open; };
    form.onsubmit = (e) => {
      e.preventDefault();
      screen.draft = input.value;
      next(readSituation(input.value));
    };
    enableDictation(form, signal);
    bindNeeds();
  }
  if (screen.kind === "quick") advance();
  else start();
}
