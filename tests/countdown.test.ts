import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownProgress, validCountdownDate } from '../src/lib/together';

test('Countdowns reject missing and impossible dates without rendering NaN', () => {
  for (const date of ['', '2026-02-30', 'invalid', '2026-13-01']) {
    assert.equal(validCountdownDate(date), false);
    assert.equal(countdownProgress('2026-10-01', date, '2026-10-05'), 0);
  }
  assert.equal(validCountdownDate('2028-02-29'), true);
  assert.equal(countdownProgress('2026-10-01', '2026-10-11', '2026-10-06'), .5);
});
