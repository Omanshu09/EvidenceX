// Browser client for the safe synthesis proxy (key lives server-side on Vercel).

export interface CiteSource {
  label: string;
  doc: string;
  page?: number;
}

export interface SynthesizeResult {
  answer: string;
  sources: CiteSource[];
  citations: string[];
}

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/synthesize';

export async function synthesize(query: string, context: string): Promise<SynthesizeResult> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, context }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as SynthesizeResult;
}
