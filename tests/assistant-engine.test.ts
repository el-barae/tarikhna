import { describe, expect, it, vi } from 'vitest';
import type { ContentBlock, ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { createAssistantRunner, getAssistantConfiguration, type AssistantDependencies, type AssistantInput, type BedrockTransport } from '../src/server/assistant';
import type { MaktebClient, MaktebTool } from '../src/server/assistant/makteb';

const env = { NODE_ENV: 'test', AWS_REGION: 'us-east-1', BEDROCK_MODEL_ID: 'global.anthropic.claude-haiku-4-5-20251001-v1:0' } as NodeJS.ProcessEnv;
const input: AssistantInput = { messages: [{ role: 'user', content: 'Quelles sources parlent de Bagdad ?' }], context: '{"locale":"fr","year":800}' };
const catalog: MaktebTool = { name: 'search_catalog', description: 'Find a book', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } };
const pages: MaktebTool = { name: 'read_book_pages', description: 'Read pages', inputSchema: { type: 'object', properties: { slug: { type: 'string' }, range: { type: 'string' }, volume: { type: 'string' } }, required: ['slug'] } };
const book = 'https://makteb.org/book/tarikh';

function response(content: ContentBlock[], stopReason: ConverseCommandOutput['stopReason'] = 'end_turn'): ConverseCommandOutput {
  return { $metadata: {}, output: { message: { role: 'assistant', content } }, stopReason, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }, metrics: { latencyMs: 1 } };
}
function tool(name: string, toolUseId: string, args: Record<string, unknown>): ContentBlock {
  return { toolUse: { name, toolUseId, input: args as NonNullable<ContentBlock.ToolUseMember['toolUse']>['input'] } };
}
function harness(overrides: AssistantDependencies = {}) {
  const mcp = { listTools: vi.fn<MaktebClient['listTools']>().mockResolvedValue([catalog, pages]), callTool: vi.fn<MaktebClient['callTool']>() };
  const bedrock = { send: vi.fn<BedrockTransport['send']>(), destroy: vi.fn() };
  const createMcpClient = vi.fn<NonNullable<AssistantDependencies['createMcpClient']>>(() => mcp);
  const createBedrockClient = vi.fn<NonNullable<AssistantDependencies['createBedrockClient']>>(() => bedrock);
  const run = createAssistantRunner({ env, createMcpClient, createBedrockClient, ...overrides });
  return { run, mcp, bedrock, createMcpClient, createBedrockClient };
}

