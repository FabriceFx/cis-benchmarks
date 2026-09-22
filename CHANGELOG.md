# Journal des modifications (CHANGELOG)

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [5.5.0] - 2026-09-22

### 🎯 Angle émotionnel : L'angle mort de l'angle mort
> *La 5.2.0 avait fermé le faux négatif multi-UO. Une revue externe a montré qu'il en restait un cran plus loin, invisible à mes propres tests : quand aucune politique ne cible la racine, le reste du tenant continue d'hériter du défaut Google — et ce défaut n'était pas audité. Mesure faite sur les 87 contrôles : 13 d'entre eux répondaient `CONFORME` à un tenant dont le défaut est permissif.*

### Corrigé / Fixed
- **Le défaut Google hérité n'était plus évalué dès qu'une politique ADMIN existait**, y compris lorsque cette politique ne ciblait qu'une sous-UO. Concrètement : une dérogation posée sur `/Marketing` faisait sortir tout le reste de l'organisation du périmètre d'audit. `lirePolitiques_()` retourne désormais des **périmètres** plutôt qu'une liste brute, et réintroduit le défaut hérité — étiqueté « reste du tenant (défaut Google hérité, racine non configurée) » — quand aucune politique ADMIN ne cible la racine. Sur un tenant type, l'écart mesuré est de **16 `CONFORME` / 12 `NON CONFORME` avant, contre 3 / 25 après**.
- **Les super administrateurs étaient déduits d'une liste plafonnée.** `ctx.superAdmins` était filtré depuis les `MAX_UTILISATEURS` premiers comptes (12 000 par défaut) : sur un tenant plus grand, tout super admin situé au-delà du plafond était invisible, faussant les contrôles `1.1.1`, `1.1.2`, `1.1.3` et `4.1.1.1`. Une étape de collecte dédiée interroge maintenant l'Admin SDK avec `query: 'isAdmin=true'`, exhaustif en un appel quel que soit l'effectif. Le filtrage plafonné ne subsiste qu'en repli, et ce repli est **signalé dans les avertissements de collecte du rapport**.

### Ajouté / Added
- **Distinction « aucune sous-UO » / « collecte en échec ».** Les deux produisent une table d'unités organisationnelles vide. Les confondre aurait fait basculer tout le référentiel en `À VÉRIFIER` pour le cas le plus courant — un tenant à UO unique. Un marqueur explicite (`unitesCollectees`) tranche ; sans table collectée, le défaut hérité est évalué comme **indéterminé**, jamais comme un écart.
- **`tests/contexte.test.js`** : huit tests de la couche de persistance de session, jusqu'ici non couverte. Le harnais fournit désormais un `CacheService` réellement fonctionnel en mémoire, ce qui permet d'exercer `sauvegarderPartie_` et `chargerContexte_` telles quelles.
- Deux scénarios dans `tests/controles.test.js` — `defaut-herite-permissif` et `unites-non-collectees` — et cinq tests dans `tests/perimetres.test.js`. **Aucun scénario existant ne contenait de politique `SYSTEM`** : la suite était structurellement aveugle à ce défaut, ce qui explique que 35 tests verts ne l'aient pas vu. La suite compte désormais 51 tests.

### Note
Ce correctif provient d'une revue de code externe (`REVUE_EXPERTE.md`). Les autres points qu'elle soulève — styles codés en dur de l'onglet Synthèse, vectorisation des `setBackground`, timeout du mode batch, éviction du cache, pré-collecte DNS, journal des dérogations inaccessible — restent à traiter.

---

## [5.4.0] - 2026-09-22

### 🎯 Angle émotionnel : Filet
> *Le vrai risque d'un outil d'audit n'est pas de tomber en panne — ça se voit — mais de continuer à répondre « CONFORME » après que Google a renommé un champ. La version 5.4.0 installe le filet : 35 tests, une référence figée des 87 verdicts, et une CI qui refuse une régression avant qu'elle n'atteigne un tenant.*

