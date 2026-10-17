import { describe, expect, it, vi } from 'vitest';
import { MAKTEB_ENDPOINT, MAKTEB_USER_AGENT, MaktebRpcClient, validateToolArguments, type MaktebTool } from '../src/server/assistant/makteb';

const catalog: MaktebTool = { name: 'search_catalog', description: 'Search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, tradition: { type: 'string', enum: ['sunni', 'shia'] }, limit: { type: 'number' } }, required: ['query'] } };
const pages: MaktebTool = { name: 'read_book_pages', description: 'Read', inputSchema: { type: 'object', properties: { slug: { type: 'string' }, range: { type: 'string' }, page: { type: 'number' } }, required: ['slug'] } };
function envelope(id: number, result: unknown, headers?: HeadersInit) { return Response.json({ jsonrpc: '2.0', id, result }, { headers }); }
function harness() {
  const fetcher = vi.fn<typeof fetch>();
  const controller = new AbortController();
  return { fetcher, controller, client: new MaktebRpcClient(controller.signal, fetcher) };
}

describe('Makteb JSON-RPC transport', () => {
  it('negotiates the observed protocol, discovers current schemas and posts only read requests', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(envelope(1, { protocolVersion: '2024-11-05' }, { 'Mcp-Session-Id': 'test-session' }));
    h.fetcher.mockResolvedValueOnce(envelope(2, { tools: [catalog, pages] }));
    h.fetcher.mockResolvedValueOnce(envelope(3, { content: [{ type: 'text', text: 'Passage.' }] }));
    expect(await h.client.listTools()).toEqual([catalog, pages]);
    expect(await h.client.callTool('read_book_pages', { slug: 'tarikh', range: '1-1' })).toEqual({ content: [{ type: 'text', text: 'Passage.' }] });
    const calls = h.fetcher.mock.calls.map(([url, options]) => ({ url, options, body: JSON.parse(options!.body as string) }));
    expect(calls.map(call => call.body.method)).toEqual(['initialize', 'tools/list', 'tools/call']);
    expect(calls.map(call => call.body.id)).toEqual([1, 2, 3]);
    expect(calls.every(call => call.url === MAKTEB_ENDPOINT && call.options?.method === 'POST' && call.options.redirect === 'error' && call.options.cache === 'no-store')).toBe(true);
    // Cloudflare in front of api.makteb.org rate-limits requests without an identifying User-Agent.
    expect(calls.every(call => (call.options?.headers as Record<string, string>)['User-Agent'] === MAKTEB_USER_AGENT)).toBe(true);
    expect(calls[1].options?.headers).toMatchObject({ 'MCP-Protocol-Version': '2024-11-05', 'Mcp-Session-Id': 'test-session' });
    expect(calls[2].body.params).toEqual({ name: 'read_book_pages', arguments: { slug: 'tarikh', range: '1-1' } });
  });

  it('filters unknown, duplicate and unusable schemas before advertising tools', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(envelope(1, { protocolVersion: '2024-11-05' }));
    h.fetcher.mockResolvedValueOnce(envelope(2, { tools: [
      { ...catalog, name: 'delete_book' }, catalog, catalog,
      { ...pages, inputSchema: { type: 'string' } },
      { ...pages, inputSchema: { type: 'object', description: 'x'.repeat(16_001) } },
    ] }));
    expect(await h.client.listTools()).toEqual([catalog]);
  });

  it.each([
    ['non-JSON', () => new Response('<html>Unavailable</html>')],
    ['wrong ID', () => Response.json({ jsonrpc: '2.0', id: 99, result: {} })],
    ['wrong version', () => Response.json({ jsonrpc: '1.0', id: 1, result: {} })],
    ['RPC error', () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Private backend details' } })],
    ['missing result', () => Response.json({ jsonrpc: '2.0', id: 1 })],
    ['HTTP error', () => new Response('Private backend details', { status: 500 })],
    ['incompatible protocol', () => envelope(1, { protocolVersion: '2099-01-01' })],
  ])('rejects %s without forwarding remote error details', async (_name, makeResponse) => {
    const h = harness();
    h.fetcher.mockResolvedValue(makeResponse());
    const error = await h.client.listTools().catch(value => value);
    expect(error).toMatchObject({ status: 502, details: { code: 'ASSISTANT_MCP_UNAVAILABLE' } });
    expect(error.message).not.toContain('Private backend');
    expect(h.fetcher).toHaveBeenCalledOnce();
  });

  it('reports upstream rate limiting with a Retry-After instead of a generic failure', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Too Many Requests' } }), { status: 429, headers: { 'Retry-After': '240' } }));
    const error = await h.client.listTools().catch(value => value);
    expect(error).toMatchObject({ status: 503, details: { code: 'ASSISTANT_MCP_RATE_LIMIT', retryAfter: 240 } });
    expect(h.fetcher).toHaveBeenCalledOnce();
  });

  it('reuses cached read-only schemas without repeating discovery', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    const cache = {};
    fetcher.mockResolvedValueOnce(envelope(1, { protocolVersion: '2024-11-05' }));
    fetcher.mockResolvedValueOnce(envelope(2, { tools: [catalog, pages] }));
    expect(await new MaktebRpcClient(controller.signal, fetcher, cache).listTools()).toEqual([catalog, pages]);
    expect(await new MaktebRpcClient(controller.signal, fetcher, cache).listTools()).toEqual([catalog, pages]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects empty discovery rather than invoking an unconstrained model', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(envelope(1, { protocolVersion: '2024-11-05' }));
    h.fetcher.mockResolvedValueOnce(envelope(2, { tools: [{ ...catalog, name: 'run_shell' }] }));
    await expect(h.client.listTools()).rejects.toMatchObject({ status: 502 });
  });

  it('rejects oversized Content-Length before consuming the body', async () => {
    const h = harness();
    const body = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new TextEncoder().encode('{}')); } });
    const cancel = vi.spyOn(body, 'cancel');
    h.fetcher.mockResolvedValue(new Response(body, { headers: { 'Content-Length': '1048577' } }));
    await expect(h.client.listTools()).rejects.toMatchObject({ status: 502 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('stops an oversized stream even without Content-Length', async () => {
    const h = harness();
    const cancelled = vi.fn();
    h.fetcher.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new Uint8Array(600_000)); stream.enqueue(new Uint8Array(600_000)); },
      cancel: cancelled,
    })));
    await expect(h.client.listTools()).rejects.toMatchObject({ status: 502 });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('rejects a disallowed tool without making a network request', async () => {
    const h = harness();
    await expect(h.client.callTool('delete_book', {})).rejects.toThrow('Tool is not allowed');
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('preserves caller cancellation and does not begin another fetch', async () => {
    const h = harness();
    const reason = new DOMException('Cancelled', 'AbortError');
    h.controller.abort(reason);
    await expect(h.client.listTools()).rejects.toBe(reason);
    expect(h.fetcher).not.toHaveBeenCalled();
  });
});

describe('Makteb arguments', () => {
  it('limits catalog results and accepts the actual page schema', () => {
    expect(validateToolArguments(catalog, { query: 'Tabari', limit: 30 })).toEqual({ query: 'Tabari', limit: 8 });
    expect(validateToolArguments(pages, { slug: 'tarikh', range: '40-44', page: 40 })).toEqual({ slug: 'tarikh', range: '40-44', page: 40 });
  });
  it.each([
    [catalog, {}], [catalog, { query: 23 }], [catalog, { query: 'Tabari', tradition: 'unknown' }],
    [catalog, { query: 'Tabari', limit: Infinity }], [catalog, { query: 'x'.repeat(1001) }],
    [pages, { slug: 'tarikh', page_offset: 0 }], [pages, { slug: 'tarikh', page: 0 }],
    [pages, { slug: 'tarikh', page: 1.5 }], [pages, { slug: 'tarikh', range: '1-6' }],
    [pages, { slug: 'tarikh', range: '9-2' }], [pages, { slug: 'tarikh', range: '1-1000000' }],
  ])('rejects invalid or excessive arguments %#', (schema, args) => {
    expect(() => validateToolArguments(schema as MaktebTool, args)).toThrow();
  });
});
