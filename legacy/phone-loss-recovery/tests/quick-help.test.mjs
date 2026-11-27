import test from "node:test";
import assert from "node:assert/strict";
import { readSituation } from "../src/quick-help.js";

test("ambiguous language leaves the choice to the user", () => {
  assert.equal(readSituation("Verizon or T-Mobile").provider, "");
  assert.equal(readSituation("I am not with Verizon").provider, "");
  assert.equal(readSituation("I borrowed a Verizon phone").provider, "");
  assert.equal(readSituation("I don't want to suspend my phone").need, "");
  assert.equal(
    readSituation("My phone was stolen and I need my number back").need,
    "",
  );
});
test("only an explicit missing text channel is carried to the checklist", () => {
  assert.equal(readSituation("I have a new phone").missingSMS, false);
  const story = readSituation(
    "I’m with T‑Mobile and can’t receive texts. I need my number back.",
  );
  assert.deepEqual(story, {
    provider: "tmobile",
    need: "restore",
    missingSMS: true,
  });
});
