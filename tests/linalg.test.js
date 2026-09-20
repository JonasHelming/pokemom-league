import assert from 'node:assert/strict';
import { invert, matVec, dot, quadForm, shermanMorrisonGain } from '../src/linalg.js';

const inv2x2 = invert([[4, 7], [2, 6]]);
assert.ok(Math.abs(inv2x2[0][0] - 0.6) < 1e-9);
assert.ok(Math.abs(inv2x2[0][1] - -0.7) < 1e-9);
assert.ok(Math.abs(inv2x2[1][0] - -0.2) < 1e-9);
assert.ok(Math.abs(inv2x2[1][1] - 0.4) < 1e-9);

assert.deepEqual(invert([[1, 0], [0, 1]]), [[1, 0], [0, 1]]);

assert.throws(() => invert([[1, 2], [2, 4]]));

assert.deepEqual(matVec([[1, 0], [0, 1]], [3, 4]), [3, 4]);
assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
assert.equal(quadForm([[1, 0], [0, 1]], [3, 4]), 25);
assert.equal(shermanMorrisonGain([[1, 0], [0, 1]], [1, 0], 1), 0.5);

console.log('OK: linalg.test.js');