### Ajouté / Added
- **`tests/controles.test.js`** : exécution des 87 contrôles sur trois contextes simulés — collecte en échec, schéma de Policy API non reconnu, unité organisationnelle fille permissive. Vérifie qu'aucun contrôle ne lève, que tout statut appartient au vocabulaire, et surtout qu'**aucun CONFORME n'est prononcé sur des valeurs que le code ne sait pas lire**. Les verdicts sont comparés à une référence figée (`tests/fixtures/etats.json`) : tout déplacement de statut apparaît dans le diff et doit être accepté sciemment (`npm run test:maj`).
- **`tests/manifeste.test.js`** : relie chaque service Google réellement appelé au scope OAuth qu'il exige, refuse tout scope déclaré sans usage identifiable (moindre privilège), verrouille `executeAs: USER_ACCESSING` dont dépend tout le modèle de sécurité, et vérifie que `CONFIG.VERSION`, `package.json` et le `CHANGELOG` restent alignés. L'oubli du scope `orgunit` en 5.2.0 aurait été attrapé ici.
- **`tests/run.js`** et `npm test` : 35 tests répartis sur quatre fichiers, **sans aucune dépendance** — `tests/aide.js` charge le code Apps Script dans Node en doublant les services Google.
- **Intégration continue GitHub Actions** : tests sur chaque *push* et *pull request*, lint dans un job séparé.
- **ESLint** (`eslint.config.js`) adapté à la portée globale partagée d'Apps Script, **`CONTRIBUTING.md`** (organisation du code, ajout d'un contrôle, checklist de publication), **`SECURITY.md`** (signalement et modèle de sécurité), **`.clasp.json.example`**.

### Note
La concaténation des fichiers dans l'ordre alphabétique, utilisée par le harnais de test, reproduit exactement le chargement d'Apps Script : c'est elle qui fait échouer les tests sur une référence croisée manquante, ce qu'ESLint ne peut pas voir en analysant fichier par fichier.

---

## [5.3.0] - 2026-09-22

### 🎯 Angle émotionnel : Maintenabilité
> *Un fichier de 2 800 lignes ne se relit pas, il se subit. Et deux dictionnaires de traduction éloignés l'un de l'autre finissent toujours par diverger — c'est précisément ce qui avait laissé passer quatre procédures anglaises recopiées du mauvais chapitre. La version 5.3.0 range, puis installe les garde-fous.*

### Corrigé / Fixed
- **`4.3.1` et `4.3.2` : procédures anglaises erronées.** Les deux contrôles de revue périodique (*tableau de bord Sécurité* et *État de sécurité*) pointaient la protection anti-usurpation de Gmail, recopiée du chapitre `3.1.3.4.3`. Même famille de défaut que les contrôles `6.1` à `6.8` corrigés en 5.1.0 — cette fois débusquée par le nouveau test de cohérence bilingue, et non à l'œil.

### Modifié / Changed
- **Découpage de `Code.gs` en douze modules.** Le monolithe de 2 796 lignes devient `00_Config` → `11_Email`, chaque fichier portant une responsabilité. La numérotation fixe l'ordre de chargement : Apps Script partage une portée globale et remonte les déclarations de fonction, mais pas les constantes de premier niveau ; `clasp push` pousse par ordre alphabétique. Le découpage a été vérifié *lossless* — mêmes lignes de code, à l'ordre des blocs près.
- **Référentiel des risques unifié.** `RISQUES` et `RISQUES_EN` fusionnent en un dictionnaire unique où les deux langues sont côte à côte (`{ fr, en }`). Les 87 entrées ont été vérifiées identiques avant/après dans les deux langues.
- L'historique des versions ne figure plus en double dans l'en-tête du code : `CHANGELOG.md` est désormais la seule source de vérité. L'en-tête de `00_Config.gs` porte la carte des fichiers.

### Ajouté / Added
- **`tests/i18n.test.js`** — neuf tests de cohérence bilingue : complétude des titres, remédiations et risques dans les deux langues, absence de risque orphelin, structure identique des dictionnaires serveur et client (`Index.html`), libellés de statut, et **détection des remédiations anglaises dupliquées** hors d'une liste de cas légitimes recensés. C'est ce dernier test qui a trouvé `4.3.1` et `4.3.2` ; sa capacité à échouer a été vérifiée en réintroduisant le bug.
- Documentation de l'organisation du code dans le README (FR/EN) et instructions d'installation par `clasp`.

---

