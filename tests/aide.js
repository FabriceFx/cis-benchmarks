// Chargement du code Apps Script dans Node, pour les tests.
// Apps Script partage une portée globale entre les fichiers : on reproduit ce
// chargement en les concaténant dans l'ordre alphabétique, celui de clasp.
// Les services Google sont remplacés par des doublures minimales — aucun test
// n'appelle le réseau ni une API Google.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

const DOUBLURES = `
var __appelsDns = [];
var UrlFetchApp = { fetch: function (url) {
  __appelsDns.push(url);
  var rep = (typeof __reponseDns === 'function') ? __reponseDns(url) : { Status: 0, Answer: [] };
  return { getResponseCode: function () { return rep.__code || 200; },
           getContentText: function () { return JSON.stringify(rep); } };
} };
var __reponseDns = null;
var Utilities = {
  sleep: function () {}, getUuid: function () { return 'jeton-test'; },
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
var CacheService = { getUserCache: function () { return {
  get: function () { return null; }, put: function () {},
  putAll: function () {}, getAll: function () { return {}; } }; } };
var PropertiesService = { getScriptProperties: function () { return {
  getProperties: function () { return {}; }, getProperty: function () { return null; },
  setProperty: function () {}, deleteProperty: function () {} }; } };
var LockService = { getScriptLock: function () { return {
  tryLock: function () { return true; }, releaseLock: function () {} }; } };
var ScriptApp = { getOAuthToken: function () { return 'jeton'; } };
var SpreadsheetApp = null, MailApp = null, HtmlService = null;
var AdminDirectory = null, GroupsSettings = null;
`;

function charger(exports) {
  const src = fs.readdirSync(RACINE).filter(f => f.endsWith('.gs')).sort()
    .map(f => fs.readFileSync(path.join(RACINE, f), 'utf8')).join('\n');
  return new Function(DOUBLURES + src + '\n; return { ' + exports.join(', ') + ' };')();
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
