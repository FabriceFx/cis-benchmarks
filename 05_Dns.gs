/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 05_Dns
 * ============================================================================
 *  Résolution DNS (SPF, DKIM, DMARC) via DNS-over-HTTPS.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// DNS (SPF / DKIM / DMARC) via DNS-over-HTTPS Google
// ---------------------------------------------------------------------------
/**
 * Résout un enregistrement TXT via DNS-over-HTTPS, avec réessais.
 * Retour : { resolu, enregistrements, cause }
 *  - resolu = true  : la réponse fait foi (NOERROR ou NXDOMAIN). Une liste
 *                     vide signifie alors une absence CERTAINE.
 *  - resolu = false : résolution en échec (SERVFAIL, HTTP, réseau). L'absence
 *                     n'est PAS démontrée : le contrôle doit remonter
 *                     À VÉRIFIER et non NON CONFORME.
 * Seules les réponses de type 16 (TXT) sont retenues : une cible DKIM est
 * souvent un CNAME, et la chaîne de résolution contient alors aussi des
 * réponses de type 5 qui ne sont pas des enregistrements TXT.
 */
function resoudreTXT_(nom) {
  let cause = '';
  for (let tentative = 0; tentative < 3; tentative++) {
    if (tentative > 0) Utilities.sleep(500 * Math.pow(2, tentative - 1));
    try {
      const rep = UrlFetchApp.fetch(
        'https://dns.google/resolve?name=' + encodeURIComponent(nom) + '&type=TXT',
        { muteHttpExceptions: true });
      const code = rep.getResponseCode();
      if (code !== 200) { cause = 'HTTP ' + code; continue; }
      const data = JSON.parse(rep.getContentText());
      if (data.Status !== 0 && data.Status !== 3) {
        cause = 'DNS Status ' + data.Status + (data.Comment ? ' — ' + data.Comment : '');
        continue;
      }
      return {
        resolu: true,
        enregistrements: (data.Answer || [])
          .filter(function (a) { return a.type === 16; })
          .map(function (a) { return String(a.data).replace(/"/g, ''); }),
        cause: ''
      };
    } catch (e) {
      cause = e.message;
    }
  }
  return { resolu: false, enregistrements: [], cause: cause || 'résolution impossible' };
}

/**
 * Testeurs unitaires, un par enregistrement. Chacun retourne
 * { ok } | { ok: false } | { indetermine: true }, plus un libellé explicatif.
 */
function testerDkim_(domaine) {
  let echecResolution = '';
  for (let i = 0; i < CONFIG.SELECTEURS_DKIM.length; i++) {
    const r = resoudreTXT_(CONFIG.SELECTEURS_DKIM[i] + '._domainkey.' + domaine);
    if (!r.resolu) { echecResolution = r.cause; continue; }
    const hit = r.enregistrements.find(function (t) { return /v=DKIM1/i.test(t); });
    if (hit) return { ok: true, info: 'sélecteur ' + CONFIG.SELECTEURS_DKIM[i] };
  }
  if (echecResolution) return { indetermine: true, info: 'résolution DNS en échec : ' + echecResolution };
  return { ok: false, info: 'aucun enregistrement DKIM trouvé (sélecteurs testés : ' +
    CONFIG.SELECTEURS_DKIM.join(', ') + ')' };
}

function testerSpf_(domaine) {
  const r = resoudreTXT_(domaine);
  if (!r.resolu) return { indetermine: true, info: 'résolution DNS en échec : ' + r.cause };
  const spf = r.enregistrements.find(function (t) { return /^v=spf1/i.test(t); });
  return spf ? { ok: true, info: spf.slice(0, 80) } : { ok: false };
}

function testerDmarc_(domaine) {
  const r = resoudreTXT_('_dmarc.' + domaine);
  if (!r.resolu) return { indetermine: true, info: 'résolution DNS en échec : ' + r.cause };
  const rec = r.enregistrements.find(function (t) { return /^v=DMARC1/i.test(t); });
  if (!rec) return { ok: false };
  const pNone = /p=none/i.test(rec);
  return { ok: true, info: rec.slice(0, 100) + (pNone ? ' — ATTENTION p=none (protection faible)' : '') };
}

const TESTEURS_DNS = { spf: testerSpf_, dkim: testerDkim_, dmarc: testerDmarc_ };

/** Résout les trois enregistrements d'un domaine en une passe. */
function resoudreDomaine_(domaine) {
  return { spf: testerSpf_(domaine), dkim: testerDkim_(domaine), dmarc: testerDmarc_(domaine) };
}

/**
 * Agrège le verdict d'un enregistrement sur tous les domaines du tenant.
 *
 * La résolution a lieu en phase 1 et le relevé vit dans le contexte : les trois
 * contrôles DNS s'exécutant en parallèle en phase 2, ils lançaient auparavant
 * jusqu'à quatre requêtes par domaine chacun, sans cache partagé, en bloquant
 * l'appel serveur. Si le relevé manque — session expirée, mode batch sans la
 * pré-collecte — la résolution se fait à la volée, en repli.
 */
function verifierDns_(ctx, cle, libelle) {
  if (!ctx.domaines || ctx.domaines.length === 0) {
    return { statut: STATUT.ERROR, detail: 'Liste des domaines indisponible.' };
  }
  const releve = ctx.dns || {};
  const echecs = [], indetermines = [], details = [];
  ctx.domaines.forEach(function (d) {
    const r = (releve[d] && releve[d][cle]) || TESTEURS_DNS[cle](d);
    let marque;
    if (r.indetermine) { marque = 'INDÉTERMINÉ'; indetermines.push(d); }
    else if (r.ok) { marque = 'OK'; }
    else { marque = 'ABSENT'; echecs.push(d); }
    details.push(d + ' : ' + marque + (r.info ? ' (' + r.info + ')' : ''));
  });
  // Un domaine réellement en écart prime sur un domaine non résolu ; sans
  // écart avéré mais avec une résolution en échec, le verdict reste suspendu.
  const statut = echecs.length ? STATUT.FAIL
    : (indetermines.length ? STATUT.REVIEW : STATUT.PASS);
  return { statut: statut, detail: libelle + ' — ' + details.join(' ; ') };
}

