# Architecture d’Atharahom

## Organisation

```text
public/islamic-history.json ─┐
import JSON / éditeur ───────┼→ packages/core : validation, relations, temps
                            ↓
                    API Next.js / Node.js
                            ↓
          snapshots versionnés et permissions
              ↙                         ↘
     fichier local                 PostgreSQL/PostGIS
              ↘                         ↙
                   dataset publié
                         ↓
              Atlas React + MapLibre
                         ↓
              Web / WebView Expo mobile
```

- `packages/core/src` : types TypeScript indépendants de React et du serveur, validation du JSON, relations par IDs, sélection temporelle, recherche, résumé des changements et export GeoJSON complet.
- `src/components/Atlas.tsx` : carte, recherche, timeline, fiches, couches et langues. La carte MapLibre est isolée dans `HistoricalMap.tsx`.
- `src/components/Studio.tsx`, `HistoricalFields.tsx`, `JsonEditor.tsx`, `GeometryEditor.tsx` : import, validation, édition, comparaison et cycle de publication. CodeMirror fournit l’édition JSON.
- `src/app/api` : endpoints HTTP. Chaque écriture et chaque endpoint privé vérifient les permissions côté serveur.
- `src/server` : sessions, mots de passe, stockage, utilisateurs et transitions des versions.
- `db/schema.sql` : tables relationnelles, snapshots JSONB et index PostGIS.
- `mobile` : application Expo/React Native utilisant une WebView de l’application Web. `mobile/shared/history.ts` expose le domaine partagé pour de futurs écrans natifs. Aucun binaire Android/iOS n’est fourni.

Le JSON reste le format d’import et d’export officiel. Le fichier dans `public/` initialise le stockage au premier accès. Après cette initialisation, le dataset publié est lu dans le stockage : modifier le fichier de démonstration ne remplace pas les versions déjà enregistrées. Importer les changements par le Studio pour conserver l’historique.

Les géographies de référence Natural Earth dans `public/geography/` servent au fond de carte. Les territoires, villes, événements et routes historiques proviennent du dataset. Les polygones de démonstration sont identifiés comme schématiques, avec un niveau d’incertitude ; ils ne constituent pas une reconstitution précise des frontières.

## Données et temps

Le dataset sépare `metadata`, `periods`, `states`, `cities`, `events`, `people`, `routes` et `sources`. Les liens utilisent des IDs. Les noms et descriptions acceptent les langues française, anglaise et arabe. L’interface applique le RTL pour l’arabe.

Les territoires d’un même État peuvent posséder plusieurs géométries datées. Le domaine sélectionne les entités actives et leurs géométries pour l’année demandée. L’année pilote ensuite les sources GeoJSON de MapLibre. La recherche explore le dataset complet, ce qui permet de retrouver une entité hors de la période affichée.

La validation est effectuée dans le Studio et à nouveau sur le serveur : champs, IDs, coordonnées, relations, intervalles de dates, sources et structure GeoJSON. Le serveur accepte au maximum 10 Mo par corps JSON. L’export GeoJSON conserve un membre `dataset` contenant la structure complète, y compris les entités non géographiques. Un filtre `year` réduit les features exportées et conserve ce dataset complet.

## Authentification et autorisation

Aucun compte ou mot de passe par défaut. `npm run setup` crée un administrateur à partir des arguments `--email`, `--password`, `--name`, ou de `ADMIN_EMAIL` et `ADMIN_PASSWORD`. Le script charge les mêmes fichiers d’environnement que Next.js. Le mot de passe doit contenir au moins 12 caractères et est dérivé avec scrypt et un sel aléatoire.

Les sessions expirent après sept jours. Le navigateur reçoit un secret aléatoire de 256 bits ; le stockage conserve son hash SHA-256. Le cookie est HttpOnly et SameSite=Strict, avec Secure en production. Une déconnexion révoque la session dans le stockage. Désactiver un compte révoque ses sessions. Les permissions sont relues à chaque requête ; changer le rôle prend donc effet sans attendre une nouvelle connexion.

