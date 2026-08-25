# Mise en place du Bureau du Coroner (Firebase)

Le site (`coroner.html`) est prêt côté code. Il lui manque juste un projet Firebase
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

## 3. Créer un compte pour chaque coroner

1. Toujours dans **Authentication** > onglet "Users" > "Add user".
2. Renseigne l'e-mail et un mot de passe temporaire pour chaque coroner (à faire changer ensuite).
3. Une fois créé, **copie l'UID** affiché à côté de chaque utilisateur (tu en auras besoin à l'étape 5).

Aucune inscription publique n'existe sur le site : seuls les comptes que tu crées ici peuvent se connecter.

## 4. Créer la base de données (Firestore)

1. Menu de gauche : **Firestore Database** > "Créer une base de données".
2. Choisis une région proche (ex : `eur3 (europe-west)`).
3. Démarre en **mode production**.
4. Une fois créée, va dans l'onglet **Règles** et remplace tout le contenu par celui du fichier
   [`firestore.rules`](firestore.rules) de ce dépôt, puis clique sur "Publier".

## 5. Whitelister les coroners autorisés

1. Toujours dans **Firestore Database** > onglet "Données".
2. Crée une collection nommée exactement `whitelist`.
3. Pour chaque coroner à autoriser : ajoute un document dont l'**ID est l'UID** copié à l'étape 3
   (pas l'e-mail, l'UID). Le contenu du document n'a pas d'importance, tu peux mettre un seul champ
   `autorise: true`.

Pour retirer l'accès à quelqu'un plus tard, il suffit de supprimer son document dans `whitelist`.

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
- **Seuls les comptes whitelistés** (étape 5) peuvent se connecter, ajouter un dossier complet
  (photos, lieu, position du corps, dégâts, tatouages, cicatrices) et consulter les dossiers
  existants dans le détail.
- Un compte créé (étape 3) mais pas encore whitelisté peut se connecter mais voit un message
  "en attente de validation" : rien de sensible ne lui est accessible.
