import type { Dataset } from '@history/core';

export type Role = 'visitor' | 'editor' | 'administrator';
export type User = { id: string; name: string; email: string; role: Role; disabled: boolean; passwordHash: string; createdAt: string };
export type PublicUser = Omit<User, 'passwordHash'>;
export type VersionStatus = 'draft' | 'review' | 'approved' | 'published';
export type Version = {
  id: string; version: string; author: string; authorId: string; date: string;
  changes: string; status: VersionStatus; dataset: Dataset; restoredFrom?: string; baseVersionId?: string;
  history: Array<{ action: string; actor: string; date: string }>;
};
export type Session = { id: string; userId: string; expiresAt: number };
export type Store = {
  schemaVersion: 1; publishedVersionId: string; versions: Version[]; users: User[];
  sessions: Session[]; loginAttempts: Record<string, { count: number; expiresAt: number }>;
};

export function publicUser(user: User): PublicUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}