| Rôle | Actions |
| --- | --- |
| Visiteur | Consulter le dataset publié, chercher et utiliser la timeline |
| Éditeur | Créer un brouillon, importer, modifier, soumettre ses brouillons et exporter |
| Administrateur | Actions de l’éditeur, gestion des comptes, suppression d’entités, approbation, publication et restauration |

Les écritures refusent les origines étrangères et les corps incorrects. La connexion limite les essais par adresse e-mail et par adresse client lorsqu’un proxy approuvé est configuré ; sinon une limite globale complète la limite par compte. Ces compteurs sont persistés. Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé.

## Versions et conflits

```text
nouveau snapshot → draft → review → approved → published
                    ↑                         
          restauration d’un ancien snapshot
```

- Enregistrer crée toujours une nouvelle version. Le contenu des anciennes versions reste consultable.
- Soumettre déclenche la validation et passe un brouillon en `review`.
- Approuver et publier sont réservés à l’administrateur.
- Publier remplace uniquement le pointeur du dataset public. Les précédentes versions publiées sont conservées.
- Restaurer copie le snapshot choisi dans une **nouvelle version draft**. Le dataset public reste identique jusqu’à sa publication.
- Les transitions enregistrent l’action, l’auteur et la date. Chaque version possède son résumé et son auteur.

Un brouillon mémorise `baseVersionId`, la version publique existante lors de sa création. Si une autre version a été publiée entre-temps, sa publication est refusée avec HTTP 409. Le Studio affiche le message du serveur. Comparer les changements, recharger les données publiques et créer un nouveau brouillon réconcilié. Une restauration explicite crée également un brouillon basé sur la version publique actuelle. Il n’y a pas de fusion automatique ; l’utilisateur décide quels changements conserver. Les versions anciennes sans ce champ restent lisibles.

## Stockage local

Sans `DATABASE_URL`, le serveur utilise `data/.store.json`. `HISTORY_STORE_PATH` permet de choisir un autre fichier, par exemple `/var/lib/athar/.store.json` sur un volume persistant. Le fichier est privé (0600). Un verrou de dossier coordonne les processus sur la même machine. Un fichier temporaire synchronisé est renommé pour remplacer atomiquement le contenu ; une opération échouée ne publie pas d’état partiel.

Le stockage est lu et décodé en entier à chaque opération. Une écriture sérialise tous les utilisateurs, sessions et snapshots. Les lectures sans changement évitent la réécriture du fichier. Le temps et la mémoire consommés augmentent donc avec la taille cumulée des versions. Les opérations sont sérialisées ; un verrou occupé pendant plus de 15 secondes renvoie une erreur, et un verrou abandonné de plus de deux minutes peut être récupéré. Ce mode est adapté au développement et à une petite instance avec disque persistant. Il ne fournit ni réplication ni coordination entre plusieurs machines.

## PostgreSQL et PostGIS

Définir `DATABASE_URL` active l’adaptateur PostgreSQL. Il initialise `db/schema.sql` au premier accès, avec un verrou consultatif pour coordonner plusieurs processus. L’extension PostGIS doit être installable par le rôle de migration. Pour un déploiement avec un rôle applicatif restreint, appliquer le schéma auparavant.

Neon est compatible : utiliser sa chaîne de connexion (`sslmode=require`), y compris l’hôte `-pooler`. L’initialisation du schéma utilise un verrou transactionnel (`pg_advisory_xact_lock`), compatible avec le pooler en mode transaction, et le pool tolère la fermeture des connexions inactives par le fournisseur. L’authentification (utilisateurs, sessions, limitation des tentatives) est stockée dans les mêmes tables et ne nécessite aucune configuration supplémentaire.

Les tables `history_users`, `history_sessions`, `history_datasets` et `history_versions` conservent les comptes, sessions, pointeur public et snapshots JSONB. `history_features` contient les géométries de chaque nouvelle version en SRID 4326, avec un index GiST. Le contenu d’une version déjà stockée n’est pas réécrit ; seuls son statut et son historique de transitions évoluent.

