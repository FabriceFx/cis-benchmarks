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
            if (/429|RESOURCE_EXHAUSTED|quota|rate ?limit/i.test(String(e.message))) {
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
