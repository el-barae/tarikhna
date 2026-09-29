# Stockage et permissions

Sans `DATABASE_URL`, le serveur utilise `data/.store.json`. Le fichier est privé (mode 0600), protégé par un verrou entre processus et remplacé de façon atomique. Conserver le dossier `data/` sur un volume persistant et sauvegardé. Ce mode convient à une instance locale ; il ne convient pas à un système de fichiers éphémère ou à plusieurs machines.

Avec `DATABASE_URL`, le serveur utilise PostgreSQL et PostGIS. Le schéma `db/schema.sql` est initialisé au premier accès. Le rôle PostgreSQL doit pouvoir créer l’extension PostGIS, ou un administrateur doit exécuter préalablement `CREATE EXTENSION postgis`. En déploiement, appliquer le schéma avec le rôle de migration avant de démarrer un rôle applicatif plus restreint.

Tables : `history_users`, `history_sessions`, `history_datasets`, `history_versions`, `history_features`. Les datasets restent des snapshots JSONB complets, et leurs objets géographiques sont aussi indexés avec GiST en SRID 4326. Les exports JSON et GeoJSON conservent le dataset complet. Les transitions et auteurs sont enregistrés dans chaque version.

La création et les transitions s’effectuent dans une transaction protégée par un verrou consultatif PostgreSQL. Le contenu d’une version existante n’est jamais réécrit par l’adaptateur. Une restauration crée un nouveau brouillon, à soumettre, approuver puis publier. Les anciens snapshots restent consultables.

## Authentification

Aucun compte initial n’est fourni. Lancer :

```sh
npm run setup -- --email vous@example.org --password "votre-phrase-de-passe-longue" --name "Votre nom"
```

Le script charge les fichiers `.env` et `.env.local` comme Next.js. Les variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` peuvent également fournir les identifiants. La commande n’affiche et ne conserve pas le mot de passe en clair. Les mots de passe sont salés et dérivés avec scrypt. Une session utilise un secret aléatoire de 256 bits, dont seul le hash est stocké. Les cookies sont HttpOnly, SameSite=Strict et Secure en production. Utiliser HTTPS en production.

Définir `APP_ORIGIN` avec l’origine publique exacte, par exemple `https://atlas.example.org`. Les écritures vérifient l’origine, les permissions et la taille du corps côté serveur. `TRUST_PROXY=true` permet de limiter les tentatives par adresse issue de `X-Forwarded-For`, uniquement derrière un proxy qui remplace cet en-tête. Par défaut, le serveur ne fait pas confiance à cet en-tête et utilise une limite globale en plus de la limite par compte.

Un éditeur peut créer et soumettre ses brouillons, puis exporter les données publiées. Un administrateur gère les comptes, supprime des données au sein d’une nouvelle version, approuve, publie et restaure. Un visiteur peut consulter le dataset publié. Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé.

## Vérification

```sh
npx vitest run tests/backend.test.ts
```

Pour tester l’adaptateur PostgreSQL, fournir une base **jetable** avec PostGIS. Ce test écrit des utilisateurs, des versions et publie un dataset de test :

```sh
HISTORY_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/athar_test npx vitest run tests/backend-postgres.test.ts
```

Les tests locaux utilisent un dossier temporaire et ne modifient pas `data/`. Les tests PostgreSQL sont ignorés lorsque `HISTORY_TEST_DATABASE_URL` n’est pas défini.

### Connexion locale et erreur 403

Sans `APP_ORIGIN`, le contrôle compare l’origine du navigateur à l’en-tête `Host`
et au protocole de la requête. Cela permet `http://localhost:3000` même lorsque
Next.js écoute sur `0.0.0.0`. Les en-têtes `X-Forwarded-Host` ne sont pas utilisés
pour autoriser une origine.

Si `APP_ORIGIN` est défini, il doit correspondre exactement à l’adresse utilisée
dans le navigateur, y compris le protocole et le port, sans chemin ni slash final.
Après une modification de cette variable, redémarrer le serveur Next.js.
