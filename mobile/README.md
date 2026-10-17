# Atharahom · Android et iOS

Le MVP mobile est une application Expo / React Native qui ouvre l’interface responsive de l’atlas dans une WebView. Elle réutilise donc la carte, la timeline, les traductions, l’authentification et les écrans d’édition du Web. Le domaine TypeScript est également disponible dans `shared/history.ts` pour de futurs écrans natifs.

## Lancer

Node.js ≥ 22.13 est nécessaire pour Expo SDK 57. Installer les dépendances mobile séparément du projet Web :

```sh
cd mobile
npm install
npx expo install --check
cp .env.example .env
```

Renseigner `EXPO_PUBLIC_WEB_URL` avec une URL **HTTPS** accessible depuis le téléphone. Un serveur Web lancé sur `localhost` dans l’ordinateur n’est pas accessible sous ce nom depuis le téléphone. Déployer le serveur ou utiliser un tunnel HTTPS de développement.

```sh
npm start
```

Ouvrir le projet dans une version compatible d’Expo Go ou un émulateur. Les liens de sources externes s’ouvrent dans le navigateur système.

## Préparer les binaires

Les identifiants `org.atharatlas.mobile` sont des exemples à remplacer par vos identifiants avant distribution.

- Android local : installer Android Studio et son SDK, puis `npm run android`.
- iOS local : utiliser macOS avec Xcode, puis `npm run ios`.
- EAS : configurer un projet Expo, les identifiants et `EXPO_PUBLIC_WEB_URL` pour le profil choisi, puis `npx eas-cli build --profile preview --platform android` ou `npx eas-cli build --profile production --platform ios`.
- Pour le profil `development`, installer d’abord `npx expo install expo-dev-client`.

Aucun binaire Android/iOS n’a été compilé ni testé sur appareil dans cet environnement. Vérifier la navigation, la connexion persistante, la carte WebGL, l’import via le sélecteur de fichiers et l’export sur appareil avant distribution. Les téléchargements Blob du navigateur peuvent nécessiter un pont natif pour enregistrer les exports dans le stockage du téléphone. Les modes hors ligne et cartes natives ne sont pas implémentés.

## Évolution

`packages/core/src` ne dépend ni de React ni du navigateur. Des écrans React Native peuvent importer le schéma, la validation et le filtrage temporel via `shared/history.ts`, puis consommer les mêmes API. Les écrans intégrés utilisent actuellement le domaine par l’application Web.

Les versions de ce squelette suivent la [matrice Expo SDK / React Native](https://docs.expo.dev/versions/latest/), ainsi que les versions recommandées pour [WebView](https://docs.expo.dev/versions/latest/sdk/webview/) et [safe area](https://docs.expo.dev/versions/latest/sdk/safe-area-context/). `npx expo install --fix` permet d’aligner les correctifs lors d’une installation future.
