// Exécution des 87 contrôles sur des contextes simulés.
// Exécution : node tests/controles.test.js
//
// Deux filets distincts :
//  1. Robustesse — aucun contrôle ne doit lever, ni retourner un statut hors
//     du vocabulaire, quelle que soit la pauvreté du contexte.
//  2. Référence figée — les statuts obtenus sur trois contextes types sont
//     comparés à tests/fixtures/etats.json. Toute évolution du moteur
//     d'évaluation ou d'une correspondance de champ déplace un statut et fait
//     apparaître l'écart dans le diff, à accepter consciemment plutôt que
//     subir. Régénération : node tests/controles.test.js --maj
const fs = require('fs');
const path = require('path');
const { charger, suite, RACINE } = require('./aide.js');

const api = charger(['DEFINITION_CONTROLES', 'STATUT', 'indexerPolitiques_', 'controlePolitique_']);
const { DEFINITION_CONTROLES: CTRL, STATUT } = api;
const t = suite();

// Types de réglages réellement référencés par les contrôles : le contexte
// simulé est construit à partir du code, il ne peut donc pas dériver de lui.
const SRC_CTRL = fs.readFileSync(path.join(RACINE, '07_Controles.gs'), 'utf8');
const APPELS = SRC_CTRL.match(/(?:controlePolitique_|evaluerParPerimetre_)\(\s*(?:ctx,\s*)?'([^']+)'/g) || [];
const TYPES = [...new Set(APPELS.map(m => m.match(/'([^']+)'/)[1]))];

// Contrôles construits par la fabrique controlePolitique_ : leur verdict vient
// exclusivement de la Policy API. Les autres disposent d'un repli documenté
// (analyse groupe par groupe, énumération des utilisateurs) et peuvent
// légitimement trancher sans elle. On les distingue par la signature de la
// fermeture produite par la fabrique.
const SIGNATURE_FABRIQUE = String(api.controlePolitique_('x', () => null, 'y'));
const PUREMENT_POLICY = CTRL.filter(c => String(c.check) === SIGNATURE_FABRIQUE);

const politique = (type, ou, valeur, genre) => ({
  type: genre || 'ADMIN',
  policyQuery: { orgUnit: 'orgUnits/' + ou },
  setting: { type: 'settings/' + type, value: valeur }
});

const contexte = (pol, collectees) => {
  const ctx = { policies: pol, domaines: ['example.test'], unites: { ou_prod: '/Production' },
                unitesCollectees: collectees !== false, erreurs: [] };
  ctx.policyIndex = api.indexerPolitiques_(pol);
  return ctx;
};

const ANNUAIRE = ctx => {
  ctx.utilisateurs = [
    { primaryEmail: 'a@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true },
    { primaryEmail: 'b@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true }
  ];
  ctx.superAdmins = ctx.utilisateurs.slice();
  ctx.superAdminsExhaustifs = true;
  ctx.groupes = [{ email: 'g@example.test', settings: { whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW' } }];
  ctx.reglagesGroupesCollectes = true;
  return ctx;
};

const SCENARIOS = {
  // Aucune donnée : le cas d'une collecte totalement en échec.
  'contexte-vide': (() => {
    const ctx = contexte([], false);
    ctx.domaines = []; ctx.utilisateurs = null; ctx.groupes = null;
    ctx.reglagesGroupesCollectes = false;
    return ctx;
  })(),
  // Politiques présentes mais valeurs non reconnues : le cas d'une évolution
  // du schéma de la Policy API. Aucun contrôle ne doit trancher à tort.
  'schema-inconnu': (() => {
    const ctx = contexte(TYPES.map(ty => politique(ty, 'racine', { champInattendu: 'VALEUR_INCONNUE' })));
    ctx.utilisateurs = [
      { primaryEmail: 'a@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true },
      { primaryEmail: 'b@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true }
    ];
    ctx.superAdmins = ctx.utilisateurs.filter(u => u.isAdmin);
    ctx.groupes = [{ email: 'g@example.test', settings: { whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW' } }];
    ctx.reglagesGroupesCollectes = true;
    return ctx;
  })(),
  // LE cas que la revue experte a mis en évidence, et que les scénarios
  // précédents ne pouvaient pas voir : aucun d'eux ne contenait de politique
  // SYSTEM. Une dérogation posée uniquement sur une sous-UO laisse le reste du
  // tenant sur le défaut Google ; si ce défaut est permissif, l'ignorer
  // revenait à déclarer conforme un tenant qui ne l'est pas.
  'defaut-herite-permissif': (() => {
    const pol = [];
    TYPES.forEach(ty => {
      pol.push(politique(ty, 'ou_prod', { enabled: false, state: 'DISABLED' }));
      pol.push(politique(ty, 'defaut', { enabled: true, state: 'ENABLED' }, 'SYSTEM'));
    });
    return ANNUAIRE(contexte(pol));
  })(),
  // Même tenant, table des UO non collectée : la racine n'est plus
  // identifiable, donc le défaut hérité doit rester indéterminé — À VÉRIFIER,
  // jamais un écart prononcé sur une hypothèse invérifiable.
  'unites-non-collectees': (() => {
    const pol = [];
    TYPES.forEach(ty => {
      pol.push(politique(ty, 'racine', { enabled: false, state: 'DISABLED' }));
      pol.push(politique(ty, 'defaut', { enabled: true, state: 'ENABLED' }, 'SYSTEM'));
    });
    return ANNUAIRE(contexte(pol, false));
  })(),

  // Mêmes réglages, plus une UO fille permissive : vérifie que l'évaluation
  // par périmètre reste stable sur l'ensemble du référentiel.
  'ou-fille-permissive': (() => {
    const pol = [];
    TYPES.forEach(ty => {
      pol.push(politique(ty, 'racine', { enabled: false, state: 'DISABLED' }));
      pol.push(politique(ty, 'ou_prod', { enabled: true, state: 'ENABLED' }));
    });
    const ctx = contexte(pol);
    ctx.utilisateurs = [
      { primaryEmail: 'a@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true },
      { primaryEmail: 'b@example.test', isAdmin: true, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true },
      { primaryEmail: 'c@example.test', isAdmin: false, isEnrolledIn2Sv: false, isEnforcedIn2Sv: false }
    ];
    ctx.superAdmins = ctx.utilisateurs.filter(u => u.isAdmin);
    ctx.groupes = [{ email: 'g@example.test', settings: { whoCanViewGroup: 'ANYONE_CAN_VIEW' } }];
    ctx.reglagesGroupesCollectes = true;
    return ctx;
  })()
};

const VOCABULAIRE = new Set(Object.values(STATUT));
const executer = ctx => {
  const etats = {};
  CTRL.forEach(c => { etats[c.id] = c.check(ctx); });   // volontairement sans try
  return etats;
};

t('chaque appel à la Policy API du référentiel est couvert par le contexte simulé', () => {
  const attendus = (SRC_CTRL.match(/controlePolitique_\(|evaluerParPerimetre_\(/g) || []).length;
  if (APPELS.length !== attendus) {
    throw new Error(APPELS.length + ' types extraits pour ' + attendus + ' appels — extraction incomplète');
  }
  if (!PUREMENT_POLICY.length) throw new Error('fabrique controlePolitique_ non reconnue');
});

Object.entries(SCENARIOS).forEach(([nom, ctx]) => {
  t(`aucun contrôle ne lève — ${nom}`, () => { executer(ctx); });

  t(`tout statut appartient au vocabulaire — ${nom}`, () => {
    const etats = executer(ctx);
    const ko = Object.entries(etats)
      .filter(([, r]) => !r || !VOCABULAIRE.has(r.statut) || typeof r.detail !== 'string');
    if (ko.length) throw new Error(ko.map(([id]) => id).join(', '));
  });
});

t("aucun CONFORME n'est prononcé sur un schéma non reconnu", () => {
  // Le pire défaut d'un outil de conformité est le faux négatif : sur des
  // valeurs que le code ne sait pas lire, il doit se taire, pas rassurer.
  const etats = executer(SCENARIOS['schema-inconnu']);
  const rassurants = PUREMENT_POLICY
    .filter(c => etats[c.id].statut === STATUT.PASS)
    .map(c => c.id);
  if (rassurants.length) throw new Error(rassurants.join(', '));
});

// --- référence figée -------------------------------------------------------
const REF = path.join(__dirname, 'fixtures', 'etats.json');
const actuel = {};
Object.entries(SCENARIOS).forEach(([nom, ctx]) => {
  const etats = executer(ctx);
  actuel[nom] = Object.fromEntries(CTRL.map(c => [c.id, etats[c.id].statut]));
});

if (process.argv.includes('--maj') || !fs.existsSync(REF)) {
  fs.writeFileSync(REF, JSON.stringify(actuel, null, 2) + '\n');
  console.log('Référence écrite : tests/fixtures/etats.json');
}

t('les statuts correspondent à la référence figée', () => {
  const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const ecarts = [];
  Object.keys(actuel).forEach(nom => {
    Object.keys(actuel[nom]).forEach(id => {
      const a = (ref[nom] || {})[id], b = actuel[nom][id];
      if (a !== b) ecarts.push(`${nom}/${id} : ${a} -> ${b}`);
    });
  });
  if (ecarts.length) {
    throw new Error(ecarts.length + ' écart(s) : ' + ecarts.slice(0, 12).join(' ; ') +
      (ecarts.length > 12 ? ' …' : '') + " — si le changement est voulu : node tests/controles.test.js --maj");
  }
});

t.bilan();
