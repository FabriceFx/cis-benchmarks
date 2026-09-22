// Chargement du code Apps Script dans Node, pour les tests.
// Apps Script partage une portée globale entre les fichiers : on reproduit ce
// chargement en les concaténant dans l'ordre alphabétique, celui de clasp.
// Les services Google sont remplacés par des doublures minimales — aucun test
// n'appelle le réseau ni une API Google.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

const DOUBLURES = `
// Réseau simulé. __dns.appels enregistre chaque requête — ce qui permet de
// vérifier qu'une résolution n'a PAS eu lieu — et __dns.reponse permet au test
// de scénariser SERVFAIL, NXDOMAIN ou une réponse valide.
var __dns = { appels: [], reponse: null };
var UrlFetchApp = { fetch: function (url) {
  __dns.appels.push(url);
  var rep = (typeof __dns.reponse === 'function') ? __dns.reponse(url) : { Status: 0, Answer: [] };
  return { getResponseCode: function () { return rep.__code || 200; },
           getContentText: function () { return JSON.stringify(rep); } };
} };

// Services Admin SDK scénarisables : __google.groupes fournit la liste,
// __google.reglages répond (ou lève) pour chaque groupe, et __google.appels
// compte les lectures réellement effectuées.
var __google = { groupes: [], reglages: null, appels: 0, pause: 0 };
var AdminDirectory = { Groups: { list: function () {
  return { groups: __google.groupes.slice(), nextPageToken: null };
} } };
var GroupsSettings = { Groups: { get: function (email) {
  __google.appels++;
  if (typeof __google.reglages === 'function') return __google.reglages(email);
  return { whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW' };
} } };
var Utilities = {
  sleep: function (ms) { __google.pause += ms; }, getUuid: function () { return 'jeton-test'; },
  formatDate: function () { return '2026-01-01'; },
  gzip: function (b) { return b; }, ungzip: function (b) { return b; },
  newBlob: function (c) { return { getBytes: function () { return c; },
                                   getDataAsString: function () { return c; } }; },
  base64Encode: function (v) { return String(v); },
  base64Decode: function (v) { return String(v); }
};
var Session = {
  getScriptTimeZone: function () { return 'Europe/Paris'; },
  getEffectiveUser: function () { return { getEmail: function () { return 'admin@example.test'; } }; },
  getActiveUser: function () { return { getEmail: function () { return 'admin@example.test'; } }; }
};
var Logger = { log: function () {} };
// Cache réellement fonctionnel, en mémoire : permet de tester la couche de
// persistance de session (sauvegarderPartie_ / chargerContexte_) telle quelle.
var __cache = {};
var CacheService = { getUserCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(__cache, k) ? __cache[k] : null; },
  put: function (k, v) { __cache[k] = v; },
  putAll: function (o) { Object.keys(o).forEach(function (k) { __cache[k] = o[k]; }); },
  remove: function (k) { delete __cache[k]; },
  getAll: function (cles) {
    var r = {};
    cles.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(__cache, k)) r[k] = __cache[k]; });
    return r;
  } }; } };
var __props = {};
var PropertiesService = { getScriptProperties: function () { return {
  getProperties: function () { return __props; },
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(__props, k) ? __props[k] : null; },
  setProperty: function (k, v) { __props[k] = v; },
  deleteProperty: function (k) { delete __props[k]; } }; } };
var LockService = { getScriptLock: function () { return {
  tryLock: function () { return true; }, releaseLock: function () {} }; } };
var ScriptApp = { getOAuthToken: function () { return 'jeton'; } };
// Classeur enregistreur : chaque cellule retient sa valeur et sa mise en forme,
// ce qui permet de vérifier la restitution sans appeler Google Sheets.
var __classeurs = [];
function __feuille(nom) {
  var cellules = {};
  var cle = function (l, c) { return l + ':' + c; };
  var cel = function (l, c) {
    var k = cle(l, c);
    if (!cellules[k]) cellules[k] = { valeur: '', fond: null, graisse: null, couleur: null, taille: null, retour: null };
    return cellules[k];
  };
  var plage = function (l, c, nl, nc) {
    var appliquer = function (matrice, champ) {
      for (var i = 0; i < nl; i++) for (var j = 0; j < nc; j++) {
        var v = matrice[i] ? matrice[i][j] : undefined;
        if (v !== undefined) cel(l + i, c + j)[champ] = v;
      }
      return r;
    };
    var uniforme = function (v, champ) {
      for (var i = 0; i < nl; i++) for (var j = 0; j < nc; j++) cel(l + i, c + j)[champ] = v;
      return r;
    };
    var r = {
      setValues: function (m) { return appliquer(m, 'valeur'); },
      setBackgrounds: function (m) { return appliquer(m, 'fond'); },
      setFontWeights: function (m) { return appliquer(m, 'graisse'); },
      setFontColors: function (m) { return appliquer(m, 'couleur'); },
      setValue: function (v) { return uniforme(v, 'valeur'); },
      setBackground: function (v) { return uniforme(v, 'fond'); },
      setFontWeight: function (v) { return uniforme(v, 'graisse'); },
      setFontColor: function (v) { return uniforme(v, 'couleur'); },
      setFontSize: function (v) { return uniforme(v, 'taille'); },
      setWrap: function (v) { return uniforme(v, 'retour'); }
    };
    return r;
  };
  var f = {
    nom: nom, cellules: cellules,
    setName: function (n) { f.nom = n; return f; },
    getRange: function (l, c, nl, nc) { return plage(l, c, nl === undefined ? 1 : nl, nc === undefined ? 1 : nc); },
    setFrozenRows: function () { return f; },
    setColumnWidth: function () { return f; },
    // lecture pratique pour les tests
    ligne: function (l) {
      var o = [];
      for (var j = 1; j <= 12; j++) o.push(cellules[cle(l, j)] || null);
      return o;
    },
    valeurs: function () {
      var max = 0;
      Object.keys(cellules).forEach(function (k) { max = Math.max(max, Number(k.split(':')[0])); });
      var t = [];
      for (var i = 1; i <= max; i++) t.push([(cellules[cle(i, 1)] || {}).valeur, (cellules[cle(i, 2)] || {}).valeur]);
      return t;
    }
  };
  return f;
}
var SpreadsheetApp = { create: function (nom) {
  var feuilles = [__feuille('Feuille 1')];
  var ss = {
    nom: nom, feuilles: feuilles,
    getSheets: function () { return feuilles; },
    insertSheet: function (n) { var f = __feuille(n); feuilles.push(f); return f; },
    getUrl: function () { return 'https://sheets.test/' + feuilles.length; }
  };
  __classeurs.push(ss);
  return ss;
} };
var MailApp = null, HtmlService = null;

`;

function charger(exports) {
  const src = fs.readdirSync(RACINE).filter(f => f.endsWith('.gs')).sort()
    .map(f => fs.readFileSync(path.join(RACINE, f), 'utf8')).join('\n');
  return new Function(DOUBLURES + src +
    '\n; return { ' + exports.concat(['__cache', '__props', '__classeurs', '__dns', '__google']).join(', ') + ' };')();
}

// Micro-harnais : pas de dépendance, sortie lisible, code de sortie exploitable en CI.
function suite() {
  const resultats = [];
  const t = (nom, fn) => {
    try { fn(); resultats.push(['ok  ', nom]); }
    catch (e) { resultats.push(['KO  ', nom + ' → ' + e.message]); }
  };
  t.bilan = () => {
    resultats.forEach(([st, n]) => console.log(st + n));
    const ko = resultats.filter(x => x[0].trim() === 'KO');
    console.log('\n' + (resultats.length - ko.length) + '/' + resultats.length + ' tests passés');
    process.exit(ko.length ? 1 : 0);
  };
  return t;
}

module.exports = { charger, suite, RACINE };
