# Journal des modifications (CHANGELOG)

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