## [5.2.0] - 2026-09-22

### 🎯 Angle émotionnel : Angle mort
> *Un tableau de bord au vert alors que l'UO « Production » partage encore vers l'extérieur : c'est exactement le scénario qu'un audit est censé empêcher. La version 5.2.0 évalue chaque unité organisationnelle, et nomme celles qui posent problème.*

### Ajouté / Added
- **Évaluation par unité organisationnelle.** Tous les périmètres où un réglage est explicitement défini sont désormais évalués, et le pire statut l'emporte : un réglage permissif sur une UO fille rend le contrôle `NON CONFORME`, même si la racine est conforme. Le constat nomme les UO en écart (`ÉCART sur 1/3 : /Production : {…}`), ce qui rend le plan d'actions directement exploitable.
- **Nouvelle étape de collecte « Unités organisationnelles »**, qui construit la table de correspondance identifiant → chemin d'UO. Sans elle, les écarts seraient restitués sous forme d'identifiants opaques. L'UO racine n'étant jamais retournée par l'API, un identifiant absent de la table la désigne et s'affiche `/ (racine)`.
- **`tests/perimetres.test.js`** : dix tests du moteur d'évaluation, sans dépendance externe (`node tests/perimetres.test.js`). Premier filet de sécurité contre les régressions de correspondance, qui sont le risque principal de l'outil.

### Corrigé / Fixed
- **Angle mort multi-UO (correctif majeur).** `lirePolitique_()` ne retenait qu'une seule politique — celle de l'UO racine si identifiable, la première sinon. Les autres étaient signalées d'un laconique « plusieurs OU — vérifier chaque OU » sans influer sur le statut. Sur un tenant à UO multiples, un réglage laxiste sur une UO fille remontait donc `CONFORME` : un faux négatif, le défaut le plus coûteux pour un outil de conformité.
- Les contrôles `3.1.6.1`, `3.1.6.3` et `4.1.1.3`, qui lisaient la politique directement, bénéficient du même traitement. Le repli par groupe de `3.1.6.1` et `3.1.6.3` ne s'active plus que si **aucun** périmètre n'a pu être tranché.

### Modifié / Changed
- `lirePolitique_()` est remplacée par `lirePolitiques_()`, `evaluerParPerimetre_()`, `libellePerimetre_()` et `resumePerimetres_()`.
- **Nouveau scope OAuth `admin.directory.orgunit.readonly`.** Une **réautorisation est nécessaire** à la première ouverture après déploiement.

---

## [5.1.0] - 2026-09-22

### 🎯 Angle émotionnel : Confiance
> *Un outil de conformité ne vaut que par la confiance qu'on peut placer dans son verdict. La version 5.1.0 s'attaque à ce qui l'entamait : les valeurs mal interprétées, les pannes réseau prises pour des écarts, et le fait qu'un rapport pouvait être produit sans que le serveur ne l'ait vraiment calculé.*

### Sécurité / Security
- **Contrôle d'accès sur les fonctions exposées** : l'application web étant déployée en `USER_ACCESSING` / `DOMAIN`, toute fonction publique est appelable par n'importe quel utilisateur du domaine via `google.script.run`. `exigerSuperAdmin_()` garde désormais `demarrerSession`, `lancerAuditCIS`, `listerDerogations`, `enregistrerDerogation`, `revoquerDerogation`, `genererRapportSheets` et `envoyerRapportEmail`. Un utilisateur ordinaire pouvait jusqu'ici révoquer une acceptation de risque ou lire les motifs de dérogation.
- **Intégrité des rapports** : `genererRapportSheets` et `envoyerRapportEmail` recevaient les résultats depuis le navigateur — un rapport « 100 % conforme » pouvait être forgé puis diffusé sous la signature de l'outil. `executerControles` consigne désormais chaque résultat côté serveur sous une clé déterministe, et `chargerResultats_()` les relit. Un contrôle sans résultat consigné est restitué explicitement (`HORS PROFIL` s'il est exclu du profil, `ERREUR` sinon) au lieu d'être omis silencieusement.
- **Périmètre de diffusion** : les destinataires du rapport doivent appartenir à un domaine du tenant, ou à un domaine listé dans la nouvelle clé `CONFIG.DOMAINES_DESTINATAIRES`. La transmission hors du domaine devient un choix explicite et tracé.
- **Verrouillage du registre des dérogations** : `avecVerrou_()` (`LockService`) sérialise le lire-modifier-écrire des `ScriptProperties` ; deux acceptations simultanées se perdaient mutuellement.
- **Journal d'audit** : acceptations et révocations sont tracées (auteur, horodatage, motif) dans un journal borné.

