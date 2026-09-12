import test from 'node:test';
import assert from 'node:assert/strict';
import {illustrateBlinding, splitBinaryAmount, illustrateSwap} from '../dist/lesson-math.js';

test('toy blinding cancels for every allowed factor, including wraparound and zero residues', () => {
  const messages = new Set();
  for (let r = 1; r <= 96; r++) {
    const result = illustrateBlinding(r);
    assert.equal(result.unblinded, 77);
    assert.equal(result.expected, 77);
    assert.ok(result.blinded >= 0 && result.blinded < 97);
    messages.add(result.blinded);
  }
  assert.equal(messages.size, 96);
  assert.deepEqual(illustrateBlinding(9), {blinded: 56, signed: 4, removal: 315, unblinded: 77, expected: 77});
  assert.deepEqual(illustrateBlinding(3), {blinded: 26, signed: 85, removal: 105, unblinded: 77, expected: 77});
  assert.equal(illustrateBlinding(56).blinded, 0);
  assert.equal(illustrateBlinding(56).signed, 0);
});

test('binary decomposition conserves every illustrated amount and never emits a zero proof', () => {
  assert.deepEqual(splitBinaryAmount(13), [8, 4, 1]);
  assert.deepEqual(splitBinaryAmount(0), []);
  for (let amount = 0; amount <= 255; amount++) {
    const parts = splitBinaryAmount(amount);
    assert.equal(parts.reduce((sum, value) => sum + value, 0), amount);
    assert.equal(new Set(parts).size, parts.length);
    for (const part of parts) assert.ok(part > 0 && Number.isInteger(Math.log2(part)));
  }
});

test('hypothetical swap rounds total input fees once and conserves value', () => {
  assert.deepEqual(illustrateSwap(13, 100), {inputs: [8, 4, 1], fee: 1, remaining: 12, outputs: [8, 4]});
  assert.equal(illustrateSwap(255, 500).fee, 4);
  assert.equal(illustrateSwap(128, 500).fee, 1);
  assert.equal(illustrateSwap(13, 0).fee, 0);
  assert.deepEqual(illustrateSwap(1, 1000), {inputs: [1], fee: 1, remaining: 0, outputs: []});
  for (let amount = 1; amount <= 255; amount++) {
    for (const rate of [0, 1, 100, 500, 999, 1000]) {
      const result = illustrateSwap(amount, rate);
      assert.equal(result.outputs.reduce((sum, part) => sum + part, 0) + result.fee, amount);
    }
  }
});

test('teaching arithmetic rejects out-of-range and non-integer inputs', () => {
  for (const value of [0, 97, -1, 1.5, NaN, Infinity, '9', undefined]) assert.throws(() => illustrateBlinding(value), RangeError);
  for (const value of [-1, 256, 1.5, NaN, '13']) assert.throws(() => splitBinaryAmount(value), RangeError);
  for (const value of [0, 256, 1.5, NaN, '13']) assert.throws(() => illustrateSwap(value, 100), RangeError);
  for (const value of [-1, 1001, 1.5, NaN, '100']) assert.throws(() => illustrateSwap(13, value), RangeError);
});
