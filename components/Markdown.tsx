/** Tiny markdown renderer for the knowledge files (headings, lists, tables, quotes, bold, code). Content is trusted repo files. */
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inline(s: string) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
}
export function renderMd(md: string) {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) { const buf: string[] = []; i++; while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]); i++; out.push(`<pre>${esc(buf.join("\n"))}</pre>`); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/); if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (l.startsWith(">")) { const buf: string[] = []; while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote><p>${inline(buf.join(" "))}</p></blockquote>`); continue; }
    if (l.startsWith("|")) {
      const rows: string[][] = []; while (i < lines.length && lines[i].startsWith("|")) { const r = lines[i++].split("|").slice(1, -1).map((c) => c.trim()); if (!r.every((c) => /^-+:?$|^:?-+$/.test(c))) rows.push(r); }
      out.push(`<table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s/.test(l)) { const buf: string[] = []; while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) buf.push(lines[i++].replace(/^\s*[-*]\s/, "")); out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`); continue; }
    if (/^\d+\.\s/.test(l)) { const buf: string[] = []; while (i < lines.length && /^\d+\.\s/.test(lines[i])) buf.push(lines[i++].replace(/^\d+\.\s/, "")); out.push(`<ol>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ol>`); continue; }
    if (l.trim()) { const buf: string[] = []; while (i < lines.length && lines[i].trim() && !/^(#|>|\||```|\s*[-*]\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]); out.push(`<p>${inline(buf.join(" "))}</p>`); continue; }
    i++;
  }
  return out.join("\n");
}
export function Markdown({ md }: { md: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(md) }} />;
}
