// E04S10: import progress.
import { test } from "node:test";
import assert from "node:assert/strict";
import { progressLine, onImportMessage, figureText } from "../web/js/view.js";

test("progressLine", () => {
  assert.equal(progressLine(412000), "Reading export: 412k lines");
  assert.equal(progressLine(412000, 37, 100), "[#######.............] 412k lines");
});

test("onImportMessage: progress figure, then hidden on done / error", () => {
  let s = { progress: null, error: null, done: null };
  s = onImportMessage(s, { progress: 412000, bytes: 37, total: 100 });
  assert.equal(s.progress.label, "Import progress: 412 thousand lines read, 37 percent");
  assert.ok(figureText(s.progress)[0].length <= 44);
  const done = onImportMessage(s, { done: true, features: { v: 1 } });
  assert.deepEqual([done.progress, done.done], [null, { v: 1 }]);
  const err = onImportMessage(s, { error: "export.xml not found in this zip" });
  assert.deepEqual([err.progress, err.error], [null, "export.xml not found in this zip"]);
});
