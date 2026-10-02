/* Tâches (§34), en lecture seule : aucune case à cocher, aucun statut
 * modifiable. */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, section, listeSimple, cleUrl } from "./commun.js";

const TON_PRIORITE = { URGENTE: "danger", HAUTE: "warning", NORMALE: "", FAIBLE: "" };
const OUVERTE = (t) => !["DONE", "CANCELLED"].includes(t.statut);
const etat = (t) => (!OUVERTE(t) ? "Terminées" : t.en_retard ? "En retard" : "Ouvertes");

function echeance(t) {
  if (!t.echeance) return "—";
  const texte = `${fmt.date(t.echeance)}${t.heure ? ` ${t.heure}` : ""}`;
  return t.en_retard ? h("span", { class: "nowrap" }, texte, " ", badge(`${t.jours_de_retard} j de retard`, "danger")) : texte;
}

const LIENS = { equipement: "/equipment/", site: "/sites/", prestataire: "/suppliers/", panne: "/incidents/", intervention: "/interventions/", contrat: "/contracts/" };

export default pageListe({
  titre: "Tâches",
  chemin: "/tasks",
  datasets: ["tasks"],
  placeholder: "Rechercher : titre, équipement, site",
  lignes: (d) => d.tasks.items,
  cle: (t) => t.id,
  meta: (_d, lignes) => `${lignes.filter(OUVERTE).length} ouverte(s) · ${lignes.filter((t) => t.en_retard).length} en retard`,
  triInitial: { key: "echeance", sens: 1 },
  colonnes: [
    { key: "titre", label: "Tâche", priority: "primary", trunc: true },
    { key: "statut", label: "Statut", priority: "primary", value: (t) => t.statut_libelle, horsCarte: true },
    { key: "echeance", label: "Échéance", priority: "primary", render: echeance, horsCarte: true },
    { key: "priorite", label: "Priorité", priority: "secondary", value: (t) => t.priorite_libelle,
      render: (t) => badge(t.priorite_libelle, TON_PRIORITE[t.priorite] || "") },
    { key: "liens", label: "Lié à", priority: "secondary", sort: false,
      render: (t) => t.liens.filter((l) => ["equipement", "site"].includes(l.type)).map((l) => l.libelle).join(" · ") || "—" },
    { key: "origine", label: "Origine", priority: "optional", trunc: true },
  ],
  titreCarte: (t) => t.titre,
  // La pièce liée (panne, intervention) distingue deux tâches au même titre.
  sousTitreCarte: (t) => [t.statut_libelle, t.priorite_libelle, t.echeance ? fmt.date(t.echeance) : null,
    ...t.liens.filter((l) => ["panne", "intervention", "contrat"].includes(l.type)).map((l) => l.libelle)].filter(Boolean).join(" · "),
  badges: (t) => (t.en_retard ? [badge("En retard", "danger")] : []),
  filtres: [
    { key: "etat", label: "État", valeurs: etat },
    { key: "statut", label: "Statut", valeurs: (t) => t.statut_libelle },
    { key: "priorite", label: "Priorité", valeurs: (t) => t.priorite_libelle },
    { key: "origine", label: "Origine", valeurs: (t) => t.origine },
    { key: "site", label: "Site", valeurs: (t) => t.liens.filter((l) => l.type === "site").map((l) => l.libelle) },
    { key: "fournisseur", label: "Fournisseur", valeurs: (t) => t.liens.filter((l) => l.type === "prestataire").map((l) => l.libelle) },
  ],
  recherche: (t) => [t.titre, t.origine, ...t.liens.map((l) => l.libelle)],
  titreFiche: () => "Tâche",
  fiche: (t) => h("article", {},
    h("div", { class: "detail-head" }, h("h2", {}, t.titre),
      t.en_retard ? badge("En retard", "danger") : null,
      h("div", { class: "detail-sub" }, `${t.statut_libelle} · priorité ${t.priorite_libelle.toLowerCase()}`)),
    h("dl", { class: "dl" },
      champ("Statut", t.statut_libelle),
      champ("Priorité", t.priorite_libelle),
      champ("Échéance", echeance(t)),
      champ("Origine", t.origine),
      champ("Créée le", fmt.date(t.cree_le)),
      t.terminee_le ? champ("Close le", fmt.date(t.terminee_le)) : null,
    ),
    section("Éléments liés", listeSimple(t.liens.map((l) => ({
      href: LIENS[l.type] ? LIENS[l.type] + encodeURIComponent(["site", "prestataire"].includes(l.type) ? cleUrl(l.id) : l.id) : null,
      titre: l.libelle, sous: { equipement: "Équipement", site: "Site", prestataire: "Fournisseur", panne: "Panne", intervention: "Intervention", contrat: "Contrat" }[l.type] || l.type,
    })), "Aucun élément lié.")),
  ),
});
