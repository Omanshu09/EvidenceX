import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chunk, ParsedDoc } from './lib/parser';
import { parseFile, ACCEPTED, isSupported } from './lib/parser';
import { embed } from './lib/embeddings';
import type { StoredChunk, Retrieved } from './lib/store';
import { search, saveVectors, loadVectors, clearVectors } from './lib/store';
import { synthesize, type CiteSource } from './lib/api';
import './App.css';

type Phase = 'idle' | 'embedding' | 'ready';
type Status = { total: number; done: number; label: string } | null;

interface QaItem {
  id: string;
  query: string;
  answer: string;
  sources: (Retrieved & { label: string })[];
  loading?: boolean;
  error?: string;
}

let uid = 0;
const nid = () => `id_${Date.now()}_${uid++}`;

export default function App() {
  const [docs, setDocs] = useState<ParsedDoc[]>([]);
  const [collection, setCollection] = useState<StoredChunk[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<Status>(null);
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState('');
  const [qa, setQa] = useState<QaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [assistantReady, setAssistantReady] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [activeSources, setActiveSources] = useState<(Retrieved & { label: string })[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const qaBottomRef = useRef<HTMLDivElement>(null);

  // restore persisted vectors on load
  useEffect(() => {
    const saved = loadVectors();
    if (saved.length) {
      setCollection(saved);
      const names = new Map<string, string>();
      saved.forEach((s) => names.set(s.chunk.docId, s.chunk.docName));
      const pseudo: ParsedDoc[] = Array.from(names.entries()).map(([id, name]) => ({
        id,
        name,
        type: name.split('.').pop() || '',
        size: 0,
        chunks: saved.filter((s) => s.chunk.docId === id).map((s) => s.chunk),
      }));
      setDocs(pseudo);
      setPhase('ready');
      setAssistantReady(true);
    }
  }, []);

  useEffect(() => {
    qaBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [qa]);

  const ingestFiles = useCallback(async (files: File[]) => {
    const supported = files.filter((f) => isSupported(f.name));
    if (!supported.length) {
      setError('Please upload PDF, DOCX, TXT or MD files.');
      return;
    }
    setError('');
    setBusy(true);
    setPhase('ready');

    const allChunks: Chunk[] = [];
    const newDocIds: string[] = [];
    const parsedDocs: ParsedDoc[] = [];

    for (let i = 0; i < supported.length; i++) {
      const file = supported[i];
      const docId = `doc_${Date.now()}_${i}`;
      setStatus({ total: supported.length, done: i, label: `Parsing ${file.name}` });
      try {
        const doc = await parseFile(file, docId);
        parsedDocs.push(doc);
        newDocIds.push(docId);
        allChunks.push(...doc.chunks);
      } catch (e: any) {
        setError(`Could not read ${file.name}: ${e?.message}`);
      }
    }

    setStatus({ total: supported.length, done: supported.length, label: 'Embedding chunks…' });
    const texts = allChunks.map((c) => c.text);
    let vecs: number[][] = [];
    if (texts.length) {
      vecs = await embed(texts);
    }

    const stored: StoredChunk[] = allChunks.map((c, i) => ({ chunk: c, vec: vecs[i] || [] }));
    const nextCollection = [...collection.filter((s) => !newDocIds.includes(s.chunk.docId)), ...stored];
    setCollection(nextCollection);
    // keep only docs we still have chunks for (replace the replaced ids)
    setDocs((prev) => [...prev.filter((d) => !newDocIds.includes(d.id)), ...parsedDocs]);
    saveVectors(nextCollection);
    setStatus(null);
    setBusy(false);
    setAssistantReady(true);
  }, [collection]);

  const clearAll = () => {
    setDocs([]);
    setCollection([]);
    setQa([]);
    setPhase('idle');
    setAssistantReady(false);
    clearVectors();
  };

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    const item: QaItem = {
      id: nid(),
      query: q,
      answer: '',
      sources: [],
      loading: true,
    };
    setQa((prev) => [...prev, item]);
    setQuery('');
    setBusy(true);

    try {
      const queryVec = (await embed([q]))[0];
      const top = search(collection, queryVec, q, 6);
      const labeled = top.map((r, idx) => ({ ...r, label: `${idx + 1}` }));

      const context = labeled
        .map(
          (r) =>
            `[Source: ${r.chunk.docName}${r.chunk.page ? ` | Page ${r.chunk.page}` : ''}]\n${r.chunk.text.trim()}`,
        )
        .join('\n\n---\n\n');

      const result = await synthesize(q, context);
      setQa((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, answer: result.answer, sources: labeled, loading: false } : x,
        ),
      );
    } catch (err: any) {
      setQa((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, error: err?.message || 'Something went wrong.', loading: false } : x,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = (sources: (Retrieved & { label: string })[]) => {
    setActiveSources(sources);
    setShowEvidence(true);
  };

  const totalChunks = collection.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">E</span>
          <span className="brand-name">Evidence-X</span>
          <span className="brand-tag">multi-document AI workspace</span>
        </div>
        <div className="top-actions">
          {assistantReady && (
            <span className="pill ready">
              <span className="pdot" /> {totalChunks} chunks indexed
            </span>
          )}
          {docs.length > 0 && (
            <button className="ghost danger" onClick={clearAll}>
              Clear workspace
            </button>
          )}
        </div>
      </header>

      <div className="layout">
        {/* ---- left: corpus ---- */}
        <aside className="corpus">
          <div className="corpus-head">
            <span className="corpus-title">Corpus</span>
            <span className="corpus-count">{docs.length} docs</span>
          </div>

          <button className="upload-zone" onClick={() => fileRef.current?.click()}>
            <div className={`drop ${dragOver ? 'dropping' : ''}`}
                 onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                 onDragLeave={() => setDragOver(false)}
                 onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFiles(Array.from(e.dataTransfer.files)); }}>
              <span className="drop-icon">＋</span>
              <span className="drop-main">Upload documents</span>
              <span className="drop-sub">PDF, DOCX, TXT, MD</span>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED}
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && ingestFiles(Array.from(e.target.files))}
          />

          {busy && status && (
            <div className="progress">
              <div className="progress-label">
                <span>{status.label}</span>
                <span>
                  {status.total > 1 ? `${status.done}/${status.total}` : ''}
                </span>
              </div>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{ width: status.total > 1 ? `${(status.done / status.total) * 100}%` : '60%' }}
                />
              </div>
            </div>
          )}

          <div className="doc-list">
            {docs.length === 0 && !busy && (
              <div className="empty-corpus">
                <p>No documents yet.</p>
                <p>Upload to build your searchable knowledge base.</p>
              </div>
            )}
            {docs.map((d) => (
              <div className="doc" key={d.id}>
                <div className="doc-icon">
                  <span className={`ext ${d.type}`}>{d.type || 'doc'}</span>
                </div>
                <div className="doc-meta">
                  <span className="doc-name" title={d.name}>{d.name}</span>
                  <span className="doc-sub">
                    {d.chunks.length} chunks{d.pages ? ` · ${d.pages} pp` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ---- main: conversation ---- */}
        <main className="main">
          {qa.length === 0 ? (
            <div className="hero">
              <h1>
                Your documents.
                <br />
                <span className="grad">Your evidence.</span>
              </h1>
              <p className="hero-sub">
                Upload files, then ask questions that pull answers from one or many documents —
                every answer cites its source.
              </p>
              {docs.length === 0 && (
                <button className="hero-btn" onClick={() => fileRef.current?.click()}>
                  Upload your first document
                </button>
              )}
              {docs.length > 0 && (
                <div className="hero-suggest">
                  Try: <em>“Summarize the key risks across all files”</em>
                </div>
              )}
            </div>
          ) : (
            <div className="thread">
              {qa.map((item) => (
                <div className="qa-block" key={item.id}>
                  <div className="q-bubble">{item.query}</div>
                  <div className="a-area">
                    {item.loading && (
                      <div className="thinking">
                        <span className="tdot" />
                        <span className="tdot" />
                        <span className="tdot" />
                        <span>Retrieving evidence…</span>
                      </div>
                    )}
                    {item.error && <div className="a-error">{item.error}</div>}
                    {!item.loading && item.answer && (
                      <div className="a-bubble">
                        <div className="answer-text">{renderAnswer(item.answer)}</div>
                        {item.sources.length > 0 && (
                          <button
                            className="sources-btn"
                            onClick={() => openEvidence(item.sources)}
                          >
                            View {item.sources.length} evidence sources →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={qaBottomRef} />
            </div>
          )}

          <div className="ask-bar">
            <form onSubmit={ask} className="ask-form">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  assistantReady
                    ? 'Ask anything across your documents…'
                    : 'Upload documents to get started'
                }
                disabled={!assistantReady}
              />
              <button
                type="submit"
                disabled={!assistantReady || busy || !query.trim()}
                className="ask-btn"
              >
                {busy ? '…' : '↵'}
              </button>
            </form>
            <div className="ask-note">
              {phase === 'embedding' ? 'Indexing documents…' : 'Answers are grounded in your uploads with citations.'}
            </div>
          </div>
        </main>
      </div>

      {/* ---- evidence drawer ---- */}
      {showEvidence && (
        <div className="drawer-overlay" onClick={() => setShowEvidence(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <span>Evidence sources</span>
              <button className="ghost" onClick={() => setShowEvidence(false)}>✕</button>
            </div>
            <div className="drawer-body">
              {activeSources.map((s) => (
                <div className="evidence" key={s.chunk.id}>
                  <div className="evidence-head">
                    <span className="ev-num">{s.label}</span>
                    <span className="ev-doc">
                      {s.chunk.docName}
                      {s.chunk.page ? ` · p.${s.chunk.page}` : ''}
                    </span>
                    <span className="ev-score">{(s.rawScore * 100).toFixed(0)}%</span>
                  </div>
                  <p className="ev-text">{s.chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}

// tiny formatter: render citations + paragraphs + bullet lists
function renderAnswer(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    if (/^\s*[-*•]/.test(block)) {
      const items = block
        .split('\n')
        .map((l) => l.replace(/^\s*[-*•]\s*/, ''))
        .filter(Boolean);
      return (
        <ul key={i}>
          {items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      );
    }
    if (/^\d+\./.test(block)) {
      const items = block.split('\n').filter(Boolean);
      return (
        <ol key={i}>
          {items.map((it, j) => (
            <li key={j}>{it.replace(/^\d+\.\s*/, '')}</li>
          ))}
        </ol>
      );
    }
    return (
      <p key={i}>
        {block.split(/(\[[0-9,\s]+\])/).map((part, j) =>
          /^\[\d/.test(part) ? (
            <sup className="cite" key={j}>
              {part}
            </sup>
          ) : (
            part
          ),
        )}
      </p>
    );
  });
}
