// Logique de la page Coroner : registre public + espace sécurisé (whitelist).
// Suppose que firebase-config.js a déjà initialisé `auth`, `db` et `storage`.

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return escapeHtml(value);
  return d.toLocaleDateString("fr-FR");
}

function linesToTags(text) {
  const items = String(text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return '<span class="value">Aucun(e)</span>';
  return `<div class="tag-list">${items
    .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
    .join("")}</div>`;
}

/* ============================================
   REGISTRE PUBLIC — lecture libre, aucune connexion requise
   ============================================ */
const registreBody = document.getElementById("registreBody");
const registreSearch = document.getElementById("registreSearch");
const registreEmpty = document.getElementById("registreEmpty");
const registreTable = document.getElementById("registreTable");
const registreAideCoroner = document.getElementById("registreAideCoroner");
let registreData = [];
let estCoronerConnecte = false;

const DUREE_MORGUE_MS = 14 * 24 * 60 * 60 * 1000; // deux semaines

function estEncoreEnMorgue(dateDeces) {
  const deces = new Date(dateDeces);
  if (isNaN(deces)) return true;
  return Date.now() - deces.getTime() < DUREE_MORGUE_MS;
}

// Un coroner peut forcer manuellement le statut ("sorti" / "en_morgue").
// Sans réglage manuel ("auto" ou absent), on retombe sur la règle des deux semaines.
function estEnMorgueEffectif(d) {
  if (d.statutMorgue === "sorti") return false;
  if (d.statutMorgue === "en_morgue") return true;
  return estEncoreEnMorgue(d.dateDeces);
}

function statutBadge(d) {
  return estEnMorgueEffectif(d)
    ? '<span class="status-badge present">En morgue</span>'
    : '<span class="status-badge absent">Corps retiré</span>';
}

// Les corps sortis descendent en bas de liste et y restent (tri stable :
// l'ordre par date, déjà appliqué par Firestore, est conservé dans chaque groupe).
function ordreMorgueDabord(a, b) {
  const aEnMorgue = estEnMorgueEffectif(a);
  const bEnMorgue = estEnMorgueEffectif(b);
  if (aEnMorgue === bEnMorgue) return 0;
  return aEnMorgue ? -1 : 1;
}

// Attribue le plus petit numéro de frigo libre : réutilise automatiquement
// celui d'un corps sorti entre-temps.
async function prochainNumeroFrigo() {
  const snap = await db.collection("dossiers_coroner").get();
  const occupes = new Set();
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.frigo && estEnMorgueEffectif(d)) occupes.add(d.frigo);
  });
  let n = 1;
  while (occupes.has(n)) n++;
  return n;
}

function renderRegistre(filter = "") {
  const term = filter.trim().toLowerCase();
  const rows = registreData
    .filter((d) => `${d.prenom ?? ""} ${d.nom ?? ""}`.toLowerCase().includes(term))
    .sort(ordreMorgueDabord);

  registreBody.innerHTML = rows
    .map(
      (d) => `
        <tr data-id="${d.id}">
          <td>${escapeHtml(d.nom)}</td>
          <td>${escapeHtml(d.prenom)}</td>
          <td>${formatDate(d.dateNaissance)}</td>
          <td>${formatDate(d.dateDeces)}</td>
          <td>${statutBadge(d)}</td>
        </tr>`
    )
    .join("");

  registreEmpty.style.display = rows.length ? "none" : "block";
}

// Un coroner connecté peut cliquer une ligne du registre public pour ouvrir le dossier complet.
registreBody.addEventListener("click", async (event) => {
  if (!estCoronerConnecte) return;
  const tr = event.target.closest("tr[data-id]");
  if (!tr) return;
  try {
    const doc = await db.collection("dossiers_coroner").doc(tr.dataset.id).get();
    if (!doc.exists) return;
    openDossierModal(doc.id, doc.data());
  } catch (err) {
    console.error("Erreur d'ouverture du dossier :", err);
  }
});

db.collection("registre_public")
  .orderBy("dateDeces", "desc")
  .onSnapshot(
    (snap) => {
      registreData = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderRegistre(registreSearch.value);
    },
    (err) => {
      console.error("Erreur de lecture du registre :", err);
      registreEmpty.textContent = "Le registre n'a pas pu être chargé.";
      registreEmpty.style.display = "block";
    }
  );

