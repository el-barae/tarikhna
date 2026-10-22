# Assistant historique : Amazon Bedrock et Makteb

Le bouton **Assistant** ouvre une conversation dans l’atlas, en français, anglais ou arabe.
L’année et l’entité sélectionnées servent de contexte. Le serveur utilise la version publiée
des données, ses capitales datées et ses indications de certitude. Les conversations restent
en mémoire dans l’interface et sont effacées à la déconnexion ou au rechargement.

L’assistant utilise Claude via Amazon Bedrock. Quand Makteb est disponible, il peut aussi
rechercher des livres, métadonnées, extraits, tables des matières et informations sur les auteurs.
Les références affichées proviennent des résultats effectivement reçus. Une notice de
catalogue confirme la présence d’un ouvrage ; elle ne vérifie pas à elle seule un fait
historique. L’assistant peut se tromper : consulter les passages indiqués avant de modifier
les données.

Makteb est facultatif : si son service échoue, l’assistant continue avec Bedrock sans outil
externe. Il répond alors à partir des connaissances générales du modèle et du contexte de
l’atlas, sans inventer de références, et affiche un avertissement indiquant que ces informations
n’ont pas été vérifiées par des sources externes.

## Configuration

Ajouter ces variables dans `.env.local` à la racine, ou dans les variables d’environnement
du serveur. `.env.example` contient les noms à renseigner. Redémarrer Next.js après modification.

```dotenv
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-5-20250929-v1:0

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Seulement pour des identifiants temporaires :
# AWS_SESSION_TOKEN=...
```

Choisir la région et le modèle ou profil d’inférence réellement autorisés dans votre compte.
Autre exemple de profil :

```dotenv
BEDROCK_MODEL_ID=global.anthropic.claude-haiku-4-5-20251001-v1:0
```

L’identifiant peut aussi être un ARN de profil d’inférence. La disponibilité et les autorisations
dépendent du compte et de la région. Un profil global peut traiter les requêtes dans plusieurs
régions ; utiliser le profil géographique autorisé si votre déploiement l’exige.

Deux autres modes d’authentification sont pris en charge :

- **Profil AWS ou rôle IAM** : laisser le SDK utiliser sa chaîne habituelle d’identifiants,
  par exemple `AWS_PROFILE=mon-profil`, ou le rôle de la machine/conteneur.
- **Clé API Bedrock** : définir `AWS_BEARER_TOKEN_BEDROCK=...`. Si cette variable est présente,
  elle est prioritaire sur les identifiants AWS classiques.

Ne pas utiliser de préfixe `NEXT_PUBLIC_` pour ces variables. Elles restent côté serveur.
L’accès au modèle doit autoriser l’inférence Bedrock (`bedrock:InvokeModel` pour Converse).
L’application n’utilise pas l’API de streaming.

L’adresse MCP est fixe : `https://api.makteb.org/mcp`. Les appels publics testés ne demandaient
pas de clé Makteb. Le client découvre les schémas des outils à chaque conversation serveur :
les paramètres réels peuvent différer des exemples de documentation. L’accès MCP n’est pas
nécessaire au fonctionnement de base de l’assistant.

Pour désactiver entièrement Makteb/MCP et utiliser Bedrock seul, définir côté serveur :

```dotenv
ASSISTANT_USE_MCP=false
```

Sans cette variable (ou avec toute autre valeur que `false`), l’application essaie Makteb et
bascule automatiquement vers Bedrock seul si la recherche échoue.

## Utilisation

1. Configurer Bedrock et redémarrer `npm run dev`.
2. Se connecter avec un compte existant de l’atlas (visiteur, éditeur ou administrateur).
3. Choisir une année et éventuellement un État, une ville ou un événement.
4. Ouvrir **Assistant**, puis poser une question.
5. Consulter les ouvrages et passages dans les références sous la réponse.

Sans région ou modèle configurés, le panneau indique que l’assistant attend sa configuration.
Aucun appel Bedrock n’est effectué dans cet état. La présence de ces variables ne prouve pas
que les identifiants ou l’accès au modèle sont valides ; ceux-ci sont vérifiés lors de l’appel.

## Fonctionnement serveur

`POST /api/assistant` reçoit les messages et les identifiants de contexte.
Il vérifie la session, l’origine, la taille et l’ordre des messages, puis charge le contexte
historique publié. Les appels réseau ont lieu après la libération du verrou du stockage.

Le moteur utilise **Converse** avec les schémas MCP et exécute uniquement cinq outils de
lecture autorisés lorsque Makteb est disponible. Si la découverte des outils ou un appel échoue,
il bascule vers une requête Bedrock sans outils MCP. La réponse de secours peut utiliser les
connaissances générales du modèle, mais doit signaler l’absence de vérification externe et ne
peut pas fabriquer de références. Les documents retournés par Makteb sont traités comme des
sources externes. Aucun outil ne modifie le dataset, ne publie une version ou n’envoie des
identifiants AWS à Makteb.

Limites actuelles :

- 4 000 caractères par question ; historique transmis limité à 24 000 caractères.
- 20 requêtes par compte sur 15 minutes, enregistrées dans le stockage existant.
- Une requête simultanée par compte et processus serveur.
- Jusqu’à cinq appels modèle et huit appels outils par réponse en mode recherche ; délai global de 90 secondes.
- Extraits transmis au modèle limités à 14 000 caractères par outil.

Les questions et le contexte publié sont transmis à Amazon Bedrock. Makteb reçoit les arguments
de recherche choisis par le modèle. Les conversations ne sont pas sauvegardées dans la base
de l’application ; les politiques des fournisseurs s’appliquent à leurs services.

Les quotas par compte sont conservés dans le stockage transactionnel. Le verrou de concurrence
est local au processus : un déploiement sur plusieurs instances devra partager ce verrou
si une limite globale de concurrence est nécessaire.

## Vérification

```sh
npm run typecheck
npm test
```

Les tests simulent Bedrock et Makteb : ils ne nécessitent aucune clé et ne génèrent aucun coût
d’inférence. Les tests du navigateur vérifient le panneau, les références, le contexte, les
erreurs et l’affichage mobile avec des réponses simulées.

## Dépannage

- **Configuration en attente** : vérifier `AWS_REGION` (ou `AWS_DEFAULT_REGION`) et
  `BEDROCK_MODEL_ID`, puis redémarrer Next.js.
- **Accès Bedrock refusé** : vérifier les identifiants, leur expiration, les permissions IAM
  et l’accès Anthropic du compte.
- **Modèle indisponible** : vérifier la région et l’identifiant du profil d’inférence.
- **Avertissement Makteb indisponible** : l’assistant répond quand même via Bedrock, mais sans vérification externe ni références Makteb. Vérifier la connexion sortante HTTPS si ces références sont souhaitées.
- **Limite atteinte** : attendre la fin de la fenêtre de 15 minutes.
- **Réponse interrompue** : utiliser une question plus précise ou réessayer.

## Documentation des fournisseurs

- [Amazon Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Claude Sonnet 4.5 sur Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html)
- [Claude Haiku 4.5 sur Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html)
- [Clés API Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
- [Outils MCP Makteb](https://makteb.org/mcp)
