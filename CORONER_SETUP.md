# Mise en place du Bureau du Coroner (Firebase)

Le site (`index.html`) est prêt côté code. Il lui manque juste un projet Firebase
à toi, gratuit, pour stocker le registre des décès et gérer la connexion des coroners.
Cette étape doit être faite par toi (créer un compte/projet ne peut pas être fait à ta place).

Compte à prévoir : ~15 minutes, aucune carte bancaire nécessaire pour ce volume d'usage.

## 1. Créer le projet Firebase

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. "Ajouter un projet" > donne-lui un nom (ex : `sp-oren-coroner`) > crée-le.
3. Tu n'as pas besoin d'activer Google Analytics pour ce projet.

## 2. Activer l'authentification par e-mail/mot de passe

1. Dans le menu de gauche : **Authentication** > "Get started" (Commencer).
2. Onglet "Sign-in method" > active **E-mail/Mot de passe**.

## 3. Les coroners créent leur propre compte

Depuis le site, chacun peut cliquer sur "Créer un compte" (e-mail + mot de passe) sous le
formulaire de connexion. Un compte créé ainsi n'a accès à rien tant qu'il n'est pas validé :
voir "Fonctionnement une fois en place" plus bas pour le circuit de validation (demande d'accès
+ panneau Administration, géré entièrement depuis le site, sans repasser par cette console).

## 4. Créer la base de données (Firestore)

1. Menu de gauche : **Firestore Database** > "Créer une base de données".
2. Choisis une région proche (ex : `eur3 (europe-west)`).
3. Démarre en **mode production**.
4. Une fois créée, va dans l'onglet **Règles** et remplace tout le contenu par celui du fichier
   [`firestore.rules`](firestore.rules) de ce dépôt, puis clique sur "Publier".

## 5. Te whitelister toi-même comme premier admin

Cette étape manuelle n'est nécessaire qu'une seule fois, pour le tout premier compte (toi).
Ensuite, tout se gère depuis le site (voir plus bas).

1. Crée ton compte depuis le site ("Créer un compte"), puis dans **Authentication** > onglet
   "Users", **copie ton UID**.
2. Toujours dans **Firestore Database** > onglet "Données", crée une collection nommée exactement
   `whitelist`.
3. Ajoute un document dont l'**ID est ton UID** (pas l'e-mail), avec deux champs :
   `autorise: true` et `admin: true`.

Une fois cette étape faite, tu peux valider les autres coroners directement depuis le panneau
"Administration" du site — plus besoin de revenir ici pour ça.

## 6. Activer le stockage des photos (Storage)

1. Menu de gauche : **Storage** > "Get started" (garde les options par défaut).
2. Onglet **Règles** > remplace le contenu par celui du fichier [`storage.rules`](storage.rules)
   de ce dépôt, puis "Publier".
   Si la console refuse la règle (erreur sur `firestore.exists`), utilise la version simplifiée
   indiquée en commentaire dans le même fichier.

## 7. Connecter le site à ton projet

1. Dans les **paramètres du projet** (roue crantée en haut à gauche) > onglet "Général".
2. Section "Vos applications" > clique sur l'icône **`</>`** (Web) > donne un nom (ex : `site`)
   > "Enregistrer l'application".
3. Firebase affiche un bloc `firebaseConfig`. Copie chaque valeur dans le fichier
   [`js/firebase-config.js`](js/firebase-config.js) du site, à la place des `COLLE_TA_...`.
4. Enregistre, commit et pousse sur GitHub. Le site en ligne (sp-oren.fr) utilisera alors ton
   projet Firebase.

## Fonctionnement une fois en place

- **Tout le monde** peut consulter le registre public (nom, prénom, dates, statut) sur `coroner.html`,
  sans connexion. Le statut ("En morgue" / "Corps retiré") est calculé automatiquement à partir de
  la date de décès : deux semaines après, la fiche passe seule sur "Corps retiré", sans aucune
  action de ta part.
- **Seuls les comptes whitelistés** peuvent ajouter un dossier complet (photos, lieu, position du
  corps, dégâts, tatouages, cicatrices) et consulter les dossiers existants dans le détail.
- N'importe qui peut créer un compte depuis le site, mais un compte fraîchement créé ne voit
  qu'un écran "en attente de validation" (rien de sensible n'est accessible) : il y indique son
  prénom et son nom, ce qui envoie une demande d'accès.
- L'admin (toi, ou tout compte marqué `admin: true` dans `whitelist`) voit un panneau
  "Administration" dans son espace, avec la liste des demandes en attente (Autoriser/Refuser) et
  la liste des coroners déjà autorisés (Révoquer l'accès). Tout se passe depuis le site.
