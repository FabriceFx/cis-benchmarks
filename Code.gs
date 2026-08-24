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
 *  HISTORIQUE DES VERSIONS :
 *   1.0.0  Audit batch + rapport Sheets (89 contrôles CIS v1.3.0)
 *   2.0.0  WebApp progressive (résultat contrôle par contrôle)
 *   2.1.0  Collecte par étapes, journal, chronomètre, panneau d'avancement
 *   2.2.0  Arrêt propre, reprise, réinitialisation
 *   3.0.0  Résilience : lots parallèles, backoff, disjoncteur, anti-veille
 *   4.0.0  Plan d'actions + registre des dérogations (acceptation d'écarts)
 *   4.1.0  Versionnage affiché, footer, guide intégré lié au document CIS
 *   4.2.0  Gestion des quotas API (429) : attente programmée, réutilisation
 *          du relevé de politiques récent, protection Directory/Groups
 *   4.3.0  Collecte repliée en résumé après la phase 1, envoi du rapport
 *          par e-mail (dialogue destinataires/objet/message)
 *   4.4.0  Habillage à la charte Google Workspace (Material) — interface,
 *          rapport Sheets et e-mail alignés (bleu #1a73e8, Roboto)
 *   4.4.1  Correctif mise en page : footer visible sans défilement (sticky
 *          footer flex), version affichée en chip dans le bandeau
 *   5.0.0  Alignement sur le benchmark CIS v1.4 : renumérotation Drive
 *          for desktop (3.1.2.3.1), retrait Add-Ons et LSA (supprimés du
 *          CIS v1.4), mise à jour de toutes les références textuelles
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
  VERSION: '5.0.0',
  // 'L1' = contrôles de niveau 1 uniquement, 'L2' = niveaux 1 + 2
  NIVEAU_PROFIL: 'L2',
  // Nombre max d'utilisateurs analysés pour les contrôles par utilisateur (2SV, tokens)
  MAX_UTILISATEURS: 12000,
  // Nombre max de groupes analysés pour les contrôles Groups Settings
  MAX_GROUPES: 3000,
  // Taille des lots pour la lecture des réglages de groupes (WebApp, phase 1)
  GROUPES_PAR_APPEL: 40,
  // Réutiliser un relevé de politiques Cloud Identity plus récent que N minutes
  // (0 = toujours relire). Le quota de la Policy API est bas : des audits
  // rapprochés ne doivent pas le consommer inutilement.
  POLITIQUES_CACHE_MIN: 60,
  // Sélecteurs DKIM testés sur chaque domaine
  SELECTEURS_DKIM: ['google', 'default', 'selector1', 'selector2'],
  // Nom du classeur de rapport
  NOM_RAPPORT: 'Audit CIS Google Workspace v1.4'
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

// ---------------------------------------------------------------------------
// POINT D'ENTRÉE PRINCIPAL
// ---------------------------------------------------------------------------
function lancerAuditCIS() {
  const debut = new Date();
  const ctx = construireContexte_();
  const resultats = [];

  DEFINITION_CONTROLES.forEach(function (ctrl) {
    let res;
    if (ctrl.level === 'L2' && CONFIG.NIVEAU_PROFIL === 'L1') {
      res = { statut: STATUT.SKIP, detail: 'Contrôle L2 exclu du profil L1.' };
    } else {
      try {
        res = ctrl.check(ctx);
      } catch (e) {
        res = { statut: STATUT.ERROR, detail: 'Exception : ' + e.message };
      }
    }
    resultats.push({
      id: ctrl.id,
      level: ctrl.level,
      titre: ctrl.titre,
      statut: res.statut,
      detail: res.detail || '',
      remediation: ctrl.remediation || ''
    });
  });

  const url = ecrireRapport_(resultats, ctx, debut);
  Logger.log('Audit terminé. Rapport : ' + url);
  return url;
}



// ---------------------------------------------------------------------------
// RÉFÉRENTIEL DES RISQUES — présenté avant toute acceptation d'écart
// (formulations synthétiques rédigées à partir de la logique du benchmark)
// ---------------------------------------------------------------------------
const RISQUES = {
  '1.1.1': 'Un seul super admin est un point de défaillance unique : compte perdu, suspendu ou compromis, plus aucune administration du tenant n\'est possible.',
  '1.1.2': 'Chaque super admin supplémentaire est une cible de phishing à impact maximal ; au-delà de 4, la surface d\'attaque devient difficile à surveiller.',
  '1.1.3': 'Un super admin utilisé au quotidien (mail, navigation, docs) expose des privilèges totaux aux risques ordinaires : une seule pièce jointe piégée suffit.',
  '1.2.1.1': 'Un annuaire consultable de l\'extérieur facilite la cartographie des employés, donc le phishing ciblé et l\'ingénierie sociale.',
  '3.1.1.1.1': 'Le partage externe des détails d\'agenda révèle réunions, participants et sujets sensibles hors de l\'organisation.',
  '3.1.1.1.2': 'Un partage interne trop permissif permet la lecture voire la modification d\'agendas par défaut, au-delà du besoin d\'en connaître.',
  '3.1.1.1.3': 'Sans avertissement, un organisateur peut inviter un externe et lui exposer les détails d\'une réunion par inadvertance.',
  '3.1.1.2.1': 'Les agendas secondaires (équipes, projets) partagés en externe peuvent divulguer des plannings et activités internes.',
  '3.1.1.2.2': 'Des agendas secondaires modifiables par défaut ouvrent des droits au-delà du besoin réel.',
  '3.1.1.3.1': 'Les données d\'agenda synchronisées hors connexion persistent sur des postes potentiellement partagés ou non maîtrisés.',
  '3.1.2.1.1.1': 'Sans avertissement au partage externe, l\'exfiltration accidentelle de documents devient invisible pour l\'utilisateur.',
  '3.1.2.1.1.2': 'Un fichier publié sur le web est indexable et accessible à quiconque, sans authentification ni traçabilité.',
  '3.1.2.1.1.3': 'Un partage ouvert à tout domaine supprime toute maîtrise des destinataires réels des données de l\'entreprise.',
  '3.1.2.1.1.4': 'Même vers des domaines de confiance, un partage sans avertissement favorise les erreurs de destinataire.',
  '3.1.2.1.1.5': 'Un Access Checker permissif transforme un simple envoi de lien en élargissement d\'accès, jusqu\'au public.',
  '3.1.2.1.1.6': 'Autoriser des non-membres à distribuer du contenu multiplie les canaux de sortie de données non tracés.',
  '3.1.2.1.2.1': 'Sans Drive partagés, les fichiers restent attachés aux comptes individuels : perte ou orphelinage des données au départ des collaborateurs.',
  '3.1.2.1.2.2': 'Si les gestionnaires peuvent outrepasser les réglages, les garde-fous des Drive partagés deviennent contournables localement.',
  '3.1.2.1.2.3': 'L\'accès aux fichiers par des non-membres contourne la logique d\'appartenance qui fonde la sécurité des Drive partagés.',
  '3.1.2.1.2.4': 'Lecteurs et commentateurs pouvant télécharger/imprimer, tout accès en lecture devient un canal d\'exfiltration complet.',
  '3.1.2.2.1': 'Les documents disponibles hors connexion persistent en local, hors du contrôle d\'accès et de la révocation centralisés.',
  '3.1.2.3.1': 'Drive pour ordinateur synchronise des volumes entiers sur les postes : vol ou compromission du poste = fuite massive.',
  '3.1.3.1.1': 'La délégation de boîte donne un accès complet et durable au courrier d\'autrui, difficile à auditer.',
  '3.1.3.1.2': 'Gmail hors connexion conserve le courrier en local sur le poste, hors révocation centralisée.',
  '3.1.3.2.1': 'Sans DKIM, vos e-mails ne sont pas signés : usurpation de votre domaine facilitée et délivrabilité dégradée.',
  '3.1.3.2.2': 'Sans SPF, tout serveur peut émettre au nom de vos domaines sans être signalé.',
  '3.1.3.2.3': 'Sans DMARC, aucune politique n\'indique aux destinataires quoi faire des messages usurpant votre domaine, et aucun rapport ne vous alerte.',
  '3.1.3.3.1': 'Sans notification, les messages en quarantaine (fuites bloquées, malware) ne sont jamais revus par les admins.',
  '3.1.3.4.1.1': 'Les pièces jointes chiffrées échappent à l\'analyse antivirus : vecteur classique de ransomware.',
  '3.1.3.4.1.2': 'Les pièces jointes contenant des scripts d\'expéditeurs inconnus sont un vecteur d\'exécution de code.',
  '3.1.3.4.1.3': 'Les types de pièces jointes inhabituels pour votre domaine signalent des campagnes de malware ciblées.',
  '3.1.3.4.2.1': 'Les URL raccourcies masquent la destination réelle des liens de phishing.',
  '3.1.3.4.2.2': 'Des images liées peuvent charger du contenu malveillant ou traquer l\'ouverture des messages.',
  '3.1.3.4.2.3': 'Sans avertissement au clic, un lien vers un domaine non fiable mène l\'utilisateur au phishing sans friction.',
  '3.1.3.4.3.1': 'Des domaines visuellement similaires au vôtre (typosquatting) trompent les utilisateurs sur l\'expéditeur.',
  '3.1.3.4.3.2': 'L\'usurpation du nom d\'un dirigeant ou collègue est le cœur de la fraude au président et des demandes de virement.',
  '3.1.3.4.3.3': 'Des e-mails entrants prétendant venir de votre propre domaine abusent de la confiance interne.',
  '3.1.3.4.3.4': 'Les messages non authentifiés (ni SPF ni DKIM) sont les plus susceptibles d\'être frauduleux.',
  '3.1.3.4.3.5': 'Les groupes (souvent à diffusion large) relaient l\'usurpation à toute une population d\'un coup.',
  '3.1.3.5.1': 'POP/IMAP déportent le courrier vers des clients sans protections Gmail (liens, pièces jointes) ni contrôle de session.',
  '3.1.3.5.2': 'Le transfert automatique est le mécanisme privilégié d\'exfiltration silencieuse après compromission d\'un compte.',
  '3.1.3.5.3': 'Une passerelle SMTP personnelle contourne les règles de conformité, la journalisation et le DLP sortants.',
  '3.1.3.5.4': 'Sans avertissement de destinataire externe, les réponses fuitent des informations internes par simple inattention.',
  '3.1.3.6.1': 'Sans analyse renforcée pré-distribution, des messages suspects atteignent la boîte avant détection.',
  '3.1.3.6.2': 'Approuver son propre domaine sans authentification permet aux usurpateurs de contourner le filtre anti-spam.',
  '3.1.3.7.1': 'Sans stockage complet, des messages routés hors Gmail échappent à l\'archivage, à Vault et aux enquêtes.',
  '3.1.3.7.2': 'Sans TLS forcé vers les partenaires sensibles, le courrier peut transiter en clair sur Internet.',
  '3.1.4.1.1': 'Le partage de fichiers dans des conversations externes est un canal d\'exfiltration hors des règles Drive.',
  '3.1.4.1.2': 'Le partage interne illimité dans Chat diffuse des fichiers hors de la gouvernance documentaire.',
  '3.1.4.2.1': 'Un chat externe ouvert expose les utilisateurs au phishing conversationnel et à la fuite d\'informations.',
  '3.1.4.3.1': 'Des espaces ouverts aux externes mélangent conversations internes et participants non maîtrisés.',
  '3.1.4.4.1': 'Les applications Chat tierces accèdent aux conversations et données selon leurs propres conditions.',
  '3.1.4.4.2': 'Un webhook entrant est une porte d\'écriture non authentifiée par utilisateur vers vos espaces.',
  '3.1.6.1': 'Des groupes accessibles au public exposent leurs archives (souvent riches en informations internes) à Internet.',
  '3.1.6.2': 'La création libre de groupes multiplie les listes non gouvernées, avec des réglages de partage hérités hasardeux.',
  '3.1.6.3': 'Des conversations de groupes visibles par défaut au-delà des membres divulguent les échanges internes.',
  '3.1.7.1': 'Google Sites permet de publier des pages (potentiellement publiques) sans revue : fuite et défiguration possibles.',
  '3.1.8.1': 'L\'accès aux groupes Google grand public expose aux fuites vers des listes externes et au phishing communautaire.',
  '3.1.9.1.1': 'Sans liste d\'autorisation Marketplace, chaque utilisateur peut installer des applications tierces avec accès OAuth à ses données.',
  '4.1.1.1': 'Un compte à privilèges sans MFA se compromet par simple vol de mot de passe : impact total sur le tenant.',
  '4.1.1.2': 'Les OTP/notifications restent phishables ; seules les clés de sécurité résistent aux attaques de type adversary-in-the-middle pour les admins.',
  '4.1.1.3': 'Sans 2SV généralisée, chaque mot de passe volé (fuites, réutilisation) devient une compromission de compte.',
  '4.1.2.1': 'L\'auto-récupération d\'un super admin (téléphone/e-mail perso) est une voie de prise de contrôle du tenant entier.',
  '4.1.2.2': 'Sans récupération en libre-service, les blocages de comptes standards saturent le support et poussent aux contournements.',
  '4.1.3.1': 'Les comptes les plus ciblés (direction, admins) restent au niveau de protection standard face à des attaques avancées.',
  '4.1.4.1': 'Sans défi supplémentaire, une connexion suspecte (empreinte inhabituelle) aboutit sans friction.',
  '4.1.5.1': 'Mots de passe courts ou réutilisés : vulnérabilité directe au bourrage d\'identifiants et aux fuites externes.',
  '4.2.1.1': 'Des applications tierces non validées obtiennent des jetons OAuth durables sur Gmail/Drive : accès persistant même après changement de mot de passe.',
  '4.2.1.2': 'Sans revue périodique, des applications abandonnées ou compromises conservent leurs accès indéfiniment.',
  '4.2.1.3': 'Si les applications internes ne sont pas de confiance, les intégrations métier échouent et poussent à des contournements moins sûrs.',
  '4.2.1.4': 'Une délégation à l\'échelle du domaine compromise donne accès aux données de TOUS les utilisateurs sans leur consentement.',
  '4.2.2.1': 'Sans géoblocage, des connexions depuis des zones sans activité légitime ne déclenchent aucune barrière.',
  '4.2.3.1': 'Sans DLP, les données sensibles (RIB, données personnelles, secrets) sortent de Drive sans détection.',
  '4.2.4.1': 'Des sessions sans expiration laissent des accès ouverts sur des postes partagés, perdus ou volés.',
  '4.2.5.1': 'Les consoles Cloud pilotent l\'infrastructure : sans ré-authentification, une session volée suffit.',

  '4.3.1': 'Sans revue du tableau de bord, les signaux d\'attaque (pics de phishing, partages anormaux) passent inaperçus.',
  '4.3.2': 'Les recommandations de Security Health non traitées laissent des faiblesses connues et documentées ouvertes.',
  '5.1.1.1': 'Sans revue d\'utilisation, les usages anormaux (comptes dormants actifs, volumes inhabituels) ne sont pas détectés.',
  '5.1.1.2': 'Le rapport de sécurité agrège les indicateurs clés (2SV, partages externes) : sans revue, la dérive est invisible.',
  '6.1': 'Un changement de mot de passe non sollicité est souvent le premier signe d\'une compromission de compte.',
  '6.2': 'Google signale les attaques étatiques ciblées : sans alerte relayée, l\'information n\'atteint jamais l\'équipe sécurité.',
  '6.3': 'Une suspension pour activité suspecte doit déclencher une investigation immédiate, pas être découverte plus tard.',
  '6.4': 'Un octroi de privilège admin non attendu est un marqueur d\'élévation de privilèges par un attaquant.',
  '6.5': 'Une connexion programmatique suspecte signale un vol de jeton ou un script malveillant.',
  '6.6': 'Les connexions suspectes non notifiées laissent l\'attaquant agir dans la fenêtre critique.',
  '6.7': 'Un mot de passe divulgué détecté par Google exige une réinitialisation immédiate.',
  '6.8': 'L\'usurpation d\'employé dans Gmail précède typiquement une tentative de fraude interne.'
};

function risquePour_(id) {
  return RISQUES[id] || 'Écart au benchmark CIS : la protection visée par ce contrôle n\'est pas assurée.';
}

// ---------------------------------------------------------------------------
// WEBAPP — EXÉCUTION PROGRESSIVE AVEC RETOUR D'AVANCEMENT EN TEMPS RÉEL
// ---------------------------------------------------------------------------
// La collecte (phase 1) est découpée en étapes courtes pilotées par le
// navigateur : chaque appel serveur traite une tranche (pages de politiques,
// pages d'utilisateurs, lot de réglages de groupes) puis rend la main avec son
// avancement. L'interface affiche donc en continu ce qui est en train de se
// passer, et aucune étape ne peut approcher la limite des 6 minutes.
// ---------------------------------------------------------------------------

function doGet() {
  const gabarit = HtmlService.createTemplateFromFile('Index');
  gabarit.version = CONFIG.VERSION; // source unique de vérité : le serveur
  return gabarit.evaluate()
    .setTitle('Audit CIS Google Workspace v1.4')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Ouvre une session d'audit : immédiat (aucune collecte), retourne le plan. */
function demarrerSession(niveauProfil) {
  if (niveauProfil === 'L1' || niveauProfil === 'L2') CONFIG.NIVEAU_PROFIL = niveauProfil;
  const token = Utilities.getUuid();
  sauvegarderPartie_(token, 'err', []);
  return {
    token: token,
    niveau: CONFIG.NIVEAU_PROFIL,
    compte: Session.getActiveUser().getEmail(),
    version: CONFIG.VERSION,
    config: {
      maxUtilisateurs: CONFIG.MAX_UTILISATEURS,
      maxGroupes: CONFIG.MAX_GROUPES,
      groupesParAppel: CONFIG.GROUPES_PAR_APPEL
    },
    derogations: listerDerogations(),
    controles: DEFINITION_CONTROLES.map(function (c) {
      return { id: c.id, level: c.level, titre: c.titre };
    }),
    etapes: [
      { cle: 'domaines',     libelle: 'Domaines du tenant' },
      { cle: 'politiques',   libelle: 'Politiques Cloud Identity (réglages console)' },
      { cle: 'utilisateurs', libelle: 'Utilisateurs (admins, état 2SV)' },
      { cle: 'groupes',      libelle: 'Liste des groupes' },
      { cle: 'reglages',     libelle: 'Réglages de confidentialité des groupes' }
    ]
  };
}

/**
 * Exécute UNE tranche d'une étape de collecte et retourne son avancement.
 * Retour : { termine, curseur, fait, total, info, erreur? }
 * Une étape en échec est journalisée puis considérée terminée : l'audit
 * continue, les contrôles dépendants remonteront ERREUR avec la cause.
 */
function collecterEtape(token, etape, curseur) {
  try {
    switch (etape) {

      case 'domaines': {
        const rep = AdminDirectory.Domains.list('my_customer');
        const doms = (rep.domains || []).map(function (d) { return d.domainName; });
        sauvegarderPartie_(token, 'dom', doms);
        return { termine: true, fait: doms.length, total: doms.length,
                 info: doms.length + ' domaine(s) : ' + doms.join(', ') };
      }

      case 'politiques': {
        // Réutilisation d'un relevé récent (cache utilisateur) : les politiques
        // changent rarement et le quota de la Policy API est bas — des audits
        // rapprochés (tests, reprises) ne doivent pas le reconsommer.
        if (!curseur && CONFIG.POLITIQUES_CACHE_MIN > 0) {
          const snap = chargerSnapshotPolitiques_();
          if (snap && (Date.now() - snap.ts) < CONFIG.POLITIQUES_CACHE_MIN * 60000) {
            sauvegarderPartie_(token, 'pol', snap.politiques);
            const age = Math.max(1, Math.round((Date.now() - snap.ts) / 60000));
            return { termine: true, fait: snap.politiques.length, total: snap.politiques.length,
                     info: snap.politiques.length + ' politique(s) réutilisée(s) du relevé d\'il y a ' + age +
                           ' min — quota API préservé (forcer une relecture : POLITIQUES_CACHE_MIN=0)' };
          }
        }
        const existant = curseur ? (chargerPartie_(token, 'pol') || []) : [];
        let pageToken = (curseur && curseur !== '@debut') ? curseur : null;
        let pages = 0;
        const jeton = ScriptApp.getOAuthToken();
        do {
          let url = 'https://cloudidentity.googleapis.com/v1/policies?pageSize=100';
          if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
          const rep = UrlFetchApp.fetch(url, {
            headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true });
          const code = rep.getResponseCode();
          if (code === 429) {
            // Quota épuisé : on sauvegarde l'acquis et on demande au client
            // d'attendre puis de rappeler la même position — pas d'abandon.
            sauvegarderPartie_(token, 'pol', existant);
            return { termine: false, curseur: pageToken || '@debut', attente: 60,
                     fait: existant.length, total: null,
                     info: 'quota de la Policy API atteint (' + existant.length + ' politique(s) déjà lue(s))' };
          }
          if (code !== 200) {
            throw new Error('HTTP ' + code + ' — ' + rep.getContentText().slice(0, 250) +
              (code === 403 ? ' (compte non super admin, ou Cloud Identity API non activée sur le projet GCP ?)' : ''));
          }
          const data = JSON.parse(rep.getContentText());
          (data.policies || []).forEach(function (p) {
            existant.push({
              type: p.type,
              policyQuery: { orgUnit: (p.policyQuery || {}).orgUnit, query: (p.policyQuery || {}).query },
              setting: p.setting ? { type: p.setting.type, value: p.setting.value } : null
            });
          });
          pageToken = data.nextPageToken;
          pages++;
        } while (pageToken && pages < 4); // 4 pages max par appel -> retour rapide au navigateur
        sauvegarderPartie_(token, 'pol', existant);
        if (!pageToken) sauvegarderSnapshotPolitiques_(existant); // relevé complet -> réutilisable
        return { termine: !pageToken, curseur: pageToken || null,
                 fait: existant.length, total: null,
                 info: existant.length + ' politique(s) lue(s)' + (pageToken ? ' — suite en cours' : '') };
      }

      case 'utilisateurs': {
        const existant = curseur ? (chargerPartie_(token, 'usr') || []) : [];
        let pageToken = (curseur && curseur !== '@debut') ? curseur : null;
        let pages = 0;
        do {
          let rep;
          try {
            rep = AdminDirectory.Users.list({
              customer: 'my_customer', maxResults: 500, pageToken: pageToken, projection: 'basic',
              fields: 'nextPageToken,users(primaryEmail,isAdmin,isDelegatedAdmin,suspended,isEnrolledIn2Sv,isEnforcedIn2Sv,lastLoginTime)'
            });
          } catch (e) {
            if (/429|RESOURCE_EXHAUSTED|quota|rate ?limit/i.test(String(e.message))) {
              sauvegarderPartie_(token, 'usr', existant);
              return { termine: false, curseur: pageToken || '@debut', attente: 30,
                       fait: existant.length, total: null,
                       info: 'quota de la Directory API atteint (' + existant.length + ' utilisateur(s) déjà lu(s))' };
            }
            throw e;
          }
          (rep.users || []).forEach(function (u) { existant.push(u); });
          pageToken = rep.nextPageToken;
          pages++;
        } while (pageToken && pages < 3 && existant.length < CONFIG.MAX_UTILISATEURS);
        sauvegarderPartie_(token, 'usr', existant);
        const termine = !pageToken || existant.length >= CONFIG.MAX_UTILISATEURS;
        return { termine: termine, curseur: pageToken || null,
                 fait: existant.length, total: null,
                 info: existant.length + ' utilisateur(s) lu(s)' + (termine ? '' : ' — suite en cours') };
      }

      case 'groupes': {
        const groupes = [];
        let pageToken = null;
        do {
          const rep = AdminDirectory.Groups.list({
            customer: 'my_customer', maxResults: 200, pageToken: pageToken,
            fields: 'nextPageToken,groups(email,name)'
          });
          (rep.groups || []).forEach(function (g) { groupes.push({ email: g.email, name: g.name }); });
          pageToken = rep.nextPageToken;
        } while (pageToken && groupes.length < CONFIG.MAX_GROUPES);
        sauvegarderPartie_(token, 'grp', groupes);
        return { termine: true, fait: groupes.length, total: groupes.length,
                 info: groupes.length + ' groupe(s) recensé(s)' };
      }

      case 'reglages': {
        const groupes = chargerPartie_(token, 'grp');
        const borne = Math.min(groupes.length, CONFIG.MAX_GROUPES);
        const debutIdx = Number(curseur) || 0;
        const finIdx = Math.min(debutIdx + CONFIG.GROUPES_PAR_APPEL, borne);
        for (let i = debutIdx; i < finIdx; i++) {
          try {
            const s = GroupsSettings.Groups.get(groupes[i].email);
            groupes[i].settings = {
              whoCanViewGroup: s.whoCanViewGroup,
              whoCanPostMessage: s.whoCanPostMessage,
              whoCanViewTopics: s.whoCanViewTopics,
              whoCanJoin: s.whoCanJoin
            };
          } catch (e) {
            groupes[i].settings = null;
            groupes[i].erreur = e.message;
          }
        }
        sauvegarderPartie_(token, 'grp', groupes);
        const termine = finIdx >= borne;
        return { termine: termine, curseur: String(finIdx),
                 fait: finIdx, total: borne,
                 info: finIdx + ' / ' + borne + ' réglages de groupes lus' };
      }

      default:
        throw new Error('Étape inconnue : ' + etape);
    }
  } catch (e) {
    ajouterErreur_(token, 'Collecte "' + etape + '" : ' + e.message);
    return { termine: true, erreur: e.message,
             info: 'Étape "' + etape + '" en échec : ' + e.message + ' — l\'audit continue, les contrôles dépendants seront en ERREUR.' };
  }
}

/**
 * Lit les réglages d'UNE tranche de groupes [debut, debut+GROUPES_PAR_APPEL[
 * et la stocke sous sa propre clé de cache ("grs_<debut>"). Les tranches étant
 * indépendantes, le client peut en lancer plusieurs en parallèle sans risque
 * d'écrasement concurrent (contrairement à l'ancienne écriture du tableau
 * complet). L'assemblage se fait dans chargerContexte_().
 */
function collecterReglagesTranche(token, debut) {
  const d = Number(debut) || 0;
  try {
    const groupes = chargerPartie_(token, 'grp');
    if (!groupes) throw new Error('Liste des groupes absente du cache (session expirée ?).');
    const borne = Math.min(groupes.length, CONFIG.MAX_GROUPES);
    const f = Math.min(d + CONFIG.GROUPES_PAR_APPEL, borne);
    const tranche = [];
    for (let i = d; i < f; i++) {
      try {
        const s = GroupsSettings.Groups.get(groupes[i].email);
        tranche.push({
          whoCanViewGroup: s.whoCanViewGroup,
          whoCanPostMessage: s.whoCanPostMessage,
          whoCanViewTopics: s.whoCanViewTopics,
          whoCanJoin: s.whoCanJoin
        });
      } catch (e) {
        if (/429|RESOURCE_EXHAUSTED|quota|rate ?limit/i.test(String(e.message))) {
          throw new Error('QUOTA — ' + e.message); // remonte pour attente programmée (pas de null silencieux)
        }
        tranche.push(null);
      }
    }
    sauvegarderPartie_(token, 'grs_' + d, tranche);
    return { debut: d, fin: f, borne: borne };
  } catch (e) {
    if (/^QUOTA/.test(String(e.message))) {
      return { debut: d, fin: d, borne: null, attente: 30,
               erreur: 'quota de l\'API Groups Settings atteint — le lot sera rejoué automatiquement' };
    }
    ajouterErreur_(token, 'Réglages groupes, tranche ' + d + ' : ' + e.message);
    return { debut: d, fin: d, borne: null, erreur: e.message };
  }
}


// ---------------------------------------------------------------------------
// REGISTRE DES DÉROGATIONS (acceptation d'écarts en connaissance de cause)
// Stockage : ScriptProperties => durable (pas de TTL) et partagé entre les
// administrateurs qui utilisent la WebApp.
// ---------------------------------------------------------------------------
function listerDerogations() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const map = {};
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('derog_') === 0) {
      try { map[k.substring(6)] = JSON.parse(props[k]); } catch (e) { /* entrée corrompue : ignorée */ }
    }
  });
  return map;
}

