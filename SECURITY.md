# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour un problème de sécurité.
Écrivez plutôt à l'auteur via [faucheux.bzh](https://faucheux.bzh) en décrivant
le problème, les étapes de reproduction et l'impact estimé. Une première
réponse est visée sous 7 jours.

## Modèle de sécurité de l'outil

Comprendre ce que l'outil fait — et ne fait pas — aide à juger de ce qui
constitue une vulnérabilité.

- **Exécution sous l'identité de l'utilisateur.** L'application web est
  déployée en `executeAs: USER_ACCESSING`. Un audit s'exécute donc avec les
  droits de la personne connectée, jamais avec ceux du propriétaire du script.
  Passer à `USER_DEPLOYING` accorderait à tout le domaine les privilèges du
  super administrateur propriétaire : `tests/manifeste.test.js` empêche cette
  régression.
- **Contrôle d'accès côté serveur.** Toute fonction publique d'un projet Apps
  Script est appelable par n'importe quel utilisateur autorisé via
  `google.script.run`. Les fonctions qui écrivent dans un état partagé
  (registre des dérogations) ou qui diffusent des données d'audit vérifient le
  rôle super administrateur côté serveur — voir `02_Securite.gs`.
- **Intégrité des rapports.** Le rapport Sheets et l'e-mail de synthèse sont
  construits à partir des résultats consignés côté serveur, jamais à partir
  d'un tableau transmis par le navigateur.
- **Périmètre de diffusion.** Les destinataires de l'e-mail sont restreints aux
  domaines du tenant, sauf ajout explicite dans `CONFIG.DOMAINES_DESTINATAIRES`.
- **Scopes en lecture seule.** À l'exception de la création du classeur de
  rapport et de l'envoi de l'e-mail, tous les scopes OAuth sont en lecture.
  L'outil ne modifie aucun réglage du tenant. `tests/manifeste.test.js` refuse
  tout scope déclaré sans usage identifiable dans le code.
- **Aucune donnée ne quitte le tenant.** Les seuls appels réseau sortants sont
  les API Google et `dns.google` pour la résolution SPF / DKIM / DMARC des
  domaines publics du tenant. Aucune télémétrie, aucun service tiers.

## Données manipulées

Un rapport d'audit décrit la posture de sécurité complète d'un tenant : c'est
un document sensible. Le classeur généré est créé dans le Drive de la personne
qui lance l'audit et hérite de ses règles de partage. Le registre des
dérogations est stocké dans les `ScriptProperties` du projet et contient les
motifs d'acceptation et leurs auteurs.

## Versions supportées

Seule la dernière version publiée reçoit des correctifs. Voir
[CHANGELOG.md](CHANGELOG.md).
