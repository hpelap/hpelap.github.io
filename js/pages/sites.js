/* Sites : la liste, et la fiche d'un site (équipements, pannes en cours,
 * maintenances à venir). */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, section, listeSimple, lienFournisseur } from "./commun.js";

const alerte = (n, ton) => (n ? badge(String(n), ton) : "0");

export default pageListe({
  titre: "Sites",
  chemin: "/sites",
  datasets: ["sites", "equipment", "incidents", "maintenance"],
  placeholder: "Rechercher un site",
  lignes: (d) => d.sites.items,
  cle: (s) => s.key,
  meta: (_d, lignes) => `${lignes.length} site(s) · ${lignes.reduce((n, s) => n + s.equipements, 0)} équipement(s) actif(s)`,
  triInitial: { key: "nom", sens: 1 },
  colonnes: [
    { key: "nom", label: "Site", priority: "primary", trunc: true },
    { key: "equipements", label: "Équipements", priority: "primary", num: true, horsCarte: true },
    { key: "pannes_ouvertes", label: "Pannes ouvertes", priority: "primary", num: true,
      render: (s) => alerte(s.pannes_ouvertes, s.pannes_bloquantes ? "danger" : "warning") },
    { key: "maintenances_en_retard", label: "Maint. en retard", priority: "secondary", num: true,
      render: (s) => alerte(s.maintenances_en_retard, "danger") },
    { key: "maintenances_a_venir", label: "Maint. ≤ 30 j", priority: "secondary", num: true },
    { key: "prestataires", label: "Prestataires", priority: "optional", sort: false, trunc: true,
      render: (s) => s.prestataires.join(", ") || "—" },
  ],
  titreCarte: (s) => s.nom,
  sousTitreCarte: (s) => `${s.equipements} équipement(s) · ${s.maintenances_a_venir} maintenance(s) sous 30 jours`,
  badges: (s) => [
    s.pannes_bloquantes ? badge(`${s.pannes_bloquantes} bloquante(s)`, "danger") : null,
    s.pannes_ouvertes && !s.pannes_bloquantes ? badge(`${s.pannes_ouvertes} panne(s)`, "warning") : null,
    s.maintenances_en_retard ? badge(`${s.maintenances_en_retard} en retard`, "danger") : null,
  ].filter(Boolean),
  filtres: [
    { key: "pannes", label: "Pannes ouvertes", valeurs: (s) => (s.pannes_ouvertes ? "Oui" : "Non") },
    { key: "retard", label: "Maintenance en retard", valeurs: (s) => (s.maintenances_en_retard ? "Oui" : "Non") },
    { key: "prestataire", label: "Prestataire", valeurs: (s) => s.prestataires },
  ],
  recherche: (s) => [s.nom, ...s.prestataires],
  titreFiche: (s) => s.nom,
  fiche: (s, d) => {
    const equipements = d.equipment.items.filter((e) => e.site_key === s.key && e.actif);
    const pannes = d.incidents.items.filter((p) => p.site_key === s.key && p.statut === "Ouverte");
    const maintenances = d.maintenance.items
      .filter((m) => m.site_key === s.key && (m.en_retard || m.a_venir))
      .sort((a, b) => String(a.prochaine).localeCompare(String(b.prochaine)));
    return h("article", {},
      h("div", { class: "detail-head" }, h("h2", {}, s.nom),
        h("div", { class: "detail-sub" }, `${s.equipements} équipement(s) actif(s)`)),
      h("dl", { class: "dl" },
        champ("Pannes ouvertes", String(s.pannes_ouvertes)),
        champ("Dont bloquantes", String(s.pannes_bloquantes)),
        champ("Maintenances en retard", String(s.maintenances_en_retard)),
        champ("Maintenances sous 30 jours", String(s.maintenances_a_venir)),
        champ("Prestataires", s.prestataires.length ? h("span", {},
          s.prestataires.flatMap((p, i) => (i ? [", ", lienFournisseur(p)] : [lienFournisseur(p)]))) : null),
      ),
      section("Pannes en cours", listeSimple(pannes.map((p) => ({
        href: `/incidents/${p.id}`, titre: `${p.eq_id} — ${p.categorie || ""}`,
        sous: p.etape_libelle || p.symptome || "",
        badge: p.bloquante ? badge("Bloquante", "danger") : p.en_observation ? badge("En observation", "info") : null,
        date: fmt.date(p.date_declaration) })), "Aucune panne en cours.")),
      section("Maintenances en retard et à venir", listeSimple(maintenances.map((m) => ({
        href: `/maintenance/${encodeURIComponent(m.eq_id)}`, titre: `${m.eq_id} — ${m.categorie || ""}`,
        sous: m.prestataire || "", badge: m.en_retard ? badge("En retard", "danger") : null,
        date: fmt.date(m.prochaine) })), "Aucune maintenance en retard ni sous 30 jours.")),
      section(`Équipements (${equipements.length})`, listeSimple(equipements
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((e) => ({ href: `/equipment/${encodeURIComponent(e.id)}`, titre: `${e.id} — ${e.categorie || ""}`,
          sous: [e.marque, e.modele, e.salle].filter(Boolean).join(" · ") })), "Aucun équipement actif.")),
    );
  },
});
