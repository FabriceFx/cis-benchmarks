// Pré-collecte DNS et garde-fous du mode batch.
// Exécution : node tests/collecte.test.js
const { charger, suite } = require('./aide.js');
const t = suite();

const api = charger([
  'resoudreTXT_', 'resoudreDomaine_', 'verifierDns_', 'testerSpf_',
  'recupererGroupesAvecReglages_', 'avecReessaiQuota_', 'estErreurQuota_', 'diagnostiquerReponse_',
  'STATUT', 'CONFIG'
]);
const { STATUT } = api;

const TXT = valeurs => ({ Status: 0, Answer: valeurs.map(v => ({ type: 16, data: '"' + v + '"' })) });
const raz = () => { api.__dns.appels.length = 0; api.__dns.reponse = null; };

// ---------------------------------------------------------------- résolution
t('NXDOMAIN fait foi : absence certaine, pas une panne', () => {
  raz(); api.__dns.reponse = () => ({ Status: 3 });
  const r = api.resoudreTXT_('absent.test');
  if (!r.resolu) throw new Error('traité comme non résolu');
  if (r.enregistrements.length) throw new Error('enregistrements inattendus');
  if (api.__dns.appels.length !== 1) throw new Error(api.__dns.appels.length + ' requête(s) — pas de réessai attendu');
});

t('SERVFAIL est réessayé, puis déclaré non résolu', () => {
  raz(); api.__dns.reponse = () => ({ Status: 2 });
  const r = api.resoudreTXT_('panne.test');
  if (r.resolu) throw new Error('déclaré résolu à tort');
  if (api.__dns.appels.length !== 3) throw new Error(api.__dns.appels.length + ' tentative(s) au lieu de 3');
});

t('un SERVFAIL transitoire suivi d\'une réponse valide réussit', () => {
  raz();
  let n = 0;
  api.__dns.reponse = () => (++n < 2 ? { Status: 2 } : TXT(['v=spf1 include:_spf.google.com ~all']));
  const r = api.testerSpf_('exemple.test');
  if (!r.ok) throw new Error('échec malgré le réessai : ' + JSON.stringify(r));
});

t('seules les réponses TXT sont retenues, pas la chaîne CNAME', () => {
  raz();
  api.__dns.reponse = () => ({ Status: 0, Answer: [
    { type: 5, data: 'cible.exemple.test.' },
    { type: 16, data: '"v=DKIM1; k=rsa; p=AAAA"' }
  ] });
  const r = api.resoudreDomaine_('exemple.test');
  if (!r.dkim.ok) throw new Error('DKIM non détecté derrière le CNAME');
});

t('resoudreDomaine_ couvre les trois enregistrements', () => {
  raz(); api.__dns.reponse = () => TXT(['v=spf1 -all']);
  const r = api.resoudreDomaine_('exemple.test');
  ['spf', 'dkim', 'dmarc'].forEach(k => { if (!(k in r)) throw new Error('clé manquante : ' + k); });
});

// ------------------------------------------------- pré-collecte de phase 1
// Le cœur du correctif : les trois contrôles DNS tournent en parallèle en
// phase 2. Sans relevé partagé, chacun relançait ses propres résolutions.
t('avec le relevé de phase 1, la phase 2 n\'émet aucune requête', () => {
  raz();
  const ctx = {
    domaines: ['a.test', 'b.test'],
    dns: {
      'a.test': { spf: { ok: true, info: 'v=spf1' }, dkim: { ok: true }, dmarc: { ok: true } },
      'b.test': { spf: { ok: true }, dkim: { ok: true }, dmarc: { ok: true } }
    }
  };
  ['spf', 'dkim', 'dmarc'].forEach(cle => api.verifierDns_(ctx, cle, cle.toUpperCase()));
  if (api.__dns.appels.length !== 0) {
    throw new Error(api.__dns.appels.length + ' requête(s) émise(s) alors que le relevé est complet');
  }
});

t('sans relevé, la résolution se fait à la volée (repli)', () => {
  raz(); api.__dns.reponse = () => TXT(['v=spf1 -all']);
  const r = api.verifierDns_({ domaines: ['a.test'] }, 'spf', 'SPF');
  if (r.statut !== STATUT.PASS) throw new Error(r.statut);
  if (api.__dns.appels.length === 0) throw new Error('aucun repli effectué');
});

t('un enregistrement absent vaut NON CONFORME, une panne vaut À VÉRIFIER', () => {
  raz();
  const absent = { domaines: ['a.test'], dns: { 'a.test': { spf: { ok: false } } } };
  if (api.verifierDns_(absent, 'spf', 'SPF').statut !== STATUT.FAIL) throw new Error('absence non signalée');
  const panne = { domaines: ['a.test'], dns: { 'a.test': { spf: { indetermine: true, info: 'SERVFAIL' } } } };
  const r = api.verifierDns_(panne, 'spf', 'SPF');
  if (r.statut !== STATUT.REVIEW) throw new Error('panne prise pour un écart : ' + r.statut);
  if (!/INDÉTERMINÉ/.test(r.detail)) throw new Error(r.detail);
});

t('un écart avéré prime sur un domaine non résolu', () => {
  raz();
  const ctx = { domaines: ['a.test', 'b.test'], dns: {
    'a.test': { spf: { indetermine: true } }, 'b.test': { spf: { ok: false } } } };
  if (api.verifierDns_(ctx, 'spf', 'SPF').statut !== STATUT.FAIL) throw new Error('écart masqué');
});