describe('assistant research engine', () => {
  it('uses discovered schemas and pairs every tool result with its model request ID', async () => {
    const h = harness();
    const requests: ConverseCommandInput[] = [];
    h.bedrock.send.mockImplementation(async command => {
      requests.push(structuredClone(command));
      if (requests.length === 1) return response([tool('search_catalog', 'lookup-1', { query: 'Tabari', limit: 30 })], 'tool_use');
      if (requests.length === 2) return response([tool('read_book_pages', 'pages-2', { slug: 'tarikh', range: '1-2', volume: 'Jild 1' })], 'tool_use');
      return response([{ text: 'Le passage consulté décrit la ville [S2]. La référence inconnue [S99] est ignorée.' }]);
    });
    h.mcp.callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: `- **[Histoire de Tabari](${book})**` }] });
    // The service returned different pages: citations must reflect its output, not the requested range.
    h.mcp.callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '### Manuscript Pages — Histoire de Tabari\n*Volume 1, Pages 15–16 (Target: Page 15)*\n**[Vol. 1 Page 15] Passage #1**:\nUn passage historique.' }] });

    const result = await h.run(input);
    expect(requests[0].toolConfig?.tools?.[1]).toMatchObject({ toolSpec: { name: 'read_book_pages', inputSchema: { json: pages.inputSchema } } });
    expect(requests[0].inferenceConfig).toMatchObject({ maxTokens: 2000, temperature: 0.2 });
    expect(requests[0].inferenceConfig).not.toHaveProperty('topP');
    expect(h.mcp.callTool).toHaveBeenNthCalledWith(1, 'search_catalog', { query: 'Tabari', limit: 8 });
    expect(h.mcp.callTool).toHaveBeenNthCalledWith(2, 'read_book_pages', { slug: 'tarikh', range: '1-2', volume: 'Jild 1' });
    expect(requests[1].messages?.at(-2)?.content?.[0].toolUse?.toolUseId).toBe('lookup-1');
    expect(requests[1].messages?.at(-1)?.content?.[0].toolResult).toMatchObject({ toolUseId: 'lookup-1', status: 'success' });
    expect(requests[2].messages?.at(-1)?.content?.[0].toolResult).toMatchObject({ toolUseId: 'pages-2', status: 'success' });
    expect(result.sources).toEqual([
      { id: 'S1', title: 'Histoire de Tabari', url: book },
      { id: 'S2', title: 'Histoire de Tabari', url: book, locator: 'Volume 1, Pages 15–16' },
    ]);
    expect(result.message).toContain('[S2]');
    expect(result.message).not.toContain('[S99]');
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });

  it('groups simultaneous tool results and excludes failed output from references', async () => {
    const h = harness();
    h.bedrock.send.mockResolvedValueOnce(response([
      tool('search_catalog', 'first', { query: 'Bagdad' }), tool('read_book_pages', 'second', { slug: 'missing', range: '1-1' }),
    ], 'tool_use')).mockResolvedValueOnce(response([{ text: 'Un ouvrage existe [S1]. Le passage est indisponible [S2].' }]));
    h.mcp.callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: `[Histoire](${book})` }] });
    h.mcp.callTool.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: '[Fausse preuve](https://makteb.org/book/error)' }] });
    const result = await h.run(input);
    const results = h.bedrock.send.mock.calls[1][0].messages?.at(-1)?.content;
    expect(results?.map(block => [block.toolResult?.toolUseId, block.toolResult?.status])).toEqual([['first', 'success'], ['second', 'error']]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe(book);
    expect(result.message).not.toContain('[S2]');
    expect(result.warnings).toContain('TOOL_FAILED');
  });

  it('does not call an unadvertised tool or send invalid arguments to Makteb', async () => {
    const h = harness();
    h.bedrock.send.mockResolvedValueOnce(response([
      tool('delete_book', 'unsafe', { slug: 'tarikh' }), tool('search_catalog', 'invalid', { query: 42 }),
    ], 'tool_use')).mockResolvedValueOnce(response([{ text: 'Les outils demandés sont indisponibles.' }]));
    const result = await h.run(input);
    expect(h.mcp.callTool).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining(['TOOL_FAILED', 'SOURCES_UNAVAILABLE']));
  });

  it('rejects links outside canonical Makteb book pages as citation sources', async () => {
    const h = harness();
    h.bedrock.send.mockResolvedValueOnce(response([tool('search_catalog', 'lookup', { query: 'Bagdad' })], 'tool_use')).mockResolvedValueOnce(response([{ text: 'Aucune référence exploitable [S1].' }]));
    h.mcp.callTool.mockResolvedValue({ content: [{ type: 'text', text: '[Phishing](https://makteb.org.attacker.test/book/a)\n[Credentials](https://user:secret@makteb.org/book/a)\n[Script](javascript:alert(1))\n[Other](https://other.example/book/a)' }] });
    const result = await h.run(input);
    expect(result.sources).toEqual([]);
    expect(result.message).not.toContain('[S1]');
  });

  it('bounds tool results before sending them to Bedrock and reports a truncated answer', async () => {
    const h = harness();
    h.bedrock.send.mockResolvedValueOnce(response([tool('search_catalog', 'large', { query: 'Tabari' })], 'tool_use')).mockResolvedValueOnce(response([{ text: 'a'.repeat(15_000) }], 'max_tokens'));
    h.mcp.callTool.mockResolvedValue({ content: [{ type: 'text', text: `${'x'.repeat(20_000)}[Hidden](https://makteb.org/book/hidden)` }] });
    const result = await h.run(input);
    const payload = h.bedrock.send.mock.calls[1][0].messages?.at(-1)?.content?.[0].toolResult?.content?.[0].text;
    expect(JSON.parse(payload!).untrustedDocument).toHaveLength(14_000);
    expect(JSON.parse(payload!).truncated).toBe(true);
    expect(result.sources).toEqual([]);
    expect(result.message).toHaveLength(12_000);
    expect(result.warnings).toContain('ANSWER_TRUNCATED');
  });

  it('terminates repeated research at eight tools and five model calls', async () => {
    const h = harness();
    let call = 0;
    h.bedrock.send.mockImplementation(async () => response([
      tool('search_catalog', `q-${++call}`, { query: 'Tabari' }), tool('search_catalog', `q-${++call}`, { query: 'Bagdad' }),
    ], 'tool_use'));
    h.mcp.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'No results.' }] });
    await expect(h.run(input)).rejects.toMatchObject({ status: 502, details: { code: 'ASSISTANT_RESEARCH_LIMIT' } });
    expect(h.bedrock.send).toHaveBeenCalledTimes(5);
    expect(h.mcp.callTool).toHaveBeenCalledTimes(8);
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });

  it('forces a final text answer through the synthetic tool on the last round', async () => {
    const h = harness();
    const requests: ConverseCommandInput[] = [];
    let call = 0;
    h.bedrock.send.mockImplementation(async command => {
      requests.push(structuredClone(command));
      if (requests.length < 5) return response([tool('search_catalog', `q-${++call}`, { query: 'Tabari' })], 'tool_use');
      return response([tool('submit_answer', 'final', { answer: 'Réponse finale fondée sur les preuves déjà réunies [S1].' })], 'tool_use');
    });
    h.mcp.callTool.mockResolvedValue({ content: [{ type: 'text', text: `[Ouvrage](${book})` }] });
    const result = await h.run(input);
    expect(requests.at(-1)?.toolConfig).toMatchObject({ tools: [{ toolSpec: { name: 'submit_answer' } }], toolChoice: { tool: { name: 'submit_answer' } } });
    expect(requests.at(-1)?.system?.at(-1)?.text).toContain('research budget is now exhausted');
    expect(result.message).toContain('Réponse finale');
    expect(result.sources).toHaveLength(1);
  });

  it('does not contact either service until region and model are configured', async () => {
    const h = harness({ env: { NODE_ENV: 'test', AWS_REGION: ' ' } as NodeJS.ProcessEnv });
    expect(getAssistantConfiguration({ NODE_ENV: 'test', AWS_DEFAULT_REGION: 'eu-west-1', BEDROCK_MODEL_ID: ' profile ' })).toEqual({ configured: true });
    await expect(h.run(input)).rejects.toMatchObject({ status: 503, details: { code: 'ASSISTANT_NOT_CONFIGURED' } });
    expect(h.createMcpClient).not.toHaveBeenCalled();
    expect(h.createBedrockClient).not.toHaveBeenCalled();
  });

  it('keeps bearer credentials server-side and lets the SDK resolve IAM credentials otherwise', async () => {
    const h = harness({ env: { ...env, AWS_BEARER_TOKEN_BEDROCK: ' private-token ' } });
    h.bedrock.send.mockResolvedValue(response([{ text: 'Bonjour.' }]));
    const reply = await h.run(input);
    expect(h.createBedrockClient).toHaveBeenCalledWith(expect.objectContaining({ token: { token: 'private-token' }, authSchemePreference: ['httpBearerAuth'] }));
    expect(JSON.stringify(reply)).not.toContain('private-token');
    const iam = harness();
    iam.bedrock.send.mockResolvedValue(response([{ text: 'Bonjour.' }]));
    await iam.run(input);
    expect(iam.createBedrockClient.mock.calls[0][0]).not.toHaveProperty('credentials');
    expect(iam.createBedrockClient.mock.calls[0][0]).not.toHaveProperty('token');
  });

  it.each([
    ['CredentialsProviderError', 'ASSISTANT_CREDENTIALS', 503],
    ['AccessDeniedException', 'ASSISTANT_CREDENTIALS', 503],
    ['ValidationException', 'ASSISTANT_MODEL_UNAVAILABLE', 503],
    ['ResourceNotFoundException', 'ASSISTANT_MODEL_UNAVAILABLE', 503],
    ['ThrottlingException', 'ASSISTANT_UNAVAILABLE', 503],
    ['UnexpectedFailure', 'ASSISTANT_UNAVAILABLE', 502],
  ])('sanitizes %s without exposing provider details', async (name, code, status) => {
    const h = harness();
    h.bedrock.send.mockRejectedValue(Object.assign(new Error('SECRET TOKEN arn:aws:private-account'), { name }));
    const error = await h.run(input).catch(value => value);
    expect(error).toMatchObject({ status, details: { code } });
    expect(error.message).not.toMatch(/SECRET|private-account/);
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });

  it('aborts before opening a service and cancels an in-flight model call', async () => {
    const before = harness();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(before.run(input, alreadyAborted.signal)).rejects.toMatchObject({ details: { code: 'ASSISTANT_TIMEOUT' } });
    expect(before.createMcpClient).not.toHaveBeenCalled();

    const h = harness();
    const controller = new AbortController();
    h.bedrock.send.mockImplementation(async (_command, signal) => {
      controller.abort();
      signal.throwIfAborted();
      return response([{ text: 'Unreachable' }]);
    });
    await expect(h.run(input, controller.signal)).rejects.toMatchObject({ status: 504, details: { code: 'ASSISTANT_TIMEOUT' } });
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });

  it('propagates the configured time budget through the transport signal', async () => {
    const h = harness({ timeoutMs: 5 });
    h.bedrock.send.mockImplementation((_command, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await expect(h.run(input)).rejects.toMatchObject({ status: 504, details: { code: 'ASSISTANT_TIMEOUT' } });
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });

  it('still enforces the time budget when a provider ignores cancellation', async () => {
    const h = harness({ timeoutMs: 5 });
    h.bedrock.send.mockImplementation(() => new Promise(() => {}));
    await expect(h.run(input)).rejects.toMatchObject({ status: 504, details: { code: 'ASSISTANT_TIMEOUT' } });
    expect(h.bedrock.destroy).toHaveBeenCalledOnce();
  });
});
