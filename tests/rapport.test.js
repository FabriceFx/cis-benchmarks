// Restitution : onglet Synthèse, mise en forme et couverture de l'audit.
// Exécution : node tests/rapport.test.js
//
// Le harnais fournit un classeur enregistreur : chaque cellule retient sa
// valeur et sa mise en forme, ce qui permet de vérifier la restitution sans
// appeler Google Sheets. Ce test encode le défaut livré depuis la 5.0 — des
// plages de lignes codées en dur (A9:B9, A11:B11…) qui se désalignaient dès
// qu'une ligne de métadonnée était insérée.
const { charger, suite } = require('./aide.js');
const t = suite();

const api = charger(['ecrireRapport_', 'STATUT', 'TRADUCTIONS_SERVEUR', 'CONFIG']);
const { STATUT } = api;
const TR = api.TRADUCTIONS_SERVEUR.fr;

const resultat = (id, statut) => ({
  id: id, level: 'L1', titre: 'Contrôle ' + id, titreEn: 'Control ' + id,
  statut: statut, detail: 'Attendu : quelque chose | constat', remediation: 'faire ceci', remediationEn: 'do this'
});

const produire = (ctx, resultats) => {
  api.__classeurs.length = 0;
  Object.keys(api.__props).forEach(k => delete api.__props[k]);
  if (ctx.__journal) api.__props['cis_journal_derog'] = JSON.stringify(ctx.__journal);
  api.ecrireRapport_(resultats || [resultat('1.1.1', STATUT.PASS)], ctx, new Date(), 'fr');
  const ss = api.__classeurs[0];
  return { ss, synthese: ss.feuilles[0] };
};

const CTX = extra => Object.assign({
  domaines: ['example.test'], policies: [], erreurs: [], niveau: 'L2',
  utilisateurs: [], groupes: [], superAdmins: [], superAdminsExhaustifs: true,
  unites: { a: '/A' }, unitesCollectees: true
}, extra || {});

// Retrouve une ligne par son libellé en colonne A, quelle que soit sa position.
const trouver = (feuille, motif) => {
  const lignes = feuille.valeurs();
  for (let i = 0; i < lignes.length; i++) {
    if (String(lignes[i][0]).indexOf(motif) === 0) {
      return { index: i + 1, libelle: lignes[i][0], valeur: lignes[i][1], cellules: feuille.ligne(i + 1) };
    }
  }
  return null;
};

t('chaque décompte de statut porte le fond de son statut', () => {
  const { synthese } = produire(CTX());
  const attendus = {
    [TR.statuts[STATUT.PASS]]: '#d9ead3',
    [TR.statuts[STATUT.FAIL]]: '#f4cccc',
    [TR.statuts[STATUT.ACCEPTED]]: '#dbe5f1',
    [TR.statuts[STATUT.REVIEW]]: '#fce5cd',
    [TR.statuts[STATUT.MANUAL]]: '#d9d9d9',
    [TR.statuts[STATUT.ERROR]]: '#ead1dc',
    [TR.statuts[STATUT.SKIP]]: '#f3f3f3'
  };
  const ko = [];
  Object.keys(attendus).forEach(libelle => {
    const l = trouver(synthese, libelle);
    if (!l) { ko.push(libelle + ' : ligne absente'); return; }
    if (l.cellules[0].fond !== attendus[libelle]) {
      ko.push(libelle + ' : fond ' + l.cellules[0].fond + ' au lieu de ' + attendus[libelle]);
    }
  });
  if (ko.length) throw new Error(ko.join(' ; '));
});

t('aucune ligne de séparation ne reçoit de mise en forme', () => {
  const { synthese } = produire(CTX());
  const lignes = synthese.valeurs();
  const ko = [];
  lignes.forEach((l, i) => {
    if (l[0] !== '' || l[1] !== '') return;
    const c = synthese.ligne(i + 1)[0];
    if (c && (c.fond || c.graisse === 'bold')) ko.push('ligne ' + (i + 1) + ' : fond=' + c.fond + ' graisse=' + c.graisse);
  });
  if (ko.length) throw new Error(ko.join(' ; '));
});

t('un score de 100 % n\'est jamais peint en rouge', () => {
  const { synthese } = produire(CTX(), [resultat('1.1.1', STATUT.PASS), resultat('1.1.2', STATUT.PASS)]);
  ['scoreResiduel', 'scoreBrut'].forEach(cle => {
    const l = trouver(synthese, TR.sheets[cle]);
    if (!l) throw new Error(TR.sheets[cle] + ' : ligne absente');
    if (String(l.valeur).indexOf('100') !== 0) throw new Error(cle + ' = ' + l.valeur);
    if (l.cellules[1].couleur !== '#0f6b3f') throw new Error(cle + ' en ' + l.cellules[1].couleur);
    if (l.cellules[0].fond === '#f4cccc') throw new Error(cle + ' sur fond rouge');
  });
});