### Corrigé / Fixed
- **Interprétation des libellés d'énumération (`estDesactive_`)** : le test s'effectuait en sous-chaîne. `NONE_ALLOWED` et `SHARING_OFF_DOMAIN` étaient donc lus comme « désactivé ». Le jeton discriminant est désormais ancré en fin de libellé, et un libellé non reconnu remonte `À VÉRIFIER` plutôt qu'un verdict potentiellement faux. **Attention** : ce resserrement peut faire basculer en `À VÉRIFIER` des contrôles jusqu'ici tranchés à tort — c'est le comportement attendu.
- **Niveau de profil perdu entre deux appels** : chaque `google.script.run` étant une exécution neuve, `CONFIG.NIVEAU_PROFIL` repartait de sa valeur par défaut. Le rapport Sheets et l'e-mail annonçaient toujours « L1 + L2 », même après un audit L1. Le niveau est désormais persisté dans la session.
- **DNS (SPF / DKIM / DMARC)** : `resoudreTXT_()` remplace `requeteTXT_()` et distingue une absence certaine (`NOERROR` / `NXDOMAIN`) d'une résolution en échec (`SERVFAIL`, HTTP, réseau), avec trois tentatives et temporisation exponentielle. Une panne DNS transitoire remontait `NON CONFORME` ; elle remonte maintenant `À VÉRIFIER`. Seules les réponses de type 16 sont retenues : les chaînes `CNAME` des cibles DKIM étaient auparavant prises pour des enregistrements TXT.
- **Pagination de l'étape « groupes »** : la boucle n'était pas bornée. À 3 000 groupes, elle enchaînait quinze appels Directory dans un seul appel serveur et pouvait approcher la limite des 6 minutes. Elle respecte désormais `CONFIG.PAGES_PAR_APPEL` et reprend proprement sur quota, comme les autres étapes.
- **Traductions anglaises erronées** : les `remediationEn` des contrôles `6.1`, `6.2`, `6.3` et `6.8` étaient recopiées des chapitres Gmail et Groups. Elles pointent désormais la procédure des règles d'alerte.
- **Troncature du constat (WebApp)** : le découpage s'appliquait après l'échappement HTML, ce qui pouvait couper une entité en deux (`&am`) et afficher « … » à tort. L'ordre est inversé.

### Modifié / Changed
- **Signatures serveur** : `genererRapportSheets(token, lang)` et `envoyerRapportEmail(token, options, lang)` — le tableau de résultats n'est plus transmis par le client.
- Nouvelle clé `CONFIG.PAGES_PAR_APPEL` (défaut : `4`), appliquée uniformément aux étapes `politiques`, `utilisateurs` et `groupes`.
- Nouvelle clé `CONFIG.DOMAINES_DESTINATAIRES` (défaut : `[]`, soit les domaines du tenant uniquement).

### Supprimé / Removed
- `case 'reglages'` de `collecterEtape()`, devenu code mort depuis le passage aux tranches parallèles de `collecterReglagesTranche()`.
- `requeteTXT_()`, remplacée par `resoudreTXT_()`.

---

## [5.0.1] - 2026-08-25

### 🎯 Angle émotionnel : Douleur
> *Rien n'est plus risqué que de croire son organisation protégée par un audit au vert, alors qu'une subtilité d'interprétation ou un réglage trop permissif laissait la porte entrouverte. La version 5.0.1 verrouille l'évaluation au millimètre près sur les critères stricts du document officiel CIS v1.4.*

