/* Planning N+1 (§33). Consultation du résultat : aucune optimisation ne
 * peut être lancée d'ici — c'est H-Pilot Desktop qui calcule. */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, section, lienEquipement, lienSite, lienFournisseur } from "./commun.js";

const TON_APPRECIATION = { Excellent: "success", Bon: "success", Acceptable: "", "Déconseillé": "warning", Conflit: "danger" };

function score(l) {
  if (l.score === null || l.score === undefined) return "—";
  return h("span", { class: "nowrap" }, `${l.score}/100`,
    l.appreciation ? [" ", badge(l.appreciation, TON_APPRECIATION[l.appreciation] || "")] : null);
}
const verrou = (l) => (l.verrouillee ? badge("Verrouillée", "info") : badge("Modifiable"));
const horaire = (l) => (l.heure_debut ? `${l.heure_debut}${l.heure_fin ? ` – ${l.heure_fin}` : ""}` : l.creneau || "");

export default pageListe({
  titre: "Planning N+1",
  chemin: "/planning",
  datasets: ["planning_n1"],
  placeholder: "Rechercher : équipement, site, prestataire",
  lignes: (d) => d.planning_n1.lignes || [],
  cle: (l) => l.id,
  meta: (d, lignes) => {
    const p = d.planning_n1;
    const opt = p.optimisation;
    return `Planning ${p.annee ?? "—"} · ${lignes.length} maintenance(s)` +
      (opt?.date ? ` · dernière optimisation le ${fmt.date(opt.date)} (${opt.mode})` : "") +
      " · consultation seule";
  },
  triInitial: { key: "date", sens: 1 },
  colonnes: [
    { key: "equipement", label: "Équipement", priority: "primary", value: (l) => l.eq_id,
      render: (l) => `${l.eq_id} — ${l.categorie || ""}`.replace(/ — $/, "") },
    { key: "site", label: "Site", priority: "primary", trunc: true, horsCarte: true },
    { key: "date", label: "Date", priority: "primary", render: (l) => `${fmt.date(l.date)}${l.heure_debut ? ` ${l.heure_debut}` : ""}`, horsCarte: true },
    { key: "verrou", label: "Verrou", priority: "primary", value: (l) => (l.verrouillee ? 1 : 0), render: verrou, horsCarte: true },
    { key: "prestataire", label: "Prestataire", priority: "secondary", trunc: true },
    { key: "score", label: "Score", priority: "secondary", value: (l) => l.score ?? -1, render: score },
    { key: "statut", label: "Statut", priority: "secondary", trunc: true },
    { key: "raison", label: "Raison principale", priority: "optional", trunc: true },
    { key: "occurrence", label: "N°", priority: "optional" },
  ],
  titreCarte: (l) => `${l.eq_id} — ${l.categorie || ""}`.replace(/ — $/, ""),
  sousTitreCarte: (l) => `${l.site || ""} · ${l.date ? fmt.dateJour(l.date) : "sans date"}${horaire(l) ? ` · ${horaire(l)}` : ""}`,
  badges: (l) => [verrou(l)],
  filtres: [
    { key: "site", label: "Site", valeurs: (l) => l.site },
    { key: "prestataire", label: "Prestataire", valeurs: (l) => l.prestataire },
    { key: "modalite", label: "Modalité", valeurs: (l) => l.categorie },
    { key: "verrou", label: "Verrou", valeurs: (l) => (l.verrouillee ? "Verrouillée" : "Modifiable") },
    { key: "appreciation", label: "Appréciation", valeurs: (l) => l.appreciation },
    { key: "mois", label: "Mois", valeurs: (l) => (l.date ? l.date.slice(0, 7) : null),
      libelle: (v) => { const [a, m] = v.split("-").map(Number); return fmt.mois(a, m - 1); } },
  ],
  recherche: (l) => [l.eq_id, l.site, l.prestataire, l.categorie, l.marque, l.modele, l.statut],
  titreFiche: (l) => l.eq_id,
  fiche: (l, d) => h("article", {},
    h("div", { class: "detail-head" }, h("h2", {}, `${l.eq_id} — ${fmt.dateJour(l.date)}`), verrou(l),
      h("div", { class: "detail-sub" }, [l.categorie, l.marque, l.modele].filter(Boolean).join(" · "))),
    h("p", { class: "muted" }, `Planning ${d.planning_n1.annee} — lecture seule. Les dates se modifient et s'optimisent dans H-Pilot Desktop.`),
    h("dl", { class: "dl" },
      champ("Équipement", lienEquipement(l.eq_id)),
      champ("Site", lienSite(l.site, l.site_key)),
      champ("Salle", l.salle),
      champ("Prestataire", lienFournisseur(l.prestataire)),
      champ("Date", fmt.dateJour(l.date)),
      champ("Source de la date", l.date_source),
      champ("Horaire", horaire(l) || null),
      champ("Échéance théorique", l.date_theorique ? fmt.date(l.date_theorique) : null),
      champ("Occurrence", l.occurrence),
      champ("Statut", l.statut),
      champ("Score qualité", score(l)),
      champ("Verrou", l.verrouillee ? l.motif_verrou || "Oui" : "Non"),
      champ("Communication annuelle", l.communication_annuelle),
      champ("Rappel J-7", l.communication_j7),
    ),
    l.raison ? section("Raison principale", h("p", {}, l.raison)) : null,
    l.alternatives?.length ? section("Autres dates possibles",
      h("ul", { class: "mini-list card" }, l.alternatives.map((a) => h("li", {},
        h("div", { class: "mini-item" }, h("div", { class: "mini-main" }, h("div", { class: "mini-title" }, fmt.dateJour(a.date))),
          h("div", { class: "mini-date" }, `${a.score}/100`), a.date === l.date ? badge("Retenue", "success") : null))))) : null,
  ),
});
