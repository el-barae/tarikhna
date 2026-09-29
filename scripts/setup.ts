import { loadEnvConfig } from '@next/env';
import { withStore, closeStore } from '../src/server/store';
import { addUser } from '../src/server/users';

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const value = (key: string) => { const index = args.indexOf(`--${key}`); return index >= 0 ? args[index + 1] : undefined; };
  const email = value('email') || process.env.ADMIN_EMAIL;
  const password = value('password') || process.env.ADMIN_PASSWORD;
  const name = value('name') || 'Administration';
  if (!email || !password) {
    console.log('Créer le premier administrateur :\n  npm run setup -- --email vous@example.org --password "une-phrase-de-passe-longue" --name "Votre nom"\n\nOu définir ADMIN_EMAIL et ADMIN_PASSWORD (minimum 12 caractères). Aucun compte par défaut n’est créé.');
    process.exitCode = 1;
    return;
  }
  const user = await withStore((store) => addUser(store, { name, email, password, role: 'administrator' }));
  console.log(`Administrateur créé : ${user.email}. Connectez-vous depuis le bouton Connexion de l’atlas.`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Impossible de créer l’administrateur.');
  process.exitCode = 1;
}).finally(closeStore);