### Corrigé / Fixed
- **Écart sémantique sur les comptes administrateurs (Section 1.1.x)** :
  - `1.1.1` (*Entre 2 et 4 comptes Super Admin*) : vérification stricte de la plage `2 <= superAdmins.length <= 4` (auparavant scindée de façon incorrecte).
  - `1.1.2` (*Séparation des privilèges Super Admin*) : détection et rejet formel des comptes cumulant les privilèges Super Admin et Administrateur délégué (`isDelegatedAdmin`).
  - `1.1.3` (*Comptes dédiés à l'administration*) : requalifié en contrôle bonus avec statut `À VÉRIFIER` pour auditer le nommage et l'usage quotidien des comptes à privilèges.
- **Resserrement des contrôles sur les seuils stricts CIS Benchmark v1.4** :
  - `3.1.1.1.2` & `3.1.1.2.2` (*Agendas interne*) : conformité accordée uniquement si restreint aux disponibilités (*free/busy*), rejet de `ALL_INFO_READ`.
  - `3.1.2.1.1.5` (*Access Checker Drive*) : conformité accordée uniquement sur l'option stricte « Destinataires uniquement » (*Recipients only*).
  - `3.1.4.1.2` (*Fichiers Chat interne*) : rejet du transfert de fichiers y compris les images seules (`NO_FILES` / `DISABLED` requis).
  - `3.1.6.2` (*Création de groupes*) : restriction stricte aux administrateurs ET désactivation impérative des sous-options de communication et d'adhésion externes.
  - `4.1.5.1` (*Politique de mots de passe*) : longueur minimale portée à 14 caractères (au lieu de 12), application à la prochaine connexion requise et expiration <= 365 jours.
  - `4.2.4.1` (*Durée de session web Google*) : durée maximale autorisée abaissée à 12 heures (au lieu de 24 h).
- **Fiabilisation et localisation complète du socle bilingue (FR/EN)** :
  - Correction de la signature serveur de `envoyerRapportEmail(token, resultats, options, lang)` et résolution robuste de la langue sélectionnée.
  - Création du dictionnaire serveur centralisé `TRADUCTIONS_SERVEUR` (statuts, e-mails, onglets et entêtes Google Sheets).
  - Transmission des métadonnées bilingues complètes (`titreEn`, `remediationEn`, `risqueEn`) au client WebApp et dans le plan d'actions Google Sheets.
  - Correction des apostrophes non échappées dans le code JavaScript de `Index.html` (`demanderWakeLock`, `journal`, modale de révocation).

---

## [5.0.0] - 2026-08-24

### 🎯 Angle émotionnel : Terre promise
> *Fini le doute sur la conformité de votre tenant face aux dernières exigences du CIS : bénéficiez d'une sérénité totale avec un audit aligné à 100 % sur la version 1.4 du référentiel officiel.*

### Ajouté / Added
- **Support bilingue complet Français / Anglais (FR/EN)** :
  - Sélecteur de langue dynamique `[FR | EN]` dans l'en-tête de la WebApp avec persistance dans le `localStorage`.
  - Dictionnaire centralisé `I18N` côté client traduisant dynamiquement tous les libellés, boutons, compteurs et infobulles.
  - Bilinguisation intégrale des 87 contrôles (`titreEn`, `remediationEn`) avec les libellés officiels du CIS v1.4.
  - Dictionnaire bilingue des risques opérationnels et de sécurité (`RISQUES` et `RISQUES_EN`).
  - Génération des rapports Google Sheets et des synthèses e-mail dans la langue sélectionnée par l'utilisateur.
  - Guide d'utilisation intégré et formulaires modaux (E-mail, Dérogations) traduits en français et en anglais.
  - Nouvelle modale dédiée « À propos / About » mentionnant l'outil et le développeur (Fabrice Faucheux, https://faucheux.bzh).
- **Alignement sur le benchmark CIS Google Workspace Foundations v1.4** :
  - Intégration de la nouvelle section dédiée `3.1.2.3` (Google Drive for desktop).
  - Contrôle `3.1.2.3.1` : *Ensure desktop access to Drive is disabled*.
  - Total de 87 contrôles audités (86 recommandations CIS v1.4 + 1 bonus `1.1.3`).
- **Documentation et conformité** :
  - `README.md` bilingue complet (Français / Anglais).
  - `CHANGELOG.md` exhaustif retraçant l'historique complet.

### Modifié / Changed
- Renumérotation du contrôle Drive for desktop : `3.1.2.2.2` → `3.1.2.3.1` conformément à la nomenclature CIS v1.4.
- Actualisation des libellés, synthèses Google Sheets, e-mails de rapport et métadonnées WebApp pour pointer vers le CIS v1.4.
- Prise en charge du paramètre de langue (`lang`) dans `genererRapportSheets` et `envoyerRapportEmail`.

### Supprimé / Removed
- Contrôle `3.1.2.2.3` (*Add-Ons / Modules complémentaires Drive*) supprimé du benchmark CIS v1.4 (Ticket 25810 — paramètre retiré de l'interface Google).
- Contrôle `4.2.6.1` (*Less Secure Apps / LSA*) supprimé du benchmark CIS v1.4 (Ticket 25811 — obsolescence définitive des applications moins sécurisées par Google).

---

## [4.4.1] - 2026-06-15

### Modifié / Changed
- Correctif de mise en page WebApp : le pied de page reste désormais visible sans défilement nécessaire (*sticky footer flexbox*).
- Affichage de la version applicative sous forme de *chip* Material Design dans le bandeau supérieur.

---

## [4.4.0] - 2026-05-20

### Ajouté / Added
- Refonte graphique complète selon la charte Google Workspace et les composants Material Design (palette `#1a73e8`, typographie Roboto, cartes et ombres subtiles).
- Harmonisation visuelle entre l'interface WebApp, le classeur Google Sheets généré et l'e-mail de synthèse.

---

## [4.3.0] - 2026-04-10

### Ajouté / Added
- Fonctionnalité d'envoi du rapport d'audit par e-mail avec boîte de dialogue personnalisée (destinataires, objet, message d'accompagnement).
- Synthèse rétractable automatique de la phase de collecte (Phase 1) pour clarifier l'affichage lors de la phase d'évaluation.

---

## [4.2.0] - 2026-03-02

### Ajouté / Added
- Système intelligent de mise en cache pour les politiques Cloud Identity (`POLITIQUES_CACHE_MIN`), prévenant les erreurs de quota HTTP 429 lors d'audits rapprochés.
- Gestion adaptative des quotas Directory API et Groups Settings API.

---

## [4.1.0] - 2026-01-18

### Ajouté / Added
- Guide d'utilisation interactif intégré dans une boîte de dialogue modale directement liée aux sections du document CIS.
- Affichage dynamique du numéro de version serveur dans le pied de page et le journal d'audit.

---

## [4.0.0] - 2025-11-14

### Ajouté / Added
- **Registre des dérogations (Plan d'actions)** : possibilité d'accepter formellement un écart de sécurité avec justification et calcul d'un score de conformité résiduel.
- Enrichissement des explications de risques opérationnels et de sécurité pour chaque non-conformité.

---

## [3.0.0] - 2025-09-08

### Ajouté / Added
- Moteur de résilience avancé : parallélisation des requêtes par lots, backoff exponentiel sur erreurs réseau et disjoncteur en cas de panne d'API.
- Verrou anti-veille du navigateur (*WakeLock / Heartbeat*) empêchant la mise en veille de l'ordinateur pendant l'audit.

---

## [2.2.0] - 2025-07-22

### Ajouté / Added
- Contrôles d'exécution dans la WebApp : bouton d'arrêt d'urgence propre (*Stop*), reprise sur incident et réinitialisation de session.

---

## [2.1.0] - 2025-06-05

### Ajouté / Added
- Panneau d'avancement multi-étapes (collecte, évaluation, génération du rapport).
- Chronomètre de durée d'exécution en temps réel et journal d'événements détaillé (*live log stream*).

---

## [2.0.0] - 2025-04-12

### Ajouté / Added
- Déploiement de l'application Web progressive (WebApp Google Apps Script) affichant le résultat de conformité contrôle par contrôle sans attendre la fin du traitement global.

---

## [1.0.0] - 2025-02-01

### Ajouté / Added
- Version initiale de l'outil d'audit batch pour Google Workspace basé sur le benchmark CIS v1.3.0.
- Interrogation de Cloud Identity Policy API, Admin SDK, Groups Settings et requêtes DNS sur `dns.google`.
- Génération automatique du classeur de rapport Google Sheets (Synthèse, Détail des contrôles, Matrice d'actions).
