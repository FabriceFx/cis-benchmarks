// Configuration ESLint (format « flat », ESLint 9+).
// Les fichiers .gs sont du JavaScript : on les déclare explicitement, ESLint
// ne reconnaissant pas cette extension par défaut.
const globals = require('globals');

module.exports = [
  {
    files: ['**/*.gs'],
    languageOptions: {
      ecmaVersion: 2020,          // moteur V8 d'Apps Script
      sourceType: 'script',
      globals: {
        // Services Apps Script et services avancés activés dans le manifeste.
        SpreadsheetApp: 'readonly', HtmlService: 'readonly', UrlFetchApp: 'readonly',
        MailApp: 'readonly', CacheService: 'readonly', PropertiesService: 'readonly',
        LockService: 'readonly', ScriptApp: 'readonly', Session: 'readonly',
        Utilities: 'readonly', Logger: 'readonly',
        AdminDirectory: 'readonly', GroupsSettings: 'readonly'
      }
    },
    rules: {
      // Apps Script partage UNE portée globale entre tous les fichiers : une
      // fonction de 04_Policy.gs appelée depuis 07_Controles.gs est parfaitement
      // valide, mais ESLint analyse fichier par fichier et la signalerait.
      // La cohérence des références est vérifiée autrement : tests/aide.js
      // concatène les fichiers et les évalue, ce qui fait échouer les tests sur
      // toute référence manquante.
      'no-undef': 'off',
      // Pour la même raison, « vars: local » : une fonction de premier niveau
      // n'est jamais « inutilisée », elle est appelée depuis un autre fichier
      // ou par le client via google.script.run. Seules les variables locales
      // réellement mortes sont signalées.
      // « caughtErrors: none » : plusieurs catch sont volontairement muets,
      // avec un commentaire qui l'explique (meilleur effort non bloquant).
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'valid-typeof': 'error',
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'warn',
      'prefer-const': 'warn'
    }
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { args: 'none' }] }
  },
  { ignores: ['node_modules/**', 'Index.html'] }
];
