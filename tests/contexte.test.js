// Couche de persistance de session : assemblage du contexte d'audit.
// Exécution : node tests/contexte.test.js
//
// Le harnais fournit un CacheService réellement fonctionnel : les fonctions
// sauvegarderPartie_ / chargerContexte_ sont exercées telles quelles, sans
// réécriture de leur logique dans le test.
const { charger, suite } = require('./aide.js');
const t = suite();

const api = charger([
  'sauvegarderPartie_', 'chargerPartie_', 'chargerContexte_', 'niveauSession_', 'CONFIG',
  'consoliderResultats_', 'chargerResultats_', 'sauvegarderResultat_', 'envoyerRapportEmail',
  'DEFINITION_CONTROLES', 'STATUT'
]);
const JETON = 'jeton-test';

const poser = parties => {
  Object.keys(api.__cache).forEach(k => delete api.__cache[k]);
  Object.keys(parties).forEach(p => api.sauvegarderPartie_(JETON, p, parties[p]));
};

const ADMIN = (mail, extra) => Object.assign(
  { primaryEmail: mail, isAdmin: true, isDelegatedAdmin: false, suspended: false }, extra || {});

t('une partie sauvegardée est relue à l\'identique', () => {
  poser({ dom: ['a.test', 'b.test'] });
  const r = api.chargerPartie_(JETON, 'dom');
  if (JSON.stringify(r) !== JSON.stringify(['a.test', 'b.test'])) throw new Error(JSON.stringify(r));
});

t('session absente du cache => erreur explicite', () => {
  poser({});
  let leve = false;
  try { api.chargerContexte_(JETON); } catch (e) { leve = /expirée ou introuvable/.test(e.message); }
  if (!leve) throw new Error('aucune erreur explicite');
});

// Le correctif : les super admins viennent d'une requête ciblée isAdmin=true,
// exhaustive quel que soit l'effectif. Les déduire de la liste plafonnée à
// MAX_UTILISATEURS laissait échapper tout compte au-delà du plafond.
t('les super admins proviennent du recensement ciblé, pas de la liste plafonnée', () => {
  poser({
    dom: ['a.test'], pol: [], usr: [ADMIN('dans-le-plafond@a.test')],
    adm: { ok: true, liste: [ADMIN('dans-le-plafond@a.test'), ADMIN('zoe.admin@a.test')] }
  });
  const ctx = api.chargerContexte_(JETON);
  if (ctx.superAdmins.length !== 2) throw new Error(ctx.superAdmins.length + ' super admin(s)');
  if (!ctx.superAdmins.some(u => u.primaryEmail === 'zoe.admin@a.test')) {
    throw new Error('le compte hors plafond est absent');
  }
  if (ctx.superAdminsExhaustifs !== true) throw new Error('non marqué exhaustif');
});

t('un super admin suspendu est exclu du décompte', () => {
  poser({ dom: ['a.test'], pol: [],
          adm: { ok: true, liste: [ADMIN('a@a.test'), ADMIN('b@a.test', { suspended: true })] } });
  const ctx = api.chargerContexte_(JETON);
  if (ctx.superAdmins.length !== 1) throw new Error(ctx.superAdmins.length);
});

t('recensement ciblé absent => repli plafonné, signalé et non marqué exhaustif', () => {
  poser({ dom: ['a.test'], pol: [], usr: [ADMIN('a@a.test'), { primaryEmail: 'u@a.test', isAdmin: false }] });
  const ctx = api.chargerContexte_(JETON);
  if (ctx.superAdmins.length !== 1) throw new Error(ctx.superAdmins.length);
  if (ctx.superAdminsExhaustifs !== false) throw new Error('marqué exhaustif à tort');
  if (!ctx.erreurs.some(e => /Recensement ciblé/.test(e))) {
    throw new Error('le repli n\'est pas signalé dans les avertissements de collecte');
  }
});

// Distinction critique : table vide mais collectée (tenant sans sous-UO) vs
// collecte en échec. Les confondre ferait basculer tout le référentiel en
// À VÉRIFIER pour le cas le plus courant.
t('tenant sans sous-UO : table vide mais collecte marquée réussie', () => {
  poser({ dom: ['a.test'], pol: [], uo: { ok: true, table: {} } });
  const ctx = api.chargerContexte_(JETON);
  if (ctx.unitesCollectees !== true) throw new Error('collecte non reconnue');
  if (Object.keys(ctx.unites).length !== 0) throw new Error('table non vide');
});

t('étape UO absente => collecte non marquée, héritage indéterminable', () => {
  poser({ dom: ['a.test'], pol: [] });
  const ctx = api.chargerContexte_(JETON);
  if (ctx.unitesCollectees !== false) throw new Error('marquée collectée à tort');
});