function enregistrerDerogation(id, motif, dureeMois) {
  if (!motif || !String(motif).trim()) {
    throw new Error('Un motif est obligatoire pour accepter un écart.');
  }
  const existeCtrl = DEFINITION_CONTROLES.some(function (c) { return c.id === id; });
  if (!existeCtrl) throw new Error('Contrôle inconnu : ' + id);
  const tz = Session.getScriptTimeZone();
  const entree = {
    id: id,
    motif: String(motif).trim().slice(0, 1000),
    par: Session.getActiveUser().getEmail(),
    date: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    revision: (dureeMois && Number(dureeMois) > 0)
      ? Utilities.formatDate(new Date(Date.now() + Number(dureeMois) * 30.44 * 86400000), tz, 'yyyy-MM-dd')
      : null // null = permanente (revue au prochain audit tout de même)
  };
  PropertiesService.getScriptProperties().setProperty('derog_' + id, JSON.stringify(entree));
  return entree;
}

function revoquerDerogation(id) {
  PropertiesService.getScriptProperties().deleteProperty('derog_' + id);
  return true;
}

/** Exécute un ou plusieurs contrôles sur le contexte collecté. */
function executerControles(token, ids, niveauProfil) {
  if (niveauProfil === 'L1' || niveauProfil === 'L2') CONFIG.NIVEAU_PROFIL = niveauProfil;
  const ctx = chargerContexte_(token);
  const parId = {};
  DEFINITION_CONTROLES.forEach(function (c) { parId[c.id] = c; });
  return ids.map(function (id) {
    const ctrl = parId[id];
    if (!ctrl) return { id: id, statut: STATUT.ERROR, detail: 'Contrôle inconnu.', titre: '', level: '', remediation: '' };
    let res;
    if (ctrl.level === 'L2' && CONFIG.NIVEAU_PROFIL === 'L1') {
      res = { statut: STATUT.SKIP, detail: 'Contrôle L2 exclu du profil L1.' };
    } else {
      try {
        res = ctrl.check(ctx);
      } catch (e) {
        res = { statut: STATUT.ERROR, detail: 'Exception : ' + e.message };
      }
    }
    return {
      id: ctrl.id, level: ctrl.level, titre: ctrl.titre,
      statut: res.statut, detail: res.detail || '', remediation: ctrl.remediation || '',
      risque: risquePour_(ctrl.id)
    };
  });
}

