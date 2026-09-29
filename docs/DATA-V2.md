# Données historiques v2

## Ce qui est livré

Le jeu de démonstration comprend 35 États, 54 villes, 31 événements, 9 personnes,
3 routes et 5 périodes. Les 54 géométries datées sont des **repères symboliques**.
Elles ne sont pas des frontières scientifiques et ne prouvent aucune souveraineté
continue. Les nouvelles zones représentent surtout des foyers régionaux, avec
une couverture volontairement partielle. Ce corpus reste à relire par des historiens.

`public/islamic-history.json` est le fichier de départ de l’application.
`islamic-history.json` en est la copie de travail ; le test de cohérence compare
les deux. La version publiée en base reste la référence pendant l’utilisation.

## Modèle

- `metadata.schemaVersion: 2`, `metadata.status: "demo" | "reviewed"` : statut
  éditorial global. Aucun avertissement répétitif n’est ajouté aux notices.
- `states[].capitals[]` : `{city, from, to, precision, role, sources}`. Plusieurs
  sièges contemporains sont possibles. Une liste partielle ne prétend pas couvrir
  toutes les années. `role` distingue capitale et résidence.
- `polityType` décrit la forme politique ; `dynasty` est un identifiant de maison
  régnante ou `null` si plusieurs dynasties se succèdent. `polityPeriods` décrit les
  changements de forme : Cordoue est un émirat jusqu’en 928 puis un califat dès 929.
- `cities[].names[]` : `{name:{fr,en,ar}, from, to, precision}` ; `aliases` contient
  les variantes d’écriture. `name` reste le nom de catalogue et sert de repli.
- `foundedYear: null` signifie fondation inconnue/non renseignée. `activeFrom`
  décrit uniquement la couverture de l’atlas. Une ville peut être plus ancienne.
- `event.location` contient **soit** `cityId`, **soit** `coordinates: [lon,lat]`,
  avec `type: actual | approximate | symbolic`. Les batailles sont approximatives.
- Les événements portent `relatedPeople` et `relatedStates`. Les événements d’une
  ville ou d’une personne sont calculés ; `city.events` et `person.events` sont interdits.
- Les personnes ont `deathPlace` nullable, `birthPrecision`, `deathPrecision` et,
  au besoin, `birthPlaceType`. Le repère régional d’al-Khwarizmi est symbolique.
- `startPrecision`, `endPrecision`, `foundedPrecision` : `exact` signifie connu à
  l’année près, `circa` indique une approximation, `unknown` une précision non
  évaluée. `startHijri` et `endHijri` sont facultatifs et ne sont pas calculés
  automatiquement ; le 2 AH de Badr provient de la source de cet événement.
- Les bornes sont inclusives. Les noms d’une ville et les instantanés territoriaux
  d’un même État ne se chevauchent pas ; une absence documentée peut créer un trou.

### Modifications annuelles sur la carte

`states[].details` est facultatif : chaque entrée `{from, to, name, description,
color, dynasty}` remplace ces propriétés pour un intervalle donné. Les intervalles
ne se chevauchent pas et restent dans la durée de l’État. `stateAt` et les filtres
résolvent ces valeurs à l’année affichée. Le nom général reste le repli.

Le mode modification crée une tranche d’une seule année. Il découpe les anciens
intervalles de fiche, de forme politique et de territoire si nécessaire, sans
modifier les années voisines. Les modifications textuelles seules conservent
les géométries et leur provenance. Un contour redessiné ou un sommet déplacé
remet `landClipped` à `false` ; il ne déclenche pas un découpage côtier automatique.
Les trous et les autres polygones sont conservés lors du déplacement d’un sommet.

L’enregistrement crée un brouillon. Le serveur vérifie le compte et la version
publiée de départ avant de l’accepter. La relecture et la publication restent
accessibles depuis l’atelier. Les changements sont stockés dans les versions,
sans réécrire les fichiers JSON de départ.

### Territoires GeoJSON