// ------------------------------------------------ garde-fous du mode batch
const groupes = n => Array.from({ length: n }, (_, i) => ({ email: 'g' + i + '@a.test', name: 'g' + i }));
const razG = () => { api.__google.groupes = []; api.__google.reglages = null; api.__google.appels = 0; };

t('mode batch : la lecture groupe par groupe est désactivée par défaut', () => {
  razG(); api.__google.groupes = groupes(50);
  api.CONFIG.GROUPES_DETAILLES_BATCH = false;
  const ctx = { erreurs: [] };
  const r = api.recupererGroupesAvecReglages_(ctx);
  if (r.length !== 50) throw new Error(r.length + ' groupe(s) recensé(s)');
  if (api.__google.appels !== 0) throw new Error(api.__google.appels + ' lecture(s) alors que l\'option est off');
  if (!ctx.erreurs.some(e => /non collectés en mode batch/.test(e))) throw new Error('non signalé');
});

t('mode batch activé : la lecture s\'arrête au budget et le signale', () => {
  razG(); api.__google.groupes = groupes(400);
  api.CONFIG.GROUPES_DETAILLES_BATCH = true;
  const budget = api.CONFIG.BUDGET_GROUPES_MS;
  api.CONFIG.BUDGET_GROUPES_MS = -1;   // budget déjà épuisé au premier tour
  const ctx = { erreurs: [] };
  api.recupererGroupesAvecReglages_(ctx);
  api.CONFIG.BUDGET_GROUPES_MS = budget;
  api.CONFIG.GROUPES_DETAILLES_BATCH = false;
  if (api.__google.appels !== 0) throw new Error(api.__google.appels + ' lecture(s) malgré le budget épuisé');
  if (!ctx.erreurs.some(e => /Budget de lecture/.test(e))) throw new Error('troncature non signalée');
});

t('un quota est réessayé, une autre erreur remonte immédiatement', () => {
  let n = 0;
  const r = api.avecReessaiQuota_(() => { if (++n < 3) throw new Error('429 RESOURCE_EXHAUSTED'); return 'ok'; });
  if (r !== 'ok' || n !== 3) throw new Error('n=' + n + ' r=' + r);
  let essais = 0;
  try {
    api.avecReessaiQuota_(() => { essais++; throw new Error('403 forbidden'); });
  } catch { /* échec attendu : on ne vérifie que le nombre de tentatives */ }
  if (essais !== 1) throw new Error(essais + ' tentative(s) sur une erreur non liée au quota');
});

t('estErreurQuota_ reconnaît les formes usuelles', () => {
  const oui = ['HTTP 429', 'RESOURCE_EXHAUSTED', 'Quota exceeded', 'rate limit exceeded'];
  const non = ['403 forbidden', 'not found'];
  oui.forEach(m => { if (!api.estErreurQuota_(new Error(m))) throw new Error('manqué : ' + m); });
  non.forEach(m => { if (api.estErreurQuota_(new Error(m))) throw new Error('faux positif : ' + m); });
});

// ------------------------------------------------- diagnostic des erreurs API
// Le corps d'une erreur SERVICE_DISABLED dépasse 250 caractères : l'ancienne
// troncature coupait l'URL d'activation en plein milieu, juste après
// « ?project= », privant l'administrateur du seul lien actionnable.
const CORPS_SERVICE_DESACTIVE = JSON.stringify({
  error: {
    code: 403,
    message: 'Cloud Identity API has not been used in project 504652170406 before or it is disabled. ' +
      'Enable it by visiting https://console.developers.google.com/apis/api/cloudidentity.googleapis.com/' +
      'overview?project=504652170406 then retry. If you enabled this API recently, wait a few minutes.',
    status: 'PERMISSION_DENIED',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: 'SERVICE_DISABLED',
      domain: 'googleapis.com',
      metadata: {
        service: 'cloudidentity.googleapis.com',
        consumer: 'projects/504652170406',
        activationUrl: 'https://console.developers.google.com/apis/api/cloudidentity.googleapis.com/overview?project=504652170406'
      }
    }]
  }
});

t('une API désactivée restitue son URL d\'activation complète', () => {
  const m = api.diagnostiquerReponse_(403, CORPS_SERVICE_DESACTIVE, 'cloudidentity.googleapis.com');
  if (!/overview\?project=504652170406/.test(m)) {
    throw new Error('URL d\'activation tronquée ou absente : ' + m);
  }
  if (!/API NON ACTIVÉE/.test(m)) throw new Error('cause non identifiée : ' + m);
  if (!/projet GCP standard/.test(m)) throw new Error('piste du projet par défaut absente');
});

t('l\'URL est reconstruite si activationUrl manque', () => {
  const corps = JSON.stringify({ error: { code: 403, message: 'API is disabled.', details: [
    { reason: 'SERVICE_DISABLED', metadata: { service: 'admin.googleapis.com', consumer: 'projects/42' } }] } });
  const m = api.diagnostiquerReponse_(403, corps);
  if (!/apis\/library\/admin\.googleapis\.com\?project=42/.test(m)) throw new Error(m);
});

t('un 403 ordinaire oriente vers le rôle super admin', () => {
  const m = api.diagnostiquerReponse_(403, JSON.stringify({ error: { message: 'Not Authorized.' } }));
  if (!/SUPER ADMIN/.test(m)) throw new Error(m);
  if (/API NON ACTIVÉE/.test(m)) throw new Error('diagnostic erroné : ' + m);
});

t('un corps non JSON ne fait pas échouer le diagnostic', () => {
  const m = api.diagnostiquerReponse_(500, '<html>Internal Error</html>');
  if (!/HTTP 500/.test(m) || !/Internal Error/.test(m)) throw new Error(m);
});

t.bilan();
