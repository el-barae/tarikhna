import { createHash } from 'node:crypto';
import { readDataset } from '@history/core';
import { currentUser, requireUser } from '@/server/auth';
import { getAssistantConfiguration, runAssistant } from '@/server/assistant';
import { assistantAtlasContext, parseAssistantRequest, reserveAssistantRequest } from '@/server/assistant-request';
import { HttpError } from '@/server/errors';
import { handle, json, readJson, sameOrigin } from '@/server/http';
import { withStore } from '@/server/store';
import { publishedVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const running = new Set<string>();

function assistantLoginRequired(): boolean {
  return process.env.ASSISTANT_REQUIRE_LOGIN !== 'false';
}

/** Public assistant quotas are keyed by a hash of the trusted proxy IP, never the raw address. */
function anonymousAssistantId(request: Request): string {
  const trustForwardedIp = process.env.TRUST_PROXY === 'true' || process.env.VERCEL === '1';
  const forwardedIp = trustForwardedIp
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined;
  const address = forwardedIp || 'unknown';
  return `anonymous-${createHash('sha256').update(address).digest('hex')}`;
}

export async function GET(request: Request) {
  return handle(() => withStore(store => json({
    ...getAssistantConfiguration(),
    authenticated: !!currentUser(store,request),
    authenticationRequired: assistantLoginRequired(),
  })));
}
export async function POST(request: Request) {
  return handle(async () => {
    let requesterId: string | undefined;
    try {
      sameOrigin(request);
      const authenticationRequired = assistantLoginRequired();
      const user = await withStore(store => {
        const authenticatedUser = currentUser(store,request);
        if (authenticationRequired && !authenticatedUser) return requireUser(store,request,'visitor');
        return authenticatedUser;
      });
      if (!getAssistantConfiguration().configured) throw new HttpError(503, 'L’assistant est en cours de configuration.', { code: 'ASSISTANT_NOT_CONFIGURED' });
      const input = parseAssistantRequest(await readJson(request,80 * 1024));
      requesterId = user?.id || anonymousAssistantId(request);
      if (running.has(requesterId)) throw new HttpError(429, 'Une réponse est déjà en cours. Patientez un instant.', { code: 'ASSISTANT_BUSY' });
      running.add(requesterId);
      const context = await withStore(store => {
        // Release the store lock before any MCP or Bedrock network operation.
        if (authenticationRequired) requireUser(store,request,'visitor');
        const result = assistantAtlasContext(readDataset(publishedVersion(store).dataset), input.context);
        reserveAssistantRequest(store,requesterId!,Date.now(),user ? 20 : 5);
        return result;
      });
      return json(await runAssistant({ messages: input.messages, context },request.signal));
    } catch (error) {
      if (error instanceof HttpError) {
        const details = error.details && typeof error.details === 'object' ? error.details : {};
        const code = 'code' in details && typeof details.code === 'string' ? details.code : undefined;
        const retryAfter = 'retryAfter' in details && typeof details.retryAfter === 'number' ? details.retryAfter : error.status === 429 ? 60 : undefined;
        return json({ error: error.message, ...(code ? { code } : {}) },error.status,retryAfter !== undefined ? { 'Retry-After': String(retryAfter) } : {});
      }
      throw error;
    } finally {
      if (requesterId) running.delete(requesterId);
    }
  });
}
