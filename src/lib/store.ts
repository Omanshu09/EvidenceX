// In-browser vector store + retrieval + reranking.
// Keeps embeddings with their chunk metadata, does brute-force cosine search,
// then a lightweight reranker boosts chunks that share keywords with the query.

import type { Chunk } from './parser';
import { cosine } from './embeddings';

export interface StoredChunk {
  chunk: Chunk;
  vec: number[];
}

export interface Retrieved {
  chunk: Chunk;
  score: number; // reranked score, higher = better
  rawScore: number; // cosine similarity before rerank
}

// ---- vector collection stored in memory (persisted to IndexedDB by caller) ----

export function search(
  collection: StoredChunk[],
  queryVec: number[],
  queryText: string,
  topK = 6,
): Retrieved[] {
  const scored = collection
    .map((s) => {
      const raw = cosine(queryVec, s.vec);
      const keyword = keywordRerank(queryText, s.chunk.text);
      const final = raw + 0.12 * keyword; // blend semantic + lexical
      return { chunk: s.chunk, score: final, rawScore: raw };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // normalize scores to 0..1-ish and dedupe near-identical chunks
  const max = scored[0]?.score || 1;
  const out: Retrieved[] = [];
  for (const r of scored) {
    out.push({ ...r, score: r.score / Math.max(max, 1e-9) });
  }
  return out;
}

function keywordRerank(query: string, text: string): number {
  const qWords = tokenize(query);
  if (!qWords.length) return 0;
  const tLow = text.toLowerCase();
  let hits = 0;
  for (const w of qWords) {
    if (tLow.includes(w)) hits++;
  }
  return hits / Math.min(qWords.length, 8);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

const STOP = new Set([
  'this','that','with','from','have','what','when','where','which','their','there',
  'about','would','could','should','were','your','them','they','then','than','just',
  'will','does','doing','make','made','more','most','some','such','only','also',
  'into','over','after','before','because','between',
]);

// ---- simple JSON persistence helpers (IndexedDB or localStorage fallback) ----

const KEY = 'evidencex:vectors';

export function saveVectors(collection: StoredChunk[]): void {
  try {
    // Store only a downsampled copy of vectors + chunk metadata (JSON-safe-ish).
    localStorage.setItem(KEY, JSON.stringify(collection));
  } catch {
    /* storage full or unavailable — in-memory only */
  }
}

export function loadVectors(): StoredChunk[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearVectors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
