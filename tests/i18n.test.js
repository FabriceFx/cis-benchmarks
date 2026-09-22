// Cohérence bilingue FR/EN du référentiel de contrôles.
// Exécution : node tests/i18n.test.js — aucune dépendance externe.
//
// C'est ce test qui aurait attrapé les remediationEn erronées des contrôles
// 6.1 à 6.8, recopiées des chapitres Gmail et Groups : une procédure anglaise
// qui nomme une application absente de la procédure française est presque
// toujours un copier-coller depuis le mauvais chapitre du benchmark.
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const src = fs.readdirSync(racine).filter(f => f.endsWith('.gs')).sort()
  .map(f => fs.readFileSync(path.join(racine, f), 'utf8')).join('\n');
const api = new Function(src + `
  return { DEFINITION_CONTROLES, RISQUES, TRADUCTIONS_SERVEUR, STATUT, risquePour_, risquePourEn_ };
`)();

const T = [];
const t = (nom, fn) => { try { fn(); T.push(['ok  ', nom]); } catch (e) { T.push(['KO  ', nom + ' → ' + e.message]); } };
const vide = v => v === undefined || v === null || String(v).trim() === '';

const CTRL = api.DEFINITION_CONTROLES;

t('87 contrôles, identifiants uniques', () => {
  if (CTRL.length !== 87) throw new Error(CTRL.length + ' contrôles');
  const vus = new Set();
  CTRL.forEach(c => { if (vus.has(c.id)) throw new Error('doublon ' + c.id); vus.add(c.id); });
});

t('chaque contrôle a un titre et une remédiation dans les deux langues', () => {
  const ko = [];
  CTRL.forEach(c => ['titre', 'titreEn', 'remediation', 'remediationEn'].forEach(champ => {
    if (vide(c[champ])) ko.push(c.id + '.' + champ);
  }));
  if (ko.length) throw new Error(ko.join(', '));
});

t('chaque contrôle a un niveau L1 ou L2 et une fonction de vérification', () => {
  const ko = CTRL.filter(c => !['L1', 'L2'].includes(c.level) || typeof c.check !== 'function');
  if (ko.length) throw new Error(ko.map(c => c.id).join(', '));
});

t('chaque contrôle a un risque renseigné dans les deux langues', () => {
  const ko = CTRL.filter(c => !api.RISQUES[c.id] || vide(api.RISQUES[c.id].fr) || vide(api.RISQUES[c.id].en));
  if (ko.length) throw new Error(ko.map(c => c.id).join(', '));
});

t('aucun risque orphelin dans le référentiel', () => {
  const ids = new Set(CTRL.map(c => c.id));
  const orphelins = Object.keys(api.RISQUES).filter(id => !ids.has(id));
  if (orphelins.length) throw new Error(orphelins.join(', '));
});

// Procédures anglaises légitimement communes à plusieurs contrôles : le
// benchmark CIS renvoie parfois plusieurs recommandations vers un même écran
// de la console. Toute AUTRE duplication est presque toujours un copier-coller
// depuis le mauvais chapitre — c'était le cas des contrôles 6.1 à 6.3 et 6.8
// (corrigés en 5.1.0) puis de 4.3.1 et 4.3.2, qui pointaient la protection
// anti-usurpation Gmail au lieu du tableau de bord Sécurité.
// Avant d'ajouter un groupe ici, vérifier dans le PDF officiel que la
// procédure est réellement commune.
const DOUBLONS_LEGITIMES = [
  ['3.1.2.1.1.1', '3.1.2.1.1.4'],
  ['3.1.2.1.1.2', '3.1.2.1.1.3', '3.1.2.1.1.6'],
  ['3.1.2.1.2.2', '3.1.2.1.2.3'],
  ['3.1.3.4.3.1', '3.1.3.4.3.2'],
  ['3.1.3.6.1', '3.1.3.6.2'],
  ['3.1.3.7.1', '3.1.3.7.2'],
  ['3.1.6.1', '3.1.6.3'],
].map(g => g.join(','));

t('aucune remédiation anglaise dupliquée hors des cas recensés', () => {
  const par = new Map();
  CTRL.forEach(c => {
    const cle = c.remediationEn.trim();
    if (!par.has(cle)) par.set(cle, []);
    par.get(cle).push(c.id);
  });
  const inattendus = [...par.values()]
    .filter(ids => ids.length > 1)
    .map(ids => ids.join(','))
    .filter(g => !DOUBLONS_LEGITIMES.includes(g));
  if (inattendus.length) {
    throw new Error('groupe(s) non recensé(s) : ' + inattendus.join(' | ') +
      " — vérifier qu'il ne s'agit pas d'un copier-coller, sinon compléter DOUBLONS_LEGITIMES");
  }
  const disparus = DOUBLONS_LEGITIMES.filter(g =>
    ![...par.values()].some(ids => ids.join(',') === g));
  if (disparus.length) {
    throw new Error('groupe(s) recensé(s) qui ne correspondent plus : ' + disparus.join(' | ') +
      ' — mettre à jour DOUBLONS_LEGITIMES');
  }
});

t('les dictionnaires serveur FR et EN ont la même structure de clés', () => {
  const cles = (o, prefixe) => Object.keys(o).flatMap(k =>
    (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]))
      ? cles(o[k], prefixe + k + '.') : [prefixe + k]);
  const fr = new Set(cles(api.TRADUCTIONS_SERVEUR.fr, ''));
  const en = new Set(cles(api.TRADUCTIONS_SERVEUR.en, ''));
  const manque = [...fr].filter(k => !en.has(k)).map(k => 'EN manque ' + k)
    .concat([...en].filter(k => !fr.has(k)).map(k => 'FR manque ' + k));
  if (manque.length) throw new Error(manque.join(', '));
});

t('chaque statut a un libellé dans les deux langues', () => {
  const ko = [];
  Object.values(api.STATUT).forEach(s => {
    if (vide(api.TRADUCTIONS_SERVEUR.fr.statuts[s])) ko.push('fr:' + s);
    if (vide(api.TRADUCTIONS_SERVEUR.en.statuts[s])) ko.push('en:' + s);
  });
  if (ko.length) throw new Error(ko.join(', '));
});

t("le dictionnaire client d'Index.html couvre les mêmes clés en FR et EN", () => {
  const html = fs.readFileSync(path.join(racine, 'Index.html'), 'utf8');
  const m = html.match(/const I18N = (\{[\s\S]*?\n  \});/);
  if (!m) throw new Error('dictionnaire I18N introuvable dans Index.html');
  const I18N = new Function('return ' + m[1])();
  const cles = (o, prefixe) => Object.keys(o).flatMap(k =>
    (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]))
      ? cles(o[k], prefixe + k + '.') : [prefixe + k]);
  const fr = new Set(cles(I18N.fr, '')), en = new Set(cles(I18N.en, ''));
  const manque = [...fr].filter(k => !en.has(k)).map(k => 'EN manque ' + k)
    .concat([...en].filter(k => !fr.has(k)).map(k => 'FR manque ' + k));
  if (manque.length) throw new Error(manque.join(', '));
});

T.forEach(([st, n]) => console.log(st + n));
const ko = T.filter(x => x[0].trim() === 'KO');
console.log('\n' + (T.length - ko.length) + '/' + T.length + ' tests passés');
process.exit(ko.length ? 1 : 0);
