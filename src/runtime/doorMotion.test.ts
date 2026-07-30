import { describe, expect, it } from 'vitest';
import { clamp01, moveTowards, smoothStep01 } from './doorMotion';

describe('door motion helpers', () => {
  it('clamps values into the normalised range', () => {
    expect(clamp01(-10)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(10)).toBe(1);
  });

  it('uses a smooth monotonic curve without overshoot', () => {
    const samples = Array.from({ length: 25 }, (_, index) => smoothStep01(index / 24));

    expect(samples[0]).toBe(0);
    expect(samples[12]).toBe(0.5);
    expect(samples[24]).toBe(1);
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
    expect(smoothStep01(-1)).toBe(0);
    expect(smoothStep01(2)).toBe(1);
  });

  it('moves towards either endpoint without crossing it', () => {
    expect(moveTowards(0, 1, 0.25)).toBe(0.25);
    expect(moveTowards(0.9, 1, 0.25)).toBe(1);
    expect(moveTowards(1, 0, 0.4)).toBe(0.6);
    expect(moveTowards(0.1, 0, 0.4)).toBe(0);
  });
});
