/* Pannes (§30). Les étapes et leurs dates — jamais les commentaires, qui
 * ne sont pas publiés. */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, section, lienEquipement, lienSite, lienFournisseur } from "./commun.js";

const TON_STATUT = { Ouverte: "warning", "Clôturée": "success", "Archivée": "" };

function statut(p) {
  return h("span", { class: "nowrap" }, badge(p.statut, TON_STATUT[p.statut] || ""),
    p.bloquante && p.statut === "Ouverte" ? [" ", badge("Bloquante", "danger")] : null,
    p.en_observation ? [" ", badge("En observation", "info")] : null);
}

// Tri par défaut : les pannes ouvertes d'abord (bloquantes en tête), puis
// clôturées, puis archivées ; les plus récentes en premier dans chaque groupe.
const RANG = { Ouverte: 1, "Clôturée": 2, "Archivée": 3 };
function ordreStatut(p) {
  const rang = p.statut === "Ouverte" && p.bloquante ? 0 : RANG[p.statut] ?? 4;
  const jour = Number(String(p.date_declaration || "").slice(0, 10).replaceAll("-", "")) || 0;
  return `${rang}-${String(99999999 - jour).padStart(8, "0")}`;
}

function inaction(p) {
  if (p.en_observation) return "En observation";
  if (p.inaction_jours === null || p.inaction_jours === undefined) return "—";
  return `${p.inaction_jours} j`;
}

export default pageListe({
  titre: "Pannes",
  chemin: "/incidents",
  datasets: ["incidents"],
  placeholder: "Rechercher : équipement, site, ticket, prestataire",
  lignes: (d) => d.incidents.items,
  cle: (p) => p.id,
  trouver: (lignes, id) => lignes.find((p) => String(p.id) === id || p.reference === id),
  meta: (_d, lignes) => h("span", {},
    `${lignes.filter((p) => p.statut === "Ouverte").length} ouverte(s) · ${lignes.length} au total  `,
    h("a", { class: "btn btn-secondary btn-inline", href: "/incidents/nouvelle" },
      "Déclarer une panne")),
  triInitial: { key: "statut", sens: 1 },
  colonnes: [
    { key: "reference", label: "Panne", priority: "primary" },
    { key: "equipement", label: "Équipement", priority: "primary", value: (p) => p.eq_id,
      render: (p) => `${p.eq_id} — ${p.categorie || ""}`.replace(/ — $/, ""), horsCarte: true },
    { key: "site", label: "Site", priority: "primary", trunc: true, horsCarte: true },
    { key: "statut", label: "Statut", priority: "primary", value: ordreStatut, render: statut, horsCarte: true },
    { key: "date", label: "Déclarée le", priority: "secondary", value: (p) => p.date_declaration,
      render: (p) => fmt.date(p.date_declaration) },
    { key: "etape_libelle", label: "Dernière action", priority: "secondary",
      render: (p) => `${p.derniere_action?.libelle || "—"}${p.derniere_action?.date ? ` · ${fmt.date(p.derniere_action.date)}` : ""}` },
    { key: "inaction", label: "Sans action", priority: "secondary", value: (p) => p.inaction_jours ?? -1, render: inaction },
    { key: "ticket", label: "Ticket", priority: "optional" },
    { key: "prestataire", label: "Prestataire", priority: "optional", trunc: true },
    { key: "duree", label: "Durée", priority: "optional", value: (p) => p.duree_jours ?? null,
      render: (p) => (p.duree_mesurable ? `${fmt.nombre(p.duree_jours)} j` : "—") },
  ],
  titreCarte: (p) => `${p.eq_id} — ${p.categorie || "Panne"}`,
  sousTitreCarte: (p) => `${p.reference}${p.ticket ? ` · ${p.ticket}` : ""} · ${p.site || ""}`,
  badges: (p) => [statut(p)],
  filtres: [
    { key: "statut", label: "Statut", valeurs: (p) => p.statut },
    { key: "bloquante", label: "Bloquante", valeurs: (p) => (p.bloquante ? "Oui" : "Non") },
    { key: "site", label: "Site", valeurs: (p) => p.site },
    { key: "prestataire", label: "Prestataire", valeurs: (p) => p.prestataire },
    { key: "etape", label: "Étape", valeurs: (p) => p.etape_libelle },
  ],
  recherche: (p) => [p.reference, p.ticket, p.eq_id, p.site, p.categorie, p.marque, p.modele, p.prestataire, p.etape_libelle],
  titreFiche: (p) => p.reference,
  fiche: (p) => h("article", {},
    h("div", { class: "detail-head" },
      h("h2", {}, `${p.reference} — ${p.eq_id}`), statut(p),
      h("div", { class: "detail-sub" }, [p.categorie, p.marque, p.modele].filter(Boolean).join(" · "))),
    h("dl", { class: "dl" },
      champ("Équipement", lienEquipement(p.eq_id)),
      champ("Site", lienSite(p.site, p.site_key)),
      champ("Salle", p.salle),
      champ("Prestataire", lienFournisseur(p.prestataire)),
      champ("Ticket", p.ticket),
      champ("Déclarée le", `${fmt.date(p.date_declaration)}${p.heure_declaration ? ` à ${p.heure_declaration}` : ""}`),
      champ("Étape", p.etape_libelle),
      champ("Bloquante", fmt.oui(p.bloquante)),
      champ("Dernière action", p.derniere_action?.date ? `${p.derniere_action.libelle} · ${fmt.date(p.derniere_action.date)}` : null),
      champ("Sans action depuis", inaction(p)),
      champ("Durée de résolution", p.duree_mesurable ? `${fmt.nombre(p.duree_jours)} j` : "En cours"),
      champ("Passages", p.tentatives ? String(p.tentatives + 1) : "1"),
      p.en_observation ? champ("En observation depuis", fmt.date(p.observation_depuis)) : null,
      p.en_observation ? champ("Motif d'observation", p.observation_motif) : null,
      p.date_cloture ? champ("Clôturée le", fmt.date(p.date_cloture)) : null,
    ),
    section("Étapes",
      p.etapes?.length
        ? h("ol", { class: "timeline" }, p.etapes.map((e) =>
          h("li", {}, h("div", {}, e.libelle), h("div", { class: "tl-date" }, fmt.dateHeure(e.date)))))
        : h("p", { class: "muted" }, "Aucune étape enregistrée.")),
    p.visites?.length ? section("Visites liées",
      h("ul", { class: "mini-list card" }, p.visites.map((id) =>
        h("li", {}, h("a", { class: "mini-item", href: `/interventions/${id}` },
          h("div", { class: "mini-main" }, h("div", { class: "mini-title" }, `Intervention n° ${id}`))))))) : null,
  ),
});
