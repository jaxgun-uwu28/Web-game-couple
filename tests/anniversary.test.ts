import {test} from 'node:test';
import assert from 'node:assert/strict';
import {anniversaryStats,validDate} from '../src/lib/anniversary';
test('anniversary validates real dates rather than rolling to next month',()=>{assert.equal(validDate('2025-02-29'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-13-01'),false)});
test('countdown uses entered date and local calendar arithmetic',()=>{const stats=anniversaryStats('2025-09-06',new Date(2026,9,4,12));assert.equal(stats.together,393);assert.equal(stats.years,1);assert.equal(stats.next.getFullYear(),2027);assert.equal(stats.next.getMonth(),8);assert.ok(stats.progress>=0&&stats.progress<=1)});
test('leap-day relationships celebrate February 28 in non-leap years',()=>{const stats=anniversaryStats('2024-02-29',new Date(2025,1,28,12));assert.equal(stats.celebration,true);assert.equal(stats.next.getDate(),28);assert.equal(stats.next.getFullYear(),2026)});
