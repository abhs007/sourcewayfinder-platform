import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCatalog } from "../src/engine.js";
import { landingHTML } from "../src/landing.js";
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const views = {
  home: "Phone-Loss Recovery Navigator",
  navigator: "Explore your recovery options",
  practice: "Practice a phone-loss decision",
  evidence: "Inspect the recovery evidence",
  study: "Local research study",
  methodology: "Methodology and contributions",
};
export function renderFragment(
  view,
  { basePath = "/", brand = "Phone-Loss Recovery" } = {},
) {
  const landing = view === "home";
  const routes = Object.fromEntries(Object.keys(views).map(v => [v, escape(basePath + (v === "home" ? "" : v + "/"))]));
  return `<link rel="stylesheet" href="${basePath}assets/recovery.css"><section id="recovery-module" class="plr${landing ? " plr-landing" : ""}" data-view="${view}" data-base="${basePath}" data-brand="${escape(brand)}">${landing ? landingHTML({ ...routes, brand: escape(brand) }) : `<p>Loading recovery guidance…</p><noscript><h1>Phone-Loss Recovery Navigator</h1><p>Enable JavaScript to use the local decision aid. Official procedures and their verification requirements remain with each provider. No account details are collected.</p><a href="https://doi.org/10.5281/zenodo.24301157">Read the documentation study</a></noscript>`}</section><script type="module" src="${basePath}assets/boot.js"></script>`;
}
export function build({
  outDir = resolve(root, "dist/client"),
  basePath = process.env.BASE_PATH || "/",
  siteUrl = process.env.SITE_URL ||
    "https://abhs007.github.io/phone-loss-recovery",
  brand = "Phone-Loss Recovery",
} = {}) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))
    throw Error("basePath must be a slash-delimited absolute path.");
  if (!/^https?:\/\//.test(siteUrl))
    throw Error("siteUrl must be an HTTP origin/site URL.");
  validateCatalog(
    JSON.parse(readFileSync(resolve(root, "content/catalog.json"))),
  );
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resolve(outDir, "assets"), { recursive: true });
  mkdirSync(resolve(outDir, "data"), { recursive: true });
  for (const name of ["engine.js", "study.js", "ui.js", "quick-help.js", "landing.js"])
    cpSync(resolve(root, "src", name), resolve(outDir, "assets", name));
  cpSync(
    resolve(root, "src/styles.css"),
    resolve(outDir, "assets/recovery.css"),
  );
  writeFileSync(
    resolve(outDir, "assets/boot.js"),
    `import {mountRecoveryModule} from './ui.js';\nconst root=document.querySelector('#recovery-module');if(root)mountRecoveryModule(root,{view:root.dataset.view,basePath:root.dataset.base,brand:root.dataset.brand});\n`,
  );
  for (const n of ["catalog", "tasks"])
    cpSync(
      resolve(root, "content", n + ".json"),
      resolve(outDir, "data", n + ".json"),
    );
  cpSync(
    resolve(root, "research/carrier_evidence_v0.8.json"),
    resolve(outDir, "data/historical.json"),
  );
  cpSync(resolve(root, "research"), resolve(outDir, "research"), {
    recursive: true,
  });
  for (const [view, title] of Object.entries(views)) {
    const suffix = view === "home" ? "" : view + "/";
    const dest = resolve(outDir, suffix, "index.html");
    mkdirSync(dirname(dest), { recursive: true });
    const canonical = new URL(basePath + suffix, new URL(siteUrl).origin).href;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Evidence-linked phone-loss recovery guidance and fictional practice across six US wireless retail brands."><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"><title>${title}</title><link rel="canonical" href="${canonical}">${view === "study" ? '<meta name="robots" content="noindex, nofollow">' : ""}<style>body{margin:0}.plr-skip{position:absolute;left:-9999px}.plr-skip:focus{position:static}</style></head><body><a class="plr-skip" href="#main">Skip to content</a><main id="main">${renderFragment(view, { basePath, brand })}</main></body></html>`;
    // Keep style external so the strict CSP also works on static hosts.
    writeFileSync(
      dest,
      html.replace(
        "<style>body{margin:0}.plr-skip{position:absolute;left:-9999px}.plr-skip:focus{position:static}</style>",
        `<link rel="stylesheet" href="${basePath}assets/shell.css">`,
      ),
    );
  }
  writeFileSync(
    resolve(outDir, "assets/shell.css"),
    "body{margin:0}.plr-skip{position:absolute;left:-9999px}.plr-skip:focus{position:static}",
  );
  writeFileSync(
    resolve(outDir, "404.html"),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><p>Check the address and return to the recovery navigator.</p></html>',
  );
  writeFileSync(
    resolve(outDir, "robots.txt"),
    "User-agent: *\nAllow: /\nDisallow: " + basePath + "study/\n",
  );
  return outDir;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(build());
}
