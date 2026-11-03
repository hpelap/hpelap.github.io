/* Tableau de bord (§27). Chaque indicateur ouvre sa liste filtrée. */
import { h, remplacer, fmt } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { squelette, erreur, enTete, listeSimple } from "./commun.js";

export default {
  titre: "Tableau de bord",
  async render({ vue, store }) {
    squelette(vue, { kpis: true });
    let tableau;
    try {
      tableau = await store.dataset("dashboard");
    } catch (e) {
      erreur(vue, e.message);
      return null;
    }
    const m = store.statut.manifest;
    const listes = tableau.listes || {};

    const kpis = h("div", { class: "kpi-grid" }, (tableau.kpis || []).map((k) =>
      h("a", { class: "kpi", href: k.lien, dataset: { ton: k.ton } },
        h("span", { class: "kpi-label" }, k.libelle),
        h("span", { class: "kpi-value" }, fmt.nombre(k.valeur)),
        h("span", { class: "kpi-link" }, "Voir la liste"))));

    const bloc = (titre, lien, elements, vide) => h("section", { class: "card" },
      h("div", { class: "card-head" }, h("h2", {}, titre),
        h("a", { href: lien, class: "btn btn-ghost" }, "Tout voir", icon("chevron-right", "icon icon-sm"))),
      elements.length ? listeSimple(elements) : h("p", { class: "card-body muted" }, vide));

    const s = tableau.seuils || {};
    remplacer(vue, 
      enTete("Tableau de bord", m ? `Snapshot ${m.snapshot_version} · données publiées par H-Pilot Desktop` : ""),
      kpis,
      h("div", { class: "grid-2 section-gap" },
        bloc("Pannes bloquantes", "/incidents?statut=Ouverte&bloquante=Oui",
          (listes.pannes_bloquantes || []).map((p) => ({
            href: `/incidents/${p.id}`, titre: p.libelle, sous: `${p.site || ""} · ${p.detail || ""}`,
            date: fmt.date(p.date) })), "Aucune panne bloquante."),
        bloc("Maintenances en retard", "/maintenance?etat=En%20retard",
          (listes.maintenances_en_retard || []).map((x) => ({
            href: `/equipment/${encodeURIComponent(x.eq_id)}`, titre: x.libelle,
            sous: `${x.site || ""}${x.detail ? ` · ${x.detail}` : ""}`, date: fmt.date(x.date) })),
          "Aucune maintenance en retard."),
        bloc(`Interventions sous ${s.intervention_a_venir_jours || 7} jours`, "/interventions?a_venir=Oui",
          (listes.interventions_a_venir || []).map((x) => ({
            href: `/interventions/${x.id}`, titre: x.libelle,
            sous: `${x.site || ""}${x.detail ? ` · ${x.detail}` : ""}`,
            date: `${fmt.date(x.date)}${x.heure ? ` ${x.heure}` : ""}` })),
          "Aucune intervention prévue."),
        bloc(`Contrats sous ${s.contrat_echeance_jours || 90} jours`, "/contracts?statut=%C3%80%20%C3%A9ch%C3%A9ance",
          (listes.contrats_a_echeance || []).map((x) => ({
            href: `/contracts/${x.id}`, titre: x.libelle, sous: x.site || "",
            date: `${fmt.date(x.date)} (${x.detail})` })),
          "Aucun contrat n'arrive à échéance."),
      ),
    );
    return null;
  },
};