/** Génère le rapport Google Sheets à partir des résultats accumulés. */
function genererRapportSheets(token, resultats) {
  let ctx;
  try {
    ctx = chargerContexte_(token);
  } catch (e) {
    ctx = { domaines: [], policies: [], policyIndex: {}, erreurs: ['Contexte expiré — onglet Politiques (brut) non disponible.'] };
  }
  return ecrireRapport_(resultats, ctx, new Date());
}



// ---------------------------------------------------------------------------
// ENVOI DU RAPPORT PAR E-MAIL
// ---------------------------------------------------------------------------
function envoyerRapportEmail(token, resultats, options) {
  options = options || {};
  const dests = String(options.destinataires || '')
    .split(/[;,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!dests.length) throw new Error('Au moins un destinataire est requis.');
  dests.forEach(function (d) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)) throw new Error('Adresse invalide : ' + d);
  });

  // Statut effectif (dérogations appliquées) + décomptes
  const derog = listerDerogations();
  const enrichis = resultats.map(function (r) {
    return Object.assign({}, r, {
      statutEffectif: (r.statut === STATUT.FAIL && derog[r.id]) ? STATUT.ACCEPTED : r.statut
    });
  });
  const compte = {};
  enrichis.forEach(function (r) { compte[r.statutEffectif] = (compte[r.statutEffectif] || 0) + 1; });
  const p = compte[STATUT.PASS] || 0, f = compte[STATUT.FAIL] || 0, a = compte[STATUT.ACCEPTED] || 0;
  const scoreRes = (p + f) > 0 ? Math.round(100 * p / (p + f)) : 100;
  const scoreBrut = (p + f + a) > 0 ? Math.round(100 * p / (p + f + a)) : 100;

  // Rapport Sheets joint en lien (généré maintenant, avec ses 5 onglets)
  let url = null;
  if (options.joindreLien) url = genererRapportSheets(token, resultats);

  const dateFr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  const objet = options.objet ||
    ('Audit CIS Google Workspace — ' + dateFr + ' — conformité résiduelle ' + scoreRes + ' %');

  MailApp.sendEmail({
    to: dests.join(','),
    subject: objet,
    htmlBody: construireEmailHtml_(enrichis, {
      scoreRes: scoreRes, scoreBrut: scoreBrut, compte: compte,
      nbDerog: a, url: url, dateFr: dateFr,
      message: options.message || '', inclureDetails: options.inclureDetails !== false
    }),
    name: 'Audit CIS Google Workspace'
  });
  return { destinataires: dests.join(', '), url: url };
}

function echapHtml_(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function construireEmailHtml_(resultats, ctx) {
  const S = STATUT;
  const teintes = {};
  teintes[S.PASS] = ['#0f6b3f', '#e2f2e8'];
  teintes[S.FAIL] = ['#b3261e', '#fbe9e7'];
  teintes[S.ACCEPTED] = ['#2b5f8a', '#e3ecf4'];
  teintes[S.REVIEW] = ['#9a5b00', '#fdf1dc'];
  teintes[S.MANUAL] = ['#4b5563', '#ebedf0'];
  teintes[S.ERROR] = ['#7a1f5c', '#f7e4f0'];
  teintes[S.SKIP] = ['#6b7280', '#f1f2f3'];

  const puce = function (statut, n) {
    const t = teintes[statut] || ['#333', '#eee'];
    return '<td style="padding:6px 10px"><span style="font-family:monospace;font-size:12px;' +
      'color:' + t[0] + ';background:' + t[1] + ';border-radius:4px;padding:3px 9px;white-space:nowrap">' +
      statut + '&nbsp;: ' + n + '</span></td>';
  };
  const ordre = [S.PASS, S.FAIL, S.ACCEPTED, S.REVIEW, S.MANUAL, S.ERROR, S.SKIP];

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#20242b;max-width:680px">';
  html += '<div style="background:#1a73e8;color:#ffffff;padding:16px 22px;border-radius:8px 8px 0 0">' +
          '<div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#d2e3fc">CIS BENCHMARK V1.4 · GOOGLE WORKSPACE</div>' +
          '<div style="font-size:18px;font-weight:bold;margin-top:2px">Rapport d\'audit de conformité — ' + ctx.dateFr + '</div></div>';
  html += '<div style="border:1px solid #dcd9d0;border-top:0;padding:18px 22px;border-radius:0 0 8px 8px">';

  if (ctx.message) {
    html += '<p style="white-space:pre-wrap;border-left:3px solid #2b5f8a;background:#f3f7fb;padding:10px 14px;margin:0 0 16px">' +
            echapHtml_(ctx.message) + '</p>';
  }

  html += '<table cellspacing="0" cellpadding="0" style="margin-bottom:6px"><tr>' +
          '<td style="padding-right:26px"><div style="font-size:34px;font-weight:bold;color:' +
          (ctx.scoreRes >= 80 ? '#0f6b3f' : ctx.scoreRes >= 50 ? '#9a5b00' : '#b3261e') + '">' + ctx.scoreRes + '&nbsp;%</div>' +
          '<div style="font-size:11px;color:#6b7280">conformité résiduelle<br>(écarts acceptés exclus)</div></td>' +
          '<td><div style="font-size:22px;font-weight:bold;color:#4b5563">' + ctx.scoreBrut + '&nbsp;%</div>' +
          '<div style="font-size:11px;color:#6b7280">conformité brute</div></td></tr></table>';

  html += '<table cellspacing="0" cellpadding="0"><tr>';
  ordre.forEach(function (s) { if (ctx.compte[s]) html += puce(s, ctx.compte[s]); });
  html += '</tr></table>';

  if (ctx.inclureDetails) {
    const nc = resultats.filter(function (r) { return r.statutEffectif === S.FAIL; })
      .sort(function (x, y) { return x.level === y.level ? x.id.localeCompare(y.id) : x.level.localeCompare(y.level); });
    if (nc.length) {
      html += '<h3 style="font-size:14px;margin:18px 0 6px">Écarts à corriger (' + nc.length + ')</h3>' +
              '<table cellspacing="0" cellpadding="0" style="font-size:12.5px;border-collapse:collapse;width:100%">';
      nc.forEach(function (r) {
        html += '<tr><td style="font-family:monospace;color:#2b5f8a;padding:4px 10px 4px 0;border-bottom:1px solid #edebe3;white-space:nowrap;vertical-align:top">' +
                r.id + '</td><td style="color:#6b7280;padding:4px 8px 4px 0;border-bottom:1px solid #edebe3;vertical-align:top">' + r.level +
                '</td><td style="padding:4px 0;border-bottom:1px solid #edebe3">' + echapHtml_(r.titre) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<p style="color:#0f6b3f;font-weight:bold;margin-top:16px">Aucun écart à corriger (hors dérogations).</p>';
    }
    if (ctx.nbDerog) {
      html += '<p style="font-size:12px;color:#2b5f8a;margin-top:10px">' + ctx.nbDerog +
              ' écart(s) couvert(s) par une dérogation formelle — détail au registre du rapport.</p>';
    }
  }

  if (ctx.url) {
    html += '<p style="margin:20px 0 8px"><a href="' + ctx.url + '" style="background:#1a73e8;color:#ffffff;' +
            'text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold">Ouvrir le rapport complet (Google Sheets)</a></p>' +
            '<p style="font-size:11px;color:#6b7280">Synthèse · Détail des 89 contrôles · Plan d\'actions · Registre des dérogations · Politiques (brut)</p>';
  }

  html += '<p style="font-size:11px;color:#9aa0a8;border-top:1px dashed #dcd9d0;margin-top:18px;padding-top:10px">' +
          'Généré par le Registre d\'audit CIS Workspace v' + CONFIG.VERSION + ' — exécuté par ' +
          echapHtml_(Session.getActiveUser().getEmail()) + '. Référentiel : CIS Google Workspace Foundations Benchmark v1.4.</p>';
  html += '</div></div>';
  return html;
}

// --- Relevé de politiques réutilisable entre audits (cache utilisateur) -----
function sauvegarderSnapshotPolitiques_(politiques) {
  try {
    const json = JSON.stringify({ ts: Date.now(), politiques: politiques });
    const b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/octet-stream')).getBytes());
    const TAILLE = 90000;
    const morceaux = [];
    for (let i = 0; i < b64.length; i += TAILLE) morceaux.push(b64.substring(i, i + TAILLE));
    const objets = {};
    objets['polsnap_n'] = String(morceaux.length);
    morceaux.forEach(function (m, i) { objets['polsnap_' + i] = m; });
    CacheService.getUserCache().putAll(objets, 21600);
  } catch (e) { /* meilleur effort : l'absence de snapshot n'est jamais bloquante */ }
}

function chargerSnapshotPolitiques_() {
  try {
    const cache = CacheService.getUserCache();
    const n = Number(cache.get('polsnap_n'));
    if (!n) return null;
    let b64 = '';
    for (let i = 0; i < n; i++) {
      const m = cache.get('polsnap_' + i);
      if (m === null) return null;
      b64 += m;
    }
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString());
  } catch (e) { return null; }
}

// --- Cache par partie (gzip + fragments < 100 Ko, 6 h) ----------------------
function sauvegarderPartie_(token, partie, donnees) {
  const json = JSON.stringify(donnees);
  const gz = Utilities.gzip(Utilities.newBlob(json, 'application/octet-stream'));
  const b64 = Utilities.base64Encode(gz.getBytes());
  const TAILLE = 90000;
  const morceaux = [];
  for (let i = 0; i < b64.length; i += TAILLE) morceaux.push(b64.substring(i, i + TAILLE));
  const objets = {};
  objets['cis_' + token + '_' + partie + '_n'] = String(morceaux.length);
  morceaux.forEach(function (m, i) { objets['cis_' + token + '_' + partie + '_' + i] = m; });
  CacheService.getUserCache().putAll(objets, 21600);
}

function chargerPartie_(token, partie) {
  const cache = CacheService.getUserCache();
  const n = Number(cache.get('cis_' + token + '_' + partie + '_n'));
  if (!n) return null;
  let b64 = '';
  for (let i = 0; i < n; i++) {
    const m = cache.get('cis_' + token + '_' + partie + '_' + i);
    if (m === null) return null;
    b64 += m;
  }
  const octets = Utilities.base64Decode(b64);
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(octets, 'application/x-gzip')).getDataAsString());
}

function ajouterErreur_(token, message) {
  const err = chargerPartie_(token, 'err') || [];
  err.push(message);
  sauvegarderPartie_(token, 'err', err);
}