Chaque `state.territories` est une véritable `FeatureCollection` :

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "id": "example-territory-0",
    "properties": {
      "stateId": "example",
      "startYear": 750,
      "endYear": 800,
      "certainty": "symbolic",
      "control": "influence",
      "sources": []
    },
    "geometry": {"type": "Polygon", "coordinates": [[[30, 25], [40, 25], [40, 35], [30, 35], [30, 25]]]}
  }]
}
```

Ces collections peuvent être copiées dans QGIS ou geojson.io. L’export GeoJSON de
l’application rassemble les géométries et conserve le dataset complet dans son
membre additionnel `dataset`.

`certainty` porte sur la **géométrie** : `high` = contour précisément étayé,
`medium` = reconstruction documentée mais approximative, `low` = contour mal
contraint, `symbolic` = simple schéma sans prétention frontalière. La démo utilise
ce dernier niveau : changer arbitrairement certains contours en « high » serait
une fausse garantie.

`control` distingue `direct`, `influence` et `nominal`. Le champ facultatif
`suzerainId` décrit une allégeance distincte du contrôle local : les Aghlabides
ont ainsi un contrôle local direct et une suzeraineté abbasside nominale.
Les sources des propriétés géographiques sont distinctes des sources de la notice.
Natural Earth n’est cité que pour le masque côtier, jamais pour les limites historiques.

Les contours sont découpés avec `@turf/intersect` sur le fichier local Natural
Earth 110m, puis orientés avec `@turf/rewind` selon la RFC 7946 : extérieur
antihoraire, trous horaires. MapLibre utilise ce sens. Une future utilisation de
d3-geo devra inverser l’orientation dans son adaptateur, sans modifier le fichier
canonique. Les côtes sont modernes et de faible résolution ; les estuaires,
petites îles et déplacements anciens du littoral ne sont pas reconstitués.

## Choix historiques et limites

- Les sièges abbassides sont ventilés entre Koufa, Anbar, Bagdad, Samarra et Bagdad.
  Les débuts sous le nom de Hachimiyya et les retours temporaires de la cour
  restent simplifiés ; les bornes de capitale sont `circa`.
- Le Caire est fondé en 969 ; l’installation de la cour fatimide est datée de 973.
  Raqqada, Mahdia et al-Mansûriyya précèdent ce transfert.
  Source consultée : [Metropolitan Museum, premier paragraphe](https://www.metmuseum.org/essays/the-art-of-the-fatimid-period-909-1171).
- Marrakech est conventionnellement placée vers 1070 dans ce jeu. Les sources
  varient autour de 1062–1070. Le [Metropolitan Museum](https://www.metmuseum.org/essays/the-art-of-the-almoravid-and-almohad-periods-ca-1062-1269)
  donne 1062 ; cette divergence est conservée dans la notice.
- Les Almoravides n’apparaissent en péninsule qu’à partir de 1086 ; cette première
  tranche est une intervention, suivie d’une tranche à partir de 1090. L’Ifriqiya
  n’est incluse dans le schéma almohade qu’à partir de 1160, et en sort après 1228.
- Kairouan est dans la tranche omeyyade dès 670 ; Samarcande et Boukhara dans les
  tranches orientales tardives. La route de Bagdad commence en 762. Une route peut
  traverser plusieurs autorités et ne prouve pas leur contrôle territorial.
- L’État ottoman territorial finit en 1922. Les événements distincts du califat
  couvrent 1922–1924 ; l’abolition de 1924 est placée à Ankara.
- Les taïfas de Séville et de Tolède sont des États distincts. Grenade commence en
  1232, sa capitale est indiquée à partir de 1238. Le corpus ne représente pas
  toutes les taïfas. L’interrègne sur de 1540–1554 est laissé vide pour les Moghols.
- Les capitales seldjoukides et celles des nouveaux États sont partielles ; aucune
  capitale n’est inventée pour combler un intervalle. Le choix d’un foyer régional
  ne représente pas l’étendue totale d’un empire pendant toute sa durée.
- « Constantinople » et « Istanbul » ont coexisté longtemps. Le passage du libellé
  moderne en 1930 est une convention d’affichage, pas une apparition soudaine du nom.

## Sources et licences

Le corpus contient 91 références : 87 pages consultées et 4 ouvrages en bibliographie.
Chaque source comporte `accessedDate`, `license`, `permanentUrl` et `verification`.
Les valeurs inconnues sont explicites (`null` ou `unverified`). Les références
acceptent un ID ou `{id, locator}` ; les fiches affichent le passage indiqué.
Les liens de révision Wikipédia effectivement récupérés sont enregistrés dans
[`source-pins.json`](source-pins.json). Un lien manquant n’est pas remplacé par un
numéro inventé. `consulted` indique que la page a été consultée, **pas** que chaque
assertion de l’entité ou chaque coordonnée est validée scientifiquement.

Les ouvrages de Bosworth, Kennedy, Hourani et l’Encyclopaedia of Islam sont ajoutés
comme **bibliographie de travail**. Leurs textes/cartes complets n’ont pas été
consultés ni reproduits. Aucune pagination de preuve ne leur est attribuée.
Les notices du Metropolitan Museum, de l’Encyclopaedia Iranica et de l’UNESCO
complètent les sources encyclopédiques accessibles.

| Ressource examinée | Conditions indiquées par la ressource | Utilisation dans cette livraison |
| --- | --- | --- |
| [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) | Domaine public | Fond local et découpage des côtes |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Copyright) | Données structurées CC0 ; texte des autres espaces sous des conditions distinctes | Aucune importation automatique |
| [GeoNames](https://www.geonames.org/) | CC BY 4.0 | Aucune importation |
| [Pleiades](https://pleiades.stoa.org/help/using-pleiades-data) | CC BY 3.0 sur la page consultée ; vérifier les notices/fichiers choisis | Aucune importation |
| [Al-Thurayyā](https://github.com/althurayya/althurayya.github.io) | Aucune licence explicite identifiée dans le dépôt consulté | Aucune donnée importée ; licence à confirmer pour le jeu exact |
| [Historical Basemaps](https://github.com/aourednik/historical-basemaps/blob/master/LICENSE) | GPL-3.0 dans le dépôt consulté | Aucun contour importé |

Les coordonnées ajoutées sont des repères urbains approximatifs, pas un gazetteer
scientifique importé. Les références de ville permettent leur vérification ultérieure.

### Figures fondatrices

`metadata.figurePolicy` prévoit `foundingFigures: "no-images"` et des formules
`honorifics: "optional" | "always"`. Une personne peut porter `foundingFigure`
et un `honorific` traduit. La validation refuse les champs de portrait d’une
figure fondatrice. L’interface actuelle ne présente aucun portrait de personne.
Les formules ne font pas partie du nom ni de l’identifiant ; elles se stockent à part.

## Commandes et migration

```sh
npm run data:validate
npm run data:validate -- mon-dataset.json
npm run data:clip -- mon-dataset.json mon-dataset-cotes.json
```

Le découpage écrit dans un **nouveau fichier** et refuse de remplacer un fichier
existant. Réimporter le résultat par le Studio pour le relire et le publier.
Une modification manuelle de géométrie remet `landClipped` à `false`.

`npm run data:build-demo` reconstruit les **deux fichiers de démonstration** depuis
la fixture v1 et les corrections de `scripts/build-demo-v2.ts`. Cette commande
remplace ces deux fichiers ; ne pas l’utiliser sur un corpus édité manuellement.
Elle ne touche ni aux comptes ni aux versions enregistrées.

`npm run data:migrate-demo` ajoute une version publiée v2 uniquement si le jeu
publié correspond exactement à la démo v1 intacte. Sinon la commande refuse de
remplacer le travail local. L’ancien instantané reste inchangé et restaurable.
Les API convertissent les anciennes versions à la lecture, sans réécrire leur JSON
stocké. Toute restauration crée un nouveau brouillon selon le workflow habituel.

Les tests couvrent les références, dates de fondation, changements de capitale,
noms datés, forme du pouvoir, lieux symboliques, 1922–1924, inclusion des villes
signalées, découpage de la mer Rouge, orientation des anneaux et migration v1.
