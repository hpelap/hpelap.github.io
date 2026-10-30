/* Interventions (§31). */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, lienEquipement, lienSite, lienFournisseur } from "./commun.js";

const TON = { "Réalisée": "success", "Planifiée": "info", "Annulée": "", "Non planifiée": "warning" };
const statut = (i) => badge(i.statut || "—", TON[i.statut] || "");
const horaire = (i) => (i.heure_debut ? `${i.heure_debut}${i.heure_fin ? ` – ${i.heure_fin}` : ""}` : "");

export default pageListe({
  titre: "Interventions",
  chemin: "/interventions",
  datasets: ["interventions"],
  placeholder: "Rechercher : équipement, site, type, prestataire",
  lignes: (d) => d.interventions.items,
  cle: (i) => i.id,
  meta: (_d, lignes) => `${lignes.filter((i) => i.a_venir).length} à venir sous 7 jours · ${lignes.length} au total`,
  triInitial: { key: "date", sens: -1 },
  colonnes: [
    { key: "date", label: "Date", priority: "primary", render: (i) => `${fmt.date(i.date)}${i.heure_debut ? ` ${i.heure_debut}` : ""}` },
    { key: "equipement", label: "Équipement", priority: "primary", value: (i) => i.eq_id,
      render: (i) => `${i.eq_id} — ${i.categorie || ""}`.replace(/ — $/, ""), horsCarte: true },
    { key: "site", label: "Site", priority: "primary", trunc: true, horsCarte: true },
    { key: "statut", label: "Statut", priority: "primary", render: statut, horsCarte: true },
    { key: "type", label: "Type", priority: "secondary", trunc: true },
    { key: "prestataire", label: "Prestataire", priority: "secondary", trunc: true },
    { key: "duree", label: "Durée", priority: "optional", value: (i) => i.duree_minutes, render: (i) => fmt.duree(i.duree_minutes) },
    { key: "rapport", label: "Rapport reçu", priority: "optional", value: (i) => (i.rapport_recu ? 1 : 0),
      render: (i) => (i.rapport_recu ? `Oui${i.rapport_recu_le ? ` (${fmt.date(i.rapport_recu_le)})` : ""}` : "Non") },
  ],
  titreCarte: (i) => `${i.eq_id} — ${i.type || "Intervention"}`,
  sousTitreCarte: (i) => `${fmt.dateJour(i.date)}${horaire(i) ? ` · ${horaire(i)}` : ""} · ${i.site || ""}`,
  badges: (i) => [statut(i)],
  filtres: [
    { key: "a_venir", label: "À venir (7 j)", valeurs: (i) => (i.a_venir ? "Oui" : "Non") },
    { key: "statut", label: "Statut", valeurs: (i) => i.statut },
    { key: "type", label: "Type", valeurs: (i) => i.type },
    { key: "site", label: "Site", valeurs: (i) => i.site },
    { key: "prestataire", label: "Prestataire", valeurs: (i) => i.prestataire },
    { key: "archivee", label: "Archivée", valeurs: (i) => (i.archivee ? "Oui" : "Non") },
  ],
  recherche: (i) => [String(i.id), i.eq_id, i.site, i.type, i.prestataire, i.categorie, i.marque, i.modele],
  titreFiche: (i) => `Intervention ${i.id}`,
  fiche: (i) => h("article", {},
    h("div", { class: "detail-head" },
      h("h2", {}, `${i.type || "Intervention"} — ${i.eq_id}`), statut(i),
      h("div", { class: "detail-sub" }, `${fmt.dateJour(i.date)}${horaire(i) ? ` · ${horaire(i)}` : ""}`)),
    h("dl", { class: "dl" },
      champ("Équipement", lienEquipement(i.eq_id)),
      champ("Site", lienSite(i.site, i.site_key)),
      champ("Salle", i.salle),
      champ("Prestataire", lienFournisseur(i.prestataire)),
      champ("Type", i.type),
      champ("Date", fmt.dateJour(i.date)),
      champ("Horaire", horaire(i) || null),
      champ("Durée", fmt.duree(i.duree_minutes)),
      champ("Rapport reçu", i.rapport_recu ? `Oui${i.rapport_recu_le ? `, le ${fmt.date(i.rapport_recu_le)}` : ""}` : "Non"),
      champ("Panne liée", i.panne_id ? h("a", { href: `/incidents/${i.panne_id}` }, `P-${String(i.panne_id).padStart(4, "0")}`) : null),
      champ("Archivée", fmt.oui(i.archivee)),
    )),
});
