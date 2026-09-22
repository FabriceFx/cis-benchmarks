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

  const sh1 = ss.getSheets()[0].setName(t.sheets.nomSynthese);
  const niveau = (ctx && ctx.niveau) || CONFIG.NIVEAU_PROFIL;
  const profilLibelle = niveau === 'L1' ? t.sheets.profilL1 : t.sheets.profilL2;
  const lignesSynthese = [
    [t.sheets.titreSynthese, ''],
    ['', ''],
    [t.sheets.dateExec, Utilities.formatDate(debut, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')],
    [t.sheets.execPar, Session.getActiveUser().getEmail()],
    [t.sheets.profilAudite, profilLibelle],
    [t.sheets.versionOutil, 'v' + CONFIG.VERSION],
    [t.sheets.referentiel, t.sheets.referentielDesc],
    [t.sheets.domaines, (ctx.domaines || []).join(', ') || t.sheets.nd],
    [t.sheets.policiesLues, String((ctx.policies || []).length)],
    ['', ''],
    [t.sheets.scoreResiduel, scorePct + ' %'],
    [t.sheets.scoreBrut, scoreBrut + ' %'],
    ['', ''],
    [t.statuts[STATUT.PASS], String(compte[STATUT.PASS] || 0)],
    [t.statuts[STATUT.FAIL] + (lang === 'en' ? ' (to remediate)' : ' (à corriger)'), String(compte[STATUT.FAIL] || 0)],
    [t.statuts[STATUT.ACCEPTED] + (lang === 'en' ? ' (formal deviation)' : ' (dérogation formelle)'), String(nAcceptes)],
    [t.statuts[STATUT.REVIEW], String(compte[STATUT.REVIEW] || 0)],
    [t.statuts[STATUT.MANUAL], String(compte[STATUT.MANUAL] || 0)],
    [t.statuts[STATUT.ERROR], String(compte[STATUT.ERROR] || 0)],
    [t.statuts[STATUT.SKIP], String(compte[STATUT.SKIP] || 0)]
  ];
  if (ctx.erreurs && ctx.erreurs.length) {
    lignesSynthese.push(['', '']);
    lignesSynthese.push([t.sheets.avertCollecte, ctx.erreurs.join(' | ')]);
  }
  sh1.getRange(1, 1, lignesSynthese.length, 2).setValues(lignesSynthese);
  sh1.getRange('A1').setFontSize(14).setFontWeight('bold');
  sh1.getRange('A9:B9').setFontWeight('bold').setBackground('#fff3cd');
  sh1.getRange('A11:B11').setBackground('#d9ead3');
  sh1.getRange('A12:B12').setBackground('#f4cccc');
  sh1.getRange('A13:B13').setBackground('#fce5cd');
  sh1.getRange('A14:B14').setBackground('#d9d9d9');
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

  const couleurs = {};
  couleurs[t.statuts[STATUT.PASS] || STATUT.PASS] = '#d9ead3';
  couleurs[t.statuts[STATUT.FAIL] || STATUT.FAIL] = '#f4cccc';
  couleurs[t.statuts[STATUT.REVIEW] || STATUT.REVIEW] = '#fce5cd';
  couleurs[t.statuts[STATUT.MANUAL] || STATUT.MANUAL] = '#d9d9d9';
  couleurs[t.statuts[STATUT.ERROR] || STATUT.ERROR] = '#ead1dc';
  couleurs[t.statuts[STATUT.SKIP] || STATUT.SKIP] = '#f3f3f3';
  couleurs[t.statuts[STATUT.ACCEPTED] || STATUT.ACCEPTED] = '#dbe5f1';
  donnees.forEach(function (l, i) {
    const c = couleurs[l[3]];
    if (c) sh2.getRange(i + 2, 4).setBackground(c);
  });

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
    lignesPlan.forEach(function (l, i) {
      sh4.getRange(i + 2, 1).setBackground(l[0].indexOf('P1') === 0 ? '#f4cccc' : '#fce5cd');
    });
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
    lignesDer.forEach(function (l, i) {
      if (l[8]) sh5.getRange(i + 2, 9).setBackground('#fce5cd').setFontWeight('bold');
    });
  } else {
    sh5.getRange(2, 1).setValue(t.sheets.aucuneDerog);
  }
  sh5.setFrozenRows(1);
  sh5.setColumnWidth(1, 90).setColumnWidth(2, 300).setColumnWidth(3, 160).setColumnWidth(4, 330)
    .setColumnWidth(5, 330).setColumnWidth(6, 210).setColumnWidth(7, 90).setColumnWidth(8, 110).setColumnWidth(9, 240);

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
