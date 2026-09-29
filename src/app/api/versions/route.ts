import { requireUser } from '@/server/auth';
import { handle, json, readJson } from '@/server/http';
import { withStore } from '@/server/store';
import { HttpError } from '@/server/errors';
import { createVersion } from '@/server/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(() => withStore((store) => {
    requireUser(store, request);
    return json({ versions: [...store.versions].reverse().map(({ dataset: _, ...version }) => version), publishedVersionId: store.publishedVersionId });
  }));
}
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    return withStore((store) => {
      const user = requireUser(store, request);
      if (body.baseVersionId !== undefined && body.baseVersionId !== store.publishedVersionId) throw new HttpError(409, 'La carte publiée a changé. Rechargez-la avant de reprendre cette modification.');
      return json({ version: createVersion(store, user, body.dataset, body.summary) }, 201);
    });
  });
}
