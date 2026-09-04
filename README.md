# Evidence-X — Multi-document AI workspace

Upload multiple documents (PDF, DOCX, TXT, MD) and ask questions that pull answers from one or many of them — **every answer cites the exact source**.

Real **RAG** (retrieval-augmented generation) for multiple documents, 100% in the browser for embeddings + retrieval, with only the final answer synthesis going through a secure server-side proxy.

Not a chat bot. A document-grounded research workspace.

## What it does

1. **Upload** — drag & drop PDF, DOCX, TXT, MD files.
2. **Index** — each document is parsed, chunked, and embedded **in the browser** (Transformer.js / ONNX / WASM — no API key, no upload-size limits).
3. **Ask** — type a question across your whole corpus. The browser retrieves the top relevant chunks (cosine similarity + lexical reranking), then sends the selected evidence to the LLM.
4. **Get cited answers** — the LLM synthesizes an answer grounded only in your files, with numbered citations and a **View evidence sources** drawer showing which document/page each answer came from.
