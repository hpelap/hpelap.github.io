/* Contrats (§35). */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, lienEquipement, lienSite, lienFournisseur } from "./commun.js";

const TON = { "À échéance": "warning", "Échu": "danger", "En cours": "success", "Inactif": "", "Sans échéance": "" };
const statut = (c) => badge(c.statut, TON[c.statut] || "");
function echeance(c) {
  if (!c.date_fin) return "—";
  if (c.jours_avant_echeance === null || c.jours_avant_echeance === undefined) return fmt.date(c.date_fin);
  const j = c.jours_avant_echeance;
  return `${fmt.date(c.date_fin)} (${j < 0 ? `échu depuis ${-j} j` : `${j} j`})`;
}

export default pageListe({
  titre: "Contrats",
  chemin: "/contracts",
  datasets: ["contracts"],
  placeholder: "Rechercher : équipement, site, prestataire, type",
  lignes: (d) => d.contracts.items,
  cle: (c) => c.id,
  meta: (_d, lignes) => `${lignes.filter((c) => c.statut === "À échéance").length} à échéance sous 90 jours · ${lignes.length} contrat(s)`,
  triInitial: { key: "date_fin", sens: 1 },
  colonnes: [
    { key: "equipement", label: "Équipement", priority: "primary", value: (c) => c.eq_id,
      render: (c) => `${c.eq_id} — ${c.categorie || ""}`.replace(/ — $/, "") },
    { key: "prestataire", label: "Prestataire", priority: "primary", trunc: true, horsCarte: true },
    { key: "date_fin", label: "Échéance", priority: "primary", render: echeance, horsCarte: true },
    { key: "statut", label: "Statut", priority: "primary", render: statut, horsCarte: true },
    { key: "type_contrat", label: "Type", priority: "secondary", trunc: true },
    { key: "montant_annuel", label: "Prix annuel", priority: "secondary", num: true,
      render: (c) => `${fmt.euros(c.montant_annuel)}${c.montant_provisoire ? " (prov.)" : ""}` },
    { key: "site", label: "Site", priority: "optional", trunc: true },
    { key: "date_debut", label: "Début", priority: "optional", render: (c) => fmt.date(c.date_debut) },
    { key: "periodicite", label: "Périodicité", priority: "optional", value: (c) => c.periodicite_mois,
      render: (c) => (c.periodicite_mois ? `${c.periodicite_mois} mois` : "—") },
  ],
  titreCarte: (c) => `${c.eq_id} — ${c.prestataire || "Contrat"}`,
  sousTitreCarte: (c) => `${c.type_contrat || ""} · ${c.site || ""}`,
  badges: (c) => [statut(c)],
  filtres: [
    { key: "statut", label: "Statut", valeurs: (c) => c.statut },
    { key: "prestataire", label: "Prestataire", valeurs: (c) => c.prestataire },
    { key: "type", label: "Type", valeurs: (c) => c.type_contrat },
    { key: "site", label: "Site", valeurs: (c) => c.site },
    { key: "annee", label: "Année", valeurs: (c) => (c.annee ? String(c.annee) : null) },
  ],
  recherche: (c) => [c.eq_id, c.site, c.prestataire, c.type_contrat, c.categorie, c.marque, c.modele],
  titreFiche: (c) => `Contrat ${c.eq_id}`,
  fiche: (c) => h("article", {},
    h("div", { class: "detail-head" }, h("h2", {}, `${c.type_contrat || "Contrat"} — ${c.eq_id}`), statut(c),
      h("div", { class: "detail-sub" }, [c.categorie, c.marque, c.modele].filter(Boolean).join(" · "))),
    h("dl", { class: "dl" },
      champ("Équipement", lienEquipement(c.eq_id)),
      champ("Site", lienSite(c.site, c.site_key)),
      champ("Prestataire", lienFournisseur(c.prestataire)),
      champ("Type de contrat", c.type_contrat),
      champ("Année", c.annee ? String(c.annee) : null),
      champ("Début", fmt.date(c.date_debut)),
      champ("Fin", fmt.date(c.date_fin)),
      champ("Échéance", echeance(c)),
      champ("Prix annuel", `${fmt.euros(c.montant_annuel)}${c.montant_provisoire ? " (provisoire)" : ""}`),
      champ("Périodicité", c.periodicite_mois ? `${c.periodicite_mois} mois` : null),
      champ("Reconduction tacite", fmt.oui(c.reconduction_tacite)),
      champ("Actif", fmt.oui(c.actif)),
    )),
});
