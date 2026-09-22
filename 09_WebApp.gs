/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 09_WebApp
 * ============================================================================
 *  Points d'entrée : application web progressive et mode batch.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


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
  const appelant = exigerSuperAdmin_();
  if (niveauProfil === 'L1' || niveauProfil === 'L2') CONFIG.NIVEAU_PROFIL = niveauProfil;
  const token = Utilities.getUuid();
  sauvegarderPartie_(token, 'err', []);
  // Chaque google.script.run est une exécution NEUVE : CONFIG.NIVEAU_PROFIL
  // repart de sa valeur par défaut. Le niveau choisi doit donc vivre dans la
  // session, sans quoi le rapport annonçait toujours "L1 + L2".
  sauvegarderPartie_(token, 'cfg', { niveau: CONFIG.NIVEAU_PROFIL });
  return {
    token: token,
    niveau: CONFIG.NIVEAU_PROFIL,
    compte: appelant,
    version: CONFIG.VERSION,
    config: {
      maxUtilisateurs: CONFIG.MAX_UTILISATEURS,
      maxGroupes: CONFIG.MAX_GROUPES,
      groupesParAppel: CONFIG.GROUPES_PAR_APPEL
    },
    derogations: listerDerogations_(),
    controles: DEFINITION_CONTROLES.map(function (c) {
      return {
        id: c.id,
        level: c.level,
        titre: c.titre,
        titreEn: c.titreEn || c.titre,
        remediation: c.remediation || '',
        remediationEn: c.remediationEn || ''
      };
    }),
    etapes: [
      { cle: 'domaines',     libelle: 'Domaines du tenant' },
      { cle: 'dns',          libelle: 'Enregistrements DNS (SPF, DKIM, DMARC)' },
      { cle: 'unites',       libelle: 'Unités organisationnelles' },
      { cle: 'admins',       libelle: 'Super administrateurs' },
      { cle: 'politiques',   libelle: 'Politiques Cloud Identity (réglages console)' },
      { cle: 'utilisateurs', libelle: 'Utilisateurs (admins, état 2SV)' },
      { cle: 'groupes',      libelle: 'Liste des groupes' },
      { cle: 'reglages',     libelle: 'Réglages de confidentialité des groupes' }
    ]
  };
}

/** Exécute un ou plusieurs contrôles sur le contexte collecté. */
function executerControles(token, ids, niveauProfil) {
  // Le niveau enregistré à l'ouverture de la session fait foi : le paramètre
  // client n'est qu'un repli si la session a expiré.
  CONFIG.NIVEAU_PROFIL = niveauSession_(token) ||
    ((niveauProfil === 'L1' || niveauProfil === 'L2') ? niveauProfil : CONFIG.NIVEAU_PROFIL);
  const ctx = chargerContexte_(token);
  const parId = {};
  DEFINITION_CONTROLES.forEach(function (c) { parId[c.id] = c; });
  return ids.map(function (id) {
    const ctrl = parId[id];
    if (!ctrl) return { id: id, statut: STATUT.ERROR, detail: 'Contrôle inconnu.', titre: '', titreEn: '', level: '', remediation: '', remediationEn: '' };
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
    const sortie = {
      id: ctrl.id,
      level: ctrl.level,
      titre: ctrl.titre,
      titreEn: ctrl.titreEn || ctrl.titre,
      statut: res.statut,
      detail: res.detail || '',
      remediation: ctrl.remediation || '',
      remediationEn: ctrl.remediationEn || '',
      risque: risquePour_(ctrl.id),
      risqueEn: risquePourEn_(ctrl.id)
    };
    sauvegarderResultat_(token, sortie); // le serveur garde l'original
    return sortie;
  });
}

/** Consolide les résultats de session sous une seule partition gzippée (phase 2 terminée). */
function consoliderResultats(token) {
  exigerSuperAdmin_();
  return consoliderResultats_(token);
}

// ---------------------------------------------------------------------------
// POINT D'ENTRÉE PRINCIPAL
// ---------------------------------------------------------------------------
function lancerAuditCIS() {
  exigerSuperAdmin_();
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
      titreEn: ctrl.titreEn || ctrl.titre,
      statut: res.statut,
      detail: res.detail || '',
      remediation: ctrl.remediation || '',
      remediationEn: ctrl.remediationEn || ''
    });
  });

  const url = ecrireRapport_(resultats, ctx, debut, CONFIG.LANGUE || 'fr');
  Logger.log('Audit terminé. Rapport : ' + url);
  return url;
}
