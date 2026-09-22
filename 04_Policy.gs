/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 04_Policy
 * ============================================================================
 *  Lecture et évaluation des politiques Cloud Identity, périmètre par périmètre.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


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
 * Toutes les politiques définissant un réglage, ou null si absent.
 * Les politiques ADMIN (réglages explicites de la console) priment sur la
 * politique SYSTEM (valeur par défaut Google) : dès qu'il en existe une, la
 * valeur par défaut n'est plus appliquée nulle part.
 */
function lirePolitiques_(ctx, type) {
  const entree = ctx.policyIndex[type];
  if (!entree) return null;
  if (entree.admin.length) return { source: 'ADMIN', politiques: entree.admin };
  if (entree.system.length) return { source: 'SYSTEM (défaut Google)', politiques: entree.system };
  return null;
}

/**
 * Libellé lisible du périmètre d'une politique : chemin de l'unité
 * organisationnelle quand il est connu, complété du ciblage par groupe.
 */
function libellePerimetre_(ctx, p) {
  const q = p.policyQuery || {};
  let libelle;
  if (!q.orgUnit) {
    libelle = 'périmètre non précisé';
  } else {
    const id = String(q.orgUnit).replace(/^orgUnits\//, '').replace(/^id:/, '');
    // Orgunits.list ne retourne jamais l'UO racine : un identifiant absent de
    // la table de correspondance la désigne donc.
    libelle = (ctx.unites || {})[id] || '/ (racine)';
  }
  if (q.query) libelle += ' + ciblage par groupe';
  return libelle;
}

/** Concatène une liste de périmètres en bornant la longueur du constat. */
function listerPerimetres_(entrees, maximum) {
  const cap = maximum || 10;
  if (entrees.length <= cap) return entrees.join(' ; ');
  return entrees.slice(0, cap).join(' ; ') + ' ; … et ' + (entrees.length - cap) + ' autre(s)';
}

/**
 * Évalue un réglage sur TOUS les périmètres où il est explicitement défini.
 *
 * La conformité CIS s'apprécie unité organisationnelle par unité
 * organisationnelle : un réglage permissif sur une UO fille est un écart réel,
 * même si la racine est conforme. L'implémentation précédente ne retenait
 * qu'une seule politique — celle de la racine — et ces écarts remontaient
 * CONFORME. Les UO qui n'apparaissent pas ici héritent de leur parent : la
 * Policy API ne retourne que les réglages explicitement définis.
 *
 * Retour : null si le réglage est absent de la réponse, sinon
 * { statut, detail, source, total, conformes, ecarts, indetermines }.
 */
function evaluerParPerimetre_(ctx, type, evaluateur, descriptionAttendue) {
  const lot = lirePolitiques_(ctx, type);
  if (!lot) return null;
  const conformes = [], ecarts = [], indetermines = [];
  lot.politiques.forEach(function (p) {
    const valeur = (p.setting && p.setting.value) || {};
    const trace = libellePerimetre_(ctx, p) + ' : ' + JSON.stringify(valeur);
    let verdict;
    try { verdict = evaluateur(valeur); } catch (e) { verdict = null; }
    if (verdict === true) conformes.push(trace);
    else if (verdict === false) ecarts.push(trace);
    else indetermines.push(trace);
  });
  const total = lot.politiques.length;
  // Un écart avéré sur un seul périmètre suffit à rendre le contrôle non
  // conforme : c'est la surface d'attaque réelle qui compte, pas la racine.
  const statut = ecarts.length ? STATUT.FAIL
    : (indetermines.length ? STATUT.REVIEW : STATUT.PASS);
  const parties = [];
  if (ecarts.length) parties.push('ÉCART sur ' + ecarts.length + '/' + total + ' : ' + listerPerimetres_(ecarts));
  if (indetermines.length) parties.push('indéterminé sur ' + indetermines.length + '/' + total + ' : ' + listerPerimetres_(indetermines));
  if (conformes.length) parties.push('conforme sur ' + conformes.length + '/' + total + ' : ' + listerPerimetres_(conformes));
  return {
    statut: statut, source: lot.source, total: total,
    conformes: conformes, ecarts: ecarts, indetermines: indetermines,
    detail: 'Attendu : ' + descriptionAttendue + ' | [' + lot.source + '] ' +
      total + ' périmètre(s) évalué(s) — ' + parties.join(' | ')
  };
}

/** Résumé purement informatif des valeurs d'un réglage, par périmètre. */
function resumePerimetres_(ctx, type) {
  const lot = lirePolitiques_(ctx, type);
  if (!lot) return '';
  return ' | [' + lot.source + '] ' + listerPerimetres_(lot.politiques.map(function (p) {
    return libellePerimetre_(ctx, p) + ' : ' + JSON.stringify((p.setting && p.setting.value) || {});
  }));
}

/**
 * Fabrique de contrôle basé sur la Policy API.
 * evaluateur(valeur) doit retourner true (conforme), false (non conforme)
 * ou null (indéterminé -> À VÉRIFIER). Il est appliqué à CHAQUE périmètre.
 */
function controlePolitique_(type, evaluateur, descriptionAttendue) {
  return function (ctx) {
    if (!ctx.policies || ctx.policies.length === 0) {
      return { statut: STATUT.ERROR, detail: 'Policy API indisponible.' };
    }
    const bilan = evaluerParPerimetre_(ctx, type, evaluateur, descriptionAttendue);
    if (!bilan) {
      return {
        statut: STATUT.REVIEW,
        detail: 'Réglage "' + type + '" absent de la réponse Policy API. ' +
          'Attendu : ' + descriptionAttendue + '. Vérifier manuellement dans la console.'
      };
    }
    return { statut: bilan.statut, detail: bilan.detail };
  };
}

// Helpers d'évaluation tolérants aux variations de nommage des champs.
function champ_(valeur, noms) {
  for (let i = 0; i < noms.length; i++) {
    if (valeur[noms[i]] !== undefined) return valeur[noms[i]];
  }
  return undefined;
}
// Libellés d'énumération de la Policy API. Le jeton discriminant est TOUJOURS
// en fin de libellé : "SHARING_DISABLED" vaut désactivé, "NONE_ALLOWED" non.
// L'ancienne implémentation testait en sous-chaîne et inversait donc le sens
// de valeurs comme NONE_ALLOWED ou SHARING_OFF_DOMAIN.
const MOTS_DESACTIVE = ['DISABLED', 'DISABLE', 'OFF', 'FALSE', 'NO', 'NONE',
  'INACTIVE', 'DENIED', 'BLOCKED', 'DISALLOWED', 'NOT_ALLOWED'];
const MOTS_ACTIVE = ['ENABLED', 'ENABLE', 'ON', 'TRUE', 'YES', 'ACTIVE', 'ALLOWED'];

/** Vrai si `s` est exactement l'un des mots, ou se termine par "_<mot>". */
function finitPar_(s, mots) {
  for (let i = 0; i < mots.length; i++) {
    if (s === mots[i] || s.slice(-(mots[i].length + 1)) === '_' + mots[i]) return true;
  }
  return false;
}

/**
 * true = désactivé, false = activé, null = libellé non reconnu.
 * Un libellé non reconnu remonte volontairement null (-> À VÉRIFIER) plutôt
 * qu'un verdict potentiellement faux : dans un outil de conformité, un faux
 * CONFORME coûte plus cher qu'une vérification manuelle.
 */
function estDesactive_(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v === false;
  if (typeof v !== 'string') return null;
  const t = v.trim().toUpperCase();
  if (!t) return null;
  if (finitPar_(t, MOTS_DESACTIVE)) return true;
  if (finitPar_(t, MOTS_ACTIVE)) return false;
  return null;
}
function estActive_(v) {
  const d = estDesactive_(v);
  return d === null ? null : !d;
}
