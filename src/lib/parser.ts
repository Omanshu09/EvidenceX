// Document parsing (PDF / DOCX / TXT) + smart chunking, all in-browser.

export interface Chunk {
  id: string;
  docId: string;
  docName: string;
  page?: number;
  text: string;
}

export interface ParsedDoc {
  id: string;
  name: string;
  type: string;
  size: number;
  pages?: number;
  fullText: string;
  chunks: Chunk[];
}

// --- extractors ---

async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const version = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  // Copy ArrayBuffer to avoid potential SharedArrayBuffer / detached-buffer issues
  const arrayBuffer = await file.arrayBuffer();
  const copy = arrayBuffer.slice(0);

  const doc = await pdfjs.getDocument({
    data: copy,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  let text = '';
  const numPages = doc.numPages;
  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: any) => ('str' in it ? it.str : ''))
        .join(' ');
      text += `\n${pageText}`;
    } catch {
      /* skip unreadable page */
    }
  }
  return { text, pages: numPages };
}

async function extractDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

function extractTxt(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

// --- chunking ---

function chunkText(text: string, chunkSize = 900, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= chunkSize) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const breakIdx = clean.lastIndexOf('. ', end);
      const nlIdx = clean.lastIndexOf('\n', end);
      const breakAt = Math.max(breakIdx, nlIdx);
      if (breakAt > start + chunkSize * 0.5) {
        end = breakAt + 1;
      }
    }
    chunks.push(clean.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}

// --- main ---

export async function parseFile(file: File, docId: string): Promise<ParsedDoc> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const buf = await file.arrayBuffer();

  let fullText = '';
  let pages: number | undefined;

  if (ext === 'pdf') {
    const r = await extractPdf(file);
    fullText = r.text;
    pages = r.pages;
  } else if (ext === 'docx') {
    fullText = await extractDocx(buf);
  } else {
    fullText = extractTxt(buf);
  }

  if (!fullText.trim()) {
    throw new Error(`Could not read any text from "${file.name}".`);
  }

  const rawChunks = chunkText(fullText);
  const chunks: Chunk[] = rawChunks.map((text, i) => ({
    id: `${docId}_c${i}`,
    docId,
    docName: file.name,
    page: pages ? Math.floor((i / rawChunks.length) * pages) + 1 : undefined,
    text,
  }));

  return {
    id: docId,
    name: file.name,
    type: ext,
    size: file.size,
    pages,
    fullText,
    chunks,
  };
}

export const ACCEPTED = '.pdf,.docx,.txt,.md';
export function isSupported(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['pdf', 'docx', 'txt', 'md'].includes(ext);
}
