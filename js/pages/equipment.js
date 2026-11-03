/* Parc et fiche équipement (§28-29, §51-52). */
import { h, fmt, badge } from "../ui/dom.js";
import {
  pageListe, champ, section, lienSite, lienFournisseur, listeSimple, lienEquipement,
} from "./commun.js";

const statutBadge = (e) => badge(e.statut, e.actif ? "success" : "");

export default pageListe({
  titre: "Parc",
  chemin: "/equipment",
  datasets: ["equipment"],
  placeholder: "Rechercher : ID, modèle, n° de série, site",
  lignes: (d) => d.equipment.items,
  cle: (e) => e.id,
  meta: (_d, lignes) => `${fmt.nombre(lignes.filter((e) => e.actif).length)} équipements actifs sur ${fmt.nombre(lignes.length)}`,
  triInitial: { key: "id", sens: 1 },
  colonnes: [
    { key: "id", label: "ID", priority: "primary" },
    { key: "equipement", label: "Équipement", priority: "primary", value: (e) => `${e.marque || ""} ${e.modele || ""}`.trim(), trunc: true },
    { key: "site", label: "Site", priority: "primary", trunc: true, horsCarte: true },
    { key: "statut", label: "Statut", priority: "primary", render: statutBadge, horsCarte: true },
    { key: "categorie", label: "Type", priority: "secondary", trunc: true, horsCarte: true },
    { key: "salle", label: "Salle", priority: "secondary", trunc: true },
    { key: "prochaine", label: "Prochaine maintenance", priority: "secondary",
      value: (e) => e.maintenance?.prochaine || "", render: (e) => maintenanceCellule(e) },
    { key: "numero_serie", label: "N° série", priority: "optional" },
    { key: "prestataire", label: "Prestataire", priority: "optional", trunc: true },
    { key: "frequence", label: "Périodicité", priority: "optional",
      value: (e) => e.maintenance?.frequence_mois ?? null,
      render: (e) => (e.maintenance?.frequence_mois ? `${e.maintenance.frequence_mois} mois` : "—") },
  ],
  titreCarte: (e) => e.id,
  sousTitreCarte: (e) => [`${e.marque || ""} ${e.modele || ""}`.trim(),
    [e.site, e.categorie].filter(Boolean).join(" · ")].filter(Boolean).join(" — "),
  badges: (e) => [statutBadge(e)],
  filtres: [
    { key: "site", label: "Site", valeurs: (e) => e.site },
    { key: "type", label: "Type", valeurs: (e) => e.categorie },
    { key: "marque", label: "Marque", valeurs: (e) => e.marque },
    { key: "prestataire", label: "Prestataire", valeurs: (e) => e.prestataire },
    { key: "statut", label: "Statut", valeurs: (e) => e.statut },
  ],
  recherche: (e) => [e.id, e.marque, e.modele, e.numero_serie, e.site, e.salle, e.categorie, e.prestataire],
  titreFiche: (e) => e.id,
  fiche: (e, _d, ctx) => ficheEquipement(e, ctx),
});

function maintenanceCellule(e) {
  const m = e.maintenance || {};
  if (!m.prochaine) return "—";
  const texte = fmt.date(m.prochaine);
  if (m.en_retard) return h("span", {}, texte, " ", badge("En retard", "danger"));
  if (m.a_venir) return h("span", {}, texte, " ", badge("À venir", "info"));
  return texte;
}

