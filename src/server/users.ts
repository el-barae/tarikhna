import { randomUUID } from 'node:crypto';
import { normalizeEmail, validateName, validateRole } from './auth';
import { HttpError } from './errors';
import { hashPassword, validatePassword } from './password';
import type { Store, User } from './types';

export async function addUser(store: Store, input: Record<string, unknown>): Promise<User> {
  const email = normalizeEmail(input.email);
  const name = validateName(input.name);
  const role = validateRole(input.role);
  validatePassword(input.password);
  if (store.users.some((user) => user.email === email)) throw new HttpError(409, 'Un utilisateur possède déjà cette adresse e-mail.');
  const user: User = { id: randomUUID(), name, email, role, disabled: false, passwordHash: await hashPassword(input.password), createdAt: new Date().toISOString() };
  store.users.push(user);
  return user;
}
export function updateUser(store: Store, input: Record<string, unknown>): User {
  const user = store.users.find((item) => item.id === input.id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
  const role = input.role === undefined ? user.role : validateRole(input.role);
  if (input.disabled !== undefined && typeof input.disabled !== 'boolean') throw new HttpError(400, 'Le champ disabled doit être un booléen.');
  const disabled = input.disabled === undefined ? user.disabled : input.disabled as boolean;
  if (user.role === 'administrator' && !user.disabled && (role !== 'administrator' || disabled) && !store.users.some((other) => other.id !== user.id && other.role === 'administrator' && !other.disabled)) {
    throw new HttpError(409, 'Le dernier administrateur actif doit être conservé.');
  }
  user.role = role;
  user.disabled = disabled;
  if (disabled) store.sessions = store.sessions.filter((session) => session.userId !== user.id);
  return user;
}
