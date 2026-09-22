/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 10_Rapport
 * ============================================================================
 *  Génération du classeur Google Sheets de restitution.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// GÉNÉRATION DU RAPPORT GOOGLE SHEETS
// ---------------------------------------------------------------------------
function ecrireRapport_(resultats, ctx, debut, lang) {
  lang = (lang === 'en') ? 'en' : (CONFIG.LANGUE || 'fr');
  const t = TRADUCTIONS_SERVEUR[lang] || TRADUCTIONS_SERVEUR.fr;
  const nomRapport = (lang === 'en' ? 'CIS Google Workspace Audit Report' : CONFIG.NOM_RAPPORT) + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const ss = SpreadsheetApp.create(nomRapport);

  // --- Dérogations : statut effectif = ÉCART ACCEPTÉ pour les NON CONFORME
  //     couverts par une acceptation formelle du registre.
  const derogations = listerDerogations_();
  resultats = resultats.map(function (r) {
    const d = derogations[r.id];
    const effectif = (r.statut === STATUT.FAIL && d) ? STATUT.ACCEPTED : r.statut;
    return Object.assign({}, r, { statutEffectif: effectif, derogation: d || null });
  });

  // --- Onglet Synthèse ------------------------------------------------------
  const compte = {};
  Object.keys(STATUT).forEach(function (k) { compte[STATUT[k]] = 0; });
  resultats.forEach(function (r) { compte[r.statutEffectif] = (compte[r.statutEffectif] || 0) + 1; });

  const nAcceptes = compte[STATUT.ACCEPTED] || 0;
  // Score résiduel : les écarts formellement acceptés sortent du dénominateur.
  const evaluables = compte[STATUT.PASS] + compte[STATUT.FAIL];
  const scorePct = evaluables > 0 ? Math.round(100 * compte[STATUT.PASS] / evaluables) : 0;
  const evaluablesBrut = evaluables + nAcceptes;
  const scoreBrut = evaluablesBrut > 0 ? Math.round(100 * compte[STATUT.PASS] / evaluablesBrut) : 0;

  // Palette unique des statuts, partagée par la Synthèse et le Détail : un même
  // statut porte ainsi la même couleur d'un onglet à l'autre.
  const FOND = {};
  FOND[STATUT.PASS] = '#d9ead3';
  FOND[STATUT.FAIL] = '#f4cccc';
  FOND[STATUT.REVIEW] = '#fce5cd';
  FOND[STATUT.MANUAL] = '#d9d9d9';
  FOND[STATUT.ERROR] = '#ead1dc';
  FOND[STATUT.SKIP] = '#f3f3f3';
  FOND[STATUT.ACCEPTED] = '#dbe5f1';
  const ALERTE = '#fff3cd';
  const teinteScore = function (p) { return p >= 80 ? '#0f6b3f' : (p >= 50 ? '#9a5b00' : '#b3261e'); };

  const sh1 = ss.getSheets()[0].setName(t.sheets.nomSynthese);
  const niveau = (ctx && ctx.niveau) || CONFIG.NIVEAU_PROFIL;
  const profilLibelle = niveau === 'L1' ? t.sheets.profilL1 : t.sheets.profilL2;

  // Chaque ligne porte sa propre mise en forme. Figer des coordonnées absolues
  // (A9:B9, A11:B11…) désalignait silencieusement les couleurs dès qu'une ligne
  // était insérée : depuis la 5.0, le score brut était peint en rouge même à
  // 100 %, une ligne vide était surlignée, et les décomptes NON CONFORME,
  // ÉCART ACCEPTÉ et suivants n'en recevaient aucune.
  const S = [];
  const ligne = function (libelle, valeur, opts) {
    S.push(Object.assign({ libelle: libelle, valeur: valeur === undefined || valeur === null ? '' : String(valeur) },
                         opts || {}));
  };
  const separateur = function () { ligne('', ''); };

  ligne(t.sheets.titreSynthese, '', { gras: true, taille: 14 });
  separateur();
  ligne(t.sheets.dateExec, Utilities.formatDate(debut, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  ligne(t.sheets.execPar, Session.getEffectiveUser().getEmail());
  ligne(t.sheets.profilAudite, profilLibelle);
  ligne(t.sheets.versionOutil, 'v' + CONFIG.VERSION);
  ligne(t.sheets.referentiel, t.sheets.referentielDesc);
  ligne(t.sheets.domaines, (ctx.domaines || []).join(', ') || t.sheets.nd);

  // --- Couverture : un rapport de conformité doit énoncer ses propres limites.
  //     Un échantillon tronqué présenté comme complet est trompeur.
  separateur();
  ligne(t.sheets.couverture, '', { gras: true });
  ligne(t.sheets.policiesLues, String((ctx.policies || []).length));
  const nbAdmins = ctx.superAdmins ? ctx.superAdmins.length : 0;
  const admExhaustif = ctx.superAdminsExhaustifs === true;
  ligne(t.sheets.superAdminsRecenses,
        nbAdmins + ' — ' + (admExhaustif ? t.sheets.exhaustif : t.sheets.parDeduction),
        admExhaustif ? null : { fond: ALERTE, gras: true });
  const nbU = (ctx.utilisateurs || []).length;
  const uTronque = nbU >= CONFIG.MAX_UTILISATEURS;
  ligne(t.sheets.utilisateursAnalyses, nbU + (uTronque ? t.sheets.plafondAtteint : ''),
        uTronque ? { fond: ALERTE, gras: true } : null);
  const nbG = (ctx.groupes || []).length;
  const gTronque = nbG >= CONFIG.MAX_GROUPES;
  ligne(t.sheets.groupesAnalyses, nbG + (gTronque ? t.sheets.plafondAtteint : ''),
        gTronque ? { fond: ALERTE, gras: true } : null);
  const uoOk = ctx.unitesCollectees === true;
  ligne(t.sheets.unitesRecensees,
        uoOk ? String(Object.keys(ctx.unites || {}).length) : t.sheets.unitesNonCollectees,
        uoOk ? null : { fond: ALERTE, gras: true });

  separateur();
  ligne(t.sheets.scoreResiduel, scorePct + ' %', { gras: true, couleurValeur: teinteScore(scorePct) });
  ligne(t.sheets.scoreBrut, scoreBrut + ' %', { couleurValeur: teinteScore(scoreBrut) });

  separateur();
  ligne(t.statuts[STATUT.PASS], compte[STATUT.PASS] || 0, { fond: FOND[STATUT.PASS] });
  ligne(t.statuts[STATUT.FAIL] + (lang === 'en' ? ' (to remediate)' : ' (à corriger)'),
        compte[STATUT.FAIL] || 0, { fond: FOND[STATUT.FAIL] });
  ligne(t.statuts[STATUT.ACCEPTED] + (lang === 'en' ? ' (formal deviation)' : ' (dérogation formelle)'),
        nAcceptes, { fond: FOND[STATUT.ACCEPTED] });
  ligne(t.statuts[STATUT.REVIEW], compte[STATUT.REVIEW] || 0, { fond: FOND[STATUT.REVIEW] });
  ligne(t.statuts[STATUT.MANUAL], compte[STATUT.MANUAL] || 0, { fond: FOND[STATUT.MANUAL] });
  ligne(t.statuts[STATUT.ERROR], compte[STATUT.ERROR] || 0, { fond: FOND[STATUT.ERROR] });
  ligne(t.statuts[STATUT.SKIP], compte[STATUT.SKIP] || 0, { fond: FOND[STATUT.SKIP] });

  if (ctx.erreurs && ctx.erreurs.length) {
    separateur();
    ligne(t.sheets.avertCollecte, ctx.erreurs.join(' | '), { fond: ALERTE, gras: true });
  }

  // Écriture vectorisée : valeurs, fonds et graisses en un appel chacun plutôt
  // qu'une opération par cellule.
  const plage = sh1.getRange(1, 1, S.length, 2);
  plage.setValues(S.map(function (x) { return [x.libelle, x.valeur]; }));
  plage.setBackgrounds(S.map(function (x) { return [x.fond || null, x.fond || null]; }));
  plage.setFontWeights(S.map(function (x) {
    const g = x.gras ? 'bold' : 'normal';
    return [g, g];
  }));
  sh1.getRange(1, 2, S.length, 1)
     .setFontColors(S.map(function (x) { return [x.couleurValeur || null]; }));
  S.forEach(function (x, i) { if (x.taille) sh1.getRange(i + 1, 1).setFontSize(x.taille); });
  sh1.getRange(2, 2, S.length - 1, 1).setWrap(true);
  sh1.setColumnWidth(1, 360).setColumnWidth(2, 620);

  // --- Onglet Détail --------------------------------------------------------
  const sh2 = ss.insertSheet(t.sheets.nomDetail);
  const entetes = t.sheets.entetesDetail;
  const donnees = resultats.map(function (r) {
    let constat = r.detail;
    if (r.statutEffectif === STATUT.ACCEPTED && r.derogation) {
      constat = t.sheets.derogationPrefix + r.derogation.par + t.sheets.derogationLe + r.derogation.date +
        (r.derogation.revision ? (t.sheets.derogationRev + r.derogation.revision + ')') : t.sheets.derogationPerm) +
        t.sheets.derogationMotif + r.derogation.motif + t.sheets.derogationConstat + r.detail;
    }
    const titreAffiche = (lang === 'en' && r.titreEn) ? r.titreEn : r.titre;
    const remedeAffiche = (lang === 'en' && r.remediationEn) ? r.remediationEn : r.remediation;
    const statutAffiche = t.statuts[r.statutEffectif] || r.statutEffectif;
    return [r.id, r.level, titreAffiche, statutAffiche, constat, remedeAffiche];
  });
  sh2.getRange(1, 1, 1, entetes.length).setValues([entetes])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  if (donnees.length) sh2.getRange(2, 1, donnees.length, entetes.length).setValues(donnees);
  sh2.setFrozenRows(1);
  sh2.setColumnWidth(1, 90).setColumnWidth(2, 60).setColumnWidth(3, 360)
    .setColumnWidth(4, 130).setColumnWidth(5, 520).setColumnWidth(6, 420);
  sh2.getRange(2, 5, Math.max(donnees.length, 1), 2).setWrap(true);

  // Même palette que la Synthèse, indexée sur le libellé traduit.
  const couleurs = {};
  Object.keys(FOND).forEach(function (st) { couleurs[t.statuts[st] || st] = FOND[st]; });
  if (donnees.length) {
    sh2.getRange(2, 4, donnees.length, 1)
       .setBackgrounds(donnees.map(function (l) { return [couleurs[l[3]] || null]; }));
  }

  // --- Onglet Plan d'actions ------------------------------------------------
  const sh4 = ss.insertSheet(t.sheets.nomPlan);
  const entetesPlan = t.sheets.entetesPlan;
  const lignesPlan = resultats
    .filter(function (r) { return r.statutEffectif === STATUT.FAIL; })
    .map(function (r) {
      const attendu = (r.detail.match(/Attendu : ([^|]+)/) || [])[1] || '';
      const titreAffiche = (lang === 'en' && r.titreEn) ? r.titreEn : r.titre;
      const remedeAffiche = (lang === 'en' && r.remediationEn) ? r.remediationEn : (r.remediation || '');
      const risqueAffiche = (lang === 'en') ? risquePourEn_(r.id) : risquePour_(r.id);
      return [
        r.level === 'L1' ? t.sheets.prioHaute : t.sheets.prioMoyenne,
        r.id, titreAffiche, r.detail,
        remedeAffiche + (attendu ? t.sheets.cible + attendu.trim() : ''),
        risqueAffiche,
        '', '', t.sheets.aFaire
      ];
    })
    .sort(function (a, b) { return a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : String(a[0]).localeCompare(String(b[0])); });
  sh4.getRange(1, 1, 1, entetesPlan.length).setValues([entetesPlan])
    .setFontWeight('bold').setBackground('#d93025').setFontColor('#ffffff');
  if (lignesPlan.length) {
    sh4.getRange(2, 1, lignesPlan.length, entetesPlan.length).setValues(lignesPlan);
    sh4.getRange(2, 4, lignesPlan.length, 3).setWrap(true);
    sh4.getRange(2, 1, lignesPlan.length, 1).setBackgrounds(lignesPlan.map(function (l) {
      return [l[0].indexOf('P1') === 0 ? FOND[STATUT.FAIL] : FOND[STATUT.REVIEW]];
    }));
  } else {
    sh4.getRange(2, 1).setValue(t.sheets.aucuneAction);
  }
  sh4.setFrozenRows(1);
  sh4.setColumnWidth(1, 110).setColumnWidth(2, 90).setColumnWidth(3, 300).setColumnWidth(4, 380)
    .setColumnWidth(5, 380).setColumnWidth(6, 340).setColumnWidth(7, 140).setColumnWidth(8, 100).setColumnWidth(9, 90);

  // --- Onglet Registre des dérogations -------------------------------------
  const sh5 = ss.insertSheet(t.sheets.nomDerog);
  const entetesDer = t.sheets.entetesDerog;
  const parId = {};
  resultats.forEach(function (r) { parId[r.id] = r; });
  const lignesDer = Object.keys(derogations).sort().map(function (id) {
    const d = derogations[id];
    const r = parId[id];
    const statutConstate = r ? (t.statuts[r.statut] || r.statut) : t.sheets.nonEvalue;
    const titreAffiche = (r && lang === 'en' && r.titreEn) ? r.titreEn : (r ? r.titre : '');
    const risqueAffiche = (lang === 'en') ? risquePourEn_(id) : risquePour_(id);
    let obs = '';
    if (r && r.statut === STATUT.PASS) obs = t.sheets.derogConforme;
    else if (d.revision && d.revision < Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) obs = t.sheets.derogDepassee;
    return [id, titreAffiche, statutConstate, risqueAffiche, d.motif, d.par, d.date, d.revision || t.sheets.permanente, obs];
  });
  sh5.getRange(1, 1, 1, entetesDer.length).setValues([entetesDer])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  if (lignesDer.length) {
    sh5.getRange(2, 1, lignesDer.length, entetesDer.length).setValues(lignesDer);
    sh5.getRange(2, 4, lignesDer.length, 2).setWrap(true);
    const obsPlage = sh5.getRange(2, 9, lignesDer.length, 1);
    obsPlage.setBackgrounds(lignesDer.map(function (l) { return [l[8] ? FOND[STATUT.REVIEW] : null]; }));
    obsPlage.setFontWeights(lignesDer.map(function (l) { return [l[8] ? 'bold' : 'normal']; }));
  } else {
    sh5.getRange(2, 1).setValue(t.sheets.aucuneDerog);
  }
  sh5.setFrozenRows(1);
  sh5.setColumnWidth(1, 90).setColumnWidth(2, 300).setColumnWidth(3, 160).setColumnWidth(4, 330)
    .setColumnWidth(5, 330).setColumnWidth(6, 210).setColumnWidth(7, 90).setColumnWidth(8, 110).setColumnWidth(9, 240);

  // --- Onglet Journal des dérogations --------------------------------------
  // Le journal était écrit dans les ScriptProperties sans qu'aucune fonction ni
  // aucun écran ne permette de le relire : un journal d'audit inconsultable ne
  // prouve rien. Il est désormais restitué, donc exportable et opposable.
  const sh6 = ss.insertSheet(t.sheets.nomJournal);
  const entetesJ = t.sheets.entetesJournal;
  sh6.getRange(1, 1, 1, entetesJ.length).setValues([entetesJ])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  const lignesJ = lireJournalDerogations_().map(function (e) {
    return [e.horodatage || '', e.action || '', e.id || '', e.par || '', e.details || ''];
  }).reverse(); // plus récent en tête
  if (lignesJ.length) {
    sh6.getRange(2, 1, lignesJ.length, entetesJ.length).setValues(lignesJ);
    sh6.getRange(2, 5, lignesJ.length, 1).setWrap(true);
  } else {
    sh6.getRange(2, 1).setValue(t.sheets.aucunJournal);
  }
  sh6.setFrozenRows(1);
  sh6.setColumnWidth(1, 150).setColumnWidth(2, 110).setColumnWidth(3, 90)
     .setColumnWidth(4, 240).setColumnWidth(5, 520);

  // --- Onglet Politiques (brut) — pour validation empirique des mappings ----
  const sh3 = ss.insertSheet(t.sheets.nomPolitiques);
  sh3.getRange(1, 1, 1, 4).setValues([t.sheets.entetesPolitiques])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  const lignesPol = (ctx.policies || []).map(function (p) {
    return [
      p.setting ? p.setting.type : '',
      p.type || '',
      JSON.stringify(p.policyQuery || {}),
      p.setting ? JSON.stringify(p.setting.value || {}) : ''
    ];
  });
  if (lignesPol.length) sh3.getRange(2, 1, lignesPol.length, 4).setValues(lignesPol);
  sh3.setFrozenRows(1);
  sh3.setColumnWidth(1, 380).setColumnWidth(2, 90).setColumnWidth(3, 260).setColumnWidth(4, 600);
  sh3.getRange(2, 4, Math.max(lignesPol.length, 1), 1).setWrap(true);

  return ss.getUrl();
}   

/** Génère le rapport Google Sheets à partir des résultats accumulés. */
function genererRapportSheets(token, lang) {
  exigerSuperAdmin_();
  lang = (lang === 'en') ? 'en' : (CONFIG.LANGUE || 'fr');
  const resultats = chargerResultats_(token); // jamais le tableau du navigateur
  let ctx;
  try {
    ctx = chargerContexte_(token);
  } catch (e) {
    ctx = { domaines: [], policies: [], policyIndex: {}, niveau: niveauSession_(token),
            erreurs: ['Contexte expiré — onglet Politiques (brut) non disponible.'] };
  }
  return ecrireRapport_(resultats, ctx, new Date(), lang);
}
