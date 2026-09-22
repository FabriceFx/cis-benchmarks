# Contribuer

## Prérequis

Node 20+ pour les tests et le linter. Aucune dépendance n'est nécessaire pour
exécuter les tests ; ESLint est une dépendance de développement.

```bash
npm install     # ESLint uniquement
npm test        # 3 fichiers de test, aucune dépendance requise
npm run lint
```

## Organisation du code

Les fichiers `.gs` sont numérotés pour fixer l'ordre de chargement. Apps Script
partage **une seule portée globale** entre tous les fichiers et remonte les
déclarations de fonction, mais **pas** les constantes de premier niveau : une
constante lue à l'initialisation d'une autre doit donc être déclarée dans un
fichier qui charge avant. `clasp push` poussant par ordre alphabétique, la
numérotation rend cet ordre explicite plutôt qu'accidentel.

Conséquence pour l'outillage : ESLint analyse fichier par fichier et ne peut
pas résoudre les références croisées. `no-undef` et la détection de variables
globales inutilisées sont donc désactivées, et c'est `tests/aide.js` — qui
concatène puis évalue l'ensemble — qui fait échouer les tests sur une
référence manquante.

## Tests

| Fichier | Couvre |
|---|---|
| `tests/perimetres.test.js` | Moteur d'évaluation par unité organisationnelle |
| `tests/i18n.test.js` | Cohérence bilingue FR/EN, détection des copier-collés |
| `tests/controles.test.js` | Exécution des 87 contrôles, référence figée des statuts |
| `tests/manifeste.test.js` | Scopes OAuth, services avancés, modèle de déploiement |
| `tests/contexte.test.js` | Persistance de session, recensement des super administrateurs |
| `tests/rapport.test.js` | Restitution Sheets : mise en forme, couverture, journal |

`tests/controles.test.js` compare les statuts obtenus sur trois contextes
simulés à `tests/fixtures/etats.json`. Une modification volontaire du moteur
d'évaluation déplace ces statuts : régénérer la référence avec
`npm run test:maj`, puis **relire le diff** — c'est précisément là que se voit
l'effet réel d'un changement de correspondance de champ.

## Ajouter ou modifier un contrôle

1. Renseigner `titre`, `titreEn`, `remediation` et `remediationEn` — les quatre
   sont obligatoires, `tests/i18n.test.js` le vérifie.
2. Ajouter l'entrée correspondante dans `RISQUES` (`01_I18n.gs`), avec les deux
   langues.
3. Si la procédure anglaise est **identique** à celle d'un autre contrôle,
   vérifier dans le PDF officiel du CIS qu'elle est réellement commune, puis
   compléter `DOUBLONS_LEGITIMES` dans `tests/i18n.test.js`. Sans cela le test
   échoue : c'est voulu, quatre procédures anglaises erronées ont été
   introduites par copier-coller avant que ce garde-fou n'existe.
4. Un évaluateur retourne `true`, `false` ou `null`. **`null` sur une valeur
   non reconnue** : dans un outil de conformité, un faux CONFORME coûte plus
   cher qu'une vérification manuelle.
5. `npm test`.

## Publier une version

1. Incrémenter `CONFIG.VERSION` dans `00_Config.gs` **et** `version` dans
   `package.json` — `tests/manifeste.test.js` vérifie qu'ils coïncident.
2. Ajouter l'entrée dans `CHANGELOG.md` — le test vérifie aussi sa présence.
3. `npm test && npm run lint`.
4. `clasp push`, puis **créer un nouveau déploiement** dans l'éditeur Apps
   Script. Un `push` seul ne met pas à jour l'application web : si le pied de
   page n'affiche pas la version attendue, le redéploiement n'a pas été fait.
5. Taguer : `git tag vX.Y.Z && git push --tags`.

> ⚠️ Toute modification des `oauthScopes` impose une **réautorisation** à la
> première ouverture suivant le déploiement. Le signaler dans le CHANGELOG et
> le README.
