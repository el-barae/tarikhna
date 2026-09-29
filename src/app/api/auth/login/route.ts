import { authenticate, normalizeEmail, sessionCookie } from '@/server/auth';
import { HttpError } from '@/server/errors';
import { handle, json, readJson } from '@/server/http';
import { withStore } from '@/server/store';
import { publicUser } from '@/server/types';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (typeof body.password !== 'string' || body.password.length > 1024) throw new HttpError(400, 'Mot de passe invalide.');
    const password = body.password;
    const result = await withStore((store) => authenticate(store, email, password, request));
    if ('error' in result) return json({ error: result.error }, result.status, result.status === 429 ? { 'Retry-After': '900' } : {});
    return json({ user: publicUser(result.user) }, 200, { 'Set-Cookie': sessionCookie(result.token, request) });
  });
}
