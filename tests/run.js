// Lance tous les tests du dossier. Exécution : npm test — ou node tests/run.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const fichiers = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let echecs = 0;
fichiers.forEach(f => {
  console.log('\n\x1b[1m── ' + f + ' ' + '─'.repeat(Math.max(0, 56 - f.length)) + '\x1b[0m');
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' }));
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || '');
    echecs++;
  }
});
console.log('\n' + (echecs ? `\x1b[31m${echecs} fichier(s) de test en échec\x1b[0m`
                            : `\x1b[32mTous les tests passent (${fichiers.length} fichiers)\x1b[0m`));
process.exit(echecs ? 1 : 0);
