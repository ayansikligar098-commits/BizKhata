/**
 * Tiny dependency-free Markdown renderer for AI chat replies.
 *
 * Renders headings, paragraphs, ordered/unordered lists, tables, fenced
 * code blocks, inline code, bold and italic. Everything else is plain
 * text. All user-visible text is HTML-escaped FIRST, so a reply can
 * never inject markup; the renderer only ever emits the small safe set
 * of tags below. Tolerant of partial text (a stream cut mid-fence or
 * mid-emphasis still renders — the fence is closed, the emphasis is
 * left literal). Used for BOT messages only; user messages stay plain.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline formatting on already-escaped text: `code`, **bold**, *italic*. */
function renderInline(escaped: string): string {
  let out = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Single *...* only when it is not part of a ** pair.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out;
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function tableRow(line: string, header: boolean): string {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const tag = header ? 'th' : 'td';
  return `<tr>${cells.map((c) => `<${tag}>${renderInline(escapeHtml(c))}</${tag}>`).join('')}</tr>`;
}

/** Convert a whole reply to safe HTML (class hooks live in globals.css). */
export function markdownToHtml(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const html: string[] = [];
  let i = 0;
  let inFence = false;
  let fenceLang = '';
  let fenceBuf: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    html.push(`<p>${renderInline(escapeHtml(para.join(' ')))}</p>`);
    para = [];
  };
  const flushFence = () => {
    html.push(`<pre><code${fenceLang ? ` class="lang-${escapeHtml(fenceLang)}"` : ''}>${escapeHtml(fenceBuf.join('\n'))}</code></pre>`);
    fenceBuf = [];
    inFence = false;
    fenceLang = '';
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      if (inFence) {
        flushFence();
      } else {
        flushPara();
        inFence = true;
        fenceLang = fence[1] || '';
      }
      i++;
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushPara();
      const level = heading[1].length + 1; // # → h2, ## → h3 (h1 is the page title)
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
      i++;
      continue;
    }
    // Pipe table: header row + separator row, then body rows.
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara();
      const rows: string[] = [tableRow(line, true)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(tableRow(lines[i], false));
        i++;
      }
      html.push(`<table>${rows.join('')}</table>`);
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.+)$/);
    if (ul) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*•]\s+(.+)$/);
        if (!m) break;
        items.push(`<li>${renderInline(escapeHtml(m[1].trim()))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ol) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!m) break;
        items.push(`<li>${renderInline(escapeHtml(m[1].trim()))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  // Partial stream safety: an unclosed fence still renders as code.
  if (inFence) flushFence();
  flushPara();
  return html.join('\n');
}
