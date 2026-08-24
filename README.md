# 🛡️ Audit CIS Google Workspace Foundations Benchmark

> **Tu passes tes soirées à cocher des cases dans un tableur, à ouvrir 15 onglets de la console admin pour vérifier un par un les 86 réglages du benchmark CIS ?**
> Cet outil automatise l'évaluation en quelques minutes, pointe avec précision les failles de configuration et te fournit un plan de remédiation prêt à l'emploi.

Outil d'audit automatisé et interactif qui vérifie la configuration d'un tenant Google Workspace contre les **86 recommandations** du [CIS Google Workspace Foundations Benchmark v1.4](https://www.cisecurity.org/benchmark/google_workspace), et génère un rapport détaillé (Google Sheets & WebApp) avec statut, explication du risque, chemin de remédiation et registre des dérogations.

---

## 📋 Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Configuration](#-configuration)
- [Statuts de contrôle](#-statuts-de-contrôle)
- [Licence](#-licence)
- [Auteur](#-auteur)

---

## ✨ Fonctionnalités

- **87 contrôles audités** : 86 recommandations CIS v1.4 (profils L1 et L2) + 1 contrôle bonus (politique de nommage des comptes super admin).
- **Deux modes d'exécution** :
  - **WebApp progressive (Material Design 3)** : restitution contrôle par contrôle en temps réel, chronomètre, journal d'exécution et indicateurs dynamiques.
  - **Mode batch** : exécution directe et génération immédiate du classeur Google Sheets de synthèse.
- **Résilience & Haute performance** : traitement par lots parallèles, backoff exponentiel avec disjoncteur, protection anti-veille navigateur et gestion intelligente des quotas API (HTTP 429).
- **Plan d'actions & Gestion des risques** : registre des dérogations (acceptation formelle d'écarts avec recalcule du score résiduel) et explications contextuelles des risques.
- **Restitution multi-canal** : export Sheets structuré et envoi du rapport de synthèse par e-mail.

---

## 🏗️ Architecture

L'outil interroge **4 sources de données complémentaires** pour auditer le tenant :

| Source | Usage |
|---|---|
| **Cloud Identity Policy API** | Lecture des politiques de sécurité de la console admin (Drive, Gmail, Agenda, Chat, Marketplace, 2SV, sessions…). |
| **Admin SDK Directory API** | Analyse des super administrateurs, déploiement du 2SV par utilisateur, domaines et jetons OAuth tiers. |
| **Groups Settings API** | Analyse des règles de confidentialité et permissions de partage des groupes de discussion. |
| **DNS public (dns.google)** | Vérification en direct des enregistrements SPF, DKIM et DMARC de chaque domaine du tenant. |

---

## 📌 Prérequis

1. **Compte Super Administrateur Google Workspace** (obligatoire pour interroger la Policy API).
2. **Projet Google Cloud Platform (GCP) standard** associé au script Apps Script, avec les API suivantes activées :
   - Cloud Identity API
   - Admin SDK API
   - Groups Settings API
3. **Services avancés Google Apps Script** activés dans l'éditeur :
   - `AdminDirectory`
   - `GroupsSettings`
4. **Manifeste `appsscript.json`** configuré avec les scopes OAuth stricts nécessaires.

---

## 🚀 Installation

### 1. Créer le projet Apps Script
1. Connectez-vous à [script.google.com](https://script.google.com) avec votre compte super administrateur.
2. Créez un nouveau projet (ex: `Audit CIS Google Workspace`).
3. Copiez le contenu de [`Code.gs`](Code.gs) dans le fichier `Code.gs` du projet.
4. Créez un fichier HTML nommé `Index.html` et collez-y le contenu de [`Index.html`](Index.html).

### 2. Associer le projet GCP
1. Dans l'éditeur Apps Script, ouvrez les **Paramètres du projet** (⚙️).
2. Dans la section **Projet Google Cloud Platform (GCP)**, cliquez sur **Modifier le projet** et indiquez le numéro de votre projet GCP standard.
3. Dans la console Google Cloud de ce projet, activez les API :
   - `Cloud Identity API`
   - `Admin SDK API`
   - `Groups Settings API`

### 3. Activer les services avancés
1. Dans l'éditeur Apps Script, cliquez sur le **+** à côté de **Services**.
2. Activez **Admin SDK API** (identifiant : `AdminDirectory`).
3. Activez **Groups Settings API** (identifiant : `GroupsSettings`).

### 4. Déployer l'application Web
1. Cliquez sur **Déployer** > **Nouveau déploiement**.
2. Type : **Application Web**.
3. Exécuter en tant que : **Utilisateur accédant à l'application web**.
4. Qui a accès : **Tous les utilisateurs du domaine** (ou restreindre aux administrateurs).
5. Cliquez sur **Déployer** et conservez l'URL générée.

---

## 🎯 Utilisation

### Mode WebApp (recommandé)
1. Ouvrez l'URL de déploiement dans votre navigateur.
2. *(Optionnel)* Cochez l'option « Groupes détaillés » pour interroger individuellement la Groups Settings API sur chaque groupe.
3. Cliquez sur **Lancer l'audit**.
4. Suivez l'avancement en direct jusqu'à l'ouverture automatique du rapport Google Sheets créé dans votre Google Drive.

### Mode Batch
Exécutez directement la fonction `lancerAuditCIS()` depuis l'éditeur de script Apps Script. Le rapport Sheets complet sera créé sans passer par l'interface WebApp.

---

## ⚙️ Configuration

Les paramètres d'exécution peuvent être ajustés dans l'objet `CONFIG` au début de `Code.gs` :

| Clé | Valeur par défaut | Description |
|---|---|---|
| `VERSION` | `5.0.0` | Version de l'application (affichée dans l'UI et le rapport). |
| `NIVEAU_PROFIL` | `'L2'` | `'L1'` pour les contrôles de base, `'L2'` pour les profils renforcés L1 + L2. |
| `MAX_UTILISATEURS` | `12000` | Plafond d'utilisateurs audités pour les vérifications individuelles (2SV, tokens). |
| `MAX_GROUPES` | `3000` | Plafond de groupes audités via la Groups Settings API. |
| `GROUPES_PAR_APPEL` | `40` | Taille des lots pour la collecte asynchrone des groupes. |
| `POLITIQUES_CACHE_MIN` | `60` | Durée de mise en cache locale des politiques Cloud Identity (évite les quotas 429). |
| `SELECTEURS_DKIM` | `['google', 'default', ...]` | Sélecteurs DKIM testés automatiquement sur chaque domaine. |

---

## 🏷️ Statuts de contrôle

| Statut | Libellé | Signification |
|---|---|---|
| ✅ | **CONFORME** | Réglage strictement conforme à la recommandation CIS. |
| ❌ | **NON CONFORME** | Écart de sécurité détecté nécessitant remédiation. |
| 🔍 | **À VÉRIFIER** | Résultat partiel ou ambigu nécessitant une confirmation humaine. |
| 📋 | **MANUEL** | Contrôle non exposé par les API Google — procédure console documentée. |
| ⚠️ | **ERREUR** | Incident technique lors de l'interrogation de l'API. |
| ⏭️ | **HORS PROFIL** | Contrôle L2 ignoré lors d'un audit ciblé profil L1. |
| 🤝 | **ÉCART ACCEPTÉ** | Dérogation validée et tracée dans le registre des dérogations. |

---

## 📄 Licence

Ce projet est sous licence [MIT](LICENSE).

---

## 👤 Auteur & Crédits

- **Développeur** : Fabrice Faucheux — [https://faucheux.bzh](https://faucheux.bzh)
- **Référentiel de sécurité** : [Center for Internet Security® (CIS)](https://www.cisecurity.org/)

*Outil indépendant d'aide à l'évaluation, non affilié officiellement au Center for Internet Security®. Le document PDF officiel fait foi pour toute interprétation des recommandations.*

---
---

# 🛡️ CIS Google Workspace Foundations Benchmark Audit

> **Tired of spending evenings checking boxes in spreadsheets and juggling 15 admin console tabs just to verify the 86 CIS benchmark settings?**
> This tool automates the assessment in minutes, highlights exact misconfigurations, and provides an actionable remediation plan.

Automated and interactive audit tool that checks your Google Workspace tenant configuration against the **86 recommendations** from the [CIS Google Workspace Foundations Benchmark v1.4](https://www.cisecurity.org/benchmark/google_workspace), generating a detailed report (Google Sheets & WebApp) with status, risk rationale, remediation steps, and deviation tracking.

---

## 📋 Table of Contents

- [Features](#-features-1)
- [Architecture](#-architecture-1)
- [Prerequisites](#-prerequisites-1)
- [Installation](#-installation-1)
- [Usage](#-usage-1)
- [Configuration](#-configuration-1)
- [Control Statuses](#-control-statuses-1)
- [License](#-license-1)
- [Author](#-author--credits)

---

## ✨ Features

- **87 controls audited**: 86 CIS v1.4 recommendations (L1 and L2 levels) + 1 bonus check (super admin account naming convention).
- **Dual execution mode**:
  - **Progressive WebApp (Material Design 3)**: Real-time control-by-control feedback, timer, execution log, and dynamic progress bar.
  - **Batch mode**: Direct server-side execution and immediate Google Sheets generation.
- **Resilience & High performance**: Parallel batch processing, exponential backoff with circuit breaker, browser anti-sleep lock, and API quota management (HTTP 429).
- **Risk Management & Action Plan**: Deviation register (formal risk acceptance with residual score calculation) and contextual risk explanations.
- **Multi-channel reporting**: Structured Sheets export and automated email summary.

---

## 🏗️ Architecture

The tool queries **4 complementary data sources**:

| Source | Purpose |
|---|---|
| **Cloud Identity Policy API** | Read security policies across the Admin console (Drive, Gmail, Calendar, Chat, Marketplace, 2SV, sessions…). |
| **Admin SDK Directory API** | Super admin accounts, user-level 2SV enforcement, domain inventory, OAuth third-party tokens. |
| **Groups Settings API** | Group privacy configurations and sharing permissions. |
| **Public DNS (dns.google)** | Live validation of SPF, DKIM, and DMARC records for all verified domains. |

---

## 📌 Prerequisites

1. **Google Workspace Super Admin account** (mandatory for Policy API access).
2. **Standard Google Cloud Platform (GCP) project** linked to the Apps Script project with the following APIs enabled:
   - Cloud Identity API
   - Admin SDK API
   - Groups Settings API
3. **Advanced Services** enabled in the Apps Script project:
   - `AdminDirectory`
   - `GroupsSettings`
4. **`appsscript.json` manifest** configured with minimal OAuth scopes.

---

## 🚀 Installation

### 1. Create Apps Script Project
1. Log in to [script.google.com](https://script.google.com) with your Super Admin account.
2. Create a new project (e.g., `CIS Google Workspace Audit`).
3. Copy [`Code.gs`](Code.gs) into the project's `Code.gs`.
4. Create an HTML file named `Index.html` and paste the content from [`Index.html`](Index.html).

### 2. Link GCP Project
1. In the Apps Script editor, open **Project Settings** (⚙️).
2. Under **Google Cloud Platform (GCP) Project**, click **Change Project** and enter your standard GCP project number.
3. In the Google Cloud Console for that project, enable:
   - `Cloud Identity API`
   - `Admin SDK API`
   - `Groups Settings API`

### 3. Enable Advanced Services
1. In the Apps Script editor, click **+** next to **Services**.
2. Enable **Admin SDK API** (Identifier: `AdminDirectory`).
3. Enable **Groups Settings API** (Identifier: `GroupsSettings`).

### 4. Deploy Web App
1. Click **Deploy** > **New deployment**.
2. Select type: **Web app**.
3. Execute as: **User accessing the web app**.
4. Who has access: **Anyone within domain** (or restrict to admins).
5. Click **Deploy** and save the web app URL.

---

## 🎯 Usage

### WebApp Mode (Recommended)
1. Open the deployment URL in your browser.
2. *(Optional)* Check "Detailed groups" to inspect each group's privacy settings via Groups Settings API.
3. Click **Start Audit**.
4. Monitor progress until the Google Sheets report automatically opens.

### Batch Mode
Execute `lancerAuditCIS()` directly from the Apps Script editor.

---

## ⚙️ Configuration

Key settings can be updated in `CONFIG` in `Code.gs`:

| Key | Default | Description |
|---|---|---|
| `VERSION` | `5.0.0` | Application version. |
| `NIVEAU_PROFIL` | `'L2'` | `'L1'` for Level 1 only, `'L2'` for full Level 1 + Level 2 audit. |
| `MAX_UTILISATEURS` | `12000` | Max users analyzed for per-user checks. |
| `MAX_GROUPES` | `3000` | Max groups audited via Groups Settings API. |
| `GROUPES_PAR_APPEL` | `40` | Batch chunk size for asynchronous group queries. |
| `POLITIQUES_CACHE_MIN` | `60` | Cloud Identity policy cache TTL in minutes. |
| `SELECTEURS_DKIM` | `['google', 'default', ...]` | DKIM selectors checked per domain. |

---

## 🏷️ Control Statuses

| Status | Code | Meaning |
|---|---|---|
| ✅ | **CONFORME** | Compliant with CIS recommendation. |
| ❌ | **NON CONFORME** | Non-compliant — requires remediation. |
| 🔍 | **À VÉRIFIER** | Partial or ambiguous result — manual review advised. |
| 📋 | **MANUEL** | Non-API setting — manual review required. |
| ⚠️ | **ERREUR** | Technical failure during check execution. |
| ⏭️ | **HORS PROFIL** | Level 2 control skipped during Level 1 audit. |
| 🤝 | **ÉCART ACCEPTÉ** | Risk formally accepted in deviation register. |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 👤 Author & Credits

- **Developer**: Fabrice Faucheux — [https://faucheux.bzh](https://faucheux.bzh)
- **Security Benchmark**: [Center for Internet Security® (CIS)](https://www.cisecurity.org/)

*Independent evaluation tool, not officially affiliated with the Center for Internet Security®. Official CIS documentation remains the authoritative reference.*
