/* Feuille : en bas d'écran sur téléphone, modale centrée au-delà (§62).
 * Jamais plus haute que l'écran ; défilement interne ; Échap et appui
 * hors de la feuille la ferment ; le focus revient où il était. */
import { h } from "./dom.js";
import { icon } from "./icons.js";

export function ouvrirFeuille({ titre, corps, pied = [], onFermer }) {
  const precedent = document.activeElement;
  const racine = document.getElementById("sheet-root");

  const fermer = () => {
    document.removeEventListener("keydown", surTouche);
    document.body.style.overflow = "";
    overlay.remove();
    if (precedent && precedent.focus) precedent.focus();
    if (onFermer) onFermer();
  };
  const surTouche = (e) => { if (e.key === "Escape") fermer(); };

  const boutonFermer = h("button", { class: "icon-btn", type: "button", "aria-label": "Fermer", onclick: fermer }, icon("close"));
  const feuille = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": titre },
    h("div", { class: "sheet-head" }, h("h2", {}, titre), boutonFermer),
    h("div", { class: "sheet-body" }, corps),
    pied.length ? h("div", { class: "sheet-foot" }, pied) : null,
  );
  const overlay = h("div", { class: "sheet-overlay", onclick: (e) => { if (e.target === overlay) fermer(); } }, feuille);

  racine.appendChild(overlay);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", surTouche);
  boutonFermer.focus();
  return fermer;
}
