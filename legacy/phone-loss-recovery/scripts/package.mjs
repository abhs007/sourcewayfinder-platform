import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  statSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { build } from "./build.mjs";
const stage = resolve("dist/module");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
build({ outDir: stage + "/site" });
for (const name of ["src", "content", "research"])
  cpSync(name, stage + "/" + name, { recursive: true });
mkdirSync(stage + "/scripts", { recursive: true });
cpSync("scripts/build.mjs", stage + "/scripts/build.mjs");
for (const name of ["LICENSE", "CONTENT_LICENSE.md", "THIRD_PARTY_NOTICES.md"])
  cpSync(name, stage + "/" + name);
const files = {};
function walk(dir) {
  for (const n of readdirSync(dir).sort()) {
    const p = dir + "/" + n;
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(stage, p).split("\\").join("/")] = readFileSync(p);
  }
}
walk(stage);
const manifest = {
  version: "0.1.0",
  files: Object.entries(files).map(([path, data]) => ({
    path,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  })),
};
writeFileSync(
  stage + "/module-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
files["module-manifest.json"] = readFileSync(stage + "/module-manifest.json");
mkdirSync("release", { recursive: true });
const archive = zipSync(
  Object.fromEntries(
    Object.entries(files)
      .sort()
      .map(([n, b]) => [n, [b, { mtime: new Date(2026, 0, 1, 0, 0, 0) }]]),
  ),
  { level: 9 },
);
writeFileSync("release/phone-loss-recovery-0.1.0.zip", archive);
writeFileSync(
  "release/checksums.json",
  JSON.stringify(
    {
      version: "0.1.0",
      file: "phone-loss-recovery-0.1.0.zip",
      bytes: archive.length,
      sha256: createHash("sha256").update(archive).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(readFileSync("release/checksums.json", "utf8"));
