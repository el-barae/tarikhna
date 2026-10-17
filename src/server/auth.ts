import { createHash, randomBytes } from 'node:crypto';
import type { Role, Store, User } from './types';
import { HttpError } from './errors';
import { verifyPassword } from './password';

export const SESSION_COOKIE = 'history_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ranks: Record<Role, number> = { visitor: 0, editor: 1, administrator: 2 };

/** Disable authentication entirely; every request acts as a local administrator. */
export function isAuthDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISABLE_AUTH === 'true';
}
const AUTH_DISABLED_USER: User = {
  id: 'auth-disabled', name: 'Accès libre', email: 'local@athar.invalid',
  role: 'administrator', disabled: false, passwordHash: '', createdAt: new Date(0).toISOString(),
};

function sessionId(request: Request): string | null {
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}
export function currentUser(store: Store, request: Request): User | null {
  if (isAuthDisabled()) return AUTH_DISABLED_USER;
  const id = sessionId(request);
  const session = id && store.sessions.find((item) => item.id === id && item.expiresAt > Date.now());
  return (session && store.users.find((user) => user.id === session.userId && !user.disabled)) || null;
}
export function requireUser(store: Store, request: Request, role: Role = 'editor'): User {
  const user = currentUser(store, request);
  if (!user) throw new HttpError(401, 'Connectez-vous pour continuer.');
  if (ranks[user.role] < ranks[role]) throw new HttpError(403, 'Vous ne disposez pas des permissions nécessaires.');
  return user;
}
export function sessionCookie(token: string, request: Request, clear = false): string {
  const secure = process.env.NODE_ENV === 'production' || new URL(process.env.APP_ORIGIN || request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
export function revokeSession(store: Store, request: Request): void {
  const id = sessionId(request);
  store.sessions = store.sessions.filter((item) => item.id !== id && item.expiresAt > Date.now());
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new HttpError(400, 'Adresse e-mail invalide.');
  return value.trim().toLowerCase();
}
export function validateRole(value: unknown): Role {
  if (value !== 'visitor' && value !== 'editor' && value !== 'administrator') throw new HttpError(400, 'Rôle invalide.');
  return value;
}
export function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new HttpError(400, 'Le nom doit contenir entre 1 et 100 caractères.');
  return value.trim();
}

type LoginResult = { user: User; token: string } | { error: string; status: number };
export async function authenticate(store: Store, email: string, password: string, request: Request): Promise<LoginResult> {
  const now = Date.now();
  for (const [key, value] of Object.entries(store.loginAttempts)) if (value.expiresAt <= now) delete store.loginAttempts[key];
  // Only trust a proxy-provided address when the deployment explicitly opts in.
  const address = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown' : 'local';
  const emailKey = createHash('sha256').update(`email:${email}`).digest('hex');
  const addressKey = createHash('sha256').update(`ip:${address}`).digest('hex');
  if ((store.loginAttempts[emailKey]?.count || 0) >= 10 || (store.loginAttempts[addressKey]?.count || 0) >= 100) {
    return { error: 'Trop de tentatives. Réessayez dans 15 minutes.', status: 429 };
  }
  for (const key of [emailKey, addressKey]) {
    const previous = store.loginAttempts[key];
    store.loginAttempts[key] = { count: (previous?.count || 0) + 1, expiresAt: previous?.expiresAt || now + 15 * 60_000 };
  }
  const user = store.users.find((item) => item.email === email);
  // A fixed dummy hash keeps unknown accounts on the same expensive verification path.
  const dummy = `scrypt$00000000000000000000000000000000$${'00'.repeat(64)}`;
  const matches = await verifyPassword(password, user?.passwordHash || dummy);
  if (!user || user.disabled || !matches) return { error: 'Adresse e-mail ou mot de passe incorrect.', status: 401 };
  delete store.loginAttempts[emailKey];
  const token = randomBytes(32).toString('hex');
  const id = createHash('sha256').update(token).digest('hex');
  // Rotate the caller's previous session and discard expired sessions.
  revokeSession(store, request);
  store.sessions.push({ id, userId: user.id, expiresAt: now + SESSION_SECONDS * 1000 });
  return { user, token };
}