registreSearch.addEventListener("input", () => renderRegistre(registreSearch.value));

/* ============================================
   AUTHENTIFICATION — connexion + vérification whitelist
   ============================================ */
const loggedOutBox = document.getElementById("authLoggedOut");
const pendingBox = document.getElementById("authPending");
const workspaceBox = document.getElementById("authWorkspace");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const currentUserName = document.getElementById("currentUserName");

function showOnly(activeBox) {
  [loggedOutBox, pendingBox, workspaceBox].forEach((box) => {
    box.style.display = box === activeBox ? "" : "none";
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    loginError.textContent = "Connexion impossible : vérifie l'e-mail et le mot de passe.";
  }
});

/* ============================================
   CRÉATION DE COMPTE — le compte créé n'a accès à rien tant qu'un
   administrateur ne l'a pas validé (voir la demande d'accès plus bas).
   ============================================ */
const authCardTitle = document.getElementById("authCardTitle");
const signupForm = document.getElementById("signupForm");
const signupError = document.getElementById("signupError");
const toggleAuthMode = document.getElementById("toggleAuthMode");
const navAuthButtons = document.getElementById("navAuthButtons");
const navWorkspaceButtons = document.getElementById("navWorkspaceButtons");
const navConnexion = document.getElementById("navConnexion");
const navInscription = document.getElementById("navInscription");
const espaceCoroner = document.getElementById("espaceCoroner");

function setModeAuth(inscription) {
  loginForm.style.display = inscription ? "none" : "";
  signupForm.style.display = inscription ? "" : "none";
  authCardTitle.textContent = inscription ? "Créer un compte" : "Connexion";
  toggleAuthMode.textContent = inscription
    ? "Déjà un compte ? Se connecter"
    : "Pas encore de compte ? Créer un compte";
}

toggleAuthMode.addEventListener("click", (event) => {
  event.preventDefault();
  setModeAuth(loginForm.style.display !== "none");
});

navConnexion.addEventListener("click", (event) => {
  event.preventDefault();
  setModeAuth(false);
  espaceCoroner.scrollIntoView({ behavior: "smooth" });
});

navInscription.addEventListener("click", (event) => {
  event.preventDefault();
  setModeAuth(true);
  espaceCoroner.scrollIntoView({ behavior: "smooth" });
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  signupError.textContent = "";
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    // onAuthStateChanged prend le relais : le compte n'étant pas whitelisté,
    // l'écran "en attente de validation" s'affiche automatiquement.
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      signupError.textContent = "Un compte existe déjà avec cet e-mail.";
    } else if (err.code === "auth/weak-password") {
      signupError.textContent = "Le mot de passe doit faire au moins 6 caractères.";
    } else if (err.code === "auth/invalid-email") {
      signupError.textContent = "Adresse e-mail invalide.";
    } else {
      console.error("Erreur lors de la création du compte :", err);
      signupError.textContent = "Impossible de créer le compte.";
    }
  }
});

document.querySelectorAll(".logout-btn").forEach((btn) => {
  btn.addEventListener("click", () => auth.signOut());
});

const demandeAccesBtn = document.getElementById("demandeAccesBtn");
const demandeStatus = document.getElementById("demandeStatus");
const dPrenom = document.getElementById("dPrenom");
const dNom = document.getElementById("dNom");

demandeAccesBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const prenom = dPrenom.value.trim();
  const nom = dNom.value.trim();
  if (!prenom || !nom) {
    demandeStatus.textContent = "Indique ton prénom et ton nom.";
    demandeStatus.className = "status-msg error";
    return;
  }

  demandeAccesBtn.disabled = true;
  demandeStatus.textContent = "Envoi de la demande...";
  demandeStatus.className = "status-msg";
  try {
    // Force un jeton d'authentification à jour : utile juste après une inscription toute fraîche.
    await user.getIdToken(true);

    // Enregistré tout de suite dans "coroners" pour que le nom soit déjà là si la demande est acceptée.
    await db.collection("coroners").doc(user.uid).set({ nom, prenom });
    await db.collection("demandes_acces").doc(user.uid).set(
      { email: user.email, nom, prenom, demandeLe: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // Vérifie que l'écriture est bien passée côté serveur avant d'annoncer un succès.
    const verif = await db.collection("demandes_acces").doc(user.uid).get({ source: "server" });
    if (!verif.exists) throw new Error("demande-non-enregistree");

    demandeStatus.textContent = "Demande envoyée. Un administrateur doit valider ton accès.";
    demandeStatus.className = "status-msg success";
  } catch (err) {
    console.error("Erreur lors de la demande d'accès :", err);
    demandeStatus.textContent = "Erreur lors de l'envoi de la demande, réessaie.";
    demandeStatus.className = "status-msg error";
    demandeAccesBtn.disabled = false;
  }
});

function setCoronerConnecte(actif) {
  estCoronerConnecte = actif;
  registreTable.classList.toggle("clickable", actif);
  registreAideCoroner.style.display = actif ? "" : "none";
}

auth.onAuthStateChanged(async (user) => {
  navAuthButtons.style.display = user ? "none" : "";
  navWorkspaceButtons.style.display = "none";

  if (!user) {
    showOnly(loggedOutBox);
    setCoronerConnecte(false);
    stopAdminListeners();
    return;
  }

  let whitelistDoc;
  try {
    whitelistDoc = await db.collection("whitelist").doc(user.uid).get();
    if (!whitelistDoc.exists) {
      showOnly(pendingBox);
      setCoronerConnecte(false);
      stopAdminListeners();
      return;
    }
  } catch (err) {
    console.error("Erreur de vérification de la whitelist :", err);
    showOnly(pendingBox);
    setCoronerConnecte(false);
    stopAdminListeners();
    return;
  }

  showOnly(workspaceBox);
  navWorkspaceButtons.style.display = "";
  setCoronerConnecte(true);
  chargerProfilCoroner(user.uid, user.email);

  const estAdminUtilisateur = whitelistDoc.data().admin === true;
  adminPanel.style.display = estAdminUtilisateur ? "" : "none";
  goToAdminBtn.style.display = estAdminUtilisateur ? "" : "none";
  if (estAdminUtilisateur) {
    startAdminListeners();
  } else {
    stopAdminListeners();
  }
});

/* ============================================
   PROFIL — nom/prénom choisis par le coroner pour se reconnaître dans les dossiers
   ============================================ */
const profileForm = document.getElementById("profileForm");
const pPrenom = document.getElementById("pPrenom");
const pNom = document.getElementById("pNom");
const profileStatus = document.getElementById("profileStatus");
const toggleProfileBtn = document.getElementById("toggleProfileBtn");
const profileDropdownPanel = document.getElementById("profileDropdownPanel");

toggleProfileBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  profileDropdownPanel.style.display = profileDropdownPanel.style.display === "none" ? "" : "none";
});

document.addEventListener("click", (event) => {
  if (profileDropdownPanel.style.display === "none") return;
  if (event.target.closest(".profile-dropdown")) return;
  profileDropdownPanel.style.display = "none";
});

let coronerIdentite = { nom: "", prenom: "" };

function nomAffiche(identite, repli) {
  const complet = `${identite.prenom} ${identite.nom}`.trim();
  return complet || repli;
}

async function chargerProfilCoroner(uid, email) {
  try {
    const doc = await db.collection("coroners").doc(uid).get();
    coronerIdentite = doc.exists
      ? { nom: doc.data().nom || "", prenom: doc.data().prenom || "" }
      : { nom: "", prenom: "" };
  } catch (err) {
    console.error("Erreur de lecture du profil coroner :", err);
    coronerIdentite = { nom: "", prenom: "" };
  }
  pPrenom.value = coronerIdentite.prenom;
  pNom.value = coronerIdentite.nom;
  currentUserName.textContent = nomAffiche(coronerIdentite, email);
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prenom = pPrenom.value.trim();
  const nom = pNom.value.trim();

  if (!prenom || !nom) {
    profileStatus.textContent = "Le prénom et le nom sont obligatoires.";
    profileStatus.className = "status-msg error";
    return;
  }

  profileStatus.textContent = "Enregistrement...";
  profileStatus.className = "status-msg";

  try {
    await db.collection("coroners").doc(auth.currentUser.uid).set({ nom, prenom });
    coronerIdentite = { nom, prenom };
    currentUserName.textContent = nomAffiche(coronerIdentite, auth.currentUser.email);
    profileStatus.textContent = "Nom enregistré.";
    profileStatus.className = "status-msg success";
    setTimeout(() => {
      profileDropdownPanel.style.display = "none";
    }, 900);
  } catch (err) {
    console.error("Erreur lors de l'enregistrement du profil :", err);
    profileStatus.textContent = "Erreur lors de l'enregistrement.";
    profileStatus.className = "status-msg error";
  }
});

