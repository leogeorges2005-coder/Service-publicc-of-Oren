// On récupère les éléments HTML dont on aura besoin, une seule fois au chargement.
const staffCards = document.querySelectorAll(".staff-card");
const modal = document.getElementById("staffModal");
const modalAvatar = document.getElementById("modalAvatar");
const modalName = document.getElementById("modalName");
const modalRole = document.getElementById("modalRole");
const modalBio = document.getElementById("modalBio");
const modalClose = document.getElementById("modalClose");

// Ouvre la fenêtre et la remplit avec les infos de la carte cliquée.
// Ces infos viennent des attributs data-name / data-role / data-bio écrits dans le HTML.
function openModal(card) {
  const cardAvatar = card.querySelector(".avatar");
  modalAvatar.src = cardAvatar.src;
  modalAvatar.alt = cardAvatar.alt;
  modalName.textContent = card.dataset.name;
  modalRole.textContent = card.dataset.role;
  modalBio.textContent = card.dataset.bio;
  modal.classList.add("open");
}

function closeModal() {
  modal.classList.remove("open");
}

// Pour chaque fiche membre, on écoute le clic et on ouvre la fenêtre avec ses infos.
staffCards.forEach((card) => {
  card.addEventListener("click", () => openModal(card));
});

// Fermer avec le bouton croix.
modalClose.addEventListener("click", closeModal);

// Fermer en cliquant en dehors de la boîte (sur le fond sombre).
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

// Fermer avec la touche Échap.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
