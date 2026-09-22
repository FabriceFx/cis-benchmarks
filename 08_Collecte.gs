/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 08_Collecte
 * ============================================================================
 *  Collecte du contexte d'audit, par étapes pilotées par le client.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


/**
 * Exécute UNE tranche d'une étape de collecte et retourne son avancement.
 * Retour : { termine, curseur, fait, total, info, erreur? }
 * Une étape en échec est journalisée puis considérée terminée : l'audit
 * continue, les contrôles dépendants remonteront ERREUR avec la cause.
 */
/**
 * Transforme une réponse d'erreur d'API Google en message exploitable.
 *
 * Les erreurs SERVICE_DISABLED portent l'URL d'activation exacte dans
 * error.details[].metadata.activationUrl. Tronquer le corps JSON brut coupait
 * cette URL en plein milieu — l'administrateur recevait « …overview?project= »
 * sans l'identifiant du projet, c'est-à-dire précisément le seul lien
 * actionnable de la réponse, rendu inutilisable.
 */
function diagnostiquerReponse_(code, corps, service) {
  let message = String(corps || '').slice(0, 400);
  let activation = '';
  let raison = '';
  try {
    const err = (JSON.parse(corps) || {}).error || {};
    if (err.message) message = err.message;
    (err.details || []).forEach(function (d) {
      if (d.reason) raison = d.reason;
      const meta = d.metadata || {};
      if (meta.activationUrl) activation = meta.activationUrl;
      if (!activation && meta.service && meta.consumer) {
        activation = 'https://console.cloud.google.com/apis/library/' + meta.service +
          '?project=' + String(meta.consumer).replace(/^projects\//, '');
      }
    });
  } catch (e) { /* corps non JSON : l'extrait brut fait office de message */ }

  let aide = '';
  if (raison === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(message)) {
    aide = ' >>> API NON ACTIVÉE sur le projet GCP. Activer : ' +
      (activation || 'console Google Cloud > API et services > Bibliothèque' + (service ? ' > ' + service : '')) +
      ' — puis relancer l\'audit (la propagation prend une à deux minutes). ' +
      'Si le projet n\'est pas ouvrable dans la console, c\'est le projet par défaut d\'Apps Script : ' +
      'associer un projet GCP standard (Paramètres du projet > Projet Google Cloud Platform).';
  } else if (code === 403) {
    aide = ' >>> Vérifier que le compte exécutant est SUPER ADMIN du tenant, ' +
      'et qu\'un projet GCP standard est bien associé au script.';
  } else if (code === 401) {
    aide = ' >>> Autorisation expirée ou révoquée : rouvrir l\'application pour réautoriser.';
  }
  return 'HTTP ' + code + ' — ' + message + aide;
}

/** Reconnaît une erreur de quota ou de limitation de débit, quelle qu'en soit la forme. */
function estErreurQuota_(e) {
  return /429|RESOURCE_EXHAUSTED|quota|rate ?limit/i.test(String((e && e.message) || e));
}

/**
 * Exécute une opération en la réessayant sur quota, avec temporisation
 * croissante. Utilisé là où le client ne peut pas reprendre la main — la boucle
 * synchrone du mode batch notamment, qui n'avait aucune gestion du 429.
 */
function avecReessaiQuota_(operation, tentatives) {
  const n = tentatives || 3;
  for (let i = 0; i < n; i++) {
    try {
      return operation();
    } catch (e) {
      if (i === n - 1 || !estErreurQuota_(e)) throw e;
      Utilities.sleep(1000 * Math.pow(2, i)); // 1 s puis 2 s
    }
  }
}

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

      case 'dns': {
        // Résolution en phase 1, une seule fois par domaine. Les trois
        // contrôles DNS s'exécutant en parallèle en phase 2, ils lançaient
        // auparavant jusqu'à quatre requêtes par domaine chacun, sans cache
        // partagé, en bloquant l'appel serveur le temps de la résolution.
        const doms = chargerPartie_(token, 'dom') || [];
        if (!doms.length) {
          return { termine: true, fait: 0, total: 0, info: 'aucun domaine à résoudre' };
        }
        const depart = Number(curseur) || 0;
        const jusqua = Math.min(depart + CONFIG.DOMAINES_PAR_APPEL, doms.length);
        const releve = depart ? (chargerPartie_(token, 'dns') || {}) : {};
        for (let i = depart; i < jusqua; i++) releve[doms[i]] = resoudreDomaine_(doms[i]);
        sauvegarderPartie_(token, 'dns', releve);
        const fini = jusqua >= doms.length;
        return { termine: fini, curseur: fini ? null : String(jusqua),
                 fait: jusqua, total: doms.length,
                 info: jusqua + ' / ' + doms.length + ' domaine(s) résolu(s) (SPF, DKIM, DMARC)' };
      }

      case 'unites': {
        // Table de correspondance identifiant -> chemin d'UO. Sans elle, les
        // écarts par périmètre seraient restitués sous forme d'identifiants
        // opaques, inexploitables dans un plan d'actions.
        const rep = AdminDirectory.Orgunits.list('my_customer', {
          type: 'all', fields: 'organizationUnits(orgUnitId,orgUnitPath)'
        });
        const table = {};
        (rep.organizationUnits || []).forEach(function (o) {
          table[String(o.orgUnitId).replace(/^id:/, '')] = o.orgUnitPath;
        });
        // ok: true distingue « aucune sous-UO » de « collecte en échec » —
        // sans quoi un tenant sans sous-UO serait traité comme un tenant dont
        // la table est inconnue, et tous ses contrôles passeraient À VÉRIFIER.
        sauvegarderPartie_(token, 'uo', { ok: true, table: table });
        const n = Object.keys(table).length;
        return { termine: true, fait: n, total: n,
                 info: n + ' unité(s) organisationnelle(s) recensée(s), hors racine' };
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
            throw new Error(diagnostiquerReponse_(code, rep.getContentText(), 'cloudidentity.googleapis.com'));
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
        } while (pageToken && pages < CONFIG.PAGES_PAR_APPEL); // retour rapide au navigateur
        sauvegarderPartie_(token, 'pol', existant);
        if (!pageToken) sauvegarderSnapshotPolitiques_(existant); // relevé complet -> réutilisable
        return { termine: !pageToken, curseur: pageToken || null,
                 fait: existant.length, total: null,
                 info: existant.length + ' politique(s) lue(s)' + (pageToken ? ' — suite en cours' : '') };
      }

      case 'admins': {
        // Requête ciblée : « isAdmin=true » retourne 100 % des super
        // administrateurs en un appel, quel que soit l'effectif du tenant.
        // Les déduire de la liste des utilisateurs plafonnée à
        // MAX_UTILISATEURS laissait échapper tout super admin situé au-delà du
        // plafond, faussant les contrôles 1.1.1, 1.1.2, 1.1.3 et 4.1.1.1.
        const admins = [];
        let pageAdm = null;
        do {
          const rep = AdminDirectory.Users.list({
            customer: 'my_customer', query: 'isAdmin=true', maxResults: 500,
            pageToken: pageAdm, projection: 'basic',
            fields: 'nextPageToken,users(primaryEmail,isAdmin,isDelegatedAdmin,suspended,isEnrolledIn2Sv,isEnforcedIn2Sv,lastLoginTime)'
          });
          (rep.users || []).forEach(function (u) { admins.push(u); });
          pageAdm = rep.nextPageToken;
        } while (pageAdm);
        sauvegarderPartie_(token, 'adm', { ok: true, liste: admins });
        return { termine: true, fait: admins.length, total: admins.length,
                 info: admins.length + ' super administrateur(s) recensé(s)' };
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
            if (estErreurQuota_(e)) {
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
        } while (pageToken && pages < CONFIG.PAGES_PAR_APPEL && existant.length < CONFIG.MAX_UTILISATEURS);
        sauvegarderPartie_(token, 'usr', existant);
        const termine = !pageToken || existant.length >= CONFIG.MAX_UTILISATEURS;
        return { termine: termine, curseur: pageToken || null,
                 fait: existant.length, total: null,
                 info: existant.length + ' utilisateur(s) lu(s)' + (termine ? '' : ' — suite en cours') };
      }

      case 'groupes': {
        // Bornée à PAGES_PAR_APPEL comme les autres étapes : à 3 000 groupes,
        // l'ancienne boucle non bornée enchaînait 15 appels Directory dans un
        // seul appel serveur et pouvait approcher la limite des 6 minutes.
        const existant = curseur ? (chargerPartie_(token, 'grp') || []) : [];
        let pageToken = (curseur && curseur !== '@debut') ? curseur : null;
        let pages = 0;
        do {
          let rep;
          try {
            rep = AdminDirectory.Groups.list({
              customer: 'my_customer', maxResults: 200, pageToken: pageToken,
              fields: 'nextPageToken,groups(email,name)'
            });
          } catch (e) {
            if (estErreurQuota_(e)) {
              sauvegarderPartie_(token, 'grp', existant);
              return { termine: false, curseur: pageToken || '@debut', attente: 30,
                       fait: existant.length, total: null,
                       info: 'quota de la Directory API atteint (' + existant.length + ' groupe(s) déjà recensé(s))' };
            }
            throw e;
          }
          (rep.groups || []).forEach(function (g) { existant.push({ email: g.email, name: g.name }); });
          pageToken = rep.nextPageToken;
          pages++;
        } while (pageToken && pages < CONFIG.PAGES_PAR_APPEL && existant.length < CONFIG.MAX_GROUPES);
        sauvegarderPartie_(token, 'grp', existant);
        const termine = !pageToken || existant.length >= CONFIG.MAX_GROUPES;
        return { termine: termine, curseur: pageToken || null,
                 fait: existant.length, total: termine ? existant.length : null,
                 info: existant.length + ' groupe(s) recensé(s)' + (termine ? '' : ' — suite en cours') };
      }

      // L'étape 'reglages' n'est pas traitée ici : le client l'exécute par
      // tranches indépendantes via collecterReglagesTranche(), qui seule
      // supporte les lots parallèles sans écrasement concurrent.

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
        if (estErreurQuota_(e)) {
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
// CONSTRUCTION DU CONTEXTE (collecte des données une seule fois)
// ---------------------------------------------------------------------------
function construireContexte_() {
  const ctx = { erreurs: [], niveau: CONFIG.NIVEAU_PROFIL, unites: {}, unitesCollectees: false };

  // --- Unités organisationnelles (libellés des périmètres) -----------------
  try {
    const repUo = AdminDirectory.Orgunits.list('my_customer', {
      type: 'all', fields: 'organizationUnits(orgUnitId,orgUnitPath)'
    });
    (repUo.organizationUnits || []).forEach(function (o) {
      ctx.unites[String(o.orgUnitId).replace(/^id:/, '')] = o.orgUnitPath;
    });
    ctx.unitesCollectees = true;
  } catch (e) {
    ctx.erreurs.push('Unités organisationnelles illisibles : ' + e.message +
      ' — les périmètres seront restitués sous forme d\'identifiants.');
  }

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

  // --- Utilisateurs (2SV, jetons) ------------------------------------------
  try {
    ctx.utilisateurs = recupererUtilisateurs_();
  } catch (e) {
    ctx.utilisateurs = null;
    ctx.erreurs.push('Directory API (users) : ' + e.message);
  }

  // --- Super administrateurs (requête ciblée, jamais un filtrage plafonné) --
  try {
    ctx.superAdmins = recupererSuperAdmins_().filter(function (u) { return !u.suspended; });
    ctx.superAdminsExhaustifs = true;
  } catch (e) {
    ctx.superAdmins = null;
    ctx.superAdminsExhaustifs = false;
    ctx.erreurs.push('Directory API (super admins) : ' + e.message);
  }

  // --- Domaines -------------------------------------------------------------
  try {
    const rep = AdminDirectory.Domains.list('my_customer');
    ctx.domaines = (rep.domains || []).map(function (d) { return d.domainName; });
  } catch (e) {
    ctx.domaines = [];
    ctx.erreurs.push('Directory API (domains) : ' + e.message);
  }

  // --- Relevé DNS (SPF / DKIM / DMARC), une passe par domaine ---------------
  ctx.dns = {};
  ctx.domaines.forEach(function (d) {
    try {
      ctx.dns[d] = resoudreDomaine_(d);
    } catch (e) {
      ctx.erreurs.push('Résolution DNS de ' + d + ' : ' + e.message);
    }
  });

  // --- Groupes + réglages ---------------------------------------------------
  try {
    ctx.groupes = recupererGroupesAvecReglages_(ctx);
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
      throw new Error(diagnostiquerReponse_(code, rep.getContentText(), 'cloudidentity.googleapis.com'));
    }
    const data = JSON.parse(rep.getContentText());
    (data.policies || []).forEach(function (p) { politiques.push(p); });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return politiques;
}

// ---------------------------------------------------------------------------
// ADMIN SDK — UTILISATEURS / GROUPES
// ---------------------------------------------------------------------------
/**
 * Super administrateurs du tenant, par requête ciblée.
 * « isAdmin=true » est évalué côté Google : le résultat est exhaustif quel que
 * soit l'effectif, là où un filtrage de la liste des utilisateurs dépendait du
 * plafond MAX_UTILISATEURS et pouvait manquer des comptes.
 */
function recupererSuperAdmins_() {
  const admins = [];
  let pageToken = null;
  do {
    const rep = AdminDirectory.Users.list({
      customer: 'my_customer', query: 'isAdmin=true', maxResults: 500,
      pageToken: pageToken, projection: 'basic',
      fields: 'nextPageToken,users(primaryEmail,isAdmin,isDelegatedAdmin,suspended,isEnrolledIn2Sv,isEnforcedIn2Sv,lastLoginTime)'
    });
    (rep.users || []).forEach(function (u) { admins.push(u); });
    pageToken = rep.nextPageToken;
  } while (pageToken);
  return admins;
}

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

/**
 * Recense les groupes et, si CONFIG.GROUPES_DETAILLES_BATCH le demande, lit
 * leurs réglages de confidentialité — sous budget de temps.
 *
 * La lecture groupe par groupe coûte 150 à 250 ms l'unité : à 2 500 groupes,
 * la boucle dépassait la limite d'exécution de 6 minutes et le script était
 * stoppé sans produire aucun rapport. Elle est donc désactivée par défaut, et
 * bornée par un budget quand elle est activée. Toute troncature est signalée
 * dans les avertissements de collecte du rapport plutôt que subie.
 */
function recupererGroupesAvecReglages_(ctx) {
  const avertir = function (m) { if (ctx && ctx.erreurs) ctx.erreurs.push(m); };
  const groupes = [];
  let pageToken = null;
  do {
    const rep = avecReessaiQuota_(function () {
      return AdminDirectory.Groups.list({
        customer: 'my_customer', maxResults: 200, pageToken: pageToken,
        fields: 'nextPageToken,groups(email,name)'
      });
    });
    (rep.groups || []).forEach(function (g) { groupes.push(g); });
    pageToken = rep.nextPageToken;
  } while (pageToken && groupes.length < CONFIG.MAX_GROUPES);

  if (!CONFIG.GROUPES_DETAILLES_BATCH) {
    avertir('Réglages individuels des groupes non collectés en mode batch ' +
      '(CONFIG.GROUPES_DETAILLES_BATCH = false, pour écarter la limite des 6 minutes). ' +
      'Les contrôles concernés s\'appuient sur la Policy API ; à défaut, ils remontent À VÉRIFIER.');
    return groupes;
  }

  const echeance = Date.now() + CONFIG.BUDGET_GROUPES_MS;
  let lus = 0;
  for (let i = 0; i < groupes.length; i++) {
    if (Date.now() > echeance) {
      avertir('Budget de lecture des réglages de groupes épuisé après ' + lus + ' groupe(s) sur ' +
        groupes.length + ' : échantillon tronqué. Augmenter CONFIG.BUDGET_GROUPES_MS, ' +
        'ou passer par l\'application web qui répartit la collecte sur plusieurs appels.');
      break;
    }
    try {
      const s = avecReessaiQuota_(function () { return GroupsSettings.Groups.get(groupes[i].email); });
      // Seuls les champs utiles aux contrôles sont conservés (contexte mis en cache).
      groupes[i].settings = {
        whoCanViewGroup: s.whoCanViewGroup,
        whoCanPostMessage: s.whoCanPostMessage,
        whoCanViewTopics: s.whoCanViewTopics,
        whoCanJoin: s.whoCanJoin
      };
      lus++;
    } catch (e) {
      groupes[i].settings = null;
      groupes[i].erreur = e.message;
    }
  }
  return groupes;
}