/** Assemble le contexte d'audit depuis les parties en cache. */
function chargerContexte_(token) {
  const dom = chargerPartie_(token, 'dom');
  const pol = chargerPartie_(token, 'pol');
  const usr = chargerPartie_(token, 'usr');
  const grp = chargerPartie_(token, 'grp');
  const err = chargerPartie_(token, 'err') || [];
  if (dom === null && pol === null && usr === null && grp === null) {
    throw new Error('Session d\'audit expirée ou introuvable — relancer l\'audit.');
  }
  const ctx = {
    domaines: dom || [],
    policies: pol || [],
    utilisateurs: usr,
    groupes: grp,
    erreurs: err
  };
  // Assemblage des tranches de réglages de groupes (clés déterministes)
  if (ctx.groupes && ctx.groupes.length) {
    const borne = Math.min(ctx.groupes.length, CONFIG.MAX_GROUPES);
    for (let d = 0; d < borne; d += CONFIG.GROUPES_PAR_APPEL) {
      const tranche = chargerPartie_(token, 'grs_' + d);
      if (tranche) {
        for (let i = 0; i < tranche.length && d + i < borne; i++) {
          if (ctx.groupes[d + i].settings === undefined || ctx.groupes[d + i].settings === null) {
            ctx.groupes[d + i].settings = tranche[i];
          }
        }
      }
    }
    ctx.reglagesGroupesCollectes = ctx.groupes.some(function (g) { return g.settings; });
  } else {
    ctx.reglagesGroupesCollectes = false;
  }
  ctx.superAdmins = ctx.utilisateurs
    ? ctx.utilisateurs.filter(function (u) { return u.isAdmin && !u.suspended; })
    : null;
  ctx.policyIndex = indexerPolitiques_(ctx.policies);
  return ctx;
}

