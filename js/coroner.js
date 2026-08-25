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
let registreData = [];

const DUREE_MORGUE_MS = 14 * 24 * 60 * 60 * 1000; // deux semaines

function estEncoreEnMorgue(dateDeces) {
  const deces = new Date(dateDeces);
  if (isNaN(deces)) return true;
  return Date.now() - deces.getTime() < DUREE_MORGUE_MS;
}

function statutBadge(dateDeces) {
  return estEncoreEnMorgue(dateDeces)
    ? '<span class="status-badge present">En morgue</span>'
    : '<span class="status-badge absent">Corps retiré</span>';
}

function renderRegistre(filter = "") {
  const term = filter.trim().toLowerCase();
  const rows = registreData.filter((d) =>
    `${d.prenom ?? ""} ${d.nom ?? ""}`.toLowerCase().includes(term)
  );

  registreBody.innerHTML = rows
    .map(
      (d) => `
        <tr>
          <td>${escapeHtml(d.nom)}</td>
          <td>${escapeHtml(d.prenom)}</td>
          <td>${formatDate(d.dateNaissance)}</td>
          <td>${formatDate(d.dateDeces)}</td>
          <td>${statutBadge(d.dateDeces)}</td>
        </tr>`
    )
    .join("");

  registreEmpty.style.display = rows.length ? "none" : "block";
}

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
const currentUserEmail = document.getElementById("currentUserEmail");

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

document.querySelectorAll(".logout-btn").forEach((btn) => {
  btn.addEventListener("click", () => auth.signOut());
});

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showOnly(loggedOutBox);
    stopDossiersListener();
    return;
  }

  try {
    const whitelistDoc = await db.collection("whitelist").doc(user.uid).get();
    if (!whitelistDoc.exists) {
      showOnly(pendingBox);
      return;
    }
  } catch (err) {
    console.error("Erreur de vérification de la whitelist :", err);
    showOnly(pendingBox);
    return;
  }

  currentUserEmail.textContent = user.email;
  showOnly(workspaceBox);
  startDossiersListener();
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
      createdBy: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Le registre public ne garde que les informations non sensibles.
    await db.collection("registre_public").doc(dossierRef.id).set({
      nom,
      prenom,
      dateNaissance,
      dateDeces,
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
   LISTE DES DOSSIERS COMPLETS — réservée aux coroners connectés
   ============================================ */
const dossiersList = document.getElementById("dossiersList");
let dossiersUnsub = null;

function startDossiersListener() {
  if (dossiersUnsub) return;
  dossiersUnsub = db
    .collection("dossiers_coroner")
    .orderBy("dateDeces", "desc")
    .onSnapshot(
      (snap) => {
        dossiersList.innerHTML = "";
        snap.forEach((doc) => {
          const d = doc.data();
          const card = document.createElement("div");
          card.className = "dossier-card";
          card.innerHTML = `
            <h3>${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</h3>
            <p class="meta">${formatDate(d.dateDeces)} · ${escapeHtml(d.lieu || "Lieu inconnu")}</p>
          `;
          card.addEventListener("click", () => openDossierModal(d));
          dossiersList.appendChild(card);
        });
      },
      (err) => {
        console.error("Erreur de lecture des dossiers :", err);
      }
    );
}

function stopDossiersListener() {
  if (dossiersUnsub) {
    dossiersUnsub();
    dossiersUnsub = null;
  }
  dossiersList.innerHTML = "";
}

/* ============================================
   FICHE DÉTAILLÉE D'UN DOSSIER (modale)
   ============================================ */
const dossierModal = document.getElementById("dossierModal");
const dmName = document.getElementById("dmName");
const dmDates = document.getElementById("dmDates");
const dmLieu = document.getElementById("dmLieu");
const dmPosition = document.getElementById("dmPosition");
const dmDegats = document.getElementById("dmDegats");
const dmTatouages = document.getElementById("dmTatouages");
const dmCicatrices = document.getElementById("dmCicatrices");
const dmGallery = document.getElementById("dmGallery");
const dossierModalClose = document.getElementById("dossierModalClose");

function openDossierModal(d) {
  dmName.textContent = `${d.prenom} ${d.nom}`;
  dmDates.textContent = `Né(e) le ${formatDate(d.dateNaissance)} — Décédé(e) le ${formatDate(d.dateDeces)}`;
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

dossierModalClose.addEventListener("click", () => dossierModal.classList.remove("open"));
dossierModal.addEventListener("click", (event) => {
  if (event.target === dossierModal) dossierModal.classList.remove("open");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") dossierModal.classList.remove("open");
});
