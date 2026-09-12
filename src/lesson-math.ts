// Bounded teaching arithmetic only. This module does not implement Cashu cryptography.
function integerInRange(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`Expected an integer from ${min} to ${max}`);
}

export function illustrateBlinding(r: number) {
  integerInRange(r, 1, 96);
  const mod97 = (value: number) => ((value % 97) + 97) % 97;
  const blinded = mod97(11 + r * 5);
  const signed = mod97(7 * blinded);
  const removal = r * 35;
  return {blinded, signed, removal, unblinded: mod97(signed - removal), expected: mod97(7 * 11)};
}

export function splitBinaryAmount(amount: number): readonly number[] {
  integerInRange(amount, 0, 255);
  const parts: number[] = [];
  let remainder = amount;
  for (let value = 128; value >= 1; value /= 2) {
    if (remainder >= value) { parts.push(value); remainder -= value; }
  }
  return parts;
}

export function illustrateSwap(amount: number, inputFeePpk: number) {
  integerInRange(amount, 1, 255);
  integerInRange(inputFeePpk, 0, 1000);
  const inputs = splitBinaryAmount(amount);
  // Sum the assumed same-keyset input rates first, then round up once.
  const fee = Math.floor((inputs.length * inputFeePpk + 999) / 1000);
  const remaining = amount - fee;
  return {inputs, fee, remaining, outputs: splitBinaryAmount(remaining)};
}