Une opération utilise une transaction et un verrou consultatif. L’adaptateur actuel charge les versions complètes en mémoire et synchronise les métadonnées lors d’une mutation. Il peut donc gérer un stockage persistant partagé, mais ce n’est pas encore un moteur de requêtes spatiales à grande échelle. Les endpoints n’interrogent pas encore l’index GiST pour un viewport ou une période ; ils exposent le dataset publié complet. L’historique n’est pas paginé. Pour un grand volume de versions, remplacer ce chargement global par des requêtes ciblées, puis ajouter pagination, filtre géographique et tuiles vectorielles.

### Instance de développement avec Docker

Définir dans un fichier `.env.local` ignoré par Git :

```dotenv
POSTGRES_PASSWORD=votre-secret-local
DATABASE_URL=postgresql://athar:votre-secret-local@localhost:5433/athar
APP_ORIGIN=http://localhost:3000
```

Choisir son propre secret et encoder les caractères spéciaux dans l’URL de connexion. Puis :

```sh
docker compose --env-file .env.local -f db/docker-compose.yml up -d
npm run setup -- --email vous@example.org --password "votre-phrase-de-passe-longue"
npm run dev
```

Le Compose exige `POSTGRES_PASSWORD`, publie le port uniquement sur `127.0.0.1` et utilise un volume persistant. `POSTGRES_PORT` permet de remplacer le port hôte 5433. `POSTGRES_USER` et `POSTGRES_DB` sont optionnels ; leur valeur par défaut est `athar`. Les sauvegardes doivent inclure le volume PostgreSQL ou un export `pg_dump` ; un export JSON seul ne contient ni les utilisateurs ni l’historique complet des versions.

## Configuration

| Variable | Comportement |
| --- | --- |
| `DATABASE_URL` | Active PostgreSQL/PostGIS ; absent ou vide = fichier local |
| `HISTORY_STORE_PATH` | Chemin du fichier local ; défaut `data/.store.json` |
| `APP_ORIGIN` | Origine publique exacte, sans slash final ; défaut origine de la requête |
| `TRUST_PROXY` | `true` uniquement si le proxy remplace `X-Forwarded-For` |
| `DISABLE_AUTH` | `true` désactive l’authentification ; toute requête agit en administrateur local |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Identifiants utilisés uniquement par le script de création d’administrateur |
| `HISTORY_TEST_DATABASE_URL` | Base PostgreSQL jetable pour les tests d’intégration optionnels |
| `EXPO_PUBLIC_WEB_URL` | URL HTTPS de l’atlas chargée par l’application mobile |

## Performance et vérifications

La carte utilise des sources GeoJSON, le clustering des villes et un filtrage temporel mémorisé côté React. Le fond de carte local évite une clé de fournisseur. Seules les entités actives alimentent les couches affichées, mais le navigateur télécharge et conserve le dataset publié complet. Il n’y a pas encore de tuiles vectorielles historiques, de cache distribué, de synchronisation hors ligne ou de téléchargement du dataset par viewport. Les limites de performance sur téléphone doivent être mesurées avec les volumes historiques réels.

`npm test` lance les tests du domaine et du serveur ; Vitest exclut les fichiers `*.e2e.*`. Les tests du backend local utilisent un répertoire temporaire et couvrent les permissions, sessions, limites d’import, étapes de publication, restauration, conflits, exports et mises à jour concurrentes. Les tests `backend-postgres.test.ts` sont activés par `HISTORY_TEST_DATABASE_URL` et écrivent uniquement dans la base de test fournie. Ils vérifient persistance après reconnexion, transactions et index spatial. La validation du navigateur est assurée séparément par Playwright. Le squelette mobile nécessite encore une validation sur émulateur et appareils Android/iOS.

## Migration du domaine v2

Voir [DATA-V2.md](DATA-V2.md). Les anciens JSON de version restent intacts en stockage ; les API les convertissent à la lecture. Les nouveaux enregistrements utilisent le modèle v2. `npm run data:migrate-demo` ajoute un instantané uniquement pour une installation contenant encore la démo v1 intacte.

Playwright utilise le serveur de production sur le port 3100 et un stockage isolé dans `/tmp/athar-browser-tests-v2`. `npm run test:e2e` compile avant de lancer les tests et peut coexister avec `next dev`.
