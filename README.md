# Athar · أثر

Un atlas interactif de l’histoire islamique : géographie, chronologie, notices et sources, alimentés par un dataset JSON versionné.

## Démarrer

Prérequis : Node.js **22.12 ou plus récent** et npm.

```bash
npm install
npm run dev
```

Ouvrir **http://localhost:3000**. La consultation fonctionne immédiatement, sans clé de carte ni compte. Les fonds Natural Earth et les workers MapLibre sont servis localement.

### Créer votre compte administrateur

```bash
npm run setup -- --email vous@example.org --password "votre-phrase-de-passe-personnelle" --name "Votre nom"
```

Utiliser un mot de passe personnel d’au moins 12 caractères. Aucun compte ni mot de passe prédéfini n’est livré. Le CLI accepte aussi les variables `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

Cliquer sur **Se connecter**, puis accéder à **Espace d’édition**. Dans **Utilisateurs**, l’administrateur peut créer des comptes et modifier leurs rôles. Les préférences permettent de se déconnecter.

## Fonctionnement

### Explorer

- Carte MapLibre : déplacement, zoom, territoires datés, villes regroupées, événements, routes et personnages.
- Timeline : année précise, périodes, pas de 1/10/100 ans, lecture et pause.
- Recherche multilingue des États, villes, événements, personnages, routes et dates. Un résultat ouvre sa fiche et ajuste l’année.
- Filtres de couches, légende interactive, notices et références consultables.
- Bibliothèque de toutes les entités, lien partageable vers une année et une langue.
- Français, anglais et arabe avec disposition RTL ; interface adaptée au téléphone et à la tablette.
- Thèmes clair et sombre : bouton soleil/lune, préférence mémorisée, option « Système » dans les préférences.

Les dates de début et de fin sont **incluses**. Un événement limité à une année apparaît uniquement cette année-là. Les personnages sont localisés à leur ville de naissance renseignée. La conversion hégirienne affichée est indicative.

### Contribuer

1. Ouvrir l’atelier et modifier les formulaires, le JSON ou les sommets d’un territoire. L’import accepte un fichier JSON complet.
2. **Valider** les champs, dates, identifiants, références et géométries.
3. Examiner les ajouts, modifications et suppressions, puis confirmer l’enregistrement d’un **brouillon**.
4. Dans **Versions**, soumettre le brouillon à **relecture**.
5. Un administrateur **approuve**, puis **publie**. La carte publique utilise cette version.
6. Comparer des versions, restaurer une ancienne version dans un nouveau brouillon, ou exporter.

Une publication concurrente rend un brouillon obsolète : le serveur refuse sa publication avec une erreur 409. Repartir de la version publiée et reporter les modifications. Aucune fusion automatique n’est effectuée.

L’éditeur JSON propose coloration, suggestions de propriétés, recherche, formatage, annulation et rétablissement. Le dessin graphique propose un fond géographique, les sommets déplaçables et les coordonnées numériques. Les géométries invalides restent modifiables mais ne peuvent pas être enregistrées.

### Modifier un État directement sur la carte

1. Choisir l’année dans la chronologie et sélectionner un État.
2. Cliquer sur **Mode modification** dans sa fiche (ou sur le bouton de la carte).
   Un compte éditeur ou administrateur est requis.
3. Modifier le nom, la description, la couleur, la dynastie ou la forme du pouvoir.
4. **Redessiner le territoire** : cliquer pour poser les sommets, puis fermer avec
   le premier point ou **Terminer le tracé**. **Ajouter une zone** conserve les zones
   existantes. Les sommets se déplacent à la souris ; les petits points ajoutent
   des sommets. Au clavier, utiliser les flèches et Suppr.
5. **Enregistrer un brouillon**, puis **Ouvrir les versions** pour la relecture
   et la publication habituelles. La carte publique change après publication.

Les modifications concernent **uniquement l’année sélectionnée**. Les intervalles
sont découpés automatiquement pour préserver les années voisines. Une annulation
ne crée aucune version. Les données et tracés restent ouverts si la sauvegarde
échoue. Le dessin fonctionne aussi sur la carte tactile.

### Permissions

| Action | Visiteur | Éditeur | Administrateur |
| --- | --- | --- | --- |
| Carte, recherche, notices | Oui | Oui | Oui |
| Import, édition, brouillon, export | — | Oui | Oui |
| Soumettre à relecture | — | Ses brouillons | Tous les brouillons |
| Approuver et publier | — | — | Oui |
| Restaurer ou supprimer des entités | — | — | Oui |
| Gérer les utilisateurs | — | — | Oui |

Les permissions sont vérifiées côté serveur. L’authentification utilise des mots de passe hachés par scrypt et des sessions révocables dans un cookie HttpOnly/SameSite Strict. Les routes de mutation contrôlent l’origine des requêtes, la taille des fichiers et les tentatives de connexion.

## Données

[`islamic-history.json`](./islamic-history.json) est la copie éditable du dataset de démonstration. [`public/islamic-history.json`](./public/islamic-history.json) est la copie chargée à l’initialisation du stockage. Ces copies sont vérifiées par un test.

Le dataset comprend **35 États, 54 villes, 31 événements, 9 personnages, 3 routes, 5 périodes et 91 références**. Les données sont explicitement **DEMO DATA**. Les polygones sont des schémas pédagogiques marqués `symbolic`, pas des frontières historiquement reconstituées. Les références sont des lectures complémentaires ; elles ne valident pas ces géométries.

Après la première initialisation, la carte lit la version publiée du stockage serveur. Modifier le fichier de départ n’écrase donc pas les versions existantes : importer la nouvelle copie dans l’atelier et suivre le workflow de publication. Pour préparer un autre dataset de départ, modifier les deux copies avant une nouvelle installation.

```text
Dataset
├── metadata
├── periods
├── states → capitales datées, formes du pouvoir, territoires FeatureCollection
├── cities → noms datés, alias, fondation et couverture distinctes
├── events → lieu référencé et typé, États, personnages, citations
├── people → naissance/décès, États ; événements calculés
├── routes → LineString datée
└── sources
```

L’export JSON conserve tout le dataset. L’export GeoJSON contient les géométries actives à l’année choisie et un membre additionnel `dataset` contenant le dataset complet, afin de préserver les relations, les versions géographiques et les sources. Il ne constitue pas une sauvegarde des comptes et de tout l’historique serveur.

Validation : JSON lisible, champs obligatoires, traductions, IDs globalement uniques, dates entières et ordonnées, références existantes, coordonnées WGS84, anneaux fermés de surface non nulle, absence d’auto-intersection et URLs HTTP(S) pour les sources. Types géographiques pris en charge : Point, LineString, Polygon et MultiPolygon.

Le schéma v2, les choix historiques, les licences et les commandes de migration sont décrits dans [`docs/DATA-V2.md`](./docs/DATA-V2.md). `npm run data:validate` vérifie le fichier automatiquement.

Voir [`packages/core/README.md`](./packages/core/README.md) pour les types, filtres temporels et utilitaires partagés.

## Stockage

### Local, par défaut

Le serveur crée `data/.store.json` avec utilisateurs, sessions, versions et pointeur de publication. Les écritures sont atomiques et protégées par un verrou. Ce dossier est ignoré par Git. Conserver un volume persistant et sauvegarder ce fichier si les contributions doivent être conservées.

Le chemin peut être modifié avec `HISTORY_STORE_PATH`. Le mode local est destiné à un déploiement sur une machine avec disque persistant.

### PostgreSQL et PostGIS

L’adaptateur est fonctionnel et testé. `DATABASE_URL` sélectionne PostgreSQL à la place du fichier local.

```bash
# Choisir et exporter un mot de passe personnel avant cette commande.
docker compose -f db/docker-compose.yml up -d
```

La configuration Compose exige `POSTGRES_PASSWORD`. Copier `.env.example` en `.env.local`, renseigner la connexion `DATABASE_URL` correspondant au port **5433** par défaut, puis créer l’administrateur avec `npm run setup`. Le CLI et Next.js lisent le même fichier d’environnement. Le compte PostgreSQL doit pouvoir créer l’extension PostGIS lors de l’initialisation.

Ce choix démarre un stockage distinct ; il ne migre pas automatiquement les comptes et versions du stockage local. Les détails de déploiement, index, transactions, sauvegardes et limites se trouvent dans [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Android et iOS

[`mobile/`](./mobile/) contient une préparation Expo : application WebView, configuration EAS, protection des liens externes, URL du serveur configurable et accès au noyau partagé. L’interface responsive et les fonctions serveur sont réutilisées.

```bash
cd mobile
npm install
# Configurer EXPO_PUBLIC_WEB_URL selon mobile/README.md.
npm start
```

Les applications natives **n’ont pas été compilées ni testées sur appareil**. Cette préparation utilise la carte web dans une WebView ; une carte native dédiée et un stockage mobile hors ligne restent des extensions possibles. Consulter [`mobile/README.md`](./mobile/README.md) avant un build Android/iOS.

## Vérifications

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

- Les tests métier vérifient les imports, relations, dates, géométries, traductions, exports et comparaisons.
- Les tests serveur vérifient les rôles, sessions, publications, restaurations, concurrence et écritures atomiques dans des dossiers temporaires.
- Les tests navigateur utilisent le port 3100 et un stockage isolé dans `/tmp/athar-browser-tests`. Ils couvrent carte, timeline, filtres, recherche, RTL, écran mobile et atelier de contribution.
- Les tests PostgreSQL sont optionnels et exigent une base de test dédiée via `HISTORY_TEST_DATABASE_URL`. Ils ne doivent jamais viser une base de production.
- Playwright utilise le Chromium système s’il est disponible, ou son navigateur installé par `npx playwright install chromium`. `CHROMIUM_PATH` permet de préciser un exécutable.

## Production et limites

```bash
npm run build
npm start
```

Configurer HTTPS, `APP_ORIGIN` avec l’origine publique exacte et un stockage persistant. Aucun assistant IA n’est intégré.

Le MVP charge le dataset complet puis filtre les couches côté client, utilise le clustering et charge l’atelier à la demande. PostgreSQL conserve des index spatiaux, mais les routes API actuelles ne servent pas encore de tuiles vectorielles ni de requêtes spatiales paginées. Le stockage des snapshots croît avec le nombre de versions ; les performances à grande échelle restent à mesurer et optimiser avant une exploitation volumineuse.

Les bibliothèques et le fond géographique conservent leurs licences respectives. Natural Earth est dans le domaine public ; attribution visible sur la carte. Les assets MapLibre et leur licence sont préparés par `npm install`.
