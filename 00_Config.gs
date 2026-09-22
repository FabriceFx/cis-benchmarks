/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE FOUNDATIONS BENCHMARK v1.4
 * ============================================================================
 *  Vérifie automatiquement les recommandations du benchmark CIS contre la
 *  configuration réelle du tenant Google Workspace, et génère un rapport
 *  Google Sheets détaillé (PASS / FAIL / À VÉRIFIER / MANUEL / ERREUR).
 *
 *  SOURCES DE DONNÉES UTILISÉES :
 *   1. Cloud Identity Policy API (lecture des réglages de la console admin :
 *      Drive, Gmail, Agenda, Chat, Marketplace, 2SV, sessions, etc.)
 *   2. Admin SDK Directory API (super admins, 2SV par utilisateur, domaines,
 *      groupes, jetons OAuth)
 *   3. Groups Settings API (réglages de confidentialité des groupes)
 *   4. DNS public (dns.google) pour SPF / DKIM / DMARC
 *
 *  PRÉREQUIS (voir README) :
 *   - Exécuter le script avec un compte SUPER ADMIN (obligatoire pour la
 *     Policy API).
 *   - Projet GCP standard attaché au script, avec les API activées :
 *     Cloud Identity API, Admin SDK API, Groups Settings API.
 *   - Services avancés activés dans l'éditeur : AdminDirectory, GroupsSettings.
 *   - Manifeste appsscript.json avec les scopes fournis.
 *
 *  ORGANISATION DU CODE :
 *   Les fichiers sont numérotés pour fixer l'ordre de chargement. Apps Script
 *   partage une portée globale entre eux et remonte les déclarations de
 *   fonction, mais pas les constantes de premier niveau : une constante lue à
 *   l'initialisation d'une autre doit donc être déclarée dans un fichier qui
 *   charge avant. clasp pousse les fichiers par ordre alphabétique, que la
 *   numérotation rend explicite.
 *
 *     00_Config       CONFIG, STATUT
 *     01_I18n         traductions serveur, référentiel des risques FR/EN
 *     02_Securite     contrôle d'accès, verrou, journal d'audit
 *     03_Cache        persistance de session (contexte, résultats)
 *     04_Policy       lecture et évaluation des politiques, par périmètre
 *     05_Dns          SPF / DKIM / DMARC via DNS-over-HTTPS
 *     06_Derogations  registre d'acceptation formelle des écarts
 *     07_Controles    définition des 87 contrôles
 *     08_Collecte     collecte du contexte, par étapes
 *     09_WebApp       points d'entrée : application web et mode batch
 *     10_Rapport      classeur Google Sheets
 *     11_Email        envoi de la synthèse
 *     Index.html      interface de l'application web
 *     tests/          harnais Node sans dépendance (node tests/<fichier>)
 *
 *  HISTORIQUE DES VERSIONS : voir CHANGELOG.md, seule source de vérité.
 *
 *  POINTS D'ENTRÉE :
 *   - WebApp (progressif, contrôle par contrôle) : déployer en application web,
 *     fichier Index.html requis. Voir doGet().
 *   - Mode batch (rapport Sheets direct) : lancerAuditCIS()
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
const CONFIG = {
  // Version de l'outil — À INCRÉMENTER À CHAQUE MODIFICATION puis redéployer.
  // Affichée dans le footer de la WebApp (injectée par doGet), dans le journal
  // et dans la synthèse du rapport : si le footer n'affiche pas la version
  // attendue après une mise à jour, le redéploiement n'a pas été fait.
  VERSION: '5.4.0',
  // 'L1' = contrôles de niveau 1 uniquement, 'L2' = niveaux 1 + 2
  NIVEAU_PROFIL: 'L2',
  // Langue par défaut du script
  LANGUE: 'fr',
  // Nombre max d'utilisateurs analysés pour les contrôles par utilisateur (2SV, tokens)
  MAX_UTILISATEURS: 12000,
  // Nombre max de groupes analysés pour les contrôles Groups Settings
  MAX_GROUPES: 3000,
  // Taille des lots pour la lecture des réglages de groupes (WebApp, phase 1)
  GROUPES_PAR_APPEL: 40,
  // Pages d'API lues au maximum par appel serveur, toutes étapes confondues :
  // garantit un retour rapide au navigateur et écarte la limite des 6 minutes.
  PAGES_PAR_APPEL: 4,
  // Réutiliser un relevé de politiques Cloud Identity plus récent que N minutes
  // (0 = toujours relire). Le quota de la Policy API est bas : des audits
  // rapprochés ne doivent pas le consommer inutilement.
  POLITIQUES_CACHE_MIN: 60,
  // Sélecteurs DKIM testés sur chaque domaine
  SELECTEURS_DKIM: ['google', 'default', 'selector1', 'selector2'],
  // Nom du classeur de rapport
  NOM_RAPPORT: 'Audit CIS Google Workspace v1.4',
  // Domaines autorisés EN PLUS de ceux du tenant pour l'envoi du rapport.
  // Un rapport d'audit décrit la posture de sécurité complète du tenant :
  // sa diffusion hors du domaine doit être un choix explicite et tracé.
  // Exemple : ['cabinet-audit.example'].
  DOMAINES_DESTINATAIRES: []
};

const STATUT = {
  PASS: 'CONFORME',
  FAIL: 'NON CONFORME',
  REVIEW: 'À VÉRIFIER',
  MANUAL: 'MANUEL',
  ERROR: 'ERREUR',
  SKIP: 'HORS PROFIL',
  ACCEPTED: 'ÉCART ACCEPTÉ'
};
