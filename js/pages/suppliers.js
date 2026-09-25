/* Fournisseurs et prestataires : parc suivi, contrats, pannes en cours. */
import { h, fmt, badge } from "../ui/dom.js";
import { pageListe, champ, section, listeSimple, cleUrl } from "./commun.js";

export default pageListe({
  titre: "Fournisseurs",
  chemin: "/suppliers",
  datasets: ["suppliers", "equipment", "contracts", "incidents"],
  placeholder: "Rechercher un fournisseur",
  lignes: (d) => d.suppliers.items,
  cle: (f) => f.key,
  meta: (_d, lignes) => `${lignes.length} fournisseur(s) et prestataire(s)`,
  triInitial: { key: "nom", sens: 1 },
  colonnes: [
    { key: "nom", label: "Fournisseur", priority: "primary", trunc: true },
    { key: "nb_equipements", label: "Équipements", priority: "primary", num: true, horsCarte: true },
    { key: "pannes_ouvertes", label: "Pannes ouvertes", priority: "primary", num: true,
      render: (f) => (f.pannes_ouvertes ? badge(String(f.pannes_ouvertes), "warning") : "0") },
    { key: "nb_contrats", label: "Contrats actifs", priority: "secondary", num: true },
    { key: "prochaine_maintenance", label: "Prochaine maintenance", priority: "secondary",
      render: (f) => fmt.date(f.prochaine_maintenance) },
    { key: "sites", label: "Sites", priority: "optional", value: (f) => f.sites.length, num: true },
  ],
  titreCarte: (f) => f.nom,
  sousTitreCarte: (f) => `${f.nb_equipements} équipement(s) · ${f.nb_contrats} contrat(s)` +
    (f.prochaine_maintenance ? ` · maintenance le ${fmt.date(f.prochaine_maintenance)}` : ""),
  badges: (f) => (f.pannes_ouvertes ? [badge(`${f.pannes_ouvertes} panne(s)`, "warning")] : []),
  filtres: [
    { key: "pannes", label: "Pannes ouvertes", valeurs: (f) => (f.pannes_ouvertes ? "Oui" : "Non") },
    { key: "contrat", label: "Sous contrat", valeurs: (f) => (f.nb_contrats ? "Oui" : "Non") },
    { key: "site", label: "Site", valeurs: (f) => f.sites },
  ],
  recherche: (f) => [f.nom, ...f.sites, ...f.equipements],
  // Une adresse construite à la main (« /suppliers/Canon ») retrouve aussi la fiche.
  trouver: (lignes, id) => lignes.find((f) => f.key === id) || lignes.find((f) => f.key === cleUrl(id)),
  titreFiche: (f) => f.nom,
  fiche: (f, d) => {
    const parId = new Map(d.equipment.items.map((e) => [e.id, e]));
    const contrats = d.contracts.items.filter((c) => f.contrats.includes(c.id));
    const pannes = d.incidents.items.filter((p) => p.statut === "Ouverte" && p.prestataire && cleUrl(p.prestataire) === f.key);
    return h("article", {},
      h("div", { class: "detail-head" }, h("h2", {}, f.nom),
        h("div", { class: "detail-sub" }, `${f.nb_equipements} équipement(s) · ${f.sites.length} site(s)`)),
      h("dl", { class: "dl" },
        champ("Équipements suivis", String(f.nb_equipements)),
        champ("Contrats actifs", String(f.nb_contrats)),
        champ("Pannes ouvertes", String(f.pannes_ouvertes)),
        champ("Maintenances sous 30 jours", String(f.maintenances_a_venir)),
        champ("Prochaine maintenance", f.prochaine_maintenance ? fmt.dateJour(f.prochaine_maintenance) : null),
      ),
      section("Pannes en cours", listeSimple(pannes.map((p) => ({
        href: `/incidents/${p.id}`, titre: `${p.eq_id} — ${p.categorie || ""}`, sous: p.site || "",
        badge: p.bloquante ? badge("Bloquante", "danger") : null, date: fmt.date(p.date_declaration) })), "Aucune panne en cours.")),
      section("Contrats", listeSimple(contrats.map((c) => ({
        href: `/contracts/${c.id}`, titre: `${c.eq_id} — ${c.type_contrat || "Contrat"}`, sous: c.site || "",
        badge: c.statut === "À échéance" ? badge("À échéance", "warning") : c.statut === "Échu" ? badge("Échu", "danger") : null,
        date: c.date_fin ? `fin ${fmt.date(c.date_fin)}` : "" })), "Aucun contrat actif.")),
      section("Sites", listeSimple(f.sites.map((nom) => ({ href: `/sites/${encodeURIComponent(cleUrl(nom))}`, titre: nom })))),
      section("Équipements", listeSimple(f.equipements.map((id) => {
        const e = parId.get(id);
        return { href: `/equipment/${encodeURIComponent(id)}`, titre: `${id}${e?.categorie ? ` — ${e.categorie}` : ""}`,
          sous: e ? [e.marque, e.modele, e.site].filter(Boolean).join(" · ") : "" };
      }))),
    );
  },
});
