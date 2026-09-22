// Cohérence entre le code et le manifeste appsscript.json.
// Exécution : node tests/manifeste.test.js
//
// Un scope manquant ne se voit qu'en production, au moment où l'appel échoue
// chez un utilisateur. Ce test relie chaque service réellement appelé dans le
// code au scope OAuth qu'il exige. L'oubli du scope orgunit lors de l'ajout de
// l'évaluation par unité organisationnelle (5.2.0) aurait été attrapé ici.
const fs = require('fs');
const path = require('path');
const { suite, RACINE } = require('./aide.js');

const t = suite();
const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'appsscript.json'), 'utf8'));
const code = fs.readdirSync(RACINE).filter(f => f.endsWith('.gs')).sort()
  .map(f => fs.readFileSync(path.join(RACINE, f), 'utf8')).join('\n');

const B = 'https://www.googleapis.com/auth/';
const EXIGENCES = [
  [/AdminDirectory\.Users\./,      B + 'admin.directory.user.readonly'],
  [/AdminDirectory\.Groups\./,     B + 'admin.directory.group.readonly'],
  [/AdminDirectory\.Domains\./,    B + 'admin.directory.domain.readonly'],
  [/AdminDirectory\.Orgunits\./,   B + 'admin.directory.orgunit.readonly'],
  [/AdminDirectory\.Tokens\./,     B + 'admin.directory.user.security'],
  [/GroupsSettings\.Groups\./,     B + 'apps.groups.settings'],
  [/cloudidentity\.googleapis\.com/, B + 'cloud-identity.policies.readonly'],
  [/SpreadsheetApp\.create/,       B + 'spreadsheets'],
  [/UrlFetchApp\.fetch/,           B + 'script.external_request'],
  [/MailApp\.sendEmail/,           B + 'script.send_mail'],
];

t('chaque service appelé dispose de son scope OAuth', () => {
  const manquants = EXIGENCES
    .filter(([motif, scope]) => motif.test(code) && !manifeste.oauthScopes.includes(scope))
    .map(([motif, scope]) => scope + ' (requis par ' + motif.source + ')');
  if (manquants.length) throw new Error(manquants.join(' ; '));
});

t('aucun scope déclaré sans usage identifiable', () => {
  // Principe du moindre privilège : un scope superflu élargit le consentement
  // demandé au super administrateur. Les deux scopes d'identité sont attendus.
  const justifies = new Set(EXIGENCES.filter(([m]) => m.test(code)).map(([, s]) => s)
    .concat([B + 'userinfo.email']));
  const superflus = manifeste.oauthScopes.filter(s => !justifies.has(s));
  if (superflus.length) {
    throw new Error(superflus.join(', ') + " — retirer, ou compléter EXIGENCES si l'usage est légitime");
  }
});

t('les services avancés du manifeste correspondent aux symboles utilisés', () => {
  const declares = new Set((manifeste.dependencies.enabledAdvancedServices || []).map(s => s.userSymbol));
  const manquants = ['AdminDirectory', 'GroupsSettings'].filter(s =>
    new RegExp('\\b' + s + '\\.').test(code) && !declares.has(s));
  if (manquants.length) throw new Error(manquants.join(', '));
});

t('le déploiement web reste conforme au modèle de sécurité', () => {
  // executeAs USER_ACCESSING : l'audit s'exécute avec les droits de
  // l'utilisateur, jamais avec ceux du propriétaire du script. Passer à
  // USER_DEPLOYING donnerait à tout le domaine les droits du super admin
  // propriétaire — le contrôle d'accès de 02_Securite.gs suppose ce réglage.
  if (manifeste.webapp.executeAs !== 'USER_ACCESSING') {
    throw new Error('webapp.executeAs = ' + manifeste.webapp.executeAs + ' au lieu de USER_ACCESSING');
  }
  if (!['DOMAIN', 'MYSELF'].includes(manifeste.webapp.access)) {
    throw new Error('webapp.access = ' + manifeste.webapp.access + ' — diffusion hors du domaine');
  }
});

t('le runtime V8 est bien déclaré', () => {
  if (manifeste.runtimeVersion !== 'V8') throw new Error(String(manifeste.runtimeVersion));
});

t("la version du code et celle de package.json coïncident", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
  const m = code.match(/VERSION:\s*'([^']+)'/);
  if (!m) throw new Error('CONFIG.VERSION introuvable');
  if (m[1] !== pkg.version) {
    throw new Error('CONFIG.VERSION = ' + m[1] + ' mais package.json = ' + pkg.version);
  }
});

t('le CHANGELOG documente la version courante', () => {
  const journal = fs.readFileSync(path.join(RACINE, 'CHANGELOG.md'), 'utf8');
  const m = code.match(/VERSION:\s*'([^']+)'/);
  if (!journal.includes('## [' + m[1] + ']')) {
    throw new Error('aucune entrée « ## [' + m[1] + '] » dans CHANGELOG.md');
  }
});

t.bilan();