// ---------------------------------------------------------------------------
// CONSTRUCTION DU CONTEXTE (collecte des données une seule fois)
// ---------------------------------------------------------------------------
function construireContexte_() {
  const ctx = { erreurs: [] };

  // --- Politiques Cloud Identity -------------------------------------------
  try {
    ctx.policies = recupererPolitiques_();
    ctx.policyIndex = indexerPolitiques_(ctx.policies);
  } catch (e) {
    ctx.policies = [];
    ctx.policyIndex = {};
    ctx.erreurs.push('Policy API inaccessible : ' + e.message +
      ' — Vérifier que le compte est super admin et que Cloud Identity API est activée sur le projet GCP.');
  }

  // --- Utilisateurs (super admins, 2SV) ------------------------------------
  try {
    ctx.utilisateurs = recupererUtilisateurs_();
    ctx.superAdmins = ctx.utilisateurs.filter(function (u) { return u.isAdmin && !u.suspended; });
  } catch (e) {
    ctx.utilisateurs = null;
    ctx.superAdmins = null;
    ctx.erreurs.push('Directory API (users) : ' + e.message);
  }

  // --- Domaines -------------------------------------------------------------
  try {
    const rep = AdminDirectory.Domains.list('my_customer');
    ctx.domaines = (rep.domains || []).map(function (d) { return d.domainName; });
  } catch (e) {
    ctx.domaines = [];
    ctx.erreurs.push('Directory API (domains) : ' + e.message);
  }

  // --- Groupes + réglages ---------------------------------------------------
  try {
    ctx.groupes = recupererGroupesAvecReglages_();
  } catch (e) {
    ctx.groupes = null;
    ctx.erreurs.push('Groups Settings API : ' + e.message);
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// CLOUD IDENTITY POLICY API
// ---------------------------------------------------------------------------
function recupererPolitiques_() {
  const politiques = [];
  let pageToken = null;
  const token = ScriptApp.getOAuthToken();
  do {
    let url = 'https://cloudidentity.googleapis.com/v1/policies?pageSize=100';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    const rep = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    const code = rep.getResponseCode();
    if (code !== 200) {
      throw new Error('HTTP ' + code + ' — ' + rep.getContentText().slice(0, 300));
    }
    const data = JSON.parse(rep.getContentText());
    (data.policies || []).forEach(function (p) { politiques.push(p); });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return politiques;
}

/**
 * Indexe par type de réglage (ex. "settings/drive_and_docs.external_sharing").
 * Règle de réduction simplifiée : une politique ADMIN prime sur la politique
 * SYSTEM (valeur par défaut Google). En présence de plusieurs politiques ADMIN
 * (OU multiples), on conserve la liste complète pour affichage, et la valeur
 * "principale" retenue est celle ciblant l'OU racine si identifiable, sinon la
 * première politique ADMIN.
 */
function indexerPolitiques_(politiques) {
  const index = {};
  politiques.forEach(function (p) {
    if (!p.setting || !p.setting.type) return;
    const type = p.setting.type.replace(/^settings\//, '');
    if (!index[type]) index[type] = { admin: [], system: [] };
    if (p.type === 'SYSTEM') index[type].system.push(p);
    else index[type].admin.push(p);
  });
  return index;
}

/**
 * Retourne { valeur, source, multiples } pour un type de réglage donné,
 * ou null si absent.
 */
function lirePolitique_(ctx, type) {
  const entree = ctx.policyIndex[type];
  if (!entree) return null;
  let choisi = null;
  if (entree.admin.length > 0) {
    choisi = entree.admin.find(function (p) {
      const q = p.policyQuery || {};
      return q.orgUnit && /orgUnits\//.test(q.orgUnit) && q.query === undefined;
    }) || entree.admin[0];
    return {
      valeur: choisi.setting.value || {},
      source: 'ADMIN',
      multiples: entree.admin.length > 1,
      brut: entree.admin
    };
  }
  if (entree.system.length > 0) {
    return {
      valeur: entree.system[0].setting.value || {},
      source: 'SYSTEM (défaut Google)',
      multiples: false,
      brut: entree.system
    };
  }
  return null;
}

/**
 * Fabrique de contrôle basé sur la Policy API.
 * evaluateur(valeur) doit retourner true (conforme), false (non conforme)
 * ou null (indéterminé -> À VÉRIFIER).
 */
function controlePolitique_(type, evaluateur, descriptionAttendue) {
  return function (ctx) {
    if (!ctx.policies || ctx.policies.length === 0) {
      return { statut: STATUT.ERROR, detail: 'Policy API indisponible.' };
    }
    const pol = lirePolitique_(ctx, type);
    if (!pol) {
      return {
        statut: STATUT.REVIEW,
        detail: 'Réglage "' + type + '" absent de la réponse Policy API. ' +
          'Attendu : ' + descriptionAttendue + '. Vérifier manuellement dans la console.'
      };
    }
    const brut = JSON.stringify(pol.valeur);
    const verdict = evaluateur(pol.valeur);
    const suffixe = ' | Valeur [' + pol.source + (pol.multiples ? ', plusieurs OU — vérifier chaque OU' : '') + '] : ' + brut;
    if (verdict === true) return { statut: STATUT.PASS, detail: 'Attendu : ' + descriptionAttendue + suffixe };
    if (verdict === false) return { statut: STATUT.FAIL, detail: 'Attendu : ' + descriptionAttendue + suffixe };
    return { statut: STATUT.REVIEW, detail: 'Interprétation incertaine. Attendu : ' + descriptionAttendue + suffixe };
  };
}

// Helpers d'évaluation tolérants aux variations de nommage des champs.
function champ_(valeur, noms) {
  for (let i = 0; i < noms.length; i++) {
    if (valeur[noms[i]] !== undefined) return valeur[noms[i]];
  }
  return undefined;
}
function estDesactive_(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v === false;
  if (typeof v === 'string') return /DISABLED|OFF|FALSE|NONE/i.test(v);
  return null;
}
function estActive_(v) {
  const d = estDesactive_(v);
  return d === null ? null : !d;
}

// ---------------------------------------------------------------------------
// ADMIN SDK — UTILISATEURS / GROUPES
// ---------------------------------------------------------------------------
function recupererUtilisateurs_() {
  const utilisateurs = [];
  let pageToken = null;
  do {
    const rep = AdminDirectory.Users.list({
      customer: 'my_customer',
      maxResults: 500,
      pageToken: pageToken,
      projection: 'basic',
      fields: 'nextPageToken,users(primaryEmail,isAdmin,isDelegatedAdmin,suspended,isEnrolledIn2Sv,isEnforcedIn2Sv,lastLoginTime)'
    });
    (rep.users || []).forEach(function (u) { utilisateurs.push(u); });
    pageToken = rep.nextPageToken;
  } while (pageToken && utilisateurs.length < CONFIG.MAX_UTILISATEURS);
  return utilisateurs;
}

function recupererGroupesAvecReglages_() {
  const groupes = [];
  let pageToken = null;
  do {
    const rep = AdminDirectory.Groups.list({
      customer: 'my_customer', maxResults: 200, pageToken: pageToken,
      fields: 'nextPageToken,groups(email,name)'
    });
    (rep.groups || []).forEach(function (g) { groupes.push(g); });
    pageToken = rep.nextPageToken;
  } while (pageToken && groupes.length < CONFIG.MAX_GROUPES);

  groupes.forEach(function (g) {
    try {
      const s = GroupsSettings.Groups.get(g.email);
      // Seuls les champs utiles aux contrôles sont conservés (contexte mis en cache).
      g.settings = {
        whoCanViewGroup: s.whoCanViewGroup,
        whoCanPostMessage: s.whoCanPostMessage,
        whoCanViewTopics: s.whoCanViewTopics,
        whoCanJoin: s.whoCanJoin
      };
    } catch (e) {
      g.settings = null;
      g.erreur = e.message;
    }
  });
  return groupes;
}

// ---------------------------------------------------------------------------
// DNS (SPF / DKIM / DMARC) via DNS-over-HTTPS Google
// ---------------------------------------------------------------------------
function requeteTXT_(nom) {
  const rep = UrlFetchApp.fetch(
    'https://dns.google/resolve?name=' + encodeURIComponent(nom) + '&type=TXT',
    { muteHttpExceptions: true });
  if (rep.getResponseCode() !== 200) return [];
  const data = JSON.parse(rep.getContentText());
  return (data.Answer || []).map(function (a) { return String(a.data).replace(/"/g, ''); });
}

function verifierDnsParDomaine_(ctx, testeur, libelle) {
  if (!ctx.domaines || ctx.domaines.length === 0) {
    return { statut: STATUT.ERROR, detail: 'Liste des domaines indisponible.' };
  }
  const echecs = [];
  const details = [];
  ctx.domaines.forEach(function (d) {
    const r = testeur(d);
    details.push(d + ' : ' + (r.ok ? 'OK' : 'ABSENT') + (r.info ? ' (' + r.info + ')' : ''));
    if (!r.ok) echecs.push(d);
  });
  return {
    statut: echecs.length === 0 ? STATUT.PASS : STATUT.FAIL,
    detail: libelle + ' — ' + details.join(' ; ')
  };
}

// ---------------------------------------------------------------------------
// DÉFINITION DES 87 CONTRÔLES (86 CIS v1.4 + 1 bonus 1.1.3)
// ---------------------------------------------------------------------------
function manuel_(chemin, complement) {
  return function () {
    return {
      statut: STATUT.MANUAL,
      detail: 'Contrôle non exposé par API — revue manuelle requise. Console : ' + chemin +
        (complement ? ' | ' + complement : '')
    };
  };
}

const DEFINITION_CONTROLES = [

  // ===== SECTION 1 — COMPTES ================================================
  {
    id: '1.1.1', level: 'L1',
    titre: 'Plus d\'un compte Super Admin existe',
    remediation: 'Admin > Annuaire > Utilisateurs — attribuer le rôle Super Admin à un second compte dédié.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const n = ctx.superAdmins.length;
      return {
        statut: n > 1 ? STATUT.PASS : STATUT.FAIL,
        detail: n + ' super admin(s) actif(s) : ' + ctx.superAdmins.map(function (u) { return u.primaryEmail; }).join(', ')
      };
    }
  },
  {
    id: '1.1.2', level: 'L1',
    titre: 'Au maximum 4 comptes Super Admin',
    remediation: 'Réduire le nombre de super admins à 4 maximum (2 à 4 recommandé).',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const n = ctx.superAdmins.length;
      return {
        statut: n <= 4 ? STATUT.PASS : STATUT.FAIL,
        detail: n + ' super admin(s) actif(s).'
      };
    }
  },
  {
    id: '1.1.3', level: 'L1',
    titre: 'Comptes super admin dédiés aux seules tâches d\'administration',
    remediation: 'Chaque admin doit posséder un compte nominatif standard distinct pour l\'usage quotidien.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const suspects = ctx.superAdmins.filter(function (u) {
        return !/^(admin|adm|sadmin|superadmin|it-|si-|dsi)/i.test(u.primaryEmail);
      });
      return {
        statut: STATUT.REVIEW,
        detail: 'Vérifier que ces comptes ne servent pas à un usage quotidien (mail, docs) : ' +
          ctx.superAdmins.map(function (u) { return u.primaryEmail + ' (dernière connexion : ' + (u.lastLoginTime || 'jamais') + ')'; }).join(' ; ') +
          (suspects.length ? ' | Comptes à nommage non dédié : ' + suspects.map(function (u) { return u.primaryEmail; }).join(', ') : '')
      };
    }
  },
  {
    id: '1.2.1.1', level: 'L1',
    titre: 'Accès externe aux données de l\'annuaire restreint',
    remediation: 'Admin > Annuaire > Paramètres de l\'annuaire > Paramètres de partage > Contacts externes.',
    check: controlePolitique_('directory.external_directory_access',
      function (v) {
        const s = champ_(v, ['externalDirectoryAccess', 'sharingSetting', 'state']);
        if (s === undefined) return null;
        return !/ALL|ENABLED|PUBLIC/i.test(String(s));
      },
      'accès annuaire externe désactivé ou restreint')
  },

  // ===== SECTION 3.1.1 — AGENDA =============================================
  {
    id: '3.1.1.1.1', level: 'L1',
    titre: 'Partage externe des agendas principaux limité (disponibilités uniquement)',
    remediation: 'Admin > Applications > Google Workspace > Agenda > Paramètres de partage.',
    check: controlePolitique_('calendar.primary_calendar_max_allowed_external_sharing',
      function (v) {
        const s = champ_(v, ['maxAllowedExternalSharing', 'externalSharingOptions']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|NO_SHARING|NONE/i.test(String(s));
      },
      'partage externe limité aux disponibilités (free/busy) ou désactivé')
  },
  {
    id: '3.1.1.1.2', level: 'L2',
    titre: 'Partage interne des agendas principaux configuré',
    remediation: 'Agenda > Paramètres de partage > Partage interne — limiter aux disponibilités si politique stricte.',
    check: controlePolitique_('calendar.primary_calendar_internal_sharing',
      function (v) {
        const s = champ_(v, ['internalSharing', 'defaultInternalSharing', 'sharingOption']);
        if (s === undefined) return null;
        return !/ALL_INFO_EDIT|MANAGE/i.test(String(s));
      },
      'partage interne au maximum en lecture des détails (pas de modification par défaut)')
  },
  {
    id: '3.1.1.1.3', level: 'L1',
    titre: 'Avertissement pour les invitations externes activé',
    remediation: 'Agenda > Paramètres de partage > Invitations externes : avertir les utilisateurs.',
    check: controlePolitique_('calendar.external_invitations',
      function (v) {
        const s = champ_(v, ['warnOnInvite', 'externalInvitationWarning', 'warnOnExternalGuests']);
        return estActive_(s);
      },
      'avertissement activé lors d\'invitations d\'externes')
  },
  {
    id: '3.1.1.2.1', level: 'L1',
    titre: 'Partage externe des agendas secondaires limité',
    remediation: 'Agenda > Paramètres généraux > Agendas secondaires.',
    check: controlePolitique_('calendar.secondary_calendar_max_allowed_external_sharing',
      function (v) {
        const s = champ_(v, ['maxAllowedExternalSharing', 'externalSharingOptions']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|NO_SHARING|NONE/i.test(String(s));
      },
      'partage externe des agendas secondaires limité aux disponibilités ou désactivé')
  },
  {
    id: '3.1.1.2.2', level: 'L2',
    titre: 'Partage interne des agendas secondaires configuré',
    remediation: 'Agenda > Paramètres généraux > Agendas secondaires (partage interne).',
    check: controlePolitique_('calendar.secondary_calendar_internal_sharing',
      function (v) {
        const s = champ_(v, ['internalSharing', 'defaultInternalSharing']);
        if (s === undefined) return null;
        return !/ALL_INFO_EDIT|MANAGE/i.test(String(s));
      },
      'partage interne des agendas secondaires limité (pas de modification par défaut)')
  },
  {
    id: '3.1.1.3.1', level: 'L2',
    titre: 'Mode hors connexion d\'Agenda web désactivé',
    remediation: 'Agenda > Paramètres avancés > Hors connexion.',
    check: controlePolitique_('calendar.web_offline',
      function (v) { return estDesactive_(champ_(v, ['enableOutOfOffice', 'webOfflineEnabled', 'enabled', 'state'])); },
      'accès hors connexion à Agenda désactivé')
  },

  // ===== SECTION 3.1.2 — DRIVE ET DOCS ======================================
  {
    id: '3.1.2.1.1.1', level: 'L1',
    titre: 'Avertissement lors du partage de fichiers hors du domaine',
    remediation: 'Admin > Applications > Drive et Docs > Paramètres de partage.',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const w = champ_(v, ['warnForExternalSharing', 'warnForSharingOutsideAllowlistedDomains']);
        const niveau = champ_(v, ['externalSharingMode', 'sharingOutsideDomain']);
        if (niveau !== undefined && /DISALLOWED|NOT_ALLOWED|OFF/i.test(String(niveau))) return true; // partage externe interdit = conforme a fortiori
        return estActive_(w);
      },
      'avertissement activé (ou partage externe totalement désactivé)')
  },
  {
    id: '3.1.2.1.1.2', level: 'L1',
    titre: 'Publication de fichiers sur le web / visibilité mondiale interdite',
    remediation: 'Drive et Docs > Paramètres de partage : décocher publication sur le web.',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const p = champ_(v, ['allowPublishingFiles', 'allowFilesPublishedOnWeb', 'allowNonGoogleInvites']);
        const d = estDesactive_(p);
        return d;
      },
      'publication sur le web désactivée')
  },
  {
    id: '3.1.2.1.1.3', level: 'L2',
    titre: 'Partage de documents contrôlé par listes de domaines autorisés',
    remediation: 'Drive et Docs > Paramètres de partage : limiter aux domaines de la liste blanche.',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const niveau = champ_(v, ['externalSharingMode', 'sharingOutsideDomain']);
        if (niveau === undefined) return null;
        return /ALLOWLIST|WHITELIST|DISALLOWED|NOT_ALLOWED/i.test(String(niveau));
      },
      'partage externe limité aux domaines en liste blanche (ou désactivé)')
  },
  {
    id: '3.1.2.1.1.4', level: 'L2',
    titre: 'Avertissement lors du partage vers un domaine en liste blanche',
    remediation: 'Drive et Docs > Paramètres de partage (option d\'avertissement liste blanche).',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        return estActive_(champ_(v, ['warnForSharingOutsideAllowlistedDomains', 'warnForAllowlistedDomainSharing']));
      },
      'avertissement activé pour les partages vers domaines autorisés')
  },
  {
    id: '3.1.2.1.1.5', level: 'L1',
    titre: 'Access Checker limité (destinataires uniquement / domaine)',
    remediation: 'Drive et Docs > Paramètres de partage > Access Checker.',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const a = champ_(v, ['accessCheckerSuggestions', 'accessChecker']);
        if (a === undefined) return null;
        return !/PUBLIC|ANYONE/i.test(String(a));
      },
      'Access Checker sans option "public sur le web"')
  },
  {
    id: '3.1.2.1.1.6', level: 'L1',
    titre: 'Diffusion de contenu en externe réservée aux membres de l\'organisation',
    remediation: 'Drive et Docs > Paramètres de partage > Distribution de contenu externe.',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const s = champ_(v, ['allowNonDomainUsersContentDistribution', 'externalContentDistribution', 'allowReceivingExternalFiles']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return !/ALLOWED_ALL|ANYONE/i.test(String(s));
      },
      'seuls les utilisateurs internes peuvent distribuer du contenu en externe')
  },
  {
    id: '3.1.2.1.2.1', level: 'L1',
    titre: 'Création de Drive partagés par les utilisateurs (selon politique interne)',
    remediation: 'Drive et Docs > Paramètres de partage > Création de Drive partagés.',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowSharedDriveCreation', 'allowContentManagersToShareFolders', 'sharedDriveCreationAllowed']);
        // Le CIS recommande de PERMETTRE la création (gouvernance des données) — valeur attendue : activé.
        return estActive_(s);
      },
      'création de Drive partagés autorisée (recommandation CIS)')
  },
  {
    id: '3.1.2.1.2.2', level: 'L1',
    titre: 'Les gestionnaires ne peuvent pas outrepasser les réglages des Drive partagés',
    remediation: 'Drive et Docs > Drive partagés : interdire la modification des réglages par les gestionnaires.',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowManagersToOverrideSettings', 'orgUnitAllowsManagersToOverrideSettings']);
        return estDesactive_(s);
      },
      'gestionnaires NE pouvant PAS modifier les réglages')
  },
  {
    id: '3.1.2.1.2.3', level: 'L1',
    titre: 'Accès aux fichiers des Drive partagés réservé aux membres',
    remediation: 'Drive et Docs > Drive partagés : accès restreint aux membres.',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowNonMemberAccess', 'orgUnitAllowsNonMemberAccess']);
        return estDesactive_(s);
      },
      'accès non-membres désactivé')
  },
  {
    id: '3.1.2.1.2.4', level: 'L2',
    titre: 'Téléchargement / impression / copie interdits aux lecteurs et commentateurs',
    remediation: 'Drive et Docs > Drive partagés : bloquer téléchargement pour lecteurs/commentateurs.',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowViewersAndCommentersToDownload', 'allowedPartiesToDownloadCopyPrint']);
        return estDesactive_(s);
      },
      'téléchargement/copie/impression désactivés pour lecteurs et commentateurs')
  },
  {
    id: '3.1.2.2.1', level: 'L1',
    titre: 'Accès hors connexion aux documents désactivé',
    remediation: 'Drive et Docs > Fonctionnalités et applications > Hors connexion.',
    check: controlePolitique_('drive_and_docs.docs_offline',
      function (v) { return estDesactive_(champ_(v, ['enableDocsOffline', 'docsOfflineEnabled', 'enabled', 'state'])); },
      'mode hors connexion Docs désactivé')
  },
  // ===== SECTION 3.1.2.3 — GOOGLE DRIVE FOR DESKTOP (CIS v1.4) ===============
  {
    id: '3.1.2.3.1', level: 'L1',
    titre: 'Accès à Drive pour ordinateur (desktop) désactivé',
    remediation: 'Drive et Docs > Google Drive for desktop > Désactiver « Allow Google Drive for desktop in your organization ».',
    check: controlePolitique_('drive_and_docs.drive_for_desktop',
      function (v) { return estDesactive_(champ_(v, ['allowDriveForDesktop', 'enabled', 'state'])); },
      'Drive pour ordinateur désactivé')
  },
  // NOTE CIS v1.4 : le contrôle « Add-Ons » (ex 3.1.2.2.3 en v1.3) a été
  // supprimé du benchmark (Ticket 25810) — le réglage n'existe plus dans l'UI.

  // ===== SECTION 3.1.3 — GMAIL ==============================================
  {
    id: '3.1.3.1.1', level: 'L1',
    titre: 'Délégation de boîte mail interdite',
    remediation: 'Admin > Applications > Gmail > Paramètres utilisateur > Délégation.',
    check: controlePolitique_('gmail.mail_delegation',
      function (v) { return estDesactive_(champ_(v, ['enableMailDelegation', 'enabled', 'state'])); },
      'délégation de messagerie désactivée')
  },
  {
    id: '3.1.3.1.2', level: 'L1',
    titre: 'Gmail hors connexion désactivé',
    remediation: 'Gmail > Paramètres utilisateur > Hors connexion.',
    check: controlePolitique_('gmail.offline_access',
      function (v) { return estDesactive_(champ_(v, ['enableOfflineAccess', 'enabled', 'state'])); },
      'Gmail hors connexion désactivé')
  },
  {
    id: '3.1.3.2.1', level: 'L1',
    titre: 'DKIM activé pour tous les domaines de messagerie',
    remediation: 'Gmail > Authentification des e-mails : générer et publier la clé DKIM, puis activer la signature.',
    check: function (ctx) {
      return verifierDnsParDomaine_(ctx, function (d) {
        for (let i = 0; i < CONFIG.SELECTEURS_DKIM.length; i++) {
          const rr = requeteTXT_(CONFIG.SELECTEURS_DKIM[i] + '._domainkey.' + d);
          const hit = rr.find(function (t) { return /v=DKIM1/i.test(t); });
          if (hit) return { ok: true, info: 'sélecteur ' + CONFIG.SELECTEURS_DKIM[i] };
        }
        return { ok: false, info: 'aucun enregistrement DKIM trouvé (sélecteurs testés : ' + CONFIG.SELECTEURS_DKIM.join(', ') + ')' };
      }, 'DKIM');
    }
  },
  {
    id: '3.1.3.2.2', level: 'L1',
    titre: 'Enregistrement SPF configuré pour tous les domaines',
    remediation: 'Publier un TXT "v=spf1 include:_spf.google.com ~all" (adapter aux émetteurs légitimes).',
    check: function (ctx) {
      return verifierDnsParDomaine_(ctx, function (d) {
        const rr = requeteTXT_(d);
        const spf = rr.find(function (t) { return /^v=spf1/i.test(t); });
        return spf ? { ok: true, info: spf.slice(0, 80) } : { ok: false };
      }, 'SPF');
    }
  },
  {
    id: '3.1.3.2.3', level: 'L1',
    titre: 'Enregistrement DMARC configuré pour tous les domaines',
    remediation: 'Publier un TXT _dmarc.<domaine> "v=DMARC1; p=quarantine|reject; rua=..." (p=none insuffisant à terme).',
    check: function (ctx) {
      return verifierDnsParDomaine_(ctx, function (d) {
        const rr = requeteTXT_('_dmarc.' + d);
        const rec = rr.find(function (t) { return /^v=DMARC1/i.test(t); });
        if (!rec) return { ok: false };
        const pNone = /p=none/i.test(rec);
        return { ok: true, info: rec.slice(0, 100) + (pNone ? ' — ATTENTION p=none (protection faible)' : '') };
      }, 'DMARC');
    }
  },
  {
    id: '3.1.3.3.1', level: 'L1',
    titre: 'Notifications admin des quarantaines Gmail activées',
    remediation: 'Gmail > Gérer les quarantaines : activer la notification périodique aux admins.',
    check: manuel_('Applications > Gmail > Gérer les quarantaines',
      'Vérifier que chaque quarantaine a l\'option de notification admin cochée.')
  },
  {
    id: '3.1.3.4.1.1', level: 'L1',
    titre: 'Protection contre pièces jointes chiffrées d\'expéditeurs non fiables',
    remediation: 'Gmail > Sécurité (Safety) > Pièces jointes.',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableEncryptedAttachmentProtection', 'encryptedAttachmentProtectionEnabled'])); },
      'protection pièces jointes chiffrées activée')
  },
  {
    id: '3.1.3.4.1.2', level: 'L1',
    titre: 'Protection contre pièces jointes avec scripts d\'expéditeurs non fiables',
    remediation: 'Gmail > Sécurité > Pièces jointes.',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableAttachmentWithScriptsProtection', 'attachmentWithScriptsProtectionEnabled'])); },
      'protection scripts dans pièces jointes activée')
  },
  {
    id: '3.1.3.4.1.3', level: 'L1',
    titre: 'Protection contre types de pièces jointes anormaux',
    remediation: 'Gmail > Sécurité > Pièces jointes.',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableAnomalousAttachmentProtection', 'anomalousAttachmentProtectionEnabled'])); },
      'protection types de pièces jointes anormaux activée')
  },
  {
    id: '3.1.3.4.2.1', level: 'L1',
    titre: 'Identification des liens derrière URL raccourcies activée',
    remediation: 'Gmail > Sécurité > Liens et images externes.',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableShortenerScanning', 'shortenerScanningEnabled'])); },
      'analyse des URL raccourcies activée')
  },
  {
    id: '3.1.3.4.2.2', level: 'L1',
    titre: 'Analyse des images liées pour contenu malveillant activée',
    remediation: 'Gmail > Sécurité > Liens et images externes.',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableExternalImageScanning', 'externalImageScanningEnabled'])); },
      'analyse des images liées activée')
  },
  {
    id: '3.1.3.4.2.3', level: 'L1',
    titre: 'Avertissement au clic sur liens vers domaines non fiables activé',
    remediation: 'Gmail > Sécurité > Liens et images externes.',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableAggressiveWarningsOnUntrustedLinks', 'aggressiveWarningsEnabled'])); },
      'avertissement liens non fiables activé')
  },
  {
    id: '3.1.3.4.3.1', level: 'L1',
    titre: 'Protection contre l\'usurpation par domaines similaires',
    remediation: 'Gmail > Sécurité > Usurpation d\'identité et authentification.',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectDomainNameSpoofing', 'domainNameSpoofingProtectionEnabled'])); },
      'détection domaines similaires activée')
  },
  {
    id: '3.1.3.4.3.2', level: 'L1',
    titre: 'Protection contre l\'usurpation de noms d\'employés',
    remediation: 'Gmail > Sécurité > Usurpation.',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectEmployeeNameSpoofing', 'employeeNameSpoofingProtectionEnabled'])); },
      'détection usurpation de noms d\'employés activée')
  },
  {
    id: '3.1.3.4.3.3', level: 'L1',
    titre: 'Protection contre les e-mails entrants usurpant votre domaine',
    remediation: 'Gmail > Sécurité > Usurpation.',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectDomainSpoofingFromUnauthenticatedSenders', 'domainSpoofingProtectionEnabled'])); },
      'détection usurpation de votre domaine activée')
  },
  {
    id: '3.1.3.4.3.4', level: 'L1',
    titre: 'Protection contre tout e-mail non authentifié',
    remediation: 'Gmail > Sécurité > Usurpation.',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectUnauthenticatedEmails', 'unauthenticatedEmailProtectionEnabled'])); },
      'protection e-mails non authentifiés activée')
  },
  {
    id: '3.1.3.4.3.5', level: 'L1',
    titre: 'Groupes protégés des e-mails entrants usurpant le domaine',
    remediation: 'Gmail > Sécurité > Usurpation (protection des groupes).',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectGroupsSpoofing', 'groupsSpoofingProtectionEnabled'])); },
      'protection usurpation vers les groupes activée')
  },
  {
    id: '3.1.3.5.1', level: 'L2',
    titre: 'Accès POP et IMAP désactivé pour tous les utilisateurs',
    remediation: 'Gmail > Accès utilisateur final > POP et IMAP.',
    check: controlePolitique_('gmail.pop_access', function (v) {
      return estDesactive_(champ_(v, ['enablePopAccess', 'enabled', 'state']));
    }, 'POP désactivé — vérifier aussi gmail.imap_access dans l\'onglet Politiques (brut)')
  },
  {
    id: '3.1.3.5.2', level: 'L1',
    titre: 'Transfert automatique désactivé',
    remediation: 'Gmail > Accès utilisateur final > Transfert automatique.',
    check: controlePolitique_('gmail.auto_forwarding',
      function (v) { return estDesactive_(champ_(v, ['enableAutoForwarding', 'enabled', 'state'])); },
      'transfert automatique désactivé')
  },
  {
    id: '3.1.3.5.3', level: 'L1',
    titre: 'Passerelles sortantes par utilisateur désactivées',
    remediation: 'Gmail > Accès utilisateur final > Passerelle sortante par utilisateur.',
    check: controlePolitique_('gmail.per_user_outbound_gateway',
      function (v) { return estDesactive_(champ_(v, ['allowUsersToUseExternalSmtp', 'enabled', 'state'])); },
      'passerelle SMTP externe par utilisateur désactivée')
  },
  {
    id: '3.1.3.5.4', level: 'L1',
    titre: 'Avertissement destinataires externes activé',
    remediation: 'Gmail > Accès utilisateur final > Avertissement de réponse à un externe.',
    check: controlePolitique_('gmail.unintended_external_reply_warning',
      function (v) { return estActive_(champ_(v, ['enableUnintendedExternalReplyWarning', 'enabled', 'state'])); },
      'avertissement destinataire externe activé')
  },
  {
    id: '3.1.3.6.1', level: 'L1',
    titre: 'Analyse renforcée des messages avant distribution activée',
    remediation: 'Gmail > Spam, hameçonnage et logiciels malveillants > Analyse renforcée pré-distribution.',
    check: controlePolitique_('gmail.enhanced_pre_delivery_message_scanning',
      function (v) { return estActive_(champ_(v, ['enableImprovedSuspiciousContentDetection', 'enabled', 'state'])); },
      'analyse renforcée activée')
  },
  {
    id: '3.1.3.6.2', level: 'L1',
    titre: 'Filtres anti-spam non contournés pour les expéditeurs internes',
    remediation: 'Gmail > Spam : ne pas ajouter le domaine interne en liste d\'expéditeurs approuvés sans authentification.',
    check: controlePolitique_('gmail.spam_override_lists',
      function (v) {
        const listes = champ_(v, ['spamOverrideLists', 'approvedSenders', 'lists']);
        if (listes === undefined) return null;
        if (Array.isArray(listes) && listes.length === 0) return true;
        return null; // listes présentes -> revue humaine du contenu
      },
      'aucune liste d\'approbation contournant le filtre anti-spam pour les internes (si listes présentes, vérifier leur contenu)')
  },
  {
    id: '3.1.3.7.1', level: 'L1',
    titre: 'Stockage complet des e-mails (comprehensive mail storage) activé',
    remediation: 'Gmail > Conformité > Stockage complet du courrier.',
    check: controlePolitique_('gmail.comprehensive_mail_storage',
      function (v) { return estActive_(champ_(v, ['enableComprehensiveMailStorage', 'enabled', 'state'])); },
      'stockage complet activé')
  },
  {
    id: '3.1.3.7.2', level: 'L1',
    titre: 'Envoi des e-mails via connexion TLS sécurisée activé',
    remediation: 'Gmail > Conformité > Connexion TLS sécurisée (au minimum vers domaines partenaires).',
    check: manuel_('Applications > Gmail > Conformité > Connexion TLS sécurisée',
      'Réglage de conformité par domaine non exposé par la Policy API — vérifier la règle TLS.')
  },

  // ===== SECTION 3.1.4 — GOOGLE CHAT ========================================
  {
    id: '3.1.4.1.1', level: 'L1',
    titre: 'Partage de fichiers externe dans Chat désactivé',
    remediation: 'Admin > Applications > Google Chat > Partage de fichiers.',
    check: controlePolitique_('chat.chat_file_sharing',
      function (v) {
        const s = champ_(v, ['externalFileSharing', 'externalChatFileSharing']);
        if (s === undefined) return null;
        return /NO_FILES|DISABLED|OFF/i.test(String(s));
      },
      'partage de fichiers externe désactivé (NO_FILES)')
  },
  {
    id: '3.1.4.1.2', level: 'L2',
    titre: 'Partage de fichiers interne dans Chat restreint',
    remediation: 'Google Chat > Partage de fichiers (interne).',
    check: controlePolitique_('chat.chat_file_sharing',
      function (v) {
        const s = champ_(v, ['internalFileSharing', 'internalChatFileSharing']);
        if (s === undefined) return null;
        return /NO_FILES|IMAGES_ONLY|DISABLED/i.test(String(s));
      },
      'partage interne limité (NO_FILES ou images uniquement)')
  },
  {
    id: '3.1.4.2.1', level: 'L1',
    titre: 'Chat externe restreint aux domaines autorisés',
    remediation: 'Google Chat > Paramètres de chat externe : limiter aux domaines de confiance.',
    check: controlePolitique_('chat.external_chat_restriction',
      function (v) {
        const s = champ_(v, ['allowExternalChat', 'externalChatRestriction', 'restrictionLevel']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return /TRUSTED_DOMAINS|ALLOWLISTED|NO_EXTERNAL|DISABLED/i.test(String(s));
      },
      'chat externe désactivé ou restreint aux domaines de confiance')
  },
  {
    id: '3.1.4.3.1', level: 'L1',
    titre: 'Espaces (Spaces) externes restreints',
    remediation: 'Google Chat > Espaces externes.',
    check: controlePolitique_('chat.external_chat_restriction',
      function (v) {
        const s = champ_(v, ['externalSpaces', 'allowExternalSpaces', 'externalSpacesRestriction']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return /TRUSTED_DOMAINS|RESTRICTED|DISABLED|NO_EXTERNAL/i.test(String(s));
      },
      'espaces externes désactivés ou restreints aux domaines de confiance')
  },
  {
    id: '3.1.4.4.1', level: 'L1',
    titre: 'Installation d\'applications Chat par les utilisateurs désactivée',
    remediation: 'Google Chat > Applications Chat.',
    check: controlePolitique_('chat.chat_apps_access',
      function (v) { return estDesactive_(champ_(v, ['enableChatApps', 'allowChatApps', 'enabled', 'state'])); },
      'installation d\'apps Chat désactivée')
  },
  {
    id: '3.1.4.4.2', level: 'L1',
    titre: 'Webhooks entrants dans Chat désactivés',
    remediation: 'Google Chat > Applications Chat > Webhooks entrants.',
    check: controlePolitique_('chat.chat_apps_access',
      function (v) { return estDesactive_(champ_(v, ['enableWebhooks', 'allowWebhooks'])); },
      'webhooks entrants désactivés')
  },

  // ===== SECTION 3.1.6 — GROUPS FOR BUSINESS ================================
  {
    id: '3.1.6.1', level: 'L1',
    titre: 'Accès aux groupes depuis l\'extérieur : privé',
    remediation: 'Admin > Applications > Groups for Business > Paramètres de partage : accès externe = privé.',
    check: function (ctx) {
      const pol = lirePolitique_(ctx, 'groups_for_business.groups_sharing');
      if (pol) {
        const s = champ_(pol.valeur, ['collaborationCapability', 'accessLevel', 'outsideAccess']);
        if (s !== undefined) {
          const ok = !/ANYONE_CAN_ACCESS|PUBLIC/i.test(String(s));
          return {
            statut: ok ? STATUT.PASS : STATUT.FAIL,
            detail: 'Politique groups_for_business.groups_sharing [' + pol.source + '] : ' + JSON.stringify(pol.valeur)
          };
        }
      }
      // Repli : analyse par groupe via Groups Settings
      if (!ctx.groupes) return { statut: STATUT.ERROR, detail: 'Ni Policy API ni Groups Settings disponibles.' };
      if (ctx.reglagesGroupesCollectes === false) {
        return { statut: STATUT.REVIEW, detail: 'Politique groups_for_business non trouvée et réglages individuels des groupes non collectés (option décochée ou collecte incomplète) — vérifier dans la console Groups for Business.' };
      }
      const publics = ctx.groupes.filter(function (g) {
        return g.settings && /ANYONE_CAN_VIEW|ANYONE_CAN_POST/i.test(
          String(g.settings.whoCanViewGroup) + ' ' + String(g.settings.whoCanPostMessage));
      });
      return {
        statut: publics.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: publics.length === 0
          ? 'Aucun groupe accessible publiquement parmi les ' + ctx.groupes.length + ' groupes analysés.'
          : publics.length + ' groupe(s) accessible(s) au public : ' + publics.map(function (g) { return g.email; }).slice(0, 15).join(', ')
      };
    }
  },
  {
    id: '3.1.6.2', level: 'L1',
    titre: 'Création de groupes restreinte',
    remediation: 'Groups for Business > Paramètres de partage : création réservée aux admins (ou au domaine).',
    check: controlePolitique_('groups_for_business.groups_sharing',
      function (v) {
        const s = champ_(v, ['createGroupsAccessLevel', 'whoCanCreateGroups', 'createGroups']);
        if (s === undefined) return null;
        return /ADMIN_ONLY|ADMINS/i.test(String(s));
      },
      'création de groupes réservée aux administrateurs')
  },
  {
    id: '3.1.6.3', level: 'L1',
    titre: 'Permission par défaut de voir les conversations : restreinte',
    remediation: 'Groups for Business > Autorisation par défaut d\'affichage des conversations.',
    check: function (ctx) {
      const pol = lirePolitique_(ctx, 'groups_for_business.groups_sharing');
      if (pol) {
        const s = champ_(pol.valeur, ['viewTopicsDefaultAccessLevel', 'defaultViewTopicsAccessLevel']);
        if (s !== undefined) {
          const ok = !/ANYONE|PUBLIC/i.test(String(s));
          return { statut: ok ? STATUT.PASS : STATUT.FAIL, detail: 'Valeur [' + pol.source + '] : ' + JSON.stringify(pol.valeur) };
        }
      }
      if (!ctx.groupes) return { statut: STATUT.ERROR, detail: 'Données groupes indisponibles.' };
      if (ctx.reglagesGroupesCollectes === false) {
        return { statut: STATUT.REVIEW, detail: 'Politique non trouvée et réglages individuels des groupes non collectés (option décochée ou collecte incomplète) — vérifier dans la console.' };
      }
      const ouverts = ctx.groupes.filter(function (g) {
        return g.settings && /ANYONE_CAN_VIEW/i.test(String(g.settings.whoCanViewTopics));
      });
      return {
        statut: ouverts.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: ouverts.length === 0
          ? 'Aucun groupe avec conversations visibles publiquement (' + ctx.groupes.length + ' analysés).'
          : ouverts.length + ' groupe(s) avec conversations publiques : ' + ouverts.map(function (g) { return g.email; }).slice(0, 15).join(', ')
      };
    }
  },

  // ===== SECTIONS 3.1.7 / 3.1.8 / 3.1.9 =====================================
  {
    id: '3.1.7.1', level: 'L1',
    titre: 'Service Google Sites désactivé',
    remediation: 'Admin > Applications > Google Workspace > Sites : état du service = désactivé.',
    check: controlePolitique_('sites.service_status',
      function (v) { return estDesactive_(champ_(v, ['serviceState', 'state', 'enabled'])); },
      'service Sites désactivé (OFF)')
  },
  {
    id: '3.1.8.1', level: 'L1',
    titre: 'Accès aux groupes Google externes désactivé pour tous',
    remediation: 'Admin > Applications > Services Google supplémentaires > Google Groups (service grand public) : OFF.',
    check: controlePolitique_('groups.service_status',
      function (v) { return estDesactive_(champ_(v, ['serviceState', 'state', 'enabled'])); },
      'service Google Groups (grand public, groups.google.com externes) désactivé')
  },
  {
    id: '3.1.9.1.1', level: 'L1',
    titre: 'Accès aux applications du Marketplace restreint',
    remediation: 'Admin > Applications > Google Workspace Marketplace : liste d\'autorisation d\'applications.',
    check: controlePolitique_('workspace_marketplace.apps_access_options',
      function (v) {
        const s = champ_(v, ['accessLevel', 'appsAccessLevel', 'marketplaceAccess']);
        if (s === undefined) return null;
        return /ALLOWLIST|ALLOW_LISTED|BLOCK_ALL|NONE_ALLOWED/i.test(String(s));
      },
      'installation limitée à une liste d\'apps autorisées (ou bloquée)')
  },

  // ===== SECTION 4.1 — AUTHENTIFICATION =====================================
  {
    id: '4.1.1.1', level: 'L1',
    titre: '2SV / MFA appliquée à tous les utilisateurs à privilèges',
    remediation: 'Sécurité > Authentification > Validation en deux étapes : application forcée.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const sans2sv = ctx.superAdmins.filter(function (u) { return !u.isEnrolledIn2Sv; });
      const nonForce = ctx.superAdmins.filter(function (u) { return !u.isEnforcedIn2Sv; });
      const ok = sans2sv.length === 0;
      return {
        statut: ok ? STATUT.PASS : STATUT.FAIL,
        detail: ctx.superAdmins.length + ' super admin(s). Sans 2SV : ' +
          (sans2sv.length ? sans2sv.map(function (u) { return u.primaryEmail; }).join(', ') : 'aucun') +
          ' | 2SV non forcée pour : ' + (nonForce.length ? nonForce.map(function (u) { return u.primaryEmail; }).join(', ') : 'aucun')
      };
    }
  },
  {
    id: '4.1.1.2', level: 'L2',
    titre: 'Clés de sécurité matérielles pour les rôles administratifs',
    remediation: 'Sécurité > 2SV : imposer "clé de sécurité uniquement" pour l\'OU des admins.',
    check: controlePolitique_('security.two_step_verification_enforcement_factor',
      function (v) {
        const s = champ_(v, ['allowedSignInFactorSet', 'enforcementFactor', 'factor']);
        if (s === undefined) return null;
        return /PASSKEY_ONLY|SECURITY_KEY|PHISHING_RESISTANT/i.test(String(s));
      },
      'facteur limité aux clés de sécurité / passkeys résistants au phishing (vérifier l\'OU des admins)')
  },
  {
    id: '4.1.1.3', level: 'L1',
    titre: '2SV / MFA appliquée à TOUS les utilisateurs',
    remediation: 'Sécurité > 2SV : application forcée sur l\'ensemble du domaine + suivi de l\'enrôlement.',
    check: function (ctx) {
      if (!ctx.utilisateurs) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const actifs = ctx.utilisateurs.filter(function (u) { return !u.suspended; });
      const sans2sv = actifs.filter(function (u) { return !u.isEnrolledIn2Sv; });
      const nonForce = actifs.filter(function (u) { return !u.isEnforcedIn2Sv; });
      const pol = lirePolitique_(ctx, 'security.two_step_verification_enforcement');
      const polTxt = pol ? ' | Politique d\'application [' + pol.source + '] : ' + JSON.stringify(pol.valeur) : '';
      return {
        statut: sans2sv.length === 0 && nonForce.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: actifs.length + ' utilisateurs actifs — ' + sans2sv.length + ' non enrôlés en 2SV, ' +
          nonForce.length + ' sans application forcée.' +
          (sans2sv.length ? ' Exemples non enrôlés : ' + sans2sv.slice(0, 10).map(function (u) { return u.primaryEmail; }).join(', ') : '') + polTxt
      };
    }
  },
  {
    id: '4.1.2.1', level: 'L2',
    titre: 'Récupération de compte Super Admin désactivée',
    remediation: 'Sécurité > Récupération de compte : désactiver l\'auto-récupération pour les super admins.',
    check: controlePolitique_('security.super_admin_account_recovery',
      function (v) { return estDesactive_(champ_(v, ['enableAccountRecovery', 'accountRecoveryEnabled', 'enabled'])); },
      'auto-récupération des super admins désactivée')
  },
  {
    id: '4.1.2.2', level: 'L1',
    titre: 'Récupération de compte utilisateur activée',
    remediation: 'Sécurité > Récupération de compte : activer pour les utilisateurs standards.',
    check: controlePolitique_('security.user_account_recovery',
      function (v) { return estActive_(champ_(v, ['enableAccountRecovery', 'accountRecoveryEnabled', 'enabled'])); },
      'auto-récupération activée pour les utilisateurs standards')
  },
  {
    id: '4.1.3.1', level: 'L2',
    titre: 'Programme Protection Avancée configuré',
    remediation: 'Sécurité > Programme Protection Avancée : activer l\'inscription pour les comptes sensibles.',
    check: controlePolitique_('security.advanced_protection_program',
      function (v) { return estActive_(champ_(v, ['enableAdvancedProtectionSelfEnrollment', 'allowEnrollment', 'enabled'])); },
      'inscription au Programme Protection Avancée autorisée / déployée pour les comptes à risque')
  },
  {
    id: '4.1.4.1', level: 'L2',
    titre: 'Défis de connexion (login challenges) appliqués',
    remediation: 'Sécurité > Défis de connexion : activer la vérification supplémentaire (ID employé, etc.).',
    check: controlePolitique_('security.login_challenges',
      function (v) { return estActive_(champ_(v, ['enableEmployeeIdChallenge', 'enabled', 'state'])); },
      'défi de connexion supplémentaire activé')
  },
  {
    id: '4.1.5.1', level: 'L1',
    titre: 'Politique de mots de passe renforcée',
    remediation: 'Sécurité > Authentification > Gestion des mots de passe : force obligatoire, longueur >= 12 (CIS), réutilisation interdite, expiration selon politique.',
    check: controlePolitique_('security.password',
      function (v) {
        const longueur = champ_(v, ['minimumLength', 'minLength']);
        const force = champ_(v, ['enforceRequirementsAtLogin', 'enforceStrongPassword', 'allowedStrength']);
        const reuse = champ_(v, ['allowReuse', 'allowPasswordReuse']);
        if (longueur === undefined && force === undefined) return null;
        let ok = true;
        if (longueur !== undefined && Number(longueur) < 12) ok = false;
        if (reuse === true) ok = false;
        if (typeof force === 'string' && /WEAK/i.test(force)) ok = false;
        if (force === false) ok = false;
        return ok;
      },
      'longueur min >= 12, mot de passe fort exigé, réutilisation interdite')
  },

  // ===== SECTION 4.2 — CONTRÔLES D'ACCÈS ====================================
  {
    id: '4.2.1.1', level: 'L2',
    titre: 'Accès des applications tierces aux services Google restreint',
    remediation: 'Sécurité > Contrôles des API > Accès aux applications tierces : restreindre les services non configurés.',
    check: controlePolitique_('api_controls.unconfigured_third_party_apps',
      function (v) {
        const s = champ_(v, ['accessLevel', 'defaultAccessLevel', 'state']);
        if (s === undefined) return null;
        return /BLOCKED|RESTRICTED|LIMITED|SIGN_IN_ONLY/i.test(String(s));
      },
      'apps tierces non configurées bloquées ou limitées (pas d\'accès complet par défaut)')
  },
  {
    id: '4.2.1.2', level: 'L2',
    titre: 'Revue périodique des applications tierces',
    remediation: 'Sécurité > Contrôles des API > Gérer l\'accès aux applications tierces — revue régulière.',
    check: function (ctx) {
      // Aide à la revue : agrégation des jetons OAuth des super admins et d'un échantillon d'utilisateurs.
      if (!ctx.utilisateurs) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const apps = {};
      const echantillon = ctx.utilisateurs.filter(function (u) { return !u.suspended; }).slice(0, 100);
      echantillon.forEach(function (u) {
        try {
          const rep = AdminDirectory.Tokens.list(u.primaryEmail);
          (rep.items || []).forEach(function (t) {
            const cle = t.displayText || t.clientId;
            if (!apps[cle]) apps[cle] = { n: 0, scopes: {} };
            apps[cle].n++;
            (t.scopes || []).forEach(function (s) { apps[cle].scopes[s] = true; });
          });
        } catch (e) { /* utilisateur sans jetons ou API refusée : ignorer */ }
      });
      const sensibles = Object.keys(apps).filter(function (a) {
        return Object.keys(apps[a].scopes).some(function (s) { return /gmail|drive|admin|cloud-platform/i.test(s); });
      });
      return {
        statut: STATUT.REVIEW,
        detail: 'Revue humaine requise. ' + Object.keys(apps).length + ' application(s) OAuth détectée(s) sur un échantillon de ' +
          echantillon.length + ' utilisateurs. Applications avec scopes sensibles (gmail/drive/admin) : ' +
          (sensibles.length ? sensibles.slice(0, 20).join(' ; ') : 'aucune')
      };
    }
  },
  {
    id: '4.2.1.3', level: 'L1',
    titre: 'Les applications internes peuvent accéder aux API Workspace',
    remediation: 'Sécurité > Contrôles des API : marquer les apps internes de confiance.',
    check: controlePolitique_('api_controls.internal_apps',
      function (v) { return estActive_(champ_(v, ['trustInternalApps', 'internalAppsTrusted', 'enabled'])); },
      'apps internes marquées de confiance (accès API autorisé)')
  },
  {
    id: '4.2.1.4', level: 'L2',
    titre: 'Revue périodique de la délégation au niveau du domaine (DWD)',
    remediation: 'Sécurité > Contrôles des API > Délégation au niveau du domaine — revue régulière des client IDs et scopes.',
    check: manuel_('Sécurité > Contrôles des API > Délégation au niveau du domaine',
      'La liste DWD n\'est pas exposée par API — exporter et revoir chaque client ID / scopes.')
  },
  {
    id: '4.2.2.1', level: 'L1',
    titre: 'Blocage des accès depuis des zones géographiques non approuvées',
    remediation: 'Sécurité > Accès contextuel (Context-Aware Access) : règle de géoblocage.',
    check: manuel_('Sécurité > Accès contextuel',
      'Les niveaux d\'accès CAA ne sont pas lisibles par cette API — vérifier l\'existence d\'une règle de géoblocage.')
  },
  {
    id: '4.2.3.1', level: 'L1',
    titre: 'Règles DLP configurées pour Google Drive',
    remediation: 'Sécurité > Protection des données : créer des règles DLP Drive (détecteurs prédéfinis + personnalisés).',
    check: function (ctx) {
      // Les règles DLP apparaissent dans la Policy API sous des types "rule.dlp*" selon les tenants.
      const typesDlp = Object.keys(ctx.policyIndex || {}).filter(function (t) { return /dlp/i.test(t); });
      if (!ctx.policies || ctx.policies.length === 0) return { statut: STATUT.ERROR, detail: 'Policy API indisponible.' };
      if (typesDlp.length > 0) {
        return { statut: STATUT.PASS, detail: 'Réglages DLP détectés : ' + typesDlp.join(', ') + ' — vérifier la couverture des règles dans la console.' };
      }
      return { statut: STATUT.REVIEW, detail: 'Aucun réglage DLP détecté via Policy API — vérifier Sécurité > Protection des données.' };
    }
  },
  {
    id: '4.2.4.1', level: 'L1',
    titre: 'Contrôle de session Google configuré (durée limitée)',
    remediation: 'Sécurité > Contrôle des sessions Google : durée <= 8 h recommandée par profil strict.',
    check: controlePolitique_('security.session_controls',
      function (v) {
        const d = champ_(v, ['webSessionDuration', 'sessionDuration', 'duration']);
        if (d === undefined) return null;
        const m = String(d).match(/(\d+)/);
        if (!m) return null;
        let heures = Number(m[1]);
        if (/s$/.test(String(d))) heures = heures / 3600; // durées au format "43200s"
        return heures > 0 && heures <= 24; // non "jamais expirer" ; ajuster à 8 si politique stricte
      },
      'durée de session définie (pas de session infinie ; <= 24 h, idéalement <= 8 h)')
  },
  {
    id: '4.2.5.1', level: 'L2',
    titre: 'Contrôle de session Google Cloud configuré',
    remediation: 'Sécurité > Contrôle des sessions Google Cloud : ré-authentification exigée.',
    check: controlePolitique_('cloud.cloud_session_controls',
      function (v) {
        const d = champ_(v, ['sessionDuration', 'reauthDuration', 'duration']);
        const p = champ_(v, ['reauthPolicy', 'reauthenticationPolicy']);
        if (d === undefined && p === undefined) return null;
        if (p !== undefined && /NEVER|EXEMPT/i.test(String(p))) return false;
        return true;
      },
      'ré-authentification GCP exigée avec durée de session limitée')
  },
  // NOTE CIS v1.4 : le contrôle « Less Secure Apps / LSA » (ex 4.2.6.1 en v1.3)
  // a été supprimé du benchmark (Ticket 25811) — Google a déprécié les LSA.

  // ===== SECTION 4.3 + 5 — REVUES DE SUPERVISION ============================
  {
    id: '4.3.1', level: 'L1',
    titre: 'Revue régulière du tableau de bord Sécurité (anomalies)',
    remediation: 'Sécurité > Tableau de bord — instaurer une revue périodique documentée.',
    check: manuel_('Sécurité > Tableau de bord', 'Processus organisationnel : planifier une revue hebdomadaire.')
  },
  {
    id: '4.3.2', level: 'L1',
    titre: 'Revue régulière de la page État de sécurité (Security Health)',
    remediation: 'Sécurité > État de sécurité — corriger les recommandations signalées.',
    check: manuel_('Sécurité > État de sécurité', 'Processus organisationnel : revue périodique documentée.')
  },
  {
    id: '5.1.1.1', level: 'L1',
    titre: 'Revue régulière du rapport d\'utilisation des applications',
    remediation: 'Rapports > Utilisation des applications — revue périodique.',
    check: manuel_('Rapports > Utilisation des applications', 'Processus organisationnel.')
  },
  {
    id: '5.1.1.2', level: 'L1',
    titre: 'Revue régulière du rapport de sécurité',
    remediation: 'Rapports > Sécurité — revue périodique (partage externe, 2SV, etc.).',
    check: manuel_('Rapports > Sécurité', 'Processus organisationnel.')
  },

  // ===== SECTION 6 — RÈGLES D'ALERTES ADMIN =================================
  { id: '6.1', level: 'L1', titre: 'Alerte "Mot de passe utilisateur modifié" configurée', remediation: 'Sécurité > Règles > Mot de passe modifié : e-mail aux admins.', check: manuel_('Règles d\'alerte (Centre d\'alerte)', 'Les règles système ne sont pas listables par API — vérifier l\'activation de la notification.') },
  { id: '6.2', level: 'L1', titre: 'Alerte "Attaques soutenues par un État" configurée', remediation: 'Sécurité > Règles > Government-backed attacks.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.3', level: 'L1', titre: 'Alerte "Utilisateur suspendu (activité suspecte)" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.4', level: 'L1', titre: 'Alerte "Privilège admin accordé" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.5', level: 'L1', titre: 'Alerte "Connexion programmatique suspecte" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.6', level: 'L1', titre: 'Alerte "Connexion suspecte" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.7', level: 'L1', titre: 'Alerte "Mot de passe divulgué" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.8', level: 'L1', titre: 'Alerte "Usurpation potentielle d\'employé (Gmail)" configurée', remediation: 'Sécurité > Règles.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') }
];

