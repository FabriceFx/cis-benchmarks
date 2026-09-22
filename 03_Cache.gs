/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 03_Cache
 * ============================================================================
 *  Persistance de session : contexte, résultats et relevés de politiques.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


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

// --- Résultats de contrôle : le serveur fait autorité -----------------------
// Le rapport et l'e-mail ne doivent jamais être construits à partir d'un
// tableau de résultats fourni par le navigateur : il serait trivial d'émettre
// un rapport « 100 % conforme » portant la signature de l'outil. Chaque
// contrôle exécuté est donc consigné sous sa propre clé, déterministe, ce qui
// évite tout écrasement entre les exécutions parallèles de la phase 2.
function sauvegarderResultat_(token, resultat) {
  try {
    CacheService.getUserCache().put(
      'cisr_' + token + '_' + resultat.id, JSON.stringify(resultat), 21600);
  } catch (e) { /* un résultat non consigné réapparaîtra en « non exécuté » */ }
}

/**
 * Consolide les 87 résultats individuels sous une seule partition compressée
 * ('res'). Réduit la surface d'éviction LRU de CacheService de 87 clés à 1
 * seule clé gzippée dès que la phase 2 est terminée, sans élargir les scopes
 * OAuth à Google Drive.
 */
function consoliderResultats_(token) {
  try {
    const resultats = chargerResultats_(token);
    sauvegarderPartie_(token, 'res', resultats);
    // Relecture obligatoire : putAll peut écarter une valeur sans lever.
    const controle = chargerPartie_(token, 'res');
    if (!controle || controle.length !== resultats.length) return false;

    // On conserve volontairement les clés individuelles cisr_ comme filet de
    // sécurité : res étant l'entrée la plus récente (MRU), les anciennes clés
    // seront les premières cibles naturelles de l'éviction LRU sans risquer de
    // perte totale si res venait à être évincée ultérieurement.
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Relit l'intégralité des résultats depuis le cache serveur. Un contrôle sans
 * résultat consigné est restitué explicitement — HORS PROFIL s'il est exclu du
 * profil de la session, ERREUR sinon — plutôt qu'omis silencieusement.
 */
function chargerResultats_(token) {
  const consolides = chargerPartie_(token, 'res');
  if (consolides && Array.isArray(consolides) && consolides.length === DEFINITION_CONTROLES.length) {
    return consolides;
  }
  const niveau = niveauSession_(token);
  const cles = DEFINITION_CONTROLES.map(function (c) { return 'cisr_' + token + '_' + c.id; });
  const bruts = CacheService.getUserCache().getAll(cles) || {};
  let consignes = 0;
  const resultats = DEFINITION_CONTROLES.map(function (c) {
    const brut = bruts['cisr_' + token + '_' + c.id];
    if (brut) {
      try {
        const r = JSON.parse(brut);
        consignes++;
        return r;
      } catch (e) { /* entrée illisible : traitée comme non exécutée */ }
    }
    const exclu = (c.level === 'L2' && niveau === 'L1');
    return {
      id: c.id, level: c.level, titre: c.titre, titreEn: c.titreEn || c.titre,
      statut: exclu ? STATUT.SKIP : STATUT.ERROR,
      detail: exclu ? 'Contrôle L2 exclu du profil L1.'
                    : 'Contrôle non exécuté, ou résultat expiré du cache de session.',
      remediation: c.remediation || '', remediationEn: c.remediationEn || '',
      risque: risquePour_(c.id), risqueEn: risquePourEn_(c.id)
    };
  });
  if (!consignes) {
    throw new Error('Aucun résultat d\'audit en session — relancer l\'audit avant d\'exporter.');
  }
  return resultats;
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
    erreurs: err,
    niveau: niveauSession_(token),
    unites: {},
    unitesCollectees: false,
    dns: chargerPartie_(token, 'dns') || {}
  };
  const uo = chargerPartie_(token, 'uo');
  if (uo && uo.ok) { ctx.unites = uo.table || {}; ctx.unitesCollectees = true; }
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
  // Les super admins proviennent d'une requête ciblée « isAdmin=true », donc
  // exhaustive. Le filtrage de la liste plafonnée à MAX_UTILISATEURS ne sert
  // plus que de repli si cette étape a échoué, et le constat doit alors rester
  // prudent : c'est ce que signale superAdminsExhaustifs.
  const adm = chargerPartie_(token, 'adm');
  if (adm && adm.ok) {
    ctx.superAdmins = (adm.liste || []).filter(function (u) { return !u.suspended; });
    ctx.superAdminsExhaustifs = true;
  } else {
    ctx.superAdmins = ctx.utilisateurs
      ? ctx.utilisateurs.filter(function (u) { return u.isAdmin && !u.suspended; })
      : null;
    ctx.superAdminsExhaustifs = false;
    if (ctx.superAdmins) {
      ctx.erreurs.push('Recensement ciblé des super administrateurs indisponible : ' +
        'la liste est déduite des ' + ctx.utilisateurs.length + ' premiers utilisateurs ' +
        '(plafond MAX_UTILISATEURS = ' + CONFIG.MAX_UTILISATEURS + '). Les contrôles ' +
        '1.1.1, 1.1.2, 1.1.3 et 4.1.1.1 peuvent être incomplets.');
    }
  }
  ctx.policyIndex = indexerPolitiques_(ctx.policies);
  return ctx;
}

/** Niveau de profil de la session, faisant foi sur la valeur par défaut. */
function niveauSession_(token) {
  try {
    const cfg = chargerPartie_(token, 'cfg');
    if (cfg && (cfg.niveau === 'L1' || cfg.niveau === 'L2')) return cfg.niveau;
  } catch (e) { /* session expirée : repli sur la valeur par défaut */ }
  return CONFIG.NIVEAU_PROFIL;
}
