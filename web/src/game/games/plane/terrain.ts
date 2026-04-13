export interface ValleyGenArgs {
  seed: number;
  lengthPx: number;
  sampleEveryPx: number;
}

export interface Valley {
  lengthPx: number;
  sampleEveryPx: number;
  samples: number[];
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateValley({ seed, lengthPx, sampleEveryPx }: ValleyGenArgs): Valley {
  const next = rng(seed);
  const n = Math.floor(lengthPx / sampleEveryPx) + 1;
  const samples: number[] = [];
  let h = 0.5;
  for (let i = 0; i < n; i++) {
    h += (next() - 0.5) * 0.08;
    if (h < 0.15) h = 0.15 + (0.15 - h);
    if (h > 0.85) h = 0.85 - (h - 0.85);
    samples.push(h);
  }
  return { lengthPx, sampleEveryPx, samples };
}

export function samplePoint(valley: Valley, x: number): number {
  if (x <= 0) return valley.samples[0]!;
  const maxX = (valley.samples.length - 1) * valley.sampleEveryPx;
  if (x >= maxX) return valley.samples[valley.samples.length - 1]!;
  const i = Math.floor(x / valley.sampleEveryPx);
  const frac = (x - i * valley.sampleEveryPx) / valley.sampleEveryPx;
  return valley.samples[i]! * (1 - frac) + valley.samples[i + 1]! * frac;
}
