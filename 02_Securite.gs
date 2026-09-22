/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 02_Securite
 * ============================================================================
 *  Contrôle d'accès, verrouillage et journal d'audit.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// CONTRÔLE D'ACCÈS
// ---------------------------------------------------------------------------
// L'application web est déployée en USER_ACCESSING / DOMAIN : toute fonction
// publique (sans suffixe « _ ») est appelable par n'importe quel utilisateur du
// domaine via google.script.run. Les actions qui écrivent dans un état PARTAGÉ
// (registre des dérogations, dans les ScriptProperties) ou qui diffusent des
// données d'audit doivent donc vérifier le rôle côté serveur.
// ---------------------------------------------------------------------------

/**
 * Vérifie que l'appelant est super administrateur du tenant, sinon lève.
 * Retourne son adresse, à des fins de journalisation.
 */
function exigerSuperAdmin_() {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) throw new Error('Utilisateur non identifiable — action refusée.');
  let u;
  try {
    u = AdminDirectory.Users.get(email, { fields: 'isAdmin' });
  } catch (e) {
    throw new Error('Vérification du rôle impossible (' + e.message + ') — action refusée.');
  }
  if (!u || !u.isAdmin) {
    throw new Error('Action réservée aux super administrateurs du tenant (' + email + ').');
  }
  return email;
}

/**
 * Sérialise une opération sur un état partagé. Le registre des dérogations
 * subit un lire-modifier-écrire : sans verrou, deux acceptations simultanées
 * se perdent mutuellement.
 */
function avecVerrou_(operation) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(15000)) {
    throw new Error('Registre des dérogations momentanément occupé — réessayer dans un instant.');
  }
  try {
    return operation();
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Journal d'audit des mouvements du registre, du plus ancien au plus récent.
 * Restitué dans un onglet dédié du rapport : un journal que personne ne peut
 * consulter ne prouve rien.
 */
function lireJournalDerogations_() {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty('cis_journal_derog');
    return brut ? JSON.parse(brut) : [];
  } catch (e) {
    return [];
  }
}

/** Journal d'audit borné des mouvements du registre des dérogations. */
function journaliserDerogation_(action, id, email, details) {
  try {
    const props = PropertiesService.getScriptProperties();
    const brut = props.getProperty('cis_journal_derog');
    const journal = brut ? JSON.parse(brut) : [];
    journal.push({
      action: action, id: id, par: email, details: String(details || '').slice(0, 300),
      horodatage: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    });
    // Une valeur de ScriptProperties plafonne à 9 Ko : on purge les plus anciennes.
    while (JSON.stringify(journal).length > 8000 && journal.length > 1) journal.shift();
    props.setProperty('cis_journal_derog', JSON.stringify(journal));
  } catch (e) { /* meilleur effort : ne jamais faire échouer l'opération métier */ }
}
