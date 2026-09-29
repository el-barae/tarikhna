import { randomUUID } from 'node:crypto';
import { readDataset, summarizeChanges, validateDataset, type Dataset } from '@history/core';
import { HttpError } from './errors';
import type { Store, User, Version } from './types';

export function publishedVersion(store: Store): Version {
  const version = store.versions.find((item) => item.id === store.publishedVersionId);
  if (!version) throw new Error('Published dataset is missing.');
  return version;
}
export function findVersion(store: Store, id: string): Version {
  const version = store.versions.find((item) => item.id === id);
  if (!version) throw new HttpError(404, 'Version introuvable.');
  return version;
}
function validatedDataset(input: unknown): Dataset {
  const result = validateDataset(input);
  if (!result.valid || !result.data) throw new HttpError(422, 'Le dataset contient des erreurs.', result.errors);
  return structuredClone(result.data);
}
export function createVersion(store: Store, user: User, input: unknown, summary: unknown, restoredFrom?: string): Version {
  if (user.disabled || user.role === 'visitor') throw new HttpError(403, 'Vous ne disposez pas des permissions nécessaires.');
  const dataset = validatedDataset(input);
  const changes = summarizeChanges(readDataset(publishedVersion(store).dataset), dataset);
  if (user.role !== 'administrator' && changes.removed > 0) throw new HttpError(403, 'Seul un administrateur peut supprimer des données.');
  if (summary !== undefined && (typeof summary !== 'string' || summary.trim().length > 1000)) throw new HttpError(400, 'Le résumé doit contenir au maximum 1000 caractères.');
  const now = new Date().toISOString();
  const version: Version = { id: randomUUID(), version: String(store.versions.length + 1), author: user.name, authorId: user.id, date: now,
    changes: typeof summary === 'string' && summary.trim() ? summary.trim() : `${changes.added} ajout(s), ${changes.modified} modification(s), ${changes.removed} suppression(s)`,
    status: 'draft', dataset, baseVersionId: store.publishedVersionId, history: [{ action: restoredFrom ? 'restore' : 'create', actor: user.id, date: now }], ...(restoredFrom ? { restoredFrom } : {}) };
  store.versions.push(version);
  return version;
}
export function transitionVersion(store: Store, user: User, id: string, action: unknown): Version {
  if (user.disabled || user.role === 'visitor') throw new HttpError(403, 'Vous ne disposez pas des permissions nécessaires.');
  const version = findVersion(store, id);
  if (!['submit', 'approve', 'publish', 'restore'].includes(String(action))) throw new HttpError(400, 'Action inconnue.');
  if (action !== 'submit' && user.role !== 'administrator') throw new HttpError(403, 'Cette action est réservée aux administrateurs.');
  if (action === 'restore') return createVersion(store, user, version.dataset, `Restauration de la version ${version.version}`, version.id);
  if (action === 'submit' && user.role !== 'administrator' && version.authorId !== user.id) throw new HttpError(403, 'Vous pouvez soumettre uniquement vos propres brouillons.');
  const expected = action === 'submit' ? 'draft' : action === 'approve' ? 'review' : 'approved';
  if (version.status !== expected) throw new HttpError(409, `Cette action nécessite une version au statut ${expected}.`);
  if (action === 'publish' && version.baseVersionId && version.baseVersionId !== store.publishedVersionId) {
    throw new HttpError(409, 'Le dataset publié a changé depuis la création de ce brouillon. Comparez les versions puis créez un nouveau brouillon à partir des données actuelles.');
  }
  validatedDataset(version.dataset);
  version.status = action === 'submit' ? 'review' : action === 'approve' ? 'approved' : 'published';
  version.history.push({ action: String(action), actor: user.id, date: new Date().toISOString() });
  if (action === 'publish') store.publishedVersionId = version.id;
  return version;
}
