import type { AssistantSource } from '../../lib/assistant-types';

function bookUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'makteb.org' && !url.username && !url.password && !url.port && /^\/book\/[^/]+\/?$/.test(url.pathname)) return url.href;
  } catch { /* Untrusted or malformed link. */ }
}
function cleanLabel(value: string): string {
  return value.replace(/[*_`#]/g, '').trim().slice(0, 240);
}

/** Reference IDs are assigned by the server solely from successful MCP output. */
export class SourceCollector {
  readonly sources: AssistantSource[] = [];
  private readonly books = new Map<string, { title: string; url: string }>();
  private readonly keys = new Map<string, AssistantSource>();

  collect(tool: string, args: Record<string, unknown>, text: string): AssistantSource[] {
    const references: AssistantSource[] = [];
    const heading = cleanLabel(/^#{1,4}\s+(.+)$/m.exec(text)?.[1] || '');
    const slug = typeof args.slug === 'string' ? args.slug : undefined;
    for (const match of text.matchAll(/\[([^\]\n]{1,300})\]\((https:\/\/[^\s)]+)\)/g)) {
      const url = bookUrl(match[2]);
      if (!url) continue;
      const title = cleanLabel(/^(?:open|read|view|ouvrir)\b/i.test(match[1]) && heading ? heading : match[1]);
      const book = { title, url };
      const linkedSlug = new URL(url).pathname.split('/').filter(Boolean).at(-1)!;
      this.books.set(linkedSlug, book);
      try { this.books.set(decodeURIComponent(linkedSlug), book); } catch { /* Keep the encoded slug for malformed escapes. */ }
      const source = this.add(url, book);
      if (source && !references.includes(source)) references.push(source);
      if (references.length >= 8) break;
    }
    if (slug && ['read_book_pages', 'get_table_of_contents', 'get_book_metadata'].includes(tool)) {
      const book = this.books.get(slug);
      // Page references come from the actual returned passage, never the requested range.
      const locator = /\bVolume\s+[^\n*]{1,100}?Pages?\s+[^\n*()]{1,60}/i.exec(text)?.[0]?.trim()
        || Array.from(text.matchAll(/\[(Vol\.?\s+[^\]\n]{1,80})\]/g)).slice(0, 5).map(match => match[1]).join('; ')
        || undefined;
      if (book || (heading && locator)) {
        const source = this.add(locator ? `${book?.url || slug}|${locator}` : (book?.url || slug), { title: book?.title || heading, ...(book ? { url: book.url } : {}), ...(locator ? { locator } : {}) });
        if (source && !references.includes(source)) references.push(source);
      }
    }
    return references;
  }

  private add(key: string, value: Omit<AssistantSource, 'id'>): AssistantSource | undefined {
    const existing = this.keys.get(key);
    if (existing) return existing;
    if (this.sources.length >= 24 || !value.title) return undefined;
    const source = { id: `S${this.sources.length + 1}`, ...value };
    this.keys.set(key, source);
    this.sources.push(source);
    return source;
  }
}