t('un score faible est signalé en rouge', () => {
  const { synthese } = produire(CTX(), [resultat('1.1.1', STATUT.FAIL), resultat('1.1.2', STATUT.FAIL)]);
  const l = trouver(synthese, TR.sheets.scoreResiduel);
  if (l.cellules[1].couleur !== '#b3261e') throw new Error('couleur ' + l.cellules[1].couleur);
});

// La couverture : un échantillon tronqué présenté comme complet est trompeur.
t('un recensement de super admins non exhaustif est signalé', () => {
  const ok = produire(CTX({ superAdminsExhaustifs: true })).synthese;
  if (trouver(ok, TR.sheets.superAdminsRecenses).cellules[0].fond) throw new Error('signalé à tort');
  const ko = produire(CTX({ superAdminsExhaustifs: false })).synthese;
  const l = trouver(ko, TR.sheets.superAdminsRecenses);
  if (l.cellules[0].fond !== '#fff3cd') throw new Error('non signalé');
  if (String(l.valeur).indexOf(TR.sheets.parDeduction) === -1) throw new Error('libellé : ' + l.valeur);
});

t('un plafond d\'échantillonnage atteint est signalé', () => {
  const pleins = new Array(api.CONFIG.MAX_UTILISATEURS).fill({ primaryEmail: 'x@a.test' });
  const l = trouver(produire(CTX({ utilisateurs: pleins })).synthese, TR.sheets.utilisateursAnalyses);
  if (String(l.valeur).indexOf(TR.sheets.plafondAtteint) === -1) throw new Error('non signalé : ' + l.valeur);
  if (l.cellules[0].fond !== '#fff3cd') throw new Error('non surligné');
});

t('des unités organisationnelles non collectées sont signalées', () => {
  const l = trouver(produire(CTX({ unitesCollectees: false, unites: {} })).synthese, TR.sheets.unitesRecensees);
  if (String(l.valeur) !== TR.sheets.unitesNonCollectees) throw new Error(l.valeur);
  if (l.cellules[0].fond !== '#fff3cd') throw new Error('non surligné');
});

t('les avertissements de collecte sont restitués et surlignés', () => {
  const l = trouver(produire(CTX({ erreurs: ['Policy API indisponible'] })).synthese, TR.sheets.avertCollecte);
  if (!l) throw new Error('ligne absente');
  if (String(l.valeur).indexOf('Policy API') === -1) throw new Error(l.valeur);
  if (l.cellules[0].fond !== '#fff3cd') throw new Error('non surligné');
});

t('le classeur compte les six onglets attendus', () => {
  const { ss } = produire(CTX());
  const noms = ss.feuilles.map(f => f.nom);
  const attendus = [TR.sheets.nomSynthese, TR.sheets.nomDetail, TR.sheets.nomPlan,
                    TR.sheets.nomDerog, TR.sheets.nomJournal, TR.sheets.nomPolitiques];
  const manquants = attendus.filter(n => noms.indexOf(n) === -1);
  if (manquants.length) throw new Error('manquant : ' + manquants.join(', ') + ' — présents : ' + noms.join(', '));
});

// Le journal était écrit sans qu'aucune fonction ne permette de le relire.
t('le journal des dérogations est restitué, du plus récent au plus ancien', () => {
  const journal = [
    { horodatage: '2026-01-01 10:00:00', action: 'ACCEPTATION', id: '1.1.1', par: 'a@a.test', details: 'motif A' },
    { horodatage: '2026-02-02 11:00:00', action: 'RÉVOCATION', id: '1.1.1', par: 'b@a.test', details: 'motif B' }
  ];
  const { ss } = produire(CTX({ __journal: journal }));
  const f = ss.feuilles.filter(x => x.nom === TR.sheets.nomJournal)[0];
  const l2 = f.ligne(2);
  if (l2[0].valeur !== '2026-02-02 11:00:00') throw new Error('ordre : ' + l2[0].valeur);
  if (l2[1].valeur !== 'RÉVOCATION') throw new Error('action : ' + l2[1].valeur);
  if (f.ligne(3)[3].valeur !== 'a@a.test') throw new Error('auteur : ' + f.ligne(3)[3].valeur);
});

t('un journal vide affiche une mention explicite', () => {
  const { ss } = produire(CTX());
  const f = ss.feuilles.filter(x => x.nom === TR.sheets.nomJournal)[0];
  if (f.ligne(2)[0].valeur !== TR.sheets.aucunJournal) throw new Error(f.ligne(2)[0].valeur);
});

t.bilan();
