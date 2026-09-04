// In-browser embeddings via Transformer.js (ONNX/WASM). No API key required.
// Model: all-MiniLM-L6-v2 (384-dim, fast, runs locally).

import { pipeline } from '@xenova/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor: any = null;

export async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', MODEL);
  }
  return extractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const ex = await getExtractor();
  const out = await ex(texts, { pooling: 'mean', normalize: true });
  // out is Tensor; convert to array of arrays
  const arr: number[][] = Array.isArray(out)
    ? out.map((t: any) => Array.from(t.data))
    : Array.from(out.data).reduce(
        (acc: number[][], v: number, i: number) => {
          const dim = out.dims?.[1] ?? out.data.length;
          const row = Math.floor(i / dim);
          if (!acc[row]) acc[row] = [];
          acc[row].push(v);
          return acc;
        },
        [],
      );
  return arr;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
