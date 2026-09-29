import { requireUser } from '@/server/auth';
import { handle, json, readJson } from '@/server/http';
import { withStore } from '@/server/store';
import { transitionVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await readJson(request);
    const { id } = await context.params;
    return withStore((store) => {
      const user = requireUser(store, request);
      return json({ version: transitionVersion(store, user, id, body.action) });
    });
  });
}
