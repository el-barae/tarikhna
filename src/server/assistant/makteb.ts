import { HttpError } from '../errors';
import type { ProxyAgent } from 'undici';

export const MAKTEB_ENDPOINT = 'https://api.makteb.org/mcp';
// api.makteb.org sits behind Cloudflare, which rate-limits (HTTP 429) requests with a missing or
// blocked User-Agent. Node's fetch sends none, so identify the client explicitly.
export const MAKTEB_USER_AGENT = 'Atharahom/1.0';
export const READ_TOOLS = new Set([
  'search_catalog', 'get_book_metadata', 'read_book_pages', 'get_table_of_contents', 'get_author_details',
]);
const MAX_RESPONSE_BYTES = 1024 * 1024;
// A 429 whose Retry-After is this short is waited out once inside the same RPC timeout; longer
// windows (shared datacenter-IP budgets on the upstream CDN) are propagated to the client instead.
const RATE_LIMIT_QUICK_RETRY_SECONDS = 8;

export interface MaktebTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface MaktebResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}
export interface MaktebClient {
  listTools(): Promise<MaktebTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MaktebResult>;
}
/** Optional per-process cache of the discovered read-only schemas (the endpoint is stateless). */
export interface MaktebToolCache { tools?: MaktebTool[] }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function unavailable(): HttpError {
  return new HttpError(502, 'La bibliothèque Makteb est momentanément indisponible. Réessayez dans quelques instants.', { code: 'ASSISTANT_MCP_UNAVAILABLE' });
}
function rateLimited(retryAfter: number): HttpError {
  return new HttpError(503, 'La bibliothèque Makteb limite temporairement les requêtes. Réessayez dans quelques instants.', { code: 'ASSISTANT_MCP_RATE_LIMIT', retryAfter });
}

// Hosting platforms with shared datacenter egress (Vercel, AWS) can be blocked outright by the
// upstream CDN while residential networks pass. MAKTEB_MCP_URL and MAKTEB_PROXY_URL let production
// route these calls through an intermediary with a clean IP without changing any client behaviour.
let overrideWarned = false;
function maktebEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MAKTEB_MCP_URL?.trim();
  if (!override) return MAKTEB_ENDPOINT;
  try {
    const url = new URL(override);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('https URL required');
    return url.toString();
  } catch {
    if (!overrideWarned) { overrideWarned = true; console.error('[assistant:makteb] ignoring invalid MAKTEB_MCP_URL override'); }
    return MAKTEB_ENDPOINT;
  }
}

let proxyDispatcher: ProxyAgent | undefined;
export const maktebFetch: typeof fetch = async (input, init) => {
  const proxy = process.env.MAKTEB_PROXY_URL?.trim();
  if (!proxy) return fetch(input, init);
  const { ProxyAgent: Implementation, fetch: proxied } = await import('undici');
  proxyDispatcher ??= new Implementation(proxy);
  return proxied(String(input), { ...init, dispatcher: proxyDispatcher } as Parameters<typeof proxied>[1]) as unknown as Promise<Response>;
};

/** Abort-aware delay so a rate-limit backoff cannot outlive the request it belongs to. */
async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Makteb exposes stateless JSON-RPC POST, not an SSE stream. */
export class MaktebRpcClient implements MaktebClient {
  private requestId = 0;
  private sessionId?: string;
  private initialized = false;

