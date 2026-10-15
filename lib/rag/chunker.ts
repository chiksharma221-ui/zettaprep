/**
 * Splits a markdown knowledge file into retrieval chunks on H2/H3 boundaries, carrying the
 * heading path as context, with a soft cap so each chunk stays a focused retrieval unit.
 */
export interface RawChunk {
  topic: string;
  heading: string;
  content: string;
  tokenCount: number;
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

export function chunkMarkdown(markdown: string, maxTokens = 450): RawChunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let topic = "General";
  let heading = "";
  let buf: string[] = [];
  const chunks: RawChunk[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    buf = [];
    if (!body) return;
    // Split oversized sections on paragraph boundaries.
    const paras = body.split(/\n{2,}/);
    let cur = "";
    for (const p of paras) {
      if (cur && approxTokens(cur + "\n\n" + p) > maxTokens) {
        chunks.push(make(cur));
        cur = p;
      } else cur = cur ? `${cur}\n\n${p}` : p;
    }
    if (cur) chunks.push(make(cur));
  };
  const make = (content: string): RawChunk => {
    const full = `${topic}${heading ? ` › ${heading}` : ""}\n\n${content}`;
    return { topic, heading: heading || topic, content: full, tokenCount: approxTokens(full) };
  };

  for (const line of lines) {
    const h1 = /^#\s+(.*)/.exec(line);
    const h2 = /^##\s+(.*)/.exec(line);
    const h3 = /^###\s+(.*)/.exec(line);
    if (h1) {
      flush();
      topic = h1[1].trim();
      heading = "";
    } else if (h2) {
      flush();
      heading = h2[1].trim();
    } else if (h3) {
      flush();
      heading = `${heading.split(" › ")[0]} › ${h3[1].trim()}`;
    } else buf.push(line);
  }
  flush();
  return chunks;
}