t('le niveau de profil de la session fait foi', () => {
  poser({ dom: ['a.test'], pol: [], cfg: { niveau: 'L1' } });
  if (api.niveauSession_(JETON) !== 'L1') throw new Error(api.niveauSession_(JETON));
  if (api.chargerContexte_(JETON).niveau !== 'L1') throw new Error('non propagé au contexte');
});

t('consolidation du cache : la partition compacte est créée et les clés individuelles restent en filet de sécurité', () => {
  poser({ cfg: { niveau: 'L1' } });
  api.sauvegarderResultat_(JETON, { id: '1.1.1', level: 'L1', statut: 'CONFORME', detail: 'OK' });
  const cleIndiv = 'cisr_' + JETON + '_1.1.1';
  if (!api.__cache[cleIndiv]) throw new Error('clé individuelle non présente');

  const ok = api.consoliderResultats_(JETON);
  if (!ok) throw new Error('consoliderResultats_ a échoué');
  if (!api.__cache[cleIndiv]) throw new Error('la clé individuelle doit être conservée comme filet de sécurité');

  const relu = api.chargerResultats_(JETON);
  if (!Array.isArray(relu) || relu.length !== api.DEFINITION_CONTROLES.length) {
    throw new Error('résultats incomplets après consolidation : ' + (relu && relu.length));
  }
  const ctrl111 = relu.find(r => r.id === '1.1.1');
  if (!ctrl111 || ctrl111.statut !== 'CONFORME') throw new Error('statut 1.1.1 corrompu après consolidation');
});

t('consolidation résiliente : un échec de relecture préserve les clés individuelles', () => {
  poser({ cfg: { niveau: 'L1' } });
  api.sauvegarderResultat_(JETON, { id: '1.1.1', level: 'L1', statut: 'CONFORME', detail: 'OK' });
  const cleIndiv = 'cisr_' + JETON + '_1.1.1';

  // Partition consolidée incomplète (longueur != DEFINITION_CONTROLES.length)
  api.sauvegarderPartie_(JETON, 'res', [{ id: '1.1.1', statut: 'CONFORME' }]);
  // chargerResultats_ refuse la partition tronquée et retombe sur les clés individuelles
  const relu = api.chargerResultats_(JETON);
  if (relu.length !== api.DEFINITION_CONTROLES.length) throw new Error('la partition tronquée a été acceptée à tort');
  if (!api.__cache[cleIndiv]) throw new Error('clé individuelle perdue');
});

t('consolidation : une éviction ultérieure de la partition retombe sur les clés individuelles', () => {
  // Le mode de défaillance que la conservation des clés individuelles écarte :
  // la partition consolidée est écrite correctement, puis évincée plus tard
  // dans la session. Sans filet, l'export échouait sans recours.
  poser({ cfg: { niveau: 'L1' } });
  api.sauvegarderResultat_(JETON, { id: '1.1.1', level: 'L1', statut: 'CONFORME', detail: 'OK' });
  api.sauvegarderResultat_(JETON, { id: '1.1.2', level: 'L1', statut: 'NON CONFORME', detail: 'écart' });
  if (!api.consoliderResultats_(JETON)) throw new Error('consolidation échouée');

  Object.keys(api.__cache).filter(k => /_res_/.test(k)).forEach(k => delete api.__cache[k]);

  const relu = api.chargerResultats_(JETON);
  if (relu.length !== api.DEFINITION_CONTROLES.length) throw new Error('repli incomplet : ' + relu.length);
  if (relu.find(r => r.id === '1.1.1').statut !== 'CONFORME') throw new Error('1.1.1 perdu');
  if (relu.find(r => r.id === '1.1.2').statut !== 'NON CONFORME') throw new Error('1.1.2 perdu');
});

t('envoi e-mail : un quota quotidien insuffisant bloque l\'envoi avec message explicite', () => {
  poser({ dom: ['example.test'], cfg: { niveau: 'L1' } });
  api.sauvegarderResultat_(JETON, { id: '1.1.1', level: 'L1', statut: 'CONFORME', detail: 'OK' });
  api.consoliderResultats_(JETON);

  api.__mail.quota = 0;
  let leve = false;
  try {
    api.envoyerRapportEmail(JETON, { destinataires: 'admin@example.test' }, 'fr');
  } catch (e) {
    leve = /quota quotidien d'envoi d'e-mails insuffisant/i.test(e.message);
  }
  if (!leve) throw new Error('aucune exception explicite levée sur quota 0');

  // Quota suffisant => l'e-mail part
  api.__mail.quota = 1500;
  api.__mail.envois = [];
  const rep = api.envoyerRapportEmail(JETON, { destinataires: 'admin@example.test' }, 'fr');
  if (!rep || rep.destinataires !== 'admin@example.test') throw new Error('envoi échoué malgré quota');
  if (api.__mail.envois.length !== 1) throw new Error('aucun e-mail consigné dans le mock');
});

t.bilan();
