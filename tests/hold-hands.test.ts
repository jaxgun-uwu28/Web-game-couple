import { test } from "node:test";
import assert from "node:assert/strict";
import { handMerge, releaseDue } from "../src/lib/hold-hands";
test("holds merge only with two active partners and use the later start", () => {
  const a = { inRoom: true, holding: true, holdingSince: 1000 },
    b = { ...a, holdingSince: 2000 };
  assert.deepEqual(handMerge(a, b, 5200), {
    together: true,
    reconnecting: false,
    seconds: 3,
  });
  assert.equal(handMerge({ ...a, holding: false }, b, 5200).together, false);
  assert.equal(handMerge(a, null, 5200).together, false);
  assert.equal(handMerge(a, { ...b, inRoom: false }, 5200).together, false);
});
test("finger slips have 400ms grace; reconnect retains a merged hold for less than five seconds", () => {
  assert.equal(releaseDue(1000, 1399), false);
  assert.equal(releaseDue(1000, 1400), true);
  const a = { inRoom: true, holding: true, holdingSince: 1000 };
  assert.equal(handMerge(a, a, 6999, 2000).together, true);
  assert.equal(handMerge(a, a, 7000, 2000).together, false);
});
