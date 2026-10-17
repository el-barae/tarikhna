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

export async function GET(request: Request) {
  return handle(() => withStore(store => json({ ...getAssistantConfiguration(), authenticated: !!currentUser(store,request) })));
}
export async function POST(request: Request) {
  return handle(async () => {
    let userId: string | undefined;
    try {
      sameOrigin(request);
      const user = await withStore(store => requireUser(store,request,'visitor'));
      if (!getAssistantConfiguration().configured) throw new HttpError(503, 'L’assistant est en cours de configuration.', { code: 'ASSISTANT_NOT_CONFIGURED' });
      const input = parseAssistantRequest(await readJson(request,80 * 1024));
      if (running.has(user.id)) throw new HttpError(429, 'Une réponse est déjà en cours. Patientez un instant.', { code: 'ASSISTANT_BUSY' });
      userId = user.id;
      running.add(userId);
      const context = await withStore(store => {
        // Release the store lock before any MCP or Bedrock network operation.
        requireUser(store,request,'visitor');
        const result = assistantAtlasContext(readDataset(publishedVersion(store).dataset), input.context);
        reserveAssistantRequest(store,user.id);
        return result;
      });
      return json(await runAssistant({ messages: input.messages, context },request.signal));
    } catch (error) {
      if (error instanceof HttpError) {
        const code = error.details && typeof error.details === 'object' && 'code' in error.details ? error.details.code : undefined;
        const retryAfter = error.details && typeof error.details === 'object' && 'retryAfter' in error.details && typeof error.details.retryAfter === 'number' ? error.details.retryAfter : 60;
        return json({ error: error.message, ...(typeof code === 'string' ? { code } : {}) },error.status,error.status === 429 ? { 'Retry-After': String(retryAfter) } : {});
      }
      throw error;
    } finally {
      if (userId) running.delete(userId);
    }
  });
}