  constructor(private readonly signal: AbortSignal, private readonly fetcher: typeof fetch = maktebFetch, private readonly cache?: MaktebToolCache) {}

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const timeout = AbortSignal.timeout(20_000);
    const signal = AbortSignal.any([this.signal, timeout]);
    try {
      signal.throwIfAborted();
      const endpoint = maktebEndpoint();
      for (let attempt = 0; ; attempt++) {
        const id = ++this.requestId;
        const response = await this.fetcher(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': MAKTEB_USER_AGENT,
            ...(this.initialized ? { 'MCP-Protocol-Version': '2024-11-05' } : {}),
            ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
          },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal, cache: 'no-store', redirect: 'error',
        });
        if (response.status === 429) {
          await response.body?.cancel();
          const header = Number(response.headers.get('retry-after'));
          const retryAfter = Number.isFinite(header) && header > 0 ? Math.min(Math.round(header), 900) : 60;
          console.error('[assistant:makteb] upstream rate limited, retry-after', retryAfter, 'seconds');
          if (attempt === 0 && retryAfter <= RATE_LIMIT_QUICK_RETRY_SECONDS) {
            await abortableDelay(retryAfter * 1000, signal);
            continue;
          }
          throw rateLimited(retryAfter);
        }
        if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
          await response.body?.cancel();
          // Temporary diagnostic: status, media type and target host only, never the body.
          console.error('[assistant:makteb] upstream error status', response.status, 'from', new URL(endpoint).host, response.headers.get('content-type') ?? 'no content type');
          throw unavailable();
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw unavailable(); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
        const text = Buffer.concat(chunks).toString('utf8');
        let message: unknown;
        try { message = JSON.parse(text); } catch {
          // Temporary diagnostic: status and media type only, never the body.
          console.error('[assistant:makteb] non-JSON response', response.status, response.headers.get('content-type') ?? 'none', 'bytes', text.length);
          throw unavailable();
        }
        if (!isRecord(message) || message.jsonrpc !== '2.0' || message.id !== id || message.error || !('result' in message)) throw unavailable();
        const sessionId = response.headers.get('mcp-session-id');
        if (sessionId && sessionId.length < 512) this.sessionId = sessionId;
        return message.result;
      }
    } catch (error) {
      if (this.signal.aborted) throw this.signal.reason;
      if (error instanceof HttpError) throw error;
      // Temporary diagnostic: error name only (no response body or credentials).
      console.error('[assistant:makteb] request failed', method, error instanceof Error ? error.name : typeof error);
      throw unavailable();
    }
  }

  async listTools(): Promise<MaktebTool[]> {
    // The endpoint is stateless and its read-only schemas change rarely: reuse them across requests.
    if (this.cache?.tools?.length) { this.initialized = true; return this.cache.tools; }
    if (!this.initialized) {
      const result = await this.rpc('initialize', {
        protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'athar-atlas', version: '1.0.0' },
      });
      if (!isRecord(result) || result.protocolVersion !== '2024-11-05') throw unavailable();
      // This server rejects notifications/initialized; no notification is required for its stateless endpoint.
      this.initialized = true;
    }
    const result = await this.rpc('tools/list', {});
    if (!isRecord(result) || !Array.isArray(result.tools)) throw unavailable();
    const seen = new Set<string>();
    const tools: MaktebTool[] = [];
    for (const tool of result.tools) {
      if (!isRecord(tool) || typeof tool.name !== 'string' || !READ_TOOLS.has(tool.name) || seen.has(tool.name)) continue;
      if (!isRecord(tool.inputSchema) || tool.inputSchema.type !== 'object' || JSON.stringify(tool.inputSchema).length > 16_000) continue;
      seen.add(tool.name);
      tools.push({ name: tool.name, description: String(tool.description || tool.name).slice(0, 1200), inputSchema: tool.inputSchema });
    }
    if (!tools.length) throw unavailable();
    if (this.cache) this.cache.tools = tools;
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MaktebResult> {
    if (!READ_TOOLS.has(name)) throw new Error('Tool is not allowed');
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (!isRecord(result)) throw unavailable();
    return result as MaktebResult;
  }
}

/** Enforce published argument types and small requests before calling the read-only service. */
export function validateToolArguments(tool: MaktebTool, input: unknown): Record<string, unknown> {
  if (!isRecord(input) || JSON.stringify(input).length > 4000) throw new Error('Invalid tool arguments');
  const properties = isRecord(tool.inputSchema.properties) ? tool.inputSchema.properties : {};
  const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [];
  for (const name of required) if (typeof name === 'string' && !(name in input)) throw new Error('Missing argument');
  for (const [name, value] of Object.entries(input)) {
    const schema = properties[name];
    if (!isRecord(schema)) throw new Error('Unknown argument');
    if (schema.type === 'string' && (typeof value !== 'string' || value.length > 1000)) throw new Error('Invalid string');
    if ((schema.type === 'number' || schema.type === 'integer') && (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)))) throw new Error('Invalid number');
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error('Invalid option');
    if (typeof value === 'number' && ((typeof schema.minimum === 'number' && value < schema.minimum) || (typeof schema.maximum === 'number' && value > schema.maximum))) throw new Error('Number out of range');
  }
  const args = { ...input };
  if ('limit' in args) args.limit = Math.max(1, Math.min(8, Number(args.limit) || 5));
  if ('page' in args && (!Number.isInteger(args.page) || Number(args.page) < 1)) throw new Error('Invalid page');
  if (typeof args.range === 'string') {
    const match = /^(\d+)\s*-\s*(\d+)$/.exec(args.range);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < Number(match[1]) || Number(match[2]) - Number(match[1]) > 4) throw new Error('Read at most five pages per call');
  }
  return args;
}
