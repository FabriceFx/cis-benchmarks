// Tests du moteur d'évaluation par périmètre (unité organisationnelle).
// Exécution : node tests/perimetres.test.js — aucune dépendance externe.
// Code.gs est évalué tel quel : aucune API Google n'est appelée au chargement.
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
// Apps Script partage une portée globale entre les fichiers : on reproduit le
// chargement en les concaténant dans l'ordre alphabétique, celui de clasp.
const src = fs.readdirSync(racine).filter(f => f.endsWith('.gs')).sort()
  .map(f => fs.readFileSync(path.join(racine, f), 'utf8')).join('\n');
const api = new Function(src + `
  return { STATUT, evaluerParPerimetre_, libellePerimetre_, indexerPolitiques_, resumePerimetres_ };
`)();
const { STATUT, evaluerParPerimetre_, indexerPolitiques_ } = api;

const P = (ou, val, type) => ({ type: type || 'ADMIN', policyQuery: { orgUnit: 'orgUnits/' + ou },
                                setting: { type: 'settings/drive.ext', value: val } });
const ctx = (pols, unites) => ({ policies: pols, policyIndex: indexerPolitiques_(pols),
                                 unites: unites || { 'ou_prod': '/Production', 'ou_it': '/IT' } });
const EV = v => v.partage === undefined ? null : v.partage === 'OFF';
const T = [];
const t = (nom, fn) => { try { fn(); T.push(['ok  ', nom]); } catch (e) { T.push(['KO  ', nom + ' → ' + e.message]); } };
const eq = (a, b, q) => { if (a !== b) throw new Error((q||'') + ' attendu ' + b + ', obtenu ' + a); };

t('racine conforme + UO fille permissive => NON CONFORME', () => {
  const r = evaluerParPerimetre_(ctx([P('racine123', {partage:'OFF'}), P('ou_prod', {partage:'ON'})]), 'drive.ext', EV, 'partage externe désactivé');
  eq(r.statut, STATUT.FAIL, 'statut');
  if (!/ÉCART sur 1\/2/.test(r.detail)) throw new Error('décompte absent : ' + r.detail);
  if (!/\/Production/.test(r.detail)) throw new Error('UO fille non nommée : ' + r.detail);
  if (!/\/ \(racine\)/.test(r.detail)) throw new Error('racine non identifiée : ' + r.detail);
});
t('tous périmètres conformes => CONFORME', () => {
  eq(evaluerParPerimetre_(ctx([P('racine123',{partage:'OFF'}), P('ou_it',{partage:'OFF'})]), 'drive.ext', EV, 'x').statut, STATUT.PASS);
});
t('un périmètre indéterminé, reste conforme => À VÉRIFIER', () => {
  const r = evaluerParPerimetre_(ctx([P('racine123',{partage:'OFF'}), P('ou_it',{autre:1})]), 'drive.ext', EV, 'x');
  eq(r.statut, STATUT.REVIEW, 'statut');
});
t('un écart prime sur un indéterminé => NON CONFORME', () => {
  eq(evaluerParPerimetre_(ctx([P('ou_it',{autre:1}), P('ou_prod',{partage:'ON'})]), 'drive.ext', EV, 'x').statut, STATUT.FAIL);
});
t('réglage absent => null (le contrôle remontera À VÉRIFIER)', () => {
  if (evaluerParPerimetre_(ctx([]), 'drive.ext', EV, 'x') !== null) throw new Error('non null');
});
t('ADMIN prime sur SYSTEM', () => {
  const r = evaluerParPerimetre_(ctx([P('racine123',{partage:'ON'}), P('sys',{partage:'OFF'},'SYSTEM')]), 'drive.ext', EV, 'x');
  eq(r.source, 'ADMIN', 'source'); eq(r.total, 1, 'total'); eq(r.statut, STATUT.FAIL, 'statut');
});
t('sans ADMIN, le défaut SYSTEM est évalué', () => {
  const r = evaluerParPerimetre_(ctx([P('sys',{partage:'ON'},'SYSTEM')]), 'drive.ext', EV, 'x');
  eq(r.source, 'SYSTEM (défaut Google)', 'source'); eq(r.statut, STATUT.FAIL, 'statut');
});
t('préfixe "Attendu : " préservé pour le plan d\'actions', () => {
  const r = evaluerParPerimetre_(ctx([P('ou_prod',{partage:'ON'})]), 'drive.ext', EV, 'partage externe désactivé');
  const m = r.detail.match(/Attendu : ([^|]+)/);
  if (!m || m[1].trim() !== 'partage externe désactivé') throw new Error('extraction cassée : ' + r.detail);
});
t('évaluateur qui lève => indéterminé, pas de crash', () => {
  const r = evaluerParPerimetre_(ctx([P('ou_prod',{})]), 'drive.ext', () => { throw new Error('boum'); }, 'x');
  eq(r.statut, STATUT.REVIEW, 'statut');
});
t('liste de périmètres bornée à 10', () => {
  const many = Array.from({length: 14}, (_, i) => P('ou_' + i, {partage:'ON'}));
  const r = evaluerParPerimetre_(ctx(many, {}), 'drive.ext', EV, 'x');
  if (!/… et 4 autre\(s\)/.test(r.detail)) throw new Error('pas de bornage : ' + r.detail.slice(0,300));
});
T.forEach(([st, n]) => console.log(st + n));
const ko = T.filter(x => x[0].trim() === 'KO');
console.log('\n' + (T.length - ko.length) + '/' + T.length + ' tests passés');
process.exit(ko.length ? 1 : 0);
