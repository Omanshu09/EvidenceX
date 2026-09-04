# Evidence-X — Multi-document AI workspace

Upload multiple documents (PDF, DOCX, TXT, MD) and ask questions that pull answers from one or many of them — **every answer cites the exact source**.

Real **RAG** (retrieval-augmented generation) for multiple documents, 100% in the browser for embeddings + retrieval, with only the final answer synthesis going through a secure server-side proxy.

Not a chat bot. A document-grounded research workspace.

---

## What it does

1. **Upload** — drag & drop PDF, DOCX, TXT, MD files.
2. **Index** — each document is parsed, chunked, and embedded **in the browser** (Transformer.js / ONNX / WASM — no API key, no upload-size limits).
3. **Ask** — type a question across your whole corpus. The browser retrieves the top relevant chunks (cosine similarity + lexical reranking), then sends the selected evidence to the LLM.
4. **Get cited answers** — the LLM synthesizes an answer grounded only in your files, with numbered citations and a **View evidence sources** drawer showing which document/page each answer came from.

## Architecture

```
Browser (React)
  parse (pdfjs / mammoth)  ->  chunk  ->  embed (@xenova/transformers, local)
                                                   |
                                        vector store + search + rerank (local)
                                                   |
                    top evidence chunks (only these are sent)
                                                   v
                               POST /api/synthesize  (Vercel function)
                                    holds GROQ_API_KEY (server env var)
                                                   v
                                          Groq LLM -> cited answer
```

- **Embeds & retrieves 100% in-browser** → free, private, no server for the ML part.
- **Synthesis proxy** (`api/synthesize.ts`) keeps your Groq key server-side. It NEVER reaches the browser.
- **Citations** map each answer claim to a source doc + page.

## Stack
- React + TypeScript + Vite
- `@xenova/transformers` (in-browser embeddings, all-MiniLM-L6-v2)
- `pdfjs-dist` (PDF) + `mammoth` (DOCX)
- Groq `openai/gpt-oss-120b` via Vercel serverless function

## Deploy
1. Import the repo into **Vercel** (it auto-builds the Vite app + `/api`).
2. Add env vars in Vercel → Settings → Environment Variables:
   - `GROQ_API_KEY` = your key
   - `GROQ_MODEL` = `openai/gpt-oss-120b`
3. Deploy. Done.

## Local dev
```bash
npm install
node node_modules/esbuild/install.js   # if install-scripts are blocked
npm run dev
```

Test the synthesis proxy locally:
```bash
GROQ_API_KEY=<key> npx tsx scripts/test-proxy.mts
```
