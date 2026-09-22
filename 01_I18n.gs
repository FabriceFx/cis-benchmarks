/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 01_I18n
 * ============================================================================
 *  Dictionnaires de traduction serveur et référentiel des risques.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// RÉFÉRENTIEL DES RISQUES — présenté avant toute acceptation d'écart
// ---------------------------------------------------------------------------
// Une seule entrée par contrôle, les deux langues côte à côte. Les traductions
// vivaient auparavant dans deux dictionnaires distincts et éloignés, ce qui
// laissait passer des désynchronisations (voir les remediationEn erronées des
// contrôles 6.1 à 6.8, corrigées en 5.1.0). tests/i18n.test.js vérifie
// désormais la complétude des deux langues.
// (formulations synthétiques rédigées à partir de la logique du benchmark)
// ---------------------------------------------------------------------------
const RISQUES = {
  "1.1.1": {
    fr: "Avoir moins de 2 super admins crée un point unique de défaillance ; en avoir plus de 4 élargit excessivement la surface d'attaque.",
    en: "Fewer than 2 super admins creates a critical single point of failure; more than 4 unnecessarily expands the attack surface."
  },
  "1.1.2": {
    fr: "Cumuler le rôle Super Admin avec des rôles délégués mélange les privilèges globaux et opérationnels, rendant la traçabilité et le principe du moindre privilège inopérants.",
    en: "Combining Super Admin and Delegated Admin roles blurs privilege boundaries and violates the principle of least privilege."
  },
  "1.1.3": {
    fr: "Un super admin utilisé au quotidien (mail, navigation, docs) expose des privilèges totaux aux risques ordinaires : une seule pièce jointe piégée suffit.",
    en: "Using super admin accounts for daily tasks (email, web browsing) drastically increases exposure to phishing and credential theft."
  },
  "1.2.1.1": {
    fr: "Un annuaire consultable de l'extérieur facilite la cartographie des employés, donc le phishing ciblé et l'ingénierie sociale.",
    en: "Exposing directory data externally enables attacker reconnaissance, social engineering, and targeted phishing against employees."
  },
  "3.1.1.1.1": {
    fr: "Le partage externe des détails d'agenda révèle réunions, participants et sujets sensibles hors de l'organisation.",
    en: "Public calendar sharing exposes internal schedules, confidential meetings, and employee availability to external reconnaissance."
  },
  "3.1.1.1.2": {
    fr: "Un partage interne trop permissif permet la lecture voire la modification d'agendas par défaut, au-delà du besoin d'en connaître.",
    en: "Excessive internal calendar permissions allow unintended internal access to confidential meeting subjects and sensitive agendas."
  },
  "3.1.1.1.3": {
    fr: "Sans avertissement, un organisateur peut inviter un externe et lui exposer les détails d'une réunion par inadvertance.",
    en: "Without external invitation warnings, users may inadvertently accept rogue meeting invites or share sensitive data with external attendees."
  },
  "3.1.1.2.1": {
    fr: "Les agendas secondaires (équipes, projets) partagés en externe peuvent divulguer des plannings et activités internes.",
    en: "Secondary calendars (e.g. project or team schedules) without external restrictions can leak sensitive project milestones."
  },
  "3.1.1.2.2": {
    fr: "Des agendas secondaires modifiables par défaut ouvrent des droits au-delà du besoin réel.",
    en: "Default edit access on secondary calendars risks unauthorized schedule alterations or deletion of shared team events."
  },
  "3.1.1.3.1": {
    fr: "Les données d'agenda synchronisées hors connexion persistent sur des postes potentiellement partagés ou non maîtrisés.",
    en: "Offline calendar data cached in the browser remains accessible on unmanaged or lost endpoints without centralized revocation."
  },
  "3.1.2.1.1.1": {
    fr: "Sans avertissement au partage externe, l'exfiltration accidentelle de documents devient invisible pour l'utilisateur.",
    en: "Without external sharing warnings, users easily misdirect files containing confidential data to external parties by mistake."
  },
  "3.1.2.1.1.2": {
    fr: "Un fichier publié sur le web est indexable et accessible à quiconque, sans authentification ni traçabilité.",
    en: "Publishing files to the web makes corporate assets publicly indexable by search engines with no access control."
  },
  "3.1.2.1.1.3": {
    fr: "Un partage ouvert à tout domaine supprime toute maîtrise des destinataires réels des données de l'entreprise.",
    en: "Without domain allowlists, file sharing is uncontrolled and data can be shared with arbitrary personal or competitor domains."
  },
  "3.1.2.1.1.4": {
    fr: "Même vers des domaines de confiance, un partage sans avertissement favorise les erreurs de destinataire.",
    en: "Even towards trusted domains, sharing without explicit confirmation leads to accidental recipient errors."
  },
  "3.1.2.1.1.5": {
    fr: "Un Access Checker permissif transforme un simple envoi de lien en élargissement d'accès, jusqu'au public.",
    en: "A permissive Access Checker turns a simple link share into wide unauthorized access expansion, up to public visibility."
  },
  "3.1.2.1.1.6": {
    fr: "Autoriser des non-membres à distribuer du contenu multiplie les canaux de sortie de données non tracés.",
    en: "Allowing external users to distribute internal content creates untracked outbound data exfiltration paths."
  },
  "3.1.2.1.2.1": {
    fr: "Sans Drive partagés, les fichiers restent attachés aux comptes individuels : perte ou orphelinage des données au départ des collaborateurs.",
    en: "Without shared drives, documents remain tied to individual accounts: data is lost or orphaned when employees depart."
  },
  "3.1.2.1.2.2": {
    fr: "Si les gestionnaires peuvent outrepasser les réglages, les garde-fous des Drive partagés deviennent contournables localement.",
    en: "If managers can override shared drive settings, security baselines and sharing guardrails can be bypassed locally."
  },
  "3.1.2.1.2.3": {
    fr: "L'accès aux fichiers par des non-membres contourne la logique d'appartenance qui fonde la sécurité des Drive partagés.",
    en: "Non-member file access bypasses the membership boundary that secures shared drive contents."
  },
  "3.1.2.1.2.4": {
    fr: "Lecteurs et commentateurs pouvant télécharger/imprimer, tout accès en lecture devient un canal d'exfiltration complet.",
    en: "Allowing viewers and commenters to download, print, or copy makes any read access a full data exfiltration channel."
  },
  "3.1.2.2.1": {
    fr: "Les documents disponibles hors connexion persistent en local, hors du contrôle d'accès et de la révocation centralisés.",
    en: "Documents stored offline persist on local devices beyond centralized access control and rapid revocation."
  },
  "3.1.2.3.1": {
    fr: "Drive pour ordinateur synchronise des volumes entiers sur les postes : vol ou compromission du poste = fuite massive.",
    en: "Drive for desktop syncs massive volume of files locally: lost, stolen, or compromised endpoints result in major data breaches."
  },
  "3.1.3.1.1": {
    fr: "La délégation de boîte donne un accès complet et durable au courrier d'autrui, difficile à auditer.",
    en: "Mailbox delegation provides full, long-term access to another user's private emails, which is difficult to audit."
  },
  "3.1.3.1.2": {
    fr: "Gmail hors connexion conserve le courrier en local sur le poste, hors révocation centralisée.",
    en: "Offline Gmail caches corporate email locally on the disk outside of centralized session revocation."
  },
  "3.1.3.2.1": {
    fr: "Sans DKIM, vos e-mails ne sont pas signés : usurpation de votre domaine facilitée et délivrabilité dégradée.",
    en: "Without DKIM, outgoing emails lack cryptographic signing: domain spoofing is easy and email deliverability is degraded."
  },
  "3.1.3.2.2": {
    fr: "Sans SPF, tout serveur peut émettre au nom de vos domaines sans être signalé.",
    en: "Without SPF, any rogue server can send email impersonating your domain without being flagged by recipient servers."
  },
  "3.1.3.2.3": {
    fr: "Sans DMARC, aucune politique n'indique aux destinataires quoi faire des messages usurpant votre domaine, et aucun rapport ne vous alerte.",
    en: "Without DMARC, recipient mail servers receive no policy on how to handle spoofed emails, and you receive no forensic reports."
  },
  "3.1.3.3.1": {
    fr: "Sans notification, les messages en quarantaine (fuites bloquées, malware) ne sont jamais revus par les admins.",
    en: "Without admin quarantine notifications, trapped security threats (malware, data loss incidents) are never reviewed."
  },
  "3.1.3.4.1.1": {
    fr: "Les pièces jointes chiffrées échappent à l'analyse antivirus : vecteur classique de ransomware.",
    en: "Encrypted attachments bypass standard malware scanning: a classic ransomware delivery vector."
  },
  "3.1.3.4.1.2": {
    fr: "Les pièces jointes contenant des scripts d'expéditeurs inconnus sont un vecteur d'exécution de code.",
    en: "Script attachments from untrusted senders present an immediate arbitrary code execution risk."
  },
  "3.1.3.4.1.3": {
    fr: "Les types de pièces jointes inhabituels pour votre domaine signalent des campagnes de malware ciblées.",
    en: "Anomalous attachment extensions for your domain typically signal targeted malware or zero-day campaigns."
  },
  "3.1.3.4.2.1": {
    fr: "Les URL raccourcies masquent la destination réelle des liens de phishing.",
    en: "Shortened URLs conceal the true destination of malicious phishing links."
  },
  "3.1.3.4.2.2": {
    fr: "Des images liées peuvent charger du contenu malveillant ou traquer l'ouverture des messages.",
    en: "Linked external images can load malicious payloads or track email opens and user IP addresses."
  },
  "3.1.3.4.2.3": {
    fr: "Sans avertissement au clic, un lien vers un domaine non fiable mène l'utilisateur au phishing sans friction.",
    en: "Without warning prompts on link clicks, users navigate to suspicious or phishing domains without friction."
  },
  "3.1.3.4.3.1": {
    fr: "Des domaines visuellement similaires au vôtre (typosquatting) trompent les utilisateurs sur l'expéditeur.",
    en: "Lookalike domains (typosquatting) deceive employees into trusting external phishing senders."
  },
  "3.1.3.4.3.2": {
    fr: "L'usurpation du nom d'un dirigeant ou collègue est le cœur de la fraude au président et des demandes de virement.",
    en: "Executive or employee name spoofing is the cornerstone of business email compromise (BEC) and wire fraud."
  },
  "3.1.3.4.3.3": {
    fr: "Des e-mails entrants prétendant venir de votre propre domaine abusent de la confiance interne.",
    en: "Inbound emails pretending to come from your own domain exploit internal employee trust."
  },
  "3.1.3.4.3.4": {
    fr: "Les messages non authentifiés (ni SPF ni DKIM) sont les plus susceptibles d'être frauduleux.",
    en: "Unauthenticated emails (failing both SPF and DKIM) carry a very high probability of phishing or scam."
  },
  "3.1.3.4.3.5": {
    fr: "Les groupes (souvent à diffusion large) relaient l'usurpation à toute une population d'un coup.",
    en: "Mailing groups amplify spoofing attacks by broadcasting malicious emails to multiple employees at once."
  },
  "3.1.3.5.1": {
    fr: "POP/IMAP déportent le courrier vers des clients sans protections Gmail (liens, pièces jointes) ni contrôle de session.",
    en: "Legacy POP and IMAP protocols lack MFA support, modern security alerts, and centralized session control."
  },
  "3.1.3.5.2": {
    fr: "Le transfert automatique est le mécanisme privilégié d'exfiltration silencieuse après compromission d'un compte.",
    en: "Automatic email forwarding is the preferred method for stealthy exfiltration following account compromise."
  },
  "3.1.3.5.3": {
    fr: "Une passerelle SMTP personnelle contourne les règles de conformité, la journalisation et le DLP sortants.",
    en: "Per-user outbound SMTP gateways bypass centralized compliance rules, audit logs, and DLP inspection."
  },
  "3.1.3.5.4": {
    fr: "Sans avertissement de destinataire externe, les réponses fuitent des informations internes par simple inattention.",
    en: "Without external recipient warnings, users risk replying with internal sensitive information inadvertently."
  },
  "3.1.3.6.1": {
    fr: "Sans analyse renforcée pré-distribution, des messages suspects atteignent la boîte avant détection.",
    en: "Without enhanced pre-delivery message scanning, advanced threats may land in inboxes before detection."
  },
  "3.1.3.6.2": {
    fr: "Approuver son propre domaine sans authentification permet aux usurpateurs de contourner le filtre anti-spam.",
    en: "Bypassing spam filters for internal senders allows spoofed internal emails to reach victims unchecked."
  },
  "3.1.3.7.1": {
    fr: "Sans stockage complet, des messages routés hors Gmail échappent à l'archivage, à Vault et aux enquêtes.",
    en: "Without comprehensive storage, routed messages bypass Gmail archives, Google Vault, and forensic audits."
  },
  "3.1.3.7.2": {
    fr: "Sans TLS forcé vers les partenaires sensibles, le courrier peut transiter en clair sur Internet.",
    en: "Without mandatory TLS encryption for sensitive partners, communications travel in cleartext over the internet."
  },
  "3.1.4.1.1": {
    fr: "Le partage de fichiers dans des conversations externes est un canal d'exfiltration hors des règles Drive.",
    en: "External file sharing in Google Chat acts as an exfiltration vector outside of standard Drive DLP controls."
  },
  "3.1.4.1.2": {
    fr: "Le partage interne illimité dans Chat diffuse des fichiers hors de la gouvernance documentaire.",
    en: "Uncontrolled file sharing in Chat scatters documents across informal rooms outside information governance."
  },
  "3.1.4.2.1": {
    fr: "Un chat externe ouvert expose les utilisateurs au phishing conversationnel et à la fuite d'informations.",
    en: "Unrestricted external chat exposes staff to social engineering, conversation phishing, and data leakage."
  },
  "3.1.4.3.1": {
    fr: "Des espaces ouverts aux externes mélangent conversations internes et participants non maîtrisés.",
    en: "Spaces open to external guests mix internal discussions with uncontrolled outside participants."
  },
  "3.1.4.4.1": {
    fr: "Les applications Chat tierces accèdent aux conversations et données selon leurs propres conditions.",
    en: "Third-party Chat apps can read and exfiltrate conversation data under their own external privacy policies."
  },
  "3.1.4.4.2": {
    fr: "Un webhook entrant est une porte d'écriture non authentifiée par utilisateur vers vos espaces.",
    en: "Incoming webhooks represent an unauthenticated write gateway into internal communication channels."
  },
  "3.1.6.1": {
    fr: "Des groupes accessibles au public exposent leurs archives (souvent riches en informations internes) à Internet.",
    en: "Publicly accessible Google Groups expose message archives (often full of internal details) to the internet."
  },
  "3.1.6.2": {
    fr: "La création libre de groupes multiplie les listes non gouvernées, avec des réglages de partage hérités hasardeux.",
    en: "Unrestricted group creation leads to ungoverned distribution lists with accidental permissive sharing settings."
  },
  "3.1.6.3": {
    fr: "Des conversations de groupes visibles par défaut au-delà des membres divulguent les échanges internes.",
    en: "Group conversations visible to non-members by default risk leaking confidential internal deliberations."
  },
  "3.1.7.1": {
    fr: "Google Sites permet de publier des pages (potentiellement publiques) sans revue : fuite et défiguration possibles.",
    en: "Google Sites allows users to publish public web pages without security review: risk of data leak or defacement."
  },
  "3.1.8.1": {
    fr: "L'accès aux groupes Google grand public expose aux fuites vers des listes externes et au phishing communautaire.",
    en: "Access to external consumer Google Groups exposes employees to community phishing and accidental leaks."
  },
  "3.1.9.1.1": {
    fr: "Sans liste d'autorisation Marketplace, chaque utilisateur peut installer des applications tierces avec accès OAuth à ses données.",
    en: "Without Marketplace app allowlists, users can install arbitrary third-party apps granting OAuth access to their data."
  },
  "4.1.1.1": {
    fr: "Un compte à privilèges sans MFA se compromet par simple vol de mot de passe : impact total sur le tenant.",
    en: "Privileged admin accounts without MFA can be compromised with a single leaked password, risking the whole tenant."
  },
  "4.1.1.2": {
    fr: "Les OTP/notifications restent phishables ; seules les clés de sécurité résistent aux attaques de type adversary-in-the-middle pour les admins.",
    en: "SMS and push OTPs remain vulnerable to adversary-in-the-middle phishing; hardware security keys are required for admins."
  },
  "4.1.1.3": {
    fr: "Sans 2SV généralisée, chaque mot de passe volé (fuites, réutilisation) devient une compromission de compte.",
    en: "Without organization-wide 2SV, any stolen user password immediately results in a full account takeover."
  },
  "4.1.2.1": {
    fr: "L'auto-récupération d'un super admin (téléphone/e-mail perso) est une voie de prise de contrôle du tenant entier.",
    en: "Super admin self-recovery via personal email/phone is a known vector for total tenant takeover by attackers."
  },
  "4.1.2.2": {
    fr: "Sans récupération en libre-service, les blocages de comptes standards saturent le support et poussent aux contournements.",
    en: "Without self-service recovery for regular users, lockouts overwhelm IT support and encourage insecure workarounds."
  },
  "4.1.3.1": {
    fr: "Les comptes les plus ciblés (direction, admins) restent au niveau de protection standard face à des attaques avancées.",
    en: "High-risk targets (executives, admins) left on standard protections lack defense against sophisticated targeted attacks."
  },
  "4.1.4.1": {
    fr: "Sans défi supplémentaire, une connexion suspecte (empreinte inhabituelle) aboutit sans friction.",
    en: "Without login challenges, suspicious sign-ins from unusual locations or devices proceed without barrier."
  },
  "4.1.5.1": {
    fr: "Mots de passe courts ou réutilisés : vulnérabilité directe au bourrage d'identifiants et aux fuites externes.",
    en: "Short or weak passwords leave user accounts vulnerable to credential stuffing, password spraying, and offline cracking."
  },
  "4.2.1.1": {
    fr: "Des applications tierces non validées obtiennent des jetons OAuth durables sur Gmail/Drive : accès persistant même après changement de mot de passe.",
    en: "Unvetted third-party apps obtain persistent OAuth tokens on Gmail/Drive, retaining access even after password changes."
  },
  "4.2.1.2": {
    fr: "Sans revue périodique, des applications abandonnées ou compromises conservent leurs accès indéfiniment.",
    en: "Without periodic OAuth review, abandoned or compromised third-party apps maintain access to company data forever."
  },
  "4.2.1.3": {
    fr: "Si les applications internes ne sont pas de confiance, les intégrations métier échouent et poussent à des contournements moins sûrs.",
    en: "If internal business apps cannot access Google APIs, employees resort to insecure shadow IT workarounds."
  },
  "4.2.1.4": {
    fr: "Une délégation à l'échelle du domaine compromise donne accès aux données de TOUS les utilisateurs sans leur consentement.",
    en: "Compromised domain-wide delegation grants an attacker unrestricted programmatic access to ALL user mailboxes and Drives."
  },
  "4.2.2.1": {
    fr: "Sans géoblocage, des connexions depuis des zones sans activité légitime ne déclenchent aucune barrière.",
    en: "Without geo-blocking, logins from high-risk countries with no legitimate business activity trigger no automated barrier."
  },
  "4.2.3.1": {
    fr: "Sans DLP, les données sensibles (RIB, données personnelles, secrets) sortent de Drive sans détection.",
    en: "Without Data Loss Prevention (DLP) rules, confidential data (PII, payment info, credentials) leaves Drive undetected."
  },
  "4.2.4.1": {
    fr: "Des sessions sans expiration laissent des accès ouverts sur des postes partagés, perdus ou volés.",
    en: "Infinite or long web sessions leave access open on shared, lost, or stolen workstations."
  },
  "4.2.5.1": {
    fr: "Les consoles Cloud pilotent l'infrastructure : sans ré-authentification, une session volée suffit.",
    en: "Google Cloud consoles control cloud infrastructure: without forced re-authentication, stolen sessions grant full control."
  },
  "4.3.1": {
    fr: "Sans revue du tableau de bord, les signaux d'attaque (pics de phishing, partages anormaux) passent inaperçus.",
    en: "Without regular security dashboard reviews, emerging attack patterns (phishing waves, mass sharing) go unnoticed."
  },
  "4.3.2": {
    fr: "Les recommandations de Security Health non traitées laissent des faiblesses connues et documentées ouvertes.",
    en: "Ignoring Security Health recommendations leaves well-documented, actionable vulnerabilities open to exploitation."
  },
  "5.1.1.1": {
    fr: "Sans revue d'utilisation, les usages anormaux (comptes dormants actifs, volumes inhabituels) ne sont pas détectés.",
    en: "Without app usage reviews, anomalous behaviors (dormant account activity, unusual data volumes) are missed."
  },
  "5.1.1.2": {
    fr: "Le rapport de sécurité agrège les indicateurs clés (2SV, partages externes) : sans revue, la dérive est invisible.",
    en: "Security reports aggregate critical compliance KPIs (2SV adoption, external shares): without review, drift is invisible."
  },
  "6.1": {
    fr: "Un changement de mot de passe non sollicité est souvent le premier signe d'une compromission de compte.",
    en: "An unsolicited password change alert is often the earliest indicator of active account compromise."
  },
  "6.2": {
    fr: "Google signale les attaques étatiques ciblées : sans alerte relayée, l'information n'atteint jamais l'équipe sécurité.",
    en: "Government-backed attack alerts must immediately reach the security team to initiate incident response."
  },
  "6.3": {
    fr: "Une suspension pour activité suspecte doit déclencher une investigation immédiate, pas être découverte plus tard.",
    en: "Suspensions due to suspicious activity require prompt investigation to determine breach scope and remediate."
  },
  "6.4": {
    fr: "Un octroi de privilège admin non attendu est un marqueur d'élévation de privilèges par un attaquant.",
    en: "Unexpected admin privilege grants indicate unauthorized privilege escalation attempts by attackers."
  },
  "6.5": {
    fr: "Une connexion programmatique suspecte signale un vol de jeton ou un script malveillant.",
    en: "Suspicious programmatic login alerts indicate stolen OAuth tokens or malicious API scripts."
  },
  "6.6": {
    fr: "Les connexions suspectes non notifiées laissent l'attaquant agir dans la fenêtre critique.",
    en: "Unnotified suspicious logins give attackers an uninterrupted window to exfiltrate data."
  },
  "6.7": {
    fr: "Un mot de passe divulgué détecté par Google exige une réinitialisation immédiate.",
    en: "A leaked password detected in public breaches requires immediate forced password reset to prevent takeover."
  },
  "6.8": {
    fr: "L'usurpation d'employé dans Gmail précède typiquement une tentative de fraude interne.",
    en: "Gmail employee spoofing detection alerts on BEC fraud attempts before employees execute fraudulent requests."
  }
};

function risquePour_(id) {
  const r = RISQUES[id];
  return (r && r.fr) || 'Écart au benchmark CIS : la protection visée par ce contrôle n\'est pas assurée.';
}

function risquePourEn_(id) {
  const r = RISQUES[id];
  return (r && r.en) || (r && r.fr) ||
    'CIS benchmark deviation: the protection targeted by this check is not enforced.';
}

// ---------------------------------------------------------------------------
// DICTIONNAIRE DE TRADUCTION SERVEUR (FR / EN)
// ---------------------------------------------------------------------------
const TRADUCTIONS_SERVEUR = {
  fr: {
    statuts: {
      'CONFORME': 'CONFORME',
      'NON CONFORME': 'NON CONFORME',
      'ÉCART ACCEPTÉ': 'ÉCART ACCEPTÉ',
      'À VÉRIFIER': 'À VÉRIFIER',
      'MANUEL': 'MANUEL',
      'ERREUR': 'ERREUR',
      'HORS PROFIL': 'HORS PROFIL'
    },
    email: {
      banniere: 'SÉCURITÉ GOOGLE WORKSPACE',
      rapportTitre: 'Rapport d\'audit CIS Foundations v1.4',
      confResiduelle: 'Conformité résiduelle (hors dérogations)',
      confBrute: 'Conformité brute',
      ecartsCorriger: 'Écarts à corriger',
      aucunEcart: '✅ Aucun écart non conforme restant (hors dérogations en vigueur).',
      derogEnVigueur: 'dérogation(s) formelle(s) en vigueur',
      rapportGenere: 'Rapport détaillé Google Sheets généré',
      ouvrirRapport: '📊 Ouvrir le classeur Google Sheets',
      piedGenere: 'Généré par Audit CIS Google Workspace',
      piedExec: ' — Exécuté par : ',
      piedRef: ' — Référentiel : CIS Google Workspace Foundations Benchmark v1.4',
      piedDev: ' — Développé par Fabrice Faucheux (https://faucheux.bzh)'
    },
    sheets: {
      nomSynthese: 'Synthèse',
      nomDetail: 'Détail des contrôles',
      nomPlan: "Plan d'actions",
      nomDerog: 'Registre des dérogations',
      nomPolitiques: 'Politiques (brut)',
      titreSynthese: 'AUDIT CIS GOOGLE WORKSPACE FOUNDATIONS BENCHMARK v1.4',
      dateExec: "Date d'exécution",
      execPar: 'Exécuté par',
      profilAudite: 'Profil audité',
      profilL1: 'Niveau 1',
      profilL2: 'Niveaux 1 + 2',
      versionOutil: "Version de l'outil d'audit",
      referentiel: 'Référentiel',
      referentielDesc: 'CIS Google Workspace Foundations Benchmark v1.4 — document officiel : cisecurity.org/benchmark/google_workspace',
      domaines: 'Domaines',
      nd: 'n/d',
      policiesLues: 'Politiques Cloud Identity lues',
      scoreResiduel: 'Score de conformité résiduel (écarts acceptés exclus)',
      scoreBrut: 'Score de conformité brut (écarts acceptés comptés non conformes)',
      avertCollecte: 'Avertissements de collecte',
      entetesDetail: ['ID CIS', 'Niveau', 'Contrôle', 'Statut', 'Constat / valeur relevée', 'Remédiation (console)'],
      derogationPrefix: 'DÉROGATION — acceptée par ',
      derogationLe: ' le ',
      derogationRev: ' (à réviser le ',
      derogationPerm: ' (permanente)',
      derogationMotif: '. Motif : ',
      derogationConstat: ' | Constat : ',
      entetesPlan: ['Priorité', 'ID CIS', 'Contrôle', 'Constat', 'Action recommandée', 'Risque couvert', 'Responsable', 'Échéance', 'État'],
      prioHaute: 'P1 — Haute',
      prioMoyenne: 'P2 — Moyenne',
      cible: ' Cible : ',
      aFaire: 'À faire',
      aucuneAction: 'Aucune action : aucun écart non conforme restant (hors dérogations).',
      entetesDerog: ['ID CIS', 'Contrôle', 'Statut constaté à cet audit', 'Risque assumé', 'Motif de la dérogation', 'Acceptée par', 'Date', 'À réviser le', 'Observation'],
      nonEvalue: 'non évalué à cet audit',
      derogConforme: 'Contrôle désormais conforme — dérogation à clore.',
      derogDepassee: 'DATE DE RÉVISION DÉPASSÉE — à réexaminer.',
      permanente: 'permanente',
      aucuneDerog: 'Aucune dérogation enregistrée.',
      entetesPolitiques: ['Type de réglage', 'Type de politique', 'Cible (policyQuery)', 'Valeur JSON']
    }
  },
  en: {
    statuts: {
      'CONFORME': 'COMPLIANT',
      'NON CONFORME': 'NON-COMPLIANT',
      'ÉCART ACCEPTÉ': 'ACCEPTED DEVIATION',
      'À VÉRIFIER': 'REVIEW REQUIRED',
      'MANUEL': 'MANUAL',
      'ERREUR': 'ERROR',
      'HORS PROFIL': 'OUT OF PROFILE'
    },
    email: {
      banniere: 'GOOGLE WORKSPACE SECURITY',
      rapportTitre: 'CIS Foundations Benchmark v1.4 Audit Report',
      confResiduelle: 'Residual Compliance (deviations excluded)',
      confBrute: 'Raw Compliance',
      ecartsCorriger: 'Non-Compliant Items to Remediate',
      aucunEcart: '✅ No non-compliant items remaining (excluding active deviations).',
      derogEnVigueur: 'formal deviation(s) currently active',
      rapportGenere: 'Detailed Google Sheets Report Generated',
      ouvrirRapport: '📊 Open Google Sheets Spreadsheet',
      piedGenere: 'Generated by CIS Google Workspace Audit',
      piedExec: ' — Executed by: ',
      piedRef: ' — Reference: CIS Google Workspace Foundations Benchmark v1.4',
      piedDev: ' — Developed by Fabrice Faucheux (https://faucheux.bzh)'
    },
    sheets: {
      nomSynthese: 'Executive Summary',
      nomDetail: 'Control Details',
      nomPlan: 'Action Plan',
      nomDerog: 'Deviation Register',
      nomPolitiques: 'Raw Policies',
      titreSynthese: 'CIS GOOGLE WORKSPACE FOUNDATIONS BENCHMARK v1.4 AUDIT',
      dateExec: 'Execution Date',
      execPar: 'Executed By',
      profilAudite: 'Audited Profile',
      profilL1: 'Level 1',
      profilL2: 'Level 1 + Level 2',
      versionOutil: 'Audit Tool Version',
      referentiel: 'Benchmark Reference',
      referentielDesc: 'CIS Google Workspace Foundations Benchmark v1.4 — Official document: cisecurity.org/benchmark/google_workspace',
      domaines: 'Tenant Domains',
      nd: 'n/a',
      policiesLues: 'Cloud Identity Policies Queried',
      scoreResiduel: 'Residual Compliance Score (deviations excluded)',
      scoreBrut: 'Raw Compliance Score (deviations counted as non-compliant)',
      avertCollecte: 'Collection Warnings',
      entetesDetail: ['CIS ID', 'Level', 'Control', 'Status', 'Observed Finding / Value', 'Remediation (Console)'],
      derogationPrefix: 'DEVIATION — Accepted by ',
      derogationLe: ' on ',
      derogationRev: ' (review by ',
      derogationPerm: ' (permanent)',
      derogationMotif: '. Reason: ',
      derogationConstat: ' | Finding: ',
      entetesPlan: ['Priority', 'CIS ID', 'Control', 'Finding', 'Recommended Action', 'Covered Risk', 'Owner', 'Due Date', 'Status'],
      prioHaute: 'P1 — High',
      prioMoyenne: 'P2 — Medium',
      cible: ' Target: ',
      aFaire: 'To Do',
      aucuneAction: 'No actions required: no non-compliant findings remaining (excluding deviations).',
      entetesDerog: ['CIS ID', 'Control', 'Audit Status', 'Assumed Risk', 'Deviation Reason', 'Accepted By', 'Date', 'Review By', 'Notes'],
      nonEvalue: 'not evaluated in this audit',
      derogConforme: 'Control now compliant — deviation can be closed.',
      derogDepassee: 'REVIEW DATE OVERDUE — re-evaluation required.',
      permanente: 'permanent',
      aucuneDerog: 'No deviations registered.',
      entetesPolitiques: ['Setting Type', 'Policy Type', 'Target (policyQuery)', 'JSON Value']
    }
  }
};
