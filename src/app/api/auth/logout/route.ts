import { revokeSession, sessionCookie } from '@/server/auth';
import { handle, json, sameOrigin } from '@/server/http';
import { withStore } from '@/server/store';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    await withStore((store) => revokeSession(store, request));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', request, true) });
  });
}