/* ============================================
   FORMULAIRE — ajout d'un dossier
   ============================================ */
const toggleFormBtn = document.getElementById("toggleFormBtn");
const dossierForm = document.getElementById("dossierForm");
const positionSelect = document.getElementById("fPosition");
const positionAutreField = document.getElementById("positionAutreField");
const photosInput = document.getElementById("fPhotos");
const photoPreview = document.getElementById("photoPreview");
const formStatus = document.getElementById("formStatus");

toggleFormBtn.addEventListener("click", () => {
  const hidden = dossierForm.style.display === "none";
  dossierForm.style.display = hidden ? "" : "none";
  toggleFormBtn.textContent = hidden ? "Fermer le formulaire" : "+ Ajouter un dossier";
});

positionSelect.addEventListener("change", () => {
  positionAutreField.style.display = positionSelect.value === "autre" ? "" : "none";
});

let selectedFiles = [];
photosInput.addEventListener("change", () => {
  selectedFiles = Array.from(photosInput.files);
  photoPreview.innerHTML = "";
  selectedFiles.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.src = e.target.result;
      img.className = "photo-thumb";
      img.alt = file.name;
      photoPreview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

dossierForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nom = document.getElementById("fNom").value.trim();
  const prenom = document.getElementById("fPrenom").value.trim();
  const dateNaissance = document.getElementById("fDateNaissance").value;
  const dateDeces = document.getElementById("fDateDeces").value;
  const lieu = document.getElementById("fLieu").value.trim();
  const position =
    positionSelect.value === "autre"
      ? document.getElementById("fPositionAutre").value.trim()
      : positionSelect.options[positionSelect.selectedIndex].text;
  const degats = document.getElementById("fDegats").value.trim();
  const tatouages = document.getElementById("fTatouages").value.trim();
  const cicatrices = document.getElementById("fCicatrices").value.trim();

  if (!nom || !prenom || !dateDeces) {
    formStatus.textContent = "Le nom, le prénom et la date de décès sont obligatoires.";
    formStatus.className = "status-msg error";
    return;
  }

  formStatus.textContent = "Enregistrement en cours...";
  formStatus.className = "status-msg";

  try {
    const dossierRef = db.collection("dossiers_coroner").doc();
    const frigo = await prochainNumeroFrigo();

    const photoUrls = [];
    for (const file of selectedFiles) {
      const path = `dossiers/${dossierRef.id}/${Date.now()}_${file.name}`;
      const uploadSnap = await storage.ref(path).put(file);
      photoUrls.push(await uploadSnap.ref.getDownloadURL());
    }

    await dossierRef.set({
      nom,
      prenom,
      dateNaissance,
      dateDeces,
      lieu,
      position,
      degats,
      tatouages,
      cicatrices,
      photos: photoUrls,
      statutMorgue: "auto",
      frigo,
      createdBy: auth.currentUser.email,
      creePar: nomAffiche(coronerIdentite, auth.currentUser.email),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Le registre public ne garde que les informations non sensibles.
    await db.collection("registre_public").doc(dossierRef.id).set({
      nom,
      prenom,
      dateNaissance,
      dateDeces,
      statutMorgue: "auto",
    });

    formStatus.textContent = "Dossier enregistré avec succès.";
    formStatus.className = "status-msg success";
    dossierForm.reset();
    photoPreview.innerHTML = "";
    selectedFiles = [];
    positionAutreField.style.display = "none";
  } catch (err) {
    console.error("Erreur lors de l'enregistrement du dossier :", err);
    formStatus.textContent = "Erreur lors de l'enregistrement du dossier.";
    formStatus.className = "status-msg error";
  }
});

/* ============================================
   FICHE DÉTAILLÉE D'UN DOSSIER (modale)
   ============================================ */
const dossierModal = document.getElementById("dossierModal");
const dmName = document.getElementById("dmName");
const dmDates = document.getElementById("dmDates");
const dmCreePar = document.getElementById("dmCreePar");
const dmStatut = document.getElementById("dmStatut");
const dmFrigo = document.getElementById("dmFrigo");
const dmToggleStatutBtn = document.getElementById("dmToggleStatutBtn");
const dmLieu = document.getElementById("dmLieu");
const dmPosition = document.getElementById("dmPosition");
const dmDegats = document.getElementById("dmDegats");
const dmTatouages = document.getElementById("dmTatouages");
const dmCicatrices = document.getElementById("dmCicatrices");
const dmGallery = document.getElementById("dmGallery");
const dossierModalClose = document.getElementById("dossierModalClose");

let dossierModalId = null;

function openDossierModal(id, d) {
  dossierModalId = id;
  dmName.textContent = `${d.prenom} ${d.nom}`;
  dmDates.textContent = `Né(e) le ${formatDate(d.dateNaissance)} — Décédé(e) le ${formatDate(d.dateDeces)}`;
  dmCreePar.textContent = d.creePar || "Non renseigné";

  const enMorgue = estEnMorgueEffectif(d);
  dmStatut.innerHTML = statutBadge(d);
  dmFrigo.textContent = d.frigo ? `n°${d.frigo}` : "Non attribué";
  dmToggleStatutBtn.textContent = enMorgue ? "Marquer sorti de la morgue" : "Remettre en morgue";

  dmLieu.textContent = d.lieu || "Non renseigné";
  dmPosition.textContent = d.position || "Non renseignée";
  dmDegats.textContent = d.degats || "Aucun dégât renseigné";
  dmTatouages.innerHTML = linesToTags(d.tatouages);
  dmCicatrices.innerHTML = linesToTags(d.cicatrices);

  dmGallery.innerHTML = (d.photos || [])
    .map((url) => `<img src="${url}" alt="Photo du dossier">`)
    .join("") || '<p class="value">Aucune photo</p>';

  dossierModal.classList.add("open");
}

dmToggleStatutBtn.addEventListener("click", async () => {
  if (!dossierModalId) return;
  dmToggleStatutBtn.disabled = true;
  try {
    const docRef = db.collection("dossiers_coroner").doc(dossierModalId);
    const snap = await docRef.get();
    const d = snap.data();
    const enMorgue = estEnMorgueEffectif(d);

    let update;
    if (enMorgue) {
      // On libère son frigo pour la prochaine entrée.
      update = { statutMorgue: "sorti" };
    } else {
      // Remise en morgue : nouveau numéro (le sien a pu être repris entre-temps).
      update = { statutMorgue: "en_morgue", frigo: await prochainNumeroFrigo() };
    }

    await docRef.update(update);
    await db.collection("registre_public").doc(dossierModalId).set(
      { statutMorgue: update.statutMorgue },
      { merge: true }
    );

    const refreshed = await docRef.get();
    openDossierModal(dossierModalId, refreshed.data());
  } catch (err) {
    console.error("Erreur lors du changement de statut :", err);
  } finally {
    dmToggleStatutBtn.disabled = false;
  }
});

dossierModalClose.addEventListener("click", () => dossierModal.classList.remove("open"));
dossierModal.addEventListener("click", (event) => {
  if (event.target === dossierModal) dossierModal.classList.remove("open");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") dossierModal.classList.remove("open");
});

/* ============================================
   ADMINISTRATION — choisir qui a accès à l'espace coroner
   Visible uniquement pour le compte marqué "admin: true" dans la whitelist.
   ============================================ */
const adminPanel = document.getElementById("adminPanel");
const goToAdminBtn = document.getElementById("goToAdminBtn");
const demandesList = document.getElementById("demandesList");
const demandesEmpty = document.getElementById("demandesEmpty");
const whitelistList = document.getElementById("whitelistList");

goToAdminBtn.addEventListener("click", () => {
  adminPanel.scrollIntoView({ behavior: "smooth" });
});

let demandesUnsub = null;
let whitelistUnsub = null;

function startAdminListeners() {
  if (demandesUnsub) return;

  demandesUnsub = db.collection("demandes_acces").onSnapshot(
    (snap) => {
      demandesList.innerHTML = "";
      snap.forEach((doc) => {
        const d = doc.data();
        const nomDemandeur = `${d.prenom || ""} ${d.nom || ""}`.trim() || d.email || "Compte inconnu";
        const row = document.createElement("div");
        row.className = "dossier-card";
        row.innerHTML = `
          <h3>${escapeHtml(nomDemandeur)}</h3>
          <p class="meta">Demandé le ${d.demandeLe ? formatDate(d.demandeLe.toDate()) : "?"}</p>
          <div style="display:flex; gap:0.6rem; margin-top:0.8rem;">
            <button class="btn" data-action="autoriser" data-uid="${doc.id}" data-email="${escapeHtml(d.email || "")}">Autoriser</button>
            <button class="btn btn-secondary" data-action="refuser" data-uid="${doc.id}">Refuser</button>
          </div>
        `;
        demandesList.appendChild(row);
      });
      demandesEmpty.style.display = snap.empty ? "block" : "none";
    },
    (err) => console.error("Erreur de lecture des demandes d'accès :", err)
  );

  whitelistUnsub = db.collection("whitelist").onSnapshot(
    (snap) => {
      whitelistList.innerHTML = "";
      snap.forEach((doc) => {
        const d = doc.data();
        const estMoi = doc.id === auth.currentUser.uid;
        const row = document.createElement("div");
        row.className = "dossier-card";
        const nomProvisoire = (d.email || "Coroner (nom non renseigné)") + (d.admin ? " (admin)" : "");
        row.innerHTML = `
          <h3 data-role="nom">${escapeHtml(nomProvisoire)}</h3>
          <div style="margin-top:0.8rem;">
            <button class="btn btn-secondary" data-action="revoquer" data-uid="${doc.id}" ${estMoi ? "disabled" : ""}>
              ${estMoi ? "C'est toi" : "Révoquer l'accès"}
            </button>
          </div>
        `;
        whitelistList.appendChild(row);

        db.collection("coroners")
          .doc(doc.id)
          .get()
          .then((cdoc) => {
            if (!cdoc.exists) return;
            const c = cdoc.data();
            const nom = `${c.prenom || ""} ${c.nom || ""}`.trim();
            if (!nom) return;
            const h3 = row.querySelector('[data-role="nom"]');
            h3.textContent = nom + (d.admin ? " (admin)" : "");
          })
          .catch((err) => console.error("Erreur de lecture d'un profil coroner :", err));
      });
    },
    (err) => console.error("Erreur de lecture de la whitelist :", err)
  );
}

function stopAdminListeners() {
  if (demandesUnsub) {
    demandesUnsub();
    demandesUnsub = null;
  }
  if (whitelistUnsub) {
    whitelistUnsub();
    whitelistUnsub = null;
  }
  demandesList.innerHTML = "";
  whitelistList.innerHTML = "";
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const { action, uid, email } = btn.dataset;

  if (action === "autoriser") {
    btn.disabled = true;
    try {
      await db.collection("whitelist").doc(uid).set({ autorise: true, email: email || null }, { merge: true });
      await db.collection("demandes_acces").doc(uid).delete();
    } catch (err) {
      console.error("Erreur lors de l'autorisation :", err);
      btn.disabled = false;
    }
  } else if (action === "refuser") {
    btn.disabled = true;
    try {
      await db.collection("demandes_acces").doc(uid).delete();
    } catch (err) {
      console.error("Erreur lors du refus :", err);
      btn.disabled = false;
    }
  } else if (action === "revoquer") {
    if (!confirm("Retirer l'accès de ce coroner à l'espace coroner ?")) return;
    btn.disabled = true;
    try {
      await db.collection("whitelist").doc(uid).delete();
    } catch (err) {
      console.error("Erreur lors de la révocation :", err);
      btn.disabled = false;
    }
  }
});
