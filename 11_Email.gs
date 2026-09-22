/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 11_Email
 * ============================================================================
 *  Envoi du rapport de synthèse par e-mail.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


function echapHtml_(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function construireEmailHtml_(resultats, ctx, lang) {
  lang = (lang === 'en') ? 'en' : (CONFIG.LANGUE || 'fr');
  const t = TRADUCTIONS_SERVEUR[lang] || TRADUCTIONS_SERVEUR.fr;
  const S = STATUT;
  const teintes = {};
  teintes[S.PASS] = ['#0f6b3f', '#e2f2e8'];
  teintes[S.FAIL] = ['#b3261e', '#fbe9e7'];
  teintes[S.ACCEPTED] = ['#2b5f8a', '#e3ecf4'];
  teintes[S.REVIEW] = ['#9a5b00', '#fdf1dc'];
  teintes[S.MANUAL] = ['#4b5563', '#ebedf0'];
  teintes[S.ERROR] = ['#7a1f5c', '#f7e4f0'];
  teintes[S.SKIP] = ['#6b7280', '#f1f2f3'];

  const puce = function (statut, n) {
    const couleur = teintes[statut] || ['#333', '#eee'];
    const libelle = t.statuts[statut] || statut;
    return '<td style="padding:6px 10px"><span style="font-family:monospace;font-size:12px;' +
      'color:' + couleur[0] + ';background:' + couleur[1] + ';border-radius:4px;padding:3px 9px;white-space:nowrap">' +
      libelle + '&nbsp;: ' + n + '</span></td>';
  };
  const ordre = [S.PASS, S.FAIL, S.ACCEPTED, S.REVIEW, S.MANUAL, S.ERROR, S.SKIP];

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#20242b;max-width:680px">';
  html += '<div style="background:#1a73e8;color:#ffffff;padding:16px 22px;border-radius:8px 8px 0 0">' +
          '<div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#d2e3fc">' + t.email.banniere + '</div>' +
          '<div style="font-size:18px;font-weight:bold;margin-top:2px">' + t.email.rapportTitre + ' — ' + ctx.dateFr + '</div></div>';
  html += '<div style="border:1px solid #dcd9d0;border-top:0;padding:18px 22px;border-radius:0 0 8px 8px">';

  if (ctx.message) {
    html += '<p style="white-space:pre-wrap;border-left:3px solid #2b5f8a;background:#f3f7fb;padding:10px 14px;margin:0 0 16px">' +
            echapHtml_(ctx.message) + '</p>';
  }

  html += '<table cellspacing="0" cellpadding="0" style="margin-bottom:6px"><tr>' +
          '<td style="padding-right:26px"><div style="font-size:34px;font-weight:bold;color:' +
          (ctx.scoreRes >= 80 ? '#0f6b3f' : ctx.scoreRes >= 50 ? '#9a5b00' : '#b3261e') + '">' + ctx.scoreRes + '&nbsp;%</div>' +
          '<div style="font-size:11px;color:#6b7280">' + t.email.confResiduelle + '</div></td>' +
          '<td><div style="font-size:22px;font-weight:bold;color:#4b5563">' + ctx.scoreBrut + '&nbsp;%</div>' +
          '<div style="font-size:11px;color:#6b7280">' + t.email.confBrute + '</div></td></tr></table>';

  html += '<table cellspacing="0" cellpadding="0"><tr>';
  ordre.forEach(function (s) { if (ctx.compte[s]) html += puce(s, ctx.compte[s]); });
  html += '</tr></table>';

  if (ctx.inclureDetails) {
    const nc = resultats.filter(function (r) { return r.statutEffectif === S.FAIL; })
      .sort(function (x, y) { return x.level === y.level ? x.id.localeCompare(y.id) : x.level.localeCompare(y.level); });
    if (nc.length) {
      html += '<h3 style="font-size:14px;margin:18px 0 6px">' + t.email.ecartsCorriger + ' (' + nc.length + ')</h3>' +
              '<table cellspacing="0" cellpadding="0" style="font-size:12.5px;border-collapse:collapse;width:100%">';
      nc.forEach(function (r) {
        const titreAffiche = (lang === 'en' && r.titreEn) ? r.titreEn : r.titre;
        html += '<tr><td style="font-family:monospace;color:#2b5f8a;padding:4px 10px 4px 0;border-bottom:1px solid #edebe3;white-space:nowrap;vertical-align:top">' +
                r.id + '</td><td style="color:#6b7280;padding:4px 8px 4px 0;border-bottom:1px solid #edebe3;vertical-align:top">' + r.level +
                '</td><td style="padding:4px 0;border-bottom:1px solid #edebe3">' + echapHtml_(titreAffiche) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<p style="color:#0f6b3f;font-weight:bold;margin-top:16px">' + t.email.aucunEcart + '</p>';
    }
    if (ctx.nbDerog) {
      html += '<p style="font-size:12px;color:#2b5f8a;margin-top:12px">ℹ ' + ctx.nbDerog + ' ' + t.email.derogEnVigueur + '</p>';
    }
  }

  if (ctx.url) {
    html += '<p style="margin-top:20px;padding:12px 16px;background:#f3f7fb;border-radius:6px;font-size:13px">' +
            '<b>' + t.email.rapportGenere + '</b><br>' +
            '<a href="' + ctx.url + '" style="color:#1a73e8;font-weight:bold;text-decoration:none">' +
            t.email.ouvrirRapport + '</a></p>';
  }

  html += '<p style="font-size:11px;color:#9aa0a8;border-top:1px dashed #dcd9d0;margin-top:18px;padding-top:10px">' +
          t.email.piedGenere + ' v' + CONFIG.VERSION + t.email.piedExec +
          echapHtml_(Session.getActiveUser().getEmail()) + t.email.piedRef +
          '<br>' + (lang === 'en' ? 'Developed by ' : 'Développé par ') +
          '<a href="https://faucheux.bzh" style="color:#1a73e8;text-decoration:none;font-weight:bold">Fabrice Faucheux (faucheux.bzh)</a></p>';
  html += '</div></div>';
  return html;
}


// ---------------------------------------------------------------------------
// ENVOI DU RAPPORT PAR E-MAIL
// ---------------------------------------------------------------------------
/** Domaines vers lesquels la diffusion du rapport est autorisée. */
function domainesDestinatairesAutorises_(token, appelant) {
  const liste = [];
  try {
    (chargerPartie_(token, 'dom') || []).forEach(function (d) { liste.push(String(d).toLowerCase()); });
  } catch (e) { /* collecte des domaines indisponible */ }
  if (!liste.length && appelant) liste.push(String(appelant).split('@').pop().toLowerCase());
  (CONFIG.DOMAINES_DESTINATAIRES || []).forEach(function (d) { liste.push(String(d).toLowerCase()); });
  return liste;
}

function envoyerRapportEmail(token, options, lang) {
  const appelant = exigerSuperAdmin_();
  options = options || {};
  lang = (lang === 'en') ? 'en' : ((options && options.lang === 'en') ? 'en' : (CONFIG.LANGUE || 'fr'));
  const dests = String(options.destinataires || '')
    .split(/[;,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!dests.length) throw new Error('Au moins un destinataire est requis.');
  dests.forEach(function (d) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)) throw new Error('Adresse invalide : ' + d);
  });

  // Un rapport d'audit décrit la posture de sécurité complète du tenant : sa
  // diffusion hors du domaine doit être un choix explicite, pas un défaut.
  const autorises = domainesDestinatairesAutorises_(token, appelant);
  const refuses = dests.filter(function (d) {
    return autorises.indexOf(d.split('@').pop().toLowerCase()) === -1;
  });
  if (refuses.length) {
    throw new Error('Diffusion hors périmètre refusée pour : ' + refuses.join(', ') +
      '. Domaines autorisés : ' + autorises.join(', ') +
      '. Pour ouvrir à un destinataire externe, ajouter son domaine à CONFIG.DOMAINES_DESTINATAIRES.');
  }

  const resultats = chargerResultats_(token); // jamais le tableau du navigateur

  // Statut effectif (dérogations appliquées) + décomptes
  const derog = listerDerogations_();
  const enrichis = resultats.map(function (r) {
    return Object.assign({}, r, {
      statutEffectif: (r.statut === STATUT.FAIL && derog[r.id]) ? STATUT.ACCEPTED : r.statut
    });
  });
  const compte = {};
  enrichis.forEach(function (r) { compte[r.statutEffectif] = (compte[r.statutEffectif] || 0) + 1; });
  const p = compte[STATUT.PASS] || 0, f = compte[STATUT.FAIL] || 0, a = compte[STATUT.ACCEPTED] || 0;
  const scoreRes = (p + f) > 0 ? Math.round(100 * p / (p + f)) : 100;
  const scoreBrut = (p + f + a) > 0 ? Math.round(100 * p / (p + f + a)) : 100;

  // Rapport Sheets joint en lien (généré maintenant, avec ses 5 onglets)
  let url = null;
  if (options.joindreLien) url = genererRapportSheets(token, lang);

  const dateFr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  const objet = options.objet ||
    (lang === 'en' ? ('CIS Google Workspace Audit — ' + dateFr + ' — residual score ' + scoreRes + ' %') : ('Audit CIS Google Workspace — ' + dateFr + ' — conformité résiduelle ' + scoreRes + ' %'));

  MailApp.sendEmail({
    to: dests.join(','),
    subject: objet,
    htmlBody: construireEmailHtml_(enrichis, {
      scoreRes: scoreRes, scoreBrut: scoreBrut, compte: compte,
      nbDerog: a, url: url, dateFr: dateFr,
      message: options.message || '', inclureDetails: options.inclureDetails !== false
    }, lang),
    name: 'Audit CIS Google Workspace'
  });
  return { destinataires: dests.join(', '), url: url };
}
