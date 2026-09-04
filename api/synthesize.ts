// Vercel serverless function — secure synthesis for Evidence-X.
// Your GROQ_API_KEY lives here as a server-side env var and NEVER reaches the browser.
// The browser does retrieval + embeddings locally, then sends ONLY the top evidence
// chunks so this function grounds the answer and returns it with citations.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function callGroq(messages: { role: string; content: string }[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set on the server.');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 900,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Groq error (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

const SYSTEM = `You are Evidence-X, a precise multi-document research assistant.
You will be given a USER QUERY and a set of EVIDENCE snippets, each tagged like [Source: DocName | Page N].
Answer ONLY from the provided evidence. If the evidence does not contain the answer, say so honestly.
Use inline citations like [1], [2] matching the source order, and end with a "Sources" list mapping each number to its document.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const query = String(req.body?.query || '').trim();
    const context = String(req.body?.context || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });

    const userContent = context
      ? `USER QUERY:\n${query}\n\nEVIDENCE:\n${context}`
      : `USER QUERY:\n${query}\n\n(No evidence provided.)`;

    const answer = await callGroq([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ]);

    return res.status(200).json({ answer, sources: [], citations: [] });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Unexpected server error' });
  }
}