// ---------------------------------------------------------------------------
// GÉNÉRATION DU RAPPORT GOOGLE SHEETS
// ---------------------------------------------------------------------------
function ecrireRapport_(resultats, ctx, debut) {
  const ss = SpreadsheetApp.create(CONFIG.NOM_RAPPORT + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));

  // --- Dérogations : statut effectif = ÉCART ACCEPTÉ pour les NON CONFORME
  //     couverts par une acceptation formelle du registre.
  const derogations = listerDerogations();
  resultats = resultats.map(function (r) {
    const d = derogations[r.id];
    const effectif = (r.statut === STATUT.FAIL && d) ? STATUT.ACCEPTED : r.statut;
    return Object.assign({}, r, { statutEffectif: effectif, derogation: d || null });
  });

  // --- Onglet Synthèse ------------------------------------------------------
  const compte = {};
  Object.keys(STATUT).forEach(function (k) { compte[STATUT[k]] = 0; });
  resultats.forEach(function (r) { compte[r.statutEffectif] = (compte[r.statutEffectif] || 0) + 1; });

  const nAcceptes = compte[STATUT.ACCEPTED] || 0;
  // Score résiduel : les écarts formellement acceptés sortent du dénominateur.
  const evaluables = compte[STATUT.PASS] + compte[STATUT.FAIL];
  const scorePct = evaluables > 0 ? Math.round(100 * compte[STATUT.PASS] / evaluables) : 0;
  const evaluablesBrut = evaluables + nAcceptes;
  const scoreBrut = evaluablesBrut > 0 ? Math.round(100 * compte[STATUT.PASS] / evaluablesBrut) : 0;

  const sh1 = ss.getSheets()[0].setName('Synthèse');
  const lignesSynthese = [
    ['AUDIT CIS GOOGLE WORKSPACE FOUNDATIONS BENCHMARK v1.4', ''],
    ['', ''],
    ['Date d\'exécution', Utilities.formatDate(debut, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')],
    ['Exécuté par', Session.getActiveUser().getEmail()],
    ['Profil audité', CONFIG.NIVEAU_PROFIL === 'L1' ? 'Niveau 1' : 'Niveaux 1 + 2'],
    ['Version de l\'outil d\'audit', 'v' + CONFIG.VERSION],
    ['Référentiel', 'CIS Google Workspace Foundations Benchmark v1.4 — document officiel : cisecurity.org/benchmark/google_workspace'],
    ['Domaines', (ctx.domaines || []).join(', ') || 'n/d'],
    ['Politiques Cloud Identity lues', String((ctx.policies || []).length)],
    ['', ''],
    ['Score de conformité résiduel (écarts acceptés exclus)', scorePct + ' %'],
    ['Score de conformité brut (écarts acceptés comptés non conformes)', scoreBrut + ' %'],
    ['', ''],
    ['CONFORME', String(compte[STATUT.PASS] || 0)],
    ['NON CONFORME (à corriger)', String(compte[STATUT.FAIL] || 0)],
    ['ÉCART ACCEPTÉ (dérogation formelle)', String(nAcceptes)],
    ['À VÉRIFIER', String(compte[STATUT.REVIEW] || 0)],
    ['MANUEL', String(compte[STATUT.MANUAL] || 0)],
    ['ERREUR', String(compte[STATUT.ERROR] || 0)],
    ['HORS PROFIL', String(compte[STATUT.SKIP] || 0)]
  ];
  if (ctx.erreurs.length) {
    lignesSynthese.push(['', '']);
    lignesSynthese.push(['Avertissements de collecte', ctx.erreurs.join(' | ')]);
  }
  sh1.getRange(1, 1, lignesSynthese.length, 2).setValues(lignesSynthese);
  sh1.getRange('A1').setFontSize(14).setFontWeight('bold');
  sh1.getRange('A9:B9').setFontWeight('bold').setBackground('#fff3cd');
  sh1.getRange('A11:B11').setBackground('#d9ead3');
  sh1.getRange('A12:B12').setBackground('#f4cccc');
  sh1.getRange('A13:B13').setBackground('#fce5cd');
  sh1.getRange('A14:B14').setBackground('#d9d9d9');
  sh1.setColumnWidth(1, 340).setColumnWidth(2, 620);

  // --- Onglet Détail --------------------------------------------------------
  const sh2 = ss.insertSheet('Détail des contrôles');
  const entetes = ['ID CIS', 'Niveau', 'Contrôle', 'Statut', 'Constat / valeur relevée', 'Remédiation (console)'];
  const donnees = resultats.map(function (r) {
    let constat = r.detail;
    if (r.statutEffectif === STATUT.ACCEPTED && r.derogation) {
      constat = 'DÉROGATION — acceptée par ' + r.derogation.par + ' le ' + r.derogation.date +
        (r.derogation.revision ? ' (à réviser le ' + r.derogation.revision + ')' : ' (permanente)') +
        '. Motif : ' + r.derogation.motif + ' | Constat : ' + r.detail;
    }
    return [r.id, r.level, r.titre, r.statutEffectif, constat, r.remediation];
  });
  sh2.getRange(1, 1, 1, entetes.length).setValues([entetes])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  if (donnees.length) sh2.getRange(2, 1, donnees.length, entetes.length).setValues(donnees);
  sh2.setFrozenRows(1);
  sh2.setColumnWidth(1, 90).setColumnWidth(2, 60).setColumnWidth(3, 360)
    .setColumnWidth(4, 120).setColumnWidth(5, 520).setColumnWidth(6, 420);
  sh2.getRange(2, 5, Math.max(donnees.length, 1), 2).setWrap(true);

  const couleurs = {};
  couleurs[STATUT.PASS] = '#d9ead3';
  couleurs[STATUT.FAIL] = '#f4cccc';
  couleurs[STATUT.REVIEW] = '#fce5cd';
  couleurs[STATUT.MANUAL] = '#d9d9d9';
  couleurs[STATUT.ERROR] = '#ead1dc';
  couleurs[STATUT.SKIP] = '#f3f3f3';
  couleurs[STATUT.ACCEPTED] = '#dbe5f1';
  donnees.forEach(function (l, i) {
    const c = couleurs[l[3]];
    if (c) sh2.getRange(i + 2, 4).setBackground(c);
  });

  // --- Onglet Plan d'actions ------------------------------------------------
  const sh4 = ss.insertSheet("Plan d'actions");
  const entetesPlan = ['Priorité', 'ID CIS', 'Contrôle', 'Constat', 'Action recommandée', 'Risque couvert', 'Responsable', 'Échéance', 'État'];
  const lignesPlan = resultats
    .filter(function (r) { return r.statutEffectif === STATUT.FAIL; })
    .map(function (r) {
      const attendu = (r.detail.match(/Attendu : ([^|]+)/) || [])[1] || '';
      return [
        r.level === 'L1' ? 'P1 — Haute' : 'P2 — Moyenne',
        r.id, r.titre, r.detail,
        (r.remediation || '') + (attendu ? ' Cible : ' + attendu.trim() : ''),
        risquePour_(r.id),
        '', '', 'À faire'
      ];
    })
    .sort(function (a, b) { return a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : String(a[0]).localeCompare(String(b[0])); });
  sh4.getRange(1, 1, 1, entetesPlan.length).setValues([entetesPlan])
    .setFontWeight('bold').setBackground('#d93025').setFontColor('#ffffff');
  if (lignesPlan.length) {
    sh4.getRange(2, 1, lignesPlan.length, entetesPlan.length).setValues(lignesPlan);
    sh4.getRange(2, 4, lignesPlan.length, 3).setWrap(true);
    lignesPlan.forEach(function (l, i) {
      sh4.getRange(i + 2, 1).setBackground(l[0].indexOf('P1') === 0 ? '#f4cccc' : '#fce5cd');
    });
  } else {
    sh4.getRange(2, 1).setValue('Aucune action : aucun écart non conforme restant (hors dérogations).');
  }
  sh4.setFrozenRows(1);
  sh4.setColumnWidth(1, 100).setColumnWidth(2, 90).setColumnWidth(3, 300).setColumnWidth(4, 380)
    .setColumnWidth(5, 380).setColumnWidth(6, 340).setColumnWidth(7, 140).setColumnWidth(8, 100).setColumnWidth(9, 90);

  // --- Onglet Registre des dérogations -------------------------------------
  const sh5 = ss.insertSheet('Registre des dérogations');
  const entetesDer = ['ID CIS', 'Contrôle', 'Statut constaté à cet audit', 'Risque assumé', 'Motif de la dérogation', 'Acceptée par', 'Date', 'À réviser le', 'Observation'];
  const parId = {};
  resultats.forEach(function (r) { parId[r.id] = r; });
  const lignesDer = Object.keys(derogations).sort().map(function (id) {
    const d = derogations[id];
    const r = parId[id];
    const statutConstate = r ? r.statut : 'non évalué à cet audit';
    let obs = '';
    if (r && r.statut === STATUT.PASS) obs = 'Contrôle désormais conforme — dérogation à clore.';
    else if (d.revision && d.revision < Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) obs = 'DATE DE RÉVISION DÉPASSÉE — à réexaminer.';
    return [id, r ? r.titre : '', statutConstate, risquePour_(id), d.motif, d.par, d.date, d.revision || 'permanente', obs];
  });
  sh5.getRange(1, 1, 1, entetesDer.length).setValues([entetesDer])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  if (lignesDer.length) {
    sh5.getRange(2, 1, lignesDer.length, entetesDer.length).setValues(lignesDer);
    sh5.getRange(2, 4, lignesDer.length, 2).setWrap(true);
    lignesDer.forEach(function (l, i) {
      if (l[8]) sh5.getRange(i + 2, 9).setBackground('#fce5cd').setFontWeight('bold');
    });
  } else {
    sh5.getRange(2, 1).setValue('Aucune dérogation enregistrée.');
  }
  sh5.setFrozenRows(1);
  sh5.setColumnWidth(1, 90).setColumnWidth(2, 300).setColumnWidth(3, 160).setColumnWidth(4, 330)
    .setColumnWidth(5, 330).setColumnWidth(6, 210).setColumnWidth(7, 90).setColumnWidth(8, 110).setColumnWidth(9, 240);

  // --- Onglet Politiques (brut) — pour validation empirique des mappings ----
  const sh3 = ss.insertSheet('Politiques (brut)');
  sh3.getRange(1, 1, 1, 4).setValues([['Type de réglage', 'Type de politique', 'Cible (policyQuery)', 'Valeur JSON']])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  const lignesPol = (ctx.policies || []).map(function (p) {
    return [
      p.setting ? p.setting.type : '',
      p.type || '',
      JSON.stringify(p.policyQuery || {}),
      p.setting ? JSON.stringify(p.setting.value || {}) : ''
    ];
  });
  if (lignesPol.length) sh3.getRange(2, 1, lignesPol.length, 4).setValues(lignesPol);
  sh3.setFrozenRows(1);
  sh3.setColumnWidth(1, 380).setColumnWidth(2, 90).setColumnWidth(3, 260).setColumnWidth(4, 600);
  sh3.getRange(2, 4, Math.max(lignesPol.length, 1), 1).setWrap(true);

  return ss.getUrl();
}   