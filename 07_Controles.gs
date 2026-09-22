/**
 * ============================================================================
 *  AUDIT CIS GOOGLE WORKSPACE — 07_Controles
 * ============================================================================
 *  Définition des 87 contrôles du benchmark CIS v1.4.
 *
 *  Les fichiers sont numérotés pour fixer l'ordre de chargement : Apps Script
 *  partage une portée globale entre eux, et une constante de premier niveau
 *  n'est pas remontée comme l'est une déclaration de fonction.
 *  Vue d'ensemble et historique : 00_Config.gs et CHANGELOG.md.
 * ============================================================================
 */


// ---------------------------------------------------------------------------
// DÉFINITION DES 87 CONTRÔLES (86 CIS v1.4 + 1 bonus 1.1.3)
// ---------------------------------------------------------------------------
function manuel_(chemin, complement) {
  return function () {
    return {
      statut: STATUT.MANUAL,
      detail: 'Contrôle non exposé par API — revue manuelle requise. Console : ' + chemin +
        (complement ? ' | ' + complement : '')
    };
  };
}

const DEFINITION_CONTROLES = [

  // ===== SECTION 1 — COMPTES ================================================
  {
    id: '1.1.1', level: 'L1',
    titre: 'Entre 2 et 4 comptes Super Admin désignés', titreEn: 'Ensure that between two and four global admins are designated',
    remediation: 'Admin > Annuaire > Utilisateurs — Maintenir entre 2 et 4 comptes Super Admin dédiés.', remediationEn: 'Create at least one additional account with a Super Admin role if there is only 1 Super Admin account. If more than 4 accounts with Super Admin access, reduce the number of accounts with a Super Admin role. NOTE: A new account should be created vs adding this role to an existing account since Administration tasks should be done through separate Admin accounts.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const n = ctx.superAdmins.length;
      if (n < 2) {
        return {
          statut: STATUT.FAIL,
          detail: n + ' super admin actif : au moins 2 comptes sont requis pour éviter un point unique de défaillance (' + ctx.superAdmins.map(function (u) { return u.primaryEmail; }).join(', ') + ').'
        };
      }
      if (n > 4) {
        return {
          statut: STATUT.FAIL,
          detail: n + ' super admins actifs : maximum 4 autorisé par le benchmark pour limiter la surface d\'attaque (' + ctx.superAdmins.map(function (u) { return u.primaryEmail; }).join(', ') + ').'
        };
      }
      return {
        statut: STATUT.PASS,
        detail: n + ' super admins actifs : ' + ctx.superAdmins.map(function (u) { return u.primaryEmail; }).join(', ')
      };
    }
  },
  {
    id: '1.1.2', level: 'L1',
    titre: 'Comptes super admin non cumulés avec un rôle d\'administrateur délégué', titreEn: 'Ensure super admin accounts are used only for super admin activities',
    remediation: 'Séparer les privilèges : un super administrateur ne doit pas cumuler de rôle d\'administrateur délégué (Admin > Annuaire > Utilisateurs > Rôles d\'administrateur).', remediationEn: 'For every Super admin that is also a Delegated admin account, separate duties: remove delegated admin roles from Super admin accounts and use separate dedicated accounts.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const cumuls = ctx.superAdmins.filter(function (u) { return u.isDelegatedAdmin; });
      if (cumuls.length > 0) {
        return {
          statut: STATUT.FAIL,
          detail: cumuls.length + ' super admin(s) cumulant également un rôle d\'administrateur délégué : ' +
            cumuls.map(function (u) { return u.primaryEmail; }).join(', ')
        };
      }
      return {
        statut: STATUT.PASS,
        detail: 'Aucun super administrateur ne cumule de rôle d\'administrateur délégué (' + ctx.superAdmins.length + ' vérifiés).'
      };
    }
  },
  {
    id: '1.1.3', level: 'L1',
    titre: 'Comptes super admin dédiés aux seules tâches d\'administration (bonus)', titreEn: 'Ensure super admin accounts are dedicated exclusively to administration tasks (bonus)',
    remediation: 'Chaque admin doit posséder un compte nominatif standard distinct pour l\'usage quotidien.', remediationEn: 'Each admin should have a separate regular account for daily activities.',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const suspects = ctx.superAdmins.filter(function (u) {
        return !/^(admin|adm|sadmin|superadmin|it-|si-|dsi)/i.test(u.primaryEmail);
      });
      return {
        statut: STATUT.REVIEW,
        detail: 'Vérifier que ces comptes ne servent pas à un usage quotidien (mail, docs) : ' +
          ctx.superAdmins.map(function (u) { return u.primaryEmail + ' (dernière connexion : ' + (u.lastLoginTime || 'jamais') + ')'; }).join(' ; ') +
          (suspects.length ? ' | Comptes à nommage non dédié : ' + suspects.map(function (u) { return u.primaryEmail; }).join(', ') : '')
      };
    }
  },
  {
    id: '1.2.1.1', level: 'L1',
    titre: 'Accès externe aux données de l\'annuaire restreint', titreEn: 'Ensure directory data access is externally restricted',
    remediation: 'Admin > Annuaire > Paramètres de l\'annuaire > Paramètres de partage > Contacts externes.', remediationEn: 'To configure this setting via the Google Workspace Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Open the collapsed menu via "hamburger button \\ 3 horizontal lines" 3. Under Directory, select Directory settings 4. Under Sharing settings, select External Directory sharing 5. Select Authenticated user basic profile fields',
    check: controlePolitique_('directory.external_directory_access',
      function (v) {
        const s = champ_(v, ['externalDirectoryAccess', 'sharingSetting', 'state']);
        if (s === undefined) return null;
        return !/ALL|ENABLED|PUBLIC/i.test(String(s));
      },
      'accès annuaire externe désactivé ou restreint')
  },

  // ===== SECTION 3.1.1 — AGENDA =============================================
  {
    id: '3.1.1.1.1', level: 'L1',
    titre: 'Partage externe des agendas principaux limité (disponibilités uniquement)', titreEn: 'Ensure external sharing options for primary calendars are configured',
    remediation: 'Admin > Applications > Google Workspace > Agenda > Paramètres de partage.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under Sharing settings, select External sharing options for primary',
    check: controlePolitique_('calendar.primary_calendar_max_allowed_external_sharing',
      function (v) {
        const s = champ_(v, ['maxAllowedExternalSharing', 'externalSharingOptions']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|NO_SHARING|NONE/i.test(String(s));
      },
      'partage externe limité aux disponibilités (free/busy) ou désactivé')
  },
  {
    id: '3.1.1.1.2', level: 'L2',
    titre: 'Partage interne des agendas principaux limité aux disponibilités', titreEn: 'Ensure internal sharing options for primary calendars are configured',
    remediation: 'Agenda > Paramètres de partage > Options de partage interne des agendas principaux : sélectionner "Afficher uniquement les disponibilités (masquer les détails des événements)".', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under Sharing settings, select Internal sharing options for primary calendars 6. Select Only free/busy information (hide event details)',
    check: controlePolitique_('calendar.primary_calendar_internal_sharing',
      function (v) {
        const s = champ_(v, ['internalSharing', 'defaultInternalSharing', 'sharingOption', 'primaryCalendarInternalSharing']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|HIDE_DETAILS|HIDE_EVENT_DETAILS|NO_SHARING|NONE/i.test(String(s));
      },
      'partage interne limité aux disponibilités uniquement (free/busy)')
  },
  {
    id: '3.1.1.1.3', level: 'L1',
    titre: 'Avertissement pour les invitations externes activé', titreEn: 'Ensure external invitation warnings for Google Calendar are configured',
    remediation: 'Agenda > Paramètres de partage > Invitations externes : avertir les utilisateurs.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under Sharing settings, select External Invitations',
    check: controlePolitique_('calendar.external_invitations',
      function (v) {
        const s = champ_(v, ['warnOnInvite', 'externalInvitationWarning', 'warnOnExternalGuests']);
        return estActive_(s);
      },
      'avertissement activé lors d\'invitations d\'externes')
  },
  {
    id: '3.1.1.2.1', level: 'L1',
    titre: 'Partage externe des agendas secondaires limité', titreEn: 'Ensure external sharing options for secondary calendars are configured',
    remediation: 'Agenda > Paramètres généraux > Agendas secondaires.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under General settings, select External sharing options for',
    check: controlePolitique_('calendar.secondary_calendar_max_allowed_external_sharing',
      function (v) {
        const s = champ_(v, ['maxAllowedExternalSharing', 'externalSharingOptions']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|NO_SHARING|NONE/i.test(String(s));
      },
      'partage externe des agendas secondaires limité aux disponibilités ou désactivé')
  },
  {
    id: '3.1.1.2.2', level: 'L2',
    titre: 'Partage interne des agendas secondaires limité aux disponibilités', titreEn: 'Ensure internal sharing options for secondary calendars are configured',
    remediation: 'Agenda > Paramètres généraux > Options de partage interne des agendas secondaires : sélectionner "Afficher uniquement les disponibilités (masquer les détails des événements)".', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under General settings, select Internal sharing options for secondary calendars 6. Select Only free/busy information (hide event details)',
    check: controlePolitique_('calendar.secondary_calendar_internal_sharing',
      function (v) {
        const s = champ_(v, ['internalSharing', 'defaultInternalSharing', 'secondaryCalendarInternalSharing']);
        if (s === undefined) return null;
        return /FREE_BUSY|ONLY_FREE_BUSY|HIDE_DETAILS|HIDE_EVENT_DETAILS|NO_SHARING|NONE/i.test(String(s));
      },
      'partage interne des agendas secondaires limité aux disponibilités uniquement (free/busy)')
  },
  {
    id: '3.1.1.3.1', level: 'L2',
    titre: 'Mode hors connexion d\'Agenda web désactivé', titreEn: 'Ensure calendar web offline is disabled',
    remediation: 'Agenda > Paramètres avancés > Hors connexion.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Calendar 5. Under Advanced settings, select Calendar web offline',
    check: controlePolitique_('calendar.web_offline',
      function (v) { return estDesactive_(champ_(v, ['enableOutOfOffice', 'webOfflineEnabled', 'enabled', 'state'])); },
      'accès hors connexion à Agenda désactivé')
  },

  // ===== SECTION 3.1.2 — DRIVE ET DOCS ======================================
  {
    id: '3.1.2.1.1.1', level: 'L1',
    titre: 'Avertissement lors du partage de fichiers hors du domaine', titreEn: 'Ensure users are warned when they share a file outside their domain',
    remediation: 'Admin > Applications > Drive et Docs > Paramètres de partage.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Drive and Docs 4. Select Sharing Settings 5. Select Sharing Options',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const w = champ_(v, ['warnForExternalSharing', 'warnForSharingOutsideAllowlistedDomains']);
        const niveau = champ_(v, ['externalSharingMode', 'sharingOutsideDomain']);
        if (niveau !== undefined && /DISALLOWED|NOT_ALLOWED|OFF/i.test(String(niveau))) return true; // partage externe interdit = conforme a fortiori
        return estActive_(w);
      },
      'avertissement activé (ou partage externe totalement désactivé)')
  },
  {
    id: '3.1.2.1.1.2', level: 'L1',
    titre: 'Publication de fichiers sur le web / visibilité mondiale interdite', titreEn: 'Ensure users cannot publish files to the web or make visible to the world as public or unlisted',
    remediation: 'Drive et Docs > Paramètres de partage : décocher publication sur le web.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Under Sharing settings, select Sharing options',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const p = champ_(v, ['allowPublishingFiles', 'allowFilesPublishedOnWeb', 'allowNonGoogleInvites']);
        const d = estDesactive_(p);
        return d;
      },
      'publication sur le web désactivée')
  },
  {
    id: '3.1.2.1.1.3', level: 'L2',
    titre: 'Partage de documents contrôlé par listes de domaines autorisés', titreEn: 'Ensure document sharing is being controlled by domain with allowlists',
    remediation: 'Drive et Docs > Paramètres de partage : limiter aux domaines de la liste blanche.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Under Sharing settings, select Sharing options',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const niveau = champ_(v, ['externalSharingMode', 'sharingOutsideDomain']);
        if (niveau === undefined) return null;
        return /ALLOWLIST|WHITELIST|DISALLOWED|NOT_ALLOWED/i.test(String(niveau));
      },
      'partage externe limité aux domaines en liste blanche (ou désactivé)')
  },
  {
    id: '3.1.2.1.1.4', level: 'L2',
    titre: 'Avertissement lors du partage vers un domaine en liste blanche', titreEn: 'Ensure users are warned when they share a file with users in an allowlisted domain',
    remediation: 'Drive et Docs > Paramètres de partage (option d\'avertissement liste blanche).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Drive and Docs 4. Select Sharing Settings 5. Select Sharing Options',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        return estActive_(champ_(v, ['warnForSharingOutsideAllowlistedDomains', 'warnForAllowlistedDomainSharing']));
      },
      'avertissement activé pour les partages vers domaines autorisés')
  },
  {
    id: '3.1.2.1.1.5', level: 'L1',
    titre: 'Access Checker configuré sur "Destinataires uniquement"', titreEn: 'Ensure Access Checker is configured to limit file access',
    remediation: 'Drive et Docs > Paramètres de partage > Access Checker : sélectionner "Destinataires uniquement (sans suggestion d\'élargissement)".', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Sharing Settings 6. Under Access Checker, select Recipients only',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const a = champ_(v, ['accessCheckerSuggestions', 'accessChecker']);
        if (a === undefined) return null;
        return /RECIPIENT|RECIPIENTS_ONLY|ONLY_RECIPIENTS/i.test(String(a)) && !/AUDIENCE|DOMAIN|PUBLIC|ANYONE/i.test(String(a));
      },
      'Access Checker configuré sur "Destinataires uniquement" (Recipients only)')
  },
  {
    id: '3.1.2.1.1.6', level: 'L1',
    titre: 'Diffusion de contenu en externe réservée aux membres de l\'organisation', titreEn: 'Ensure only users inside your organization can distribute content externally',
    remediation: 'Drive et Docs > Paramètres de partage > Distribution de contenu externe.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Under Sharing settings, select Sharing options',
    check: controlePolitique_('drive_and_docs.external_sharing',
      function (v) {
        const s = champ_(v, ['allowNonDomainUsersContentDistribution', 'externalContentDistribution', 'allowReceivingExternalFiles']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return !/ALLOWED_ALL|ANYONE/i.test(String(s));
      },
      'seuls les utilisateurs internes peuvent distribuer du contenu en externe')
  },
  {
    id: '3.1.2.1.2.1', level: 'L1',
    titre: 'Création de Drive partagés par les utilisateurs (selon politique interne)', titreEn: 'Audit users ability to create new shared drives',
    remediation: 'Drive et Docs > Paramètres de partage > Création de Drive partagés.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Under Sharing settings, select Shared drive creation',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowSharedDriveCreation', 'allowContentManagersToShareFolders', 'sharedDriveCreationAllowed']);
        // Le CIS recommande de PERMETTRE la création (gouvernance des données) — valeur attendue : activé.
        return estActive_(s);
      },
      'création de Drive partagés autorisée (recommandation CIS)')
  },
  {
    id: '3.1.2.1.2.2', level: 'L1',
    titre: 'Les gestionnaires ne peuvent pas outrepasser les réglages des Drive partagés', titreEn: 'Ensure manager access members cannot modify shared drive settings',
    remediation: 'Drive et Docs > Drive partagés : interdire la modification des réglages par les gestionnaires.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Sharing settings',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowManagersToOverrideSettings', 'orgUnitAllowsManagersToOverrideSettings']);
        return estDesactive_(s);
      },
      'gestionnaires NE pouvant PAS modifier les réglages')
  },
  {
    id: '3.1.2.1.2.3', level: 'L1',
    titre: 'Accès aux fichiers des Drive partagés réservé aux membres', titreEn: 'Ensure shared drive file access is restricted to members only',
    remediation: 'Drive et Docs > Drive partagés : accès restreint aux membres.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Sharing settings',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowNonMemberAccess', 'orgUnitAllowsNonMemberAccess']);
        return estDesactive_(s);
      },
      'accès non-membres désactivé')
  },
  {
    id: '3.1.2.1.2.4', level: 'L2',
    titre: 'Téléchargement / impression / copie interdits aux lecteurs et commentateurs', titreEn: 'Ensure \'Download, print, and copy is enabled for\' is not set to \'Everyone (Managers, content managers, contributors, commenters and viewers)\'',
    remediation: 'Drive et Docs > Drive partagés : bloquer téléchargement pour lecteurs/commentateurs.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Sharing settings',
    check: controlePolitique_('drive_and_docs.shared_drive_creation',
      function (v) {
        const s = champ_(v, ['allowViewersAndCommentersToDownload', 'allowedPartiesToDownloadCopyPrint']);
        return estDesactive_(s);
      },
      'téléchargement/copie/impression désactivés pour lecteurs et commentateurs')
  },
  {
    id: '3.1.2.2.1', level: 'L1',
    titre: 'Accès hors connexion aux documents désactivé', titreEn: 'Ensure offline access to documents is disabled',
    remediation: 'Drive et Docs > Fonctionnalités et applications > Hors connexion.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Features and Applications',
    check: controlePolitique_('drive_and_docs.docs_offline',
      function (v) { return estDesactive_(champ_(v, ['enableDocsOffline', 'docsOfflineEnabled', 'enabled', 'state'])); },
      'mode hors connexion Docs désactivé')
  },
  // ===== SECTION 3.1.2.3 — GOOGLE DRIVE FOR DESKTOP (CIS v1.4) ===============
  {
    id: '3.1.2.3.1', level: 'L1',
    titre: 'Accès à Drive pour ordinateur (desktop) désactivé', titreEn: 'Ensure desktop access to Drive is disabled',
    remediation: 'Drive et Docs > Google Drive for desktop > Désactiver « Allow Google Drive for desktop in your organization ».', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Drive and Docs 5. Select Google Drive for desktop',
    check: controlePolitique_('drive_and_docs.drive_for_desktop',
      function (v) { return estDesactive_(champ_(v, ['allowDriveForDesktop', 'enabled', 'state'])); },
      'Drive pour ordinateur désactivé')
  },
  // NOTE CIS v1.4 : le contrôle « Add-Ons » (ex 3.1.2.2.3 en v1.3) a été
  // supprimé du benchmark (Ticket 25810) — le réglage n'existe plus dans l'UI.

  // ===== SECTION 3.1.3 — GMAIL ==============================================
  {
    id: '3.1.3.1.1', level: 'L1',
    titre: 'Délégation de boîte mail interdite', titreEn: 'Ensure users cannot delegate access to their mailbox',
    remediation: 'Admin > Applications > Gmail > Paramètres utilisateur > Délégation.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under User Settings - Mail delegation, set Let users delegate access',
    check: controlePolitique_('gmail.mail_delegation',
      function (v) { return estDesactive_(champ_(v, ['enableMailDelegation', 'enabled', 'state'])); },
      'délégation de messagerie désactivée')
  },
  {
    id: '3.1.3.1.2', level: 'L1',
    titre: 'Gmail hors connexion désactivé', titreEn: 'Ensure offline access to Gmail is disabled',
    remediation: 'Gmail > Paramètres utilisateur > Hors connexion.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Gmail 4. Select User Settings 5. SelectGmail web offline',
    check: controlePolitique_('gmail.offline_access',
      function (v) { return estDesactive_(champ_(v, ['enableOfflineAccess', 'enabled', 'state'])); },
      'Gmail hors connexion désactivé')
  },
  {
    id: '3.1.3.2.1', level: 'L1',
    titre: 'DKIM activé pour tous les domaines de messagerie', titreEn: 'Ensure that DKIM is enabled for all mail enabled domains',
    remediation: 'Gmail > Authentification des e-mails : générer et publier la clé DKIM, puis activer la signature.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Authenticate email, select - Generate new record',
    check: function (ctx) { return verifierDns_(ctx, 'dkim', 'DKIM'); }
  },
  {
    id: '3.1.3.2.2', level: 'L1',
    titre: 'Enregistrement SPF configuré pour tous les domaines', titreEn: 'Ensure the SPF record is configured for all mail enabled domains',
    remediation: 'Publier un TXT "v=spf1 include:_spf.google.com ~all" (adapter aux émetteurs légitimes).', remediationEn: 'Configure the DNS record for each domain. • If all email in your domain is sent from and received by Google Gmail, add the following TXT record for each domain: v=spf1 include:_spf.google.com ~all NOTE: This will likely need to be configured at your domain registrar (Godaddy, etc.).',
    check: function (ctx) { return verifierDns_(ctx, 'spf', 'SPF'); }
  },
  {
    id: '3.1.3.2.3', level: 'L1',
    titre: 'Enregistrement DMARC configuré pour tous les domaines', titreEn: 'Ensure the DMARC record is configured for all mail enabled domains',
    remediation: 'Publier un TXT _dmarc.<domaine> "v=DMARC1; p=quarantine|reject; rua=..." (p=none insuffisant à terme).', remediationEn: 'Configure the DNS record for each domain. 1. If all email in your domain is sent from and received by Google Gmail, add the following TXT record for the domain: v=DMARC1; p=none; rua=mailto:<report@domain1.com> NOTE: This will likely need to be configured at your domain registrar (Godaddy, etc.).',
    check: function (ctx) { return verifierDns_(ctx, 'dmarc', 'DMARC'); }
  },
  {
    id: '3.1.3.3.1', level: 'L1',
    titre: 'Notifications admin des quarantaines Gmail activées', titreEn: 'Enable quarantine admin notifications for Gmail',
    remediation: 'Gmail > Gérer les quarantaines : activer la notification périodique aux admins.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Manage quarantines, set Notify periodically when messages are',
    check: manuel_('Applications > Gmail > Gérer les quarantaines',
      'Vérifier que chaque quarantaine a l\'option de notification admin cochée.')
  },
  {
    id: '3.1.3.4.1.1', level: 'L1',
    titre: 'Protection contre pièces jointes chiffrées d\'expéditeurs non fiables', titreEn: 'Ensure protection against encrypted attachments from untrusted senders is enabled',
    remediation: 'Gmail > Sécurité (Safety) > Pièces jointes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Attachments, set Protect against encrypted attachments',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableEncryptedAttachmentProtection', 'encryptedAttachmentProtectionEnabled'])); },
      'protection pièces jointes chiffrées activée')
  },
  {
    id: '3.1.3.4.1.2', level: 'L1',
    titre: 'Protection contre pièces jointes avec scripts d\'expéditeurs non fiables', titreEn: 'Ensure protection against attachments with scripts from untrusted senders is enabled',
    remediation: 'Gmail > Sécurité > Pièces jointes.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Attachments, set Protect against attachments with',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableAttachmentWithScriptsProtection', 'attachmentWithScriptsProtectionEnabled'])); },
      'protection scripts dans pièces jointes activée')
  },
  {
    id: '3.1.3.4.1.3', level: 'L1',
    titre: 'Protection contre types de pièces jointes anormaux', titreEn: 'Ensure protection against anomalous attachment types in emails is enabled',
    remediation: 'Gmail > Sécurité > Pièces jointes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Attachments, set Protect against anomalous attachment',
    check: controlePolitique_('gmail.email_attachment_safety',
      function (v) { return estActive_(champ_(v, ['enableAnomalousAttachmentProtection', 'anomalousAttachmentProtectionEnabled'])); },
      'protection types de pièces jointes anormaux activée')
  },
  {
    id: '3.1.3.4.2.1', level: 'L1',
    titre: 'Identification des liens derrière URL raccourcies activée', titreEn: 'Ensure link identification behind shortened URLs is enabled',
    remediation: 'Gmail > Sécurité > Liens et images externes.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Links and external images, set Identify links behind',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableShortenerScanning', 'shortenerScanningEnabled'])); },
      'analyse des URL raccourcies activée')
  },
  {
    id: '3.1.3.4.2.2', level: 'L1',
    titre: 'Analyse des images liées pour contenu malveillant activée', titreEn: 'Ensure scan linked images for malicious content is enabled',
    remediation: 'Gmail > Sécurité > Liens et images externes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Links and external images, set Scan linked images to',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableExternalImageScanning', 'externalImageScanningEnabled'])); },
      'analyse des images liées activée')
  },
  {
    id: '3.1.3.4.2.3', level: 'L1',
    titre: 'Avertissement au clic sur liens vers domaines non fiables activé', titreEn: 'Ensure warning prompt is shown for any click on links to untrusted domains',
    remediation: 'Gmail > Sécurité > Liens et images externes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Links and external images, set Show warning prompt for',
    check: controlePolitique_('gmail.links_and_external_images',
      function (v) { return estActive_(champ_(v, ['enableAggressiveWarningsOnUntrustedLinks', 'aggressiveWarningsEnabled'])); },
      'avertissement liens non fiables activé')
  },
  {
    id: '3.1.3.4.3.1', level: 'L1',
    titre: 'Protection contre l\'usurpation par domaines similaires', titreEn: 'Ensure protection against domain spoofing based on similar domain names is enabled',
    remediation: 'Gmail > Sécurité > Usurpation d\'identité et authentification.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Spoofing and authentication, set Protect against',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectDomainNameSpoofing', 'domainNameSpoofingProtectionEnabled'])); },
      'détection domaines similaires activée')
  },
  {
    id: '3.1.3.4.3.2', level: 'L1',
    titre: 'Protection contre l\'usurpation de noms d\'employés', titreEn: 'Ensure protection against spoofing of employee names is enabled',
    remediation: 'Gmail > Sécurité > Usurpation.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Spoofing and authentication, set Protect against',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectEmployeeNameSpoofing', 'employeeNameSpoofingProtectionEnabled'])); },
      'détection usurpation de noms d\'employés activée')
  },
  {
    id: '3.1.3.4.3.3', level: 'L1',
    titre: 'Protection contre les e-mails entrants usurpant votre domaine', titreEn: 'Ensure protection against inbound emails spoofing your domain is enabled',
    remediation: 'Gmail > Sécurité > Usurpation.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Spoofing and authentication, set Protect against',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectDomainSpoofingFromUnauthenticatedSenders', 'domainSpoofingProtectionEnabled'])); },
      'détection usurpation de votre domaine activée')
  },
  {
    id: '3.1.3.4.3.4', level: 'L1',
    titre: 'Protection contre tout e-mail non authentifié', titreEn: 'Ensure protection against any unauthenticated emails is enabled',
    remediation: 'Gmail > Sécurité > Usurpation.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Spoofing and authentication, set Protect against any',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectUnauthenticatedEmails', 'unauthenticatedEmailProtectionEnabled'])); },
      'protection e-mails non authentifiés activée')
  },
  {
    id: '3.1.3.4.3.5', level: 'L1',
    titre: 'Groupes protégés des e-mails entrants usurpant le domaine', titreEn: 'Ensure groups are protected from inbound emails spoofing your domain',
    remediation: 'Gmail > Sécurité > Usurpation (protection des groupes).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under Safety - Spoofing and authentication, set Protect your Groups',
    check: controlePolitique_('gmail.spoofing_and_authentication',
      function (v) { return estActive_(champ_(v, ['detectGroupsSpoofing', 'groupsSpoofingProtectionEnabled'])); },
      'protection usurpation vers les groupes activée')
  },
  {
    id: '3.1.3.5.1', level: 'L2',
    titre: 'Accès POP et IMAP désactivé pour tous les utilisateurs', titreEn: 'Ensure POP and IMAP access is disabled for all users',
    remediation: 'Gmail > Accès utilisateur final > POP et IMAP.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under End User Access - POP and IMAP Access',
    check: controlePolitique_('gmail.pop_access', function (v) {
      return estDesactive_(champ_(v, ['enablePopAccess', 'enabled', 'state']));
    }, 'POP désactivé — vérifier aussi gmail.imap_access dans l\'onglet Politiques (brut)')
  },
  {
    id: '3.1.3.5.2', level: 'L1',
    titre: 'Transfert automatique désactivé', titreEn: 'Ensure automatic forwarding options are disabled',
    remediation: 'Gmail > Accès utilisateur final > Transfert automatique.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under End User Access - Automatic forwarding, set Allow users to',
    check: controlePolitique_('gmail.auto_forwarding',
      function (v) { return estDesactive_(champ_(v, ['enableAutoForwarding', 'enabled', 'state'])); },
      'transfert automatique désactivé')
  },
  {
    id: '3.1.3.5.3', level: 'L1',
    titre: 'Passerelles sortantes par utilisateur désactivées', titreEn: 'Ensure per-user outbound gateways is disabled',
    remediation: 'Gmail > Accès utilisateur final > Passerelle sortante par utilisateur.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Under End User Access - Allow per-user outbound gateways, set Allow',
    check: controlePolitique_('gmail.per_user_outbound_gateway',
      function (v) { return estDesactive_(champ_(v, ['allowUsersToUseExternalSmtp', 'enabled', 'state'])); },
      'passerelle SMTP externe par utilisateur désactivée')
  },
  {
    id: '3.1.3.5.4', level: 'L1',
    titre: 'Avertissement destinataires externes activé', titreEn: 'Ensure external recipient warnings are enabled',
    remediation: 'Gmail > Accès utilisateur final > Avertissement de réponse à un externe.', remediationEn: 'To configure external recipient warnings are enabled, use the Google Workspace Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail',
    check: controlePolitique_('gmail.unintended_external_reply_warning',
      function (v) { return estActive_(champ_(v, ['enableUnintendedExternalReplyWarning', 'enabled', 'state'])); },
      'avertissement destinataire externe activé')
  },
  {
    id: '3.1.3.6.1', level: 'L1',
    titre: 'Analyse renforcée des messages avant distribution activée', titreEn: 'Ensure enhanced pre-delivery message scanning is enabled',
    remediation: 'Gmail > Spam, hameçonnage et logiciels malveillants > Analyse renforcée pré-distribution.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Select Spam, phishing, and malware',
    check: controlePolitique_('gmail.enhanced_pre_delivery_message_scanning',
      function (v) { return estActive_(champ_(v, ['enableImprovedSuspiciousContentDetection', 'enabled', 'state'])); },
      'analyse renforcée activée')
  },
  {
    id: '3.1.3.6.2', level: 'L1',
    titre: 'Filtres anti-spam non contournés pour les expéditeurs internes', titreEn: 'Ensure spam filters are not bypased for internal senders',
    remediation: 'Gmail > Spam : ne pas ajouter le domaine interne en liste d\'expéditeurs approuvés sans authentification.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Select Spam, phishing, and malware',
    check: controlePolitique_('gmail.spam_override_lists',
      function (v) {
        const listes = champ_(v, ['spamOverrideLists', 'approvedSenders', 'lists']);
        if (listes === undefined) return null;
        if (Array.isArray(listes) && listes.length === 0) return true;
        return null; // listes présentes -> revue humaine du contenu
      },
      'aucune liste d\'approbation contournant le filtre anti-spam pour les internes (si listes présentes, vérifier leur contenu)')
  },
  {
    id: '3.1.3.7.1', level: 'L1',
    titre: 'Stockage complet des e-mails (comprehensive mail storage) activé', titreEn: 'Ensure comprehensive mail storage is enabled',
    remediation: 'Gmail > Conformité > Stockage complet du courrier.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Select Compliance',
    check: controlePolitique_('gmail.comprehensive_mail_storage',
      function (v) { return estActive_(champ_(v, ['enableComprehensiveMailStorage', 'enabled', 'state'])); },
      'stockage complet activé')
  },
  {
    id: '3.1.3.7.2', level: 'L1',
    titre: 'Envoi des e-mails via connexion TLS sécurisée activé', titreEn: 'Ensure \'Send email over a secure TLS connection\' Is Enabled',
    remediation: 'Gmail > Conformité > Connexion TLS sécurisée (au minimum vers domaines partenaires).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Gmail 5. Select Compliance',
    check: manuel_('Applications > Gmail > Conformité > Connexion TLS sécurisée',
      'Réglage de conformité par domaine non exposé par la Policy API — vérifier la règle TLS.')
  },

  // ===== SECTION 3.1.4 — GOOGLE CHAT ========================================
  {
    id: '3.1.4.1.1', level: 'L1',
    titre: 'Partage de fichiers externe dans Chat désactivé', titreEn: 'Ensure external filesharing in Google Chat and Hangouts is disabled',
    remediation: 'Admin > Applications > Google Chat > Partage de fichiers.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select Chat File Sharing 5. Under Setting, set External filesharing to No files',
    check: controlePolitique_('chat.chat_file_sharing',
      function (v) {
        const s = champ_(v, ['externalFileSharing', 'externalChatFileSharing']);
        if (s === undefined) return null;
        return /NO_FILES|DISABLED|OFF/i.test(String(s));
      },
      'partage de fichiers externe désactivé (NO_FILES)')
  },
  {
    id: '3.1.4.1.2', level: 'L2',
    titre: 'Partage de fichiers interne dans Chat désactivé (NO_FILES)', titreEn: 'Ensure internal filesharing in Google Chat and Hangouts is disabled',
    remediation: 'Google Chat > Partage de fichiers : définir le partage de fichiers interne sur "Aucun fichier" (No files).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select Chat File Sharing 5. Under Setting, set Internal filesharing to No files',
    check: controlePolitique_('chat.chat_file_sharing',
      function (v) {
        const s = champ_(v, ['internalFileSharing', 'internalChatFileSharing']);
        if (s === undefined) return null;
        return /NO_FILES|DISABLED/i.test(String(s)) && !/IMAGES_ONLY|ALL_FILES/i.test(String(s));
      },
      'partage interne de fichiers dans Chat désactivé (NO_FILES)')
  },
  {
    id: '3.1.4.2.1', level: 'L1',
    titre: 'Chat externe restreint aux domaines autorisés', titreEn: 'Ensure Google Chat externally is restricted to allowed domains',
    remediation: 'Google Chat > Paramètres de chat externe : limiter aux domaines de confiance.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select External Chat Settings 5. Select Chat externally',
    check: controlePolitique_('chat.external_chat_restriction',
      function (v) {
        const s = champ_(v, ['allowExternalChat', 'externalChatRestriction', 'restrictionLevel']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return /TRUSTED_DOMAINS|ALLOWLISTED|NO_EXTERNAL|DISABLED/i.test(String(s));
      },
      'chat externe désactivé ou restreint aux domaines de confiance')
  },
  {
    id: '3.1.4.3.1', level: 'L1',
    titre: 'Espaces (Spaces) externes restreints', titreEn: 'Ensure external spaces in Google Chat and Hangouts are restricted',
    remediation: 'Google Chat > Espaces externes.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select External Spaces 5. Under Setting, set Allow users at <domain> to create and join spaces',
    check: controlePolitique_('chat.external_chat_restriction',
      function (v) {
        const s = champ_(v, ['externalSpaces', 'allowExternalSpaces', 'externalSpacesRestriction']);
        if (s === undefined) return null;
        if (typeof s === 'boolean') return s === false;
        return /TRUSTED_DOMAINS|RESTRICTED|DISABLED|NO_EXTERNAL/i.test(String(s));
      },
      'espaces externes désactivés ou restreints aux domaines de confiance')
  },
  {
    id: '3.1.4.4.1', level: 'L1',
    titre: 'Installation d\'applications Chat par les utilisateurs désactivée', titreEn: 'Ensure allow users to install Chat apps is disabled',
    remediation: 'Google Chat > Applications Chat.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select Chat apps 5. Under Chat apps access settings, set Allow users to install Chat',
    check: controlePolitique_('chat.chat_apps_access',
      function (v) { return estDesactive_(champ_(v, ['enableChatApps', 'allowChatApps', 'enabled', 'state'])); },
      'installation d\'apps Chat désactivée')
  },
  {
    id: '3.1.4.4.2', level: 'L1',
    titre: 'Webhooks entrants dans Chat désactivés', titreEn: 'Ensure allow users to add and use incoming webhooks is disabled',
    remediation: 'Google Chat > Applications Chat > Webhooks entrants.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Chat and classic Hangouts 4. Select Chat apps 5. Under Chat apps access settings, set Allow users to add and use',
    check: controlePolitique_('chat.chat_apps_access',
      function (v) { return estDesactive_(champ_(v, ['enableWebhooks', 'allowWebhooks'])); },
      'webhooks entrants désactivés')
  },

  // ===== SECTION 3.1.6 — GROUPS FOR BUSINESS ================================
  {
    id: '3.1.6.1', level: 'L1',
    titre: 'Accès aux groupes depuis l\'extérieur : privé', titreEn: 'Ensure accessing groups from outside this organization is set to private',
    remediation: 'Admin > Applications > Groups for Business > Paramètres de partage : accès externe = privé.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Groups for Business 5. Select Sharing options',
    check: function (ctx) {
      const bilan = evaluerParPerimetre_(ctx, 'groups_for_business.groups_sharing',
        function (v) {
          const s = champ_(v, ['collaborationCapability', 'accessLevel', 'outsideAccess']);
          if (s === undefined) return null;
          return !/ANYONE_CAN_ACCESS|PUBLIC/i.test(String(s));
        },
        'accès aux groupes depuis l\'extérieur restreint (non public)');
      // Repli par groupe seulement si AUCUN périmètre n'a pu être tranché.
      if (bilan && bilan.indetermines.length < bilan.total) {
        return { statut: bilan.statut, detail: bilan.detail };
      }
      // Repli : analyse par groupe via Groups Settings
      if (!ctx.groupes) return { statut: STATUT.ERROR, detail: 'Ni Policy API ni Groups Settings disponibles.' };
      if (ctx.reglagesGroupesCollectes === false) {
        return { statut: STATUT.REVIEW, detail: 'Politique groups_for_business non trouvée et réglages individuels des groupes non collectés (option décochée ou collecte incomplète) — vérifier dans la console Groups for Business.' };
      }
      const publics = ctx.groupes.filter(function (g) {
        return g.settings && /ANYONE_CAN_VIEW|ANYONE_CAN_POST/i.test(
          String(g.settings.whoCanViewGroup) + ' ' + String(g.settings.whoCanPostMessage));
      });
      return {
        statut: publics.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: publics.length === 0
          ? 'Aucun groupe accessible publiquement parmi les ' + ctx.groupes.length + ' groupes analysés.'
          : publics.length + ' groupe(s) accessible(s) au public : ' + publics.map(function (g) { return g.email; }).slice(0, 15).join(', ')
      };
    }
  },
  {
    id: '3.1.6.2', level: 'L1',
    titre: 'Création de groupes restreinte aux administrateurs', titreEn: 'Ensure creating groups is restricted',
    remediation: 'Groups for Business > Paramètres de partage : sélectionner "Seuls les administrateurs peuvent créer des groupes" et décocher les options permettant aux propriétaires d\'autoriser des membres/expéditeurs externes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Groups for Business 5. Under Creating groups, select Only admins can create groups, and uncheck Group owners can allow incoming email from outside and allow members outside',
    check: controlePolitique_('groups_for_business.groups_sharing',
      function (v) {
        const create = champ_(v, ['createGroupsAccessLevel', 'whoCanCreateGroups', 'createGroups']);
        if (create === undefined) return null;
        const adminOnly = /ADMIN_ONLY|ADMINS|ADMIN/i.test(String(create)) && !/ANYONE|ALL_IN_DOMAIN|DOMAIN/i.test(String(create));
        if (!adminOnly) return false;
        const extMembers = champ_(v, ['allowExternalMembers', 'allowExternalMembersInGroup', 'ownersCanAllowExternalMembers']);
        if (extMembers !== undefined && extMembers === true) return false;
        const extSenders = champ_(v, ['allowIncomingExternalMail', 'allowExternalSenders', 'ownersCanAllowIncomingExternalMail', 'allowExternalPost']);
        if (extSenders !== undefined && extSenders === true) return false;
        return true;
      },
      'création de groupes réservée aux administrateurs ET sous-réglages externes (membres/mails externes) désactivés')
  },
  {
    id: '3.1.6.3', level: 'L1',
    titre: 'Permission par défaut de voir les conversations : restreinte', titreEn: 'Ensure default for permission to view conversations is restricted',
    remediation: 'Groups for Business > Autorisation par défaut d\'affichage des conversations.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Groups for Business 5. Select Sharing options',
    check: function (ctx) {
      const bilan = evaluerParPerimetre_(ctx, 'groups_for_business.groups_sharing',
        function (v) {
          const s = champ_(v, ['viewTopicsDefaultAccessLevel', 'defaultViewTopicsAccessLevel']);
          if (s === undefined) return null;
          return !/ANYONE|PUBLIC/i.test(String(s));
        },
        'permission par défaut d\'affichage des conversations restreinte');
      // Repli par groupe seulement si AUCUN périmètre n'a pu être tranché.
      if (bilan && bilan.indetermines.length < bilan.total) {
        return { statut: bilan.statut, detail: bilan.detail };
      }
      if (!ctx.groupes) return { statut: STATUT.ERROR, detail: 'Données groupes indisponibles.' };
      if (ctx.reglagesGroupesCollectes === false) {
        return { statut: STATUT.REVIEW, detail: 'Politique non trouvée et réglages individuels des groupes non collectés (option décochée ou collecte incomplète) — vérifier dans la console.' };
      }
      const ouverts = ctx.groupes.filter(function (g) {
        return g.settings && /ANYONE_CAN_VIEW/i.test(String(g.settings.whoCanViewTopics));
      });
      return {
        statut: ouverts.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: ouverts.length === 0
          ? 'Aucun groupe avec conversations visibles publiquement (' + ctx.groupes.length + ' analysés).'
          : ouverts.length + ' groupe(s) avec conversations publiques : ' + ouverts.map(function (g) { return g.email; }).slice(0, 15).join(', ')
      };
    }
  },

  // ===== SECTIONS 3.1.7 / 3.1.8 / 3.1.9 =====================================
  {
    id: '3.1.7.1', level: 'L1',
    titre: 'Service Google Sites désactivé', titreEn: 'Ensure service status for Google Sites is set to off',
    remediation: 'Admin > Applications > Google Workspace > Sites : état du service = désactivé.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select Sites 5. Select Service status',
    check: controlePolitique_('sites.service_status',
      function (v) { return estDesactive_(champ_(v, ['serviceState', 'state', 'enabled'])); },
      'service Sites désactivé (OFF)')
  },
  {
    id: '3.1.8.1', level: 'L1',
    titre: 'Accès aux groupes Google externes désactivé pour tous', titreEn: 'Ensure access to external Google Groups is OFF for Everyone',
    remediation: 'Admin > Applications > Services Google supplémentaires > Google Groups (service grand public) : OFF.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace 4. Select `Additional Google services 5. Scroll down to Google Groups',
    check: controlePolitique_('groups.service_status',
      function (v) { return estDesactive_(champ_(v, ['serviceState', 'state', 'enabled'])); },
      'service Google Groups (grand public, groups.google.com externes) désactivé')
  },
  {
    id: '3.1.9.1.1', level: 'L1',
    titre: 'Accès aux applications du Marketplace restreint', titreEn: 'Ensure users access to Google Workspace Marketplace apps is restricted',
    remediation: 'Admin > Applications > Google Workspace Marketplace : liste d\'autorisation d\'applications.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Apps 3. Select Google Workspace Marketplace apps 4. Select Settings 5. Under Manage Google Workspace Marketplace allowlist access, set',
    check: controlePolitique_('workspace_marketplace.apps_access_options',
      function (v) {
        const s = champ_(v, ['accessLevel', 'appsAccessLevel', 'marketplaceAccess']);
        if (s === undefined) return null;
        return /ALLOWLIST|ALLOW_LISTED|BLOCK_ALL|NONE_ALLOWED/i.test(String(s));
      },
      'installation limitée à une liste d\'apps autorisées (ou bloquée)')
  },

  // ===== SECTION 4.1 — AUTHENTIFICATION =====================================
  {
    id: '4.1.1.1', level: 'L1',
    titre: '2SV / MFA appliquée à tous les utilisateurs à privilèges', titreEn: 'Ensure 2-Step Verification (Multi-Factor Authentication) is enforced for all users in administrative roles',
    remediation: 'Sécurité > Authentification > Validation en deux étapes : application forcée.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Go to Security and click on 2-Step Verification 3. Select the appropriate group with ALL ADMIN ROLES -- Create this group if needed 4. Under Authentication, set Allow users to turn on 2-Step Verification',
    check: function (ctx) {
      if (!ctx.superAdmins) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const sans2sv = ctx.superAdmins.filter(function (u) { return !u.isEnrolledIn2Sv; });
      const nonForce = ctx.superAdmins.filter(function (u) { return !u.isEnforcedIn2Sv; });
      const ok = sans2sv.length === 0;
      return {
        statut: ok ? STATUT.PASS : STATUT.FAIL,
        detail: ctx.superAdmins.length + ' super admin(s). Sans 2SV : ' +
          (sans2sv.length ? sans2sv.map(function (u) { return u.primaryEmail; }).join(', ') : 'aucun') +
          ' | 2SV non forcée pour : ' + (nonForce.length ? nonForce.map(function (u) { return u.primaryEmail; }).join(', ') : 'aucun')
      };
    }
  },
  {
    id: '4.1.1.2', level: 'L2',
    titre: 'Clés de sécurité matérielles pour les rôles administratifs', titreEn: 'Ensure hardware security keys are used for all users in administrative roles and other high-value accounts',
    remediation: 'Sécurité > 2SV : imposer "clé de sécurité uniquement" pour l\'OU des admins.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Go to Security and click on Authentication 3. Under Authentication, select 2-Step Verification 4. Select the option to Allow users to turn on 2-Step Verification 5. Under Enforcement, enable either \'On\' or else \'On from\' and configure a valid',
    check: controlePolitique_('security.two_step_verification_enforcement_factor',
      function (v) {
        const s = champ_(v, ['allowedSignInFactorSet', 'enforcementFactor', 'factor']);
        if (s === undefined) return null;
        return /PASSKEY_ONLY|SECURITY_KEY|PHISHING_RESISTANT/i.test(String(s));
      },
      'facteur limité aux clés de sécurité / passkeys résistants au phishing (vérifier l\'OU des admins)')
  },
  {
    id: '4.1.1.3', level: 'L1',
    titre: '2SV / MFA appliquée à TOUS les utilisateurs', titreEn: 'Ensure 2-Step Verification (Multi-Factor Authentication) is enforced for all users',
    remediation: 'Sécurité > 2SV : application forcée sur l\'ensemble du domaine + suivi de l\'enrôlement.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select 2-Step Verification 4. Under Authentication, check - Allow users to turn on 2-Step Verification',
    check: function (ctx) {
      if (!ctx.utilisateurs) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const actifs = ctx.utilisateurs.filter(function (u) { return !u.suspended; });
      const sans2sv = actifs.filter(function (u) { return !u.isEnrolledIn2Sv; });
      const nonForce = actifs.filter(function (u) { return !u.isEnforcedIn2Sv; });
      const polTxt = resumePerimetres_(ctx, 'security.two_step_verification_enforcement');
      return {
        statut: sans2sv.length === 0 && nonForce.length === 0 ? STATUT.PASS : STATUT.FAIL,
        detail: actifs.length + ' utilisateurs actifs — ' + sans2sv.length + ' non enrôlés en 2SV, ' +
          nonForce.length + ' sans application forcée.' +
          (sans2sv.length ? ' Exemples non enrôlés : ' + sans2sv.slice(0, 10).map(function (u) { return u.primaryEmail; }).join(', ') : '') + polTxt
      };
    }
  },
  {
    id: '4.1.2.1', level: 'L2',
    titre: 'Récupération de compte Super Admin désactivée', titreEn: 'Ensure Super Admin account recovery is disabled',
    remediation: 'Sécurité > Récupération de compte : désactiver l\'auto-récupération pour les super admins.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Security. 3. Select Authentication. 4. Under Account recovery select Super admin account recovery. 5. Set Allow super admins to recover their account to unchecked',
    check: controlePolitique_('security.super_admin_account_recovery',
      function (v) { return estDesactive_(champ_(v, ['enableAccountRecovery', 'accountRecoveryEnabled', 'enabled'])); },
      'auto-récupération des super admins désactivée')
  },
  {
    id: '4.1.2.2', level: 'L1',
    titre: 'Récupération de compte utilisateur activée', titreEn: 'Ensure User account recovery is enabled',
    remediation: 'Sécurité > Récupération de compte : activer pour les utilisateurs standards.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Security. 3. Select User account recovery 4. Select either the pencil icon or the setting itself. 5. Set Allow users and non-super admins to recover their account to',
    check: controlePolitique_('security.user_account_recovery',
      function (v) { return estActive_(champ_(v, ['enableAccountRecovery', 'accountRecoveryEnabled', 'enabled'])); },
      'auto-récupération activée pour les utilisateurs standards')
  },
  {
    id: '4.1.3.1', level: 'L2',
    titre: 'Programme Protection Avancée configuré', titreEn: 'Ensure Advanced Protection Program is configured',
    remediation: 'Sécurité > Programme Protection Avancée : activer l\'inscription pour les comptes sensibles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Advanced Protection Program 4. Under Enrollment - Allow users to enroll in the Advanced Protection Program, set Enable user enrollment to selected for the',
    check: controlePolitique_('security.advanced_protection_program',
      function (v) { return estActive_(champ_(v, ['enableAdvancedProtectionSelfEnrollment', 'allowEnrollment', 'enabled'])); },
      'inscription au Programme Protection Avancée autorisée / déployée pour les comptes à risque')
  },
  {
    id: '4.1.4.1', level: 'L2',
    titre: 'Défis de connexion (login challenges) appliqués', titreEn: 'Ensure login challenges are enforced',
    remediation: 'Sécurité > Défis de connexion : activer la vérification supplémentaire (ID employé, etc.).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Authentication 4. Select Login Challenges 5. Depending on your organization\'s SSO configuration:',
    check: controlePolitique_('security.login_challenges',
      function (v) { return estActive_(champ_(v, ['enableEmployeeIdChallenge', 'enabled', 'state'])); },
      'défi de connexion supplémentaire activé')
  },
  {
    id: '4.1.5.1', level: 'L1',
    titre: 'Politique de mots de passe renforcée (longueur >= 14, complexité, expiration)', titreEn: 'Ensure password policy is configured for enhanced security',
    remediation: 'Sécurité > Authentification > Gestion des mots de passe : force obligatoire, longueur >= 14 (CIS), réutilisation interdite, application à la prochaine connexion, expiration <= 365 j.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Authentication 4. Select Password management 5. Under Strength, set Enforce strong passwords to checked 6. Under Length, set Minimum Length to 14 or greater 7. Check Enforce password policy at next sign-in 8. Uncheck Allow password reuse',
    check: controlePolitique_('security.password',
      function (v) {
        const longueur = champ_(v, ['minimumLength', 'minLength', 'passwordMinLength']);
        const force = champ_(v, ['enforceStrongPassword', 'enforceRequirementsAtLogin', 'allowedStrength', 'strength']);
        const reuse = champ_(v, ['allowReuse', 'allowPasswordReuse', 'allowOldPassword']);
        const nextLogin = champ_(v, ['enforceAtNextLogin', 'enforceOnNextLogin', 'enforceRequirementsAtNextLogin']);
        const expiration = champ_(v, ['expirationDurationDays', 'passwordExpirationDays', 'expirationDays']);
        if (longueur === undefined && force === undefined) return null;
        let ok = true;
        if (longueur !== undefined && Number(longueur) < 14) ok = false;
        if (reuse === true) ok = false;
        if (typeof force === 'string' && /WEAK/i.test(force)) ok = false;
        if (force === false) ok = false;
        if (nextLogin !== undefined && nextLogin === false) ok = false;
        if (expiration !== undefined && Number(expiration) > 365) ok = false;
        return ok;
      },
      'longueur min >= 14, mot de passe fort exigé, réutilisation interdite, application à la prochaine connexion')
  },

  // ===== SECTION 4.2 — CONTRÔLES D'ACCÈS ====================================
  {
    id: '4.2.1.1', level: 'L2',
    titre: 'Accès des applications tierces aux services Google restreint', titreEn: 'Ensure application access to Google services is restricted',
    remediation: 'Sécurité > Contrôles des API > Accès aux applications tierces : restreindre les services non configurés.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select API Controls, then select App access control 5. Under Overview, select MANAGE GOOGLE SERVICES',
    check: controlePolitique_('api_controls.unconfigured_third_party_apps',
      function (v) {
        const s = champ_(v, ['accessLevel', 'defaultAccessLevel', 'state']);
        if (s === undefined) return null;
        return /BLOCKED|RESTRICTED|LIMITED|SIGN_IN_ONLY/i.test(String(s));
      },
      'apps tierces non configurées bloquées ou limitées (pas d\'accès complet par défaut)')
  },
  {
    id: '4.2.1.2', level: 'L2',
    titre: 'Revue périodique des applications tierces', titreEn: 'Review third-party applications periodically',
    remediation: 'Sécurité > Contrôles des API > Gérer l\'accès aux applications tierces — revue régulière.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select API Controls, then select App access control 5. Under Overview, select MANAGE THIRD-PARTY APP ACCESS',
    check: function (ctx) {
      // Aide à la revue : agrégation des jetons OAuth des super admins et d'un échantillon d'utilisateurs.
      if (!ctx.utilisateurs) return { statut: STATUT.ERROR, detail: 'Directory API indisponible.' };
      const apps = {};
      const echantillon = ctx.utilisateurs.filter(function (u) { return !u.suspended; }).slice(0, 100);
      echantillon.forEach(function (u) {
        try {
          const rep = AdminDirectory.Tokens.list(u.primaryEmail);
          (rep.items || []).forEach(function (t) {
            const cle = t.displayText || t.clientId;
            if (!apps[cle]) apps[cle] = { n: 0, scopes: {} };
            apps[cle].n++;
            (t.scopes || []).forEach(function (s) { apps[cle].scopes[s] = true; });
          });
        } catch (e) { /* utilisateur sans jetons ou API refusée : ignorer */ }
      });
      const sensibles = Object.keys(apps).filter(function (a) {
        return Object.keys(apps[a].scopes).some(function (s) { return /gmail|drive|admin|cloud-platform/i.test(s); });
      });
      return {
        statut: STATUT.REVIEW,
        detail: 'Revue humaine requise. ' + Object.keys(apps).length + ' application(s) OAuth détectée(s) sur un échantillon de ' +
          echantillon.length + ' utilisateurs. Applications avec scopes sensibles (gmail/drive/admin) : ' +
          (sensibles.length ? sensibles.slice(0, 20).join(' ; ') : 'aucune')
      };
    }
  },
  {
    id: '4.2.1.3', level: 'L1',
    titre: 'Les applications internes peuvent accéder aux API Workspace', titreEn: 'Ensure internal apps can access Google Workspace APIs',
    remediation: 'Sécurité > Contrôles des API : marquer les apps internes de confiance.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select API Controls, then select App access control 5. Under Settings, select Trust internal, domain-owned apps',
    check: controlePolitique_('api_controls.internal_apps',
      function (v) { return estActive_(champ_(v, ['trustInternalApps', 'internalAppsTrusted', 'enabled'])); },
      'apps internes marquées de confiance (accès API autorisé)')
  },
  {
    id: '4.2.1.4', level: 'L2',
    titre: 'Revue périodique de la délégation au niveau du domaine (DWD)', titreEn: 'Review domain-wide delegation for applications periodically',
    remediation: 'Sécurité > Contrôles des API > Délégation au niveau du domaine — revue régulière des client IDs et scopes.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select API Controls 5. Under Domain wide delegation, select MANAGE DOMAIN WIDE DELEGATION',
    check: manuel_('Sécurité > Contrôles des API > Délégation au niveau du domaine',
      'La liste DWD n\'est pas exposée par API — exporter et revoir chaque client ID / scopes.')
  },
  {
    id: '4.2.2.1', level: 'L1',
    titre: 'Blocage des accès depuis des zones géographiques non approuvées', titreEn: 'Ensure blocking access from unapproved geographic locations',
    remediation: 'Sécurité > Accès contextuel (Context-Aware Access) : règle de géoblocage.', remediationEn: 'To configure this setting via the Google Admin Console: Create an appropriate Access Level 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select Context-Aware Access',
    check: manuel_('Sécurité > Accès contextuel',
      'Les niveaux d\'accès CAA ne sont pas lisibles par cette API — vérifier l\'existence d\'une règle de géoblocage.')
  },
  {
    id: '4.2.3.1', level: 'L1',
    titre: 'Règles DLP configurées pour Google Drive', titreEn: 'Ensure DLP policies for Google Drive are configured',
    remediation: 'Sécurité > Protection des données : créer des règles DLP Drive (détecteurs prédéfinis + personnalisés).', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select Data protection 5. Select Manage Rules',
    check: function (ctx) {
      // Les règles DLP apparaissent dans la Policy API sous des types "rule.dlp*" selon les tenants.
      const typesDlp = Object.keys(ctx.policyIndex || {}).filter(function (t) { return /dlp/i.test(t); });
      if (!ctx.policies || ctx.policies.length === 0) return { statut: STATUT.ERROR, detail: 'Policy API indisponible.' };
      if (typesDlp.length > 0) {
        return { statut: STATUT.PASS, detail: 'Réglages DLP détectés : ' + typesDlp.join(', ') + ' — vérifier la couverture des règles dans la console.' };
      }
      return { statut: STATUT.REVIEW, detail: 'Aucun réglage DLP détecté via Policy API — vérifier Sécurité > Protection des données.' };
    }
  },
  {
    id: '4.2.4.1', level: 'L1',
    titre: 'Contrôle de session Google configuré (durée web <= 12 h)', titreEn: 'Ensure Google session control is configured',
    remediation: 'Sécurité > Contrôle des accès et des données > Contrôle des sessions Google : définir la durée de session web à 12 heures ou moins.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select Google session control 5. Set Web session duration to 12 hours or less',
    check: controlePolitique_('security.session_controls',
      function (v) {
        const d = champ_(v, ['webSessionDuration', 'sessionDuration', 'duration']);
        if (d === undefined) return null;
        const m = String(d).match(/(\d+)/);
        if (!m) return null;
        let heures = Number(m[1]);
        if (/s$/.test(String(d))) heures = heures / 3600; // durées au format "43200s"
        return heures > 0 && heures <= 12; // CIS v1.4 : <= 12 heures
      },
      'durée de session web configurée à 12 heures ou moins')
  },
  {
    id: '4.2.5.1', level: 'L2',
    titre: 'Contrôle de session Google Cloud configuré', titreEn: 'Ensure Google Cloud session control is configured',
    remediation: 'Sécurité > Contrôle des sessions Google Cloud : ré-authentification exigée.', remediationEn: 'To configure this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator 2. Select Security 3. Select Access and Data Control 4. Select Google Cloud session control 5. Under Reauthentication policy, set Require reauthentication to',
    check: controlePolitique_('cloud.cloud_session_controls',
      function (v) {
        const d = champ_(v, ['sessionDuration', 'reauthDuration', 'duration']);
        const p = champ_(v, ['reauthPolicy', 'reauthenticationPolicy']);
        if (d === undefined && p === undefined) return null;
        if (p !== undefined && /NEVER|EXEMPT/i.test(String(p))) return false;
        return true;
      },
      'ré-authentification GCP exigée avec durée de session limitée')
  },
  // NOTE CIS v1.4 : le contrôle « Less Secure Apps / LSA » (ex 4.2.6.1 en v1.3)
  // a été supprimé du benchmark (Ticket 25811) — Google a déprécié les LSA.

  // ===== SECTION 4.3 + 5 — REVUES DE SUPERVISION ============================
  {
    id: '4.3.1', level: 'L1',
    titre: 'Revue régulière du tableau de bord Sécurité (anomalies)', titreEn: 'Ensure the Dashboard is reviewed regularly for anomalies',
    remediation: 'Sécurité > Tableau de bord — instaurer une revue périodique documentée.', remediationEn: 'To review this via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Security. 3. Select Dashboard. 4. Review each report for anomalies and investigate anything unexpected. NOTE: this is an operational control - establish a documented periodic review.',
    check: manuel_('Sécurité > Tableau de bord', 'Processus organisationnel : planifier une revue hebdomadaire.')
  },
  {
    id: '4.3.2', level: 'L1',
    titre: 'Revue régulière de la page État de sécurité (Security Health)', titreEn: 'Ensure the Security health is reviewed regularly for anomalies',
    remediation: 'Sécurité > État de sécurité — corriger les recommandations signalées.', remediationEn: 'To review this via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Security. 3. Select Security health. 4. Review each flagged recommendation and remediate as appropriate. NOTE: this is an operational control - establish a documented periodic review.',
    check: manuel_('Sécurité > État de sécurité', 'Processus organisationnel : revue périodique documentée.')
  },
  {
    id: '5.1.1.1', level: 'L1',
    titre: 'Revue régulière du rapport d\'utilisation des applications', titreEn: 'Ensure the App Usage Report is reviewed regularly for anomalies',
    remediation: 'Rapports > Utilisation des applications — revue périodique.', remediationEn: 'The remediation for any anomalies in the various fields varies widely (different sections of the Google Workspace Admin UI). Please refer to Google\'s documentation for specifics (here). NOTE: Many of these settings will be remedied by implementing other sections of this Benchmark. For example, an Admin showing recent Gmail (IMAP) - last used time and/or Gmail (POP) - last used time can be remedied by implementing the Remediation',
    check: manuel_('Rapports > Utilisation des applications', 'Processus organisationnel.')
  },
  {
    id: '5.1.1.2', level: 'L1',
    titre: 'Revue régulière du rapport de sécurité', titreEn: 'Ensure the Security Report is reviewed regularly for anomalies',
    remediation: 'Rapports > Sécurité — revue périodique (partage externe, 2SV, etc.).', remediationEn: 'The remediation for any anomalies in the various fields varies widely (different sections of the Google Workspace Admin UI). Please refer to Google\'s documentation for specifics (here). NOTE: Many of these settings will be remedied by implementing other sections of this Benchmark. For example, an Admin not enrolled in 2-Step Verification can be remedied by implementing the Remediation procedure for the recommendation Ensure 2-Step',
    check: manuel_('Rapports > Sécurité', 'Processus organisationnel.')
  },

  // ===== SECTION 6 — RÈGLES D'ALERTES ADMIN =================================
  { id: '6.1', level: 'L1',
    titre: 'Alerte "Mot de passe utilisateur modifié" configurée', titreEn: 'Ensure User\'s password changed is configured',
    remediation: 'Sécurité > Règles > Mot de passe modifié : e-mail aux admins.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to User\'s password changed and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte (Centre d\'alerte)', 'Les règles système ne sont pas listables par API — vérifier l\'activation de la notification.') },
  { id: '6.2', level: 'L1',
    titre: 'Alerte "Attaques soutenues par un État" configurée', titreEn: 'Ensure Government-backed attacks is configured',
    remediation: 'Sécurité > Règles > Government-backed attacks.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to Government-backed attacks and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.3', level: 'L1',
    titre: 'Alerte "Utilisateur suspendu (activité suspecte)" configurée', titreEn: 'Ensure User suspended due to suspicious activity is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to User suspended due to suspicious activity and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.4', level: 'L1',
    titre: 'Alerte "Privilège admin accordé" configurée', titreEn: 'Ensure User granted Admin privilege is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to User granted Admin privilege and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.5', level: 'L1',
    titre: 'Alerte "Connexion programmatique suspecte" configurée', titreEn: 'Ensure Suspicious programmatic login is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to Suspicious programmatic login and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.6', level: 'L1',
    titre: 'Alerte "Connexion suspecte" configurée', titreEn: 'Ensure Suspicious login is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to Suspicious login and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.7', level: 'L1',
    titre: 'Alerte "Mot de passe divulgué" configurée', titreEn: 'Ensure Leaked password is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to Leaked password and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') },
  { id: '6.8', level: 'L1',
    titre: 'Alerte "Usurpation potentielle d\'employé (Gmail)" configurée', titreEn: 'Ensure Gmail potential employee spoofing is configured',
    remediation: 'Sécurité > Règles.', remediationEn: 'To verify this setting via the Google Admin Console: 1. Log in to https://admin.google.com as an administrator. 2. Select Rules 3. Under Google protects you by default select View list. 4. Scroll to Gmail potential employee spoofing and select it. 5. Within the Actions pane, click the edit pencil on the right side of the pane.', check: manuel_('Règles d\'alerte', 'Vérifier notification e-mail activée.') }
];
