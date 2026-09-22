/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 06_Derogations
 * ============================================================================
 *  Registre des dérogations : acceptation formelle d'écarts.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// REGISTRE DES DÉROGATIONS (acceptation d'écarts en connaissance de cause)
// Stockage : ScriptProperties => durable (pas de TTL) et partagé entre les
// administrateurs qui utilisent la WebApp.
// ---------------------------------------------------------------------------
/** Lecture interne, sans contrôle de rôle : réservée aux appelants déjà gardés. */
function listerDerogations_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const map = {};
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('derog_') !== 0) return;
    try { map[k.substring(6)] = JSON.parse(props[k]); } catch (e) { /* entrée corrompue : ignorée */ }
  });
  return map;
}

/** Point d'entrée public : expose qui a accepté quoi, donc réservé aux admins. */
function listerDerogations() {
  exigerSuperAdmin_();
  return listerDerogations_();
}

function enregistrerDerogation(id, motif, dureeMois) {
  const appelant = exigerSuperAdmin_();
  if (!motif || !String(motif).trim()) {
    throw new Error('Un motif est obligatoire pour accepter un écart.');
  }
  const existeCtrl = DEFINITION_CONTROLES.some(function (c) { return c.id === id; });
  if (!existeCtrl) throw new Error('Contrôle inconnu : ' + id);
  const tz = Session.getScriptTimeZone();
  const entree = {
    id: id,
    motif: String(motif).trim().slice(0, 1000),
    par: appelant,
    date: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    revision: (dureeMois && Number(dureeMois) > 0)
      ? Utilities.formatDate(new Date(Date.now() + Number(dureeMois) * 30.44 * 86400000), tz, 'yyyy-MM-dd')
      : null // null = permanente (revue au prochain audit tout de même)
  };
  return avecVerrou_(function () {
    PropertiesService.getScriptProperties().setProperty('derog_' + id, JSON.stringify(entree));
    journaliserDerogation_('ACCEPTATION', id, appelant, entree.motif);
    return entree;
  });
}

function revoquerDerogation(id) {
  const appelant = exigerSuperAdmin_();
  return avecVerrou_(function () {
    const props = PropertiesService.getScriptProperties();
    const avant = props.getProperty('derog_' + id);
    props.deleteProperty('derog_' + id);
    journaliserDerogation_('RÉVOCATION', id, appelant, avant || '');
    return true;
  });
}
