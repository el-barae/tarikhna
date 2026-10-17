import { HttpError } from '../errors';

export const MAKTEB_ENDPOINT = 'https://api.makteb.org/mcp';
// api.makteb.org sits behind Cloudflare, which rate-limits (HTTP 429) requests with a missing or
// blocked User-Agent. Node's fetch sends none, so identify the client explicitly.
export const MAKTEB_USER_AGENT = 'Atharahom/1.0';
export const READ_TOOLS = new Set([
  'search_catalog', 'get_book_metadata', 'read_book_pages', 'get_table_of_contents', 'get_author_details',
]);
const MAX_RESPONSE_BYTES = 1024 * 1024;

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

/** Makteb exposes stateless JSON-RPC POST, not an SSE stream. */
export class MaktebRpcClient implements MaktebClient {
  private requestId = 0;
  private sessionId?: string;
  private initialized = false;

  constructor(private readonly signal: AbortSignal, private readonly fetcher: typeof fetch = fetch, private readonly cache?: MaktebToolCache) {}

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const timeout = AbortSignal.timeout(20_000);
    const signal = AbortSignal.any([this.signal, timeout]);
    try {
      signal.throwIfAborted();
      const id = ++this.requestId;
      const response = await this.fetcher(MAKTEB_ENDPOINT, {
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
        throw rateLimited(retryAfter);
      }
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
        await response.body?.cancel();
        console.error('[assistant:makteb] upstream error status', response.status);
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
      const message: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!isRecord(message) || message.jsonrpc !== '2.0' || message.id !== id || message.error || !('result' in message)) throw unavailable();
      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId && sessionId.length < 512) this.sessionId = sessionId;
      return message.result;
    } catch (error) {
      if (this.signal.aborted) throw this.signal.reason;
      if (error instanceof HttpError) throw error;
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