function ficheEquipement(e, { store }) {
  const m = e.maintenance || {};
  const zones = {
    contrat: h("div", {}, h("div", { class: "skeleton skeleton-row" })),
    maintenances: h("div", {}, h("div", { class: "skeleton skeleton-row" })),
    pannes: h("div", {}, h("div", { class: "skeleton skeleton-row" })),
    interventions: h("div", {}, h("div", { class: "skeleton skeleton-row" })),
    taches: h("div", {}, h("div", { class: "skeleton skeleton-row" })),
  };

  const el = h("article", {},
    h("div", { class: "detail-head" },
      h("h2", {}, `${e.id} — ${e.marque || ""} ${e.modele || ""}`.trim()),
      statutBadge(e),
      h("div", { class: "detail-sub" }, [e.categorie, e.site].filter(Boolean).join(" · "))),
    h("dl", { class: "dl" },
      champ("Site", lienSite(e.site, e.site_key)),
      champ("Salle", e.salle),
      champ("Type", e.categorie),
      champ("Marque", e.marque),
      champ("Modèle", e.modele),
      champ("N° de série", e.numero_serie),
      champ("Mainteneur", lienFournisseur(e.prestataire)),
      champ("Périodicité", m.frequence_mois ? `${m.frequence_mois} mois` : null),
      champ("Criticité", e.criticite),
      champ("Rôle", e.role_equipement),
      champ("Mise en service", e.mise_en_service ? fmt.date(e.mise_en_service) : null),
      champ("Fin de garantie", e.fin_garantie ? fmt.date(e.fin_garantie) : null),
    ),
    section("Maintenance",
      h("dl", { class: "dl" },
        champ("Dernière", m.derniere ? fmt.date(m.derniere) : null),
        champ("Prochaine", m.prochaine ? maintenanceCellule(e) : null),
        champ("Statut", m.statut)),
      zones.maintenances),
    section("Contrat", zones.contrat),
    section("Pannes", zones.pannes),
    section("Interventions", zones.interventions),
    section("Tâches liées", zones.taches),
    e.liaisons?.length ? section("Équipements liés", listeSimple(e.liaisons.map((l) => ({
      href: `/equipment/${encodeURIComponent(l.id)}`, titre: l.id, sous: l.sens === "parent" ? "Équipement parent" : "Équipement rattaché" })))) : null,
    e.documents?.length ? section("Documents (métadonnées)",
      h("p", { class: "muted" }, "Les fichiers eux-mêmes ne sont pas publiés sur le Web."),
      listeSimple(e.documents.slice(0, 20).map((d) => ({
        titre: d.nom || "Document", sous: [d.type, d.categorie].filter(Boolean).join(" · "), date: fmt.date(d.date) })))) : null,
  );

  const remplir = (zone, noeud) => { zone.replaceChildren(noeud); };
  const echec = (zone) => remplir(zone, h("p", { class: "muted" }, "Non disponible hors ligne."));

  store.dataset("contracts").then((d) => {
    const contrats = d.items.filter((c) => c.eq_id === e.id)
      .sort((a, b) => (b.annee || 0) - (a.annee || 0));
    remplir(zones.contrat, listeSimple(contrats.slice(0, 5).map((c) => ({
      href: `/contracts/${c.id}`, titre: `${c.type_contrat || "Contrat"} ${c.annee || ""}`.trim(),
      sous: `${c.prestataire || ""} · ${fmt.euros(c.montant_annuel)}`,
      badge: badge(c.statut, c.statut === "À échéance" ? "warning" : c.statut === "Échu" ? "danger" : ""),
      date: c.date_fin ? `fin ${fmt.date(c.date_fin)}` : "" })), "Aucun contrat."));
  }).catch(() => echec(zones.contrat));

  store.dataset("maintenance").then((d) => {
    const ligne = d.items.find((x) => x.eq_id === e.id);
    const evts = (ligne?.evenements || []).slice(-8).reverse();
    remplir(zones.maintenances, evts.length ? listeSimple(evts.map((ev) => ({
      href: `/interventions/${ev.intervention_id}`, titre: ev.type || "Maintenance",
      sous: ev.statut || "", date: `${fmt.date(ev.date)}${ev.heure_debut ? ` ${ev.heure_debut}` : ""}` }))) : h("p", { class: "muted" }, "Aucune maintenance enregistrée."));
  }).catch(() => echec(zones.maintenances));

  store.dataset("incidents").then((d) => {
    const pannes = d.items.filter((p) => p.eq_id === e.id).slice(0, 10);
    remplir(zones.pannes, listeSimple(pannes.map((p) => ({
      href: `/incidents/${p.id}`, titre: `${p.reference} — ${p.etape_libelle}`,
      sous: p.bloquante ? "Bloquante" : "", badge: badge(p.statut, p.statut === "Ouverte" ? "warning" : ""),
      date: fmt.date(p.date_declaration) })), "Aucune panne."));
  }).catch(() => echec(zones.pannes));

  store.dataset("interventions").then((d) => {
    const lignes = d.items.filter((i) => i.eq_id === e.id).slice(0, 10);
    remplir(zones.interventions, listeSimple(lignes.map((i) => ({
      href: `/interventions/${i.id}`, titre: i.type || "Intervention", sous: i.statut || "",
      date: `${fmt.date(i.date)}${i.heure_debut ? ` ${i.heure_debut}` : ""}` })), "Aucune intervention."));
  }).catch(() => echec(zones.interventions));

  store.dataset("tasks").then((d) => {
    const taches = d.items.filter((t) => t.liens.some((l) => l.type === "equipement" && l.id === e.id));
    remplir(zones.taches, listeSimple(taches.map((t) => ({
      href: `/tasks/${t.id}`, titre: t.titre, sous: `${t.statut_libelle} · ${t.priorite_libelle}`,
      badge: t.en_retard ? badge("En retard", "danger") : null,
      date: t.echeance ? fmt.date(t.echeance) : "" })), "Aucune tâche liée."));
  }).catch(() => echec(zones.taches));

  return el;
}

export { lienEquipement };
