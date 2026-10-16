/* Maintenances (§32) : liste, ou calendrier en lecture seule. */
import { h, remplacer, fmt, badge, aujourdhuiIso } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { pageListe, champ, section, lienEquipement, lienSite, lienFournisseur, listeSimple, squelette, erreur, enTete } from "./commun.js";

function etat(m) {
  if (m.en_retard) return "En retard";
  if (m.a_venir) return "À venir";
  return m.prochaine ? "Planifiée" : "Non planifiée";
}
const TON = { "En retard": "danger", "À venir": "info", "Planifiée": "", "Non planifiée": "warning" };
const badgeEtat = (m) => badge(etat(m), TON[etat(m)]);

function bascule(actuelle) {
  const url = (vue) => {
    const p = new URLSearchParams(location.search);
    if (vue === "liste") p.delete("vue"); else p.set("vue", vue);
    const q = p.toString();
    return `/maintenance${q ? `?${q}` : ""}`;
  };
  return h("div", { class: "segmented", role: "group", "aria-label": "Affichage" },
    h("a", { href: url("liste"), "aria-current": actuelle === "liste" ? "page" : null }, icon("list", "icon icon-sm"), "Liste"),
    h("a", { href: url("calendrier"), "aria-current": actuelle === "calendrier" ? "page" : null }, icon("calendar", "icon icon-sm"), "Calendrier"));
}

const liste = pageListe({
  titre: "Maintenances",
  chemin: "/maintenance",
  datasets: ["maintenance"],
  placeholder: "Rechercher : équipement, site, prestataire",
  lignes: (d) => d.maintenance.items,
  cle: (m) => m.eq_id,
  meta: (_d, lignes) => h("span", {}, `${lignes.filter((m) => m.en_retard).length} en retard · ${lignes.filter((m) => m.a_venir).length} sous 30 jours  `, bascule("liste")),
  triInitial: { key: "prochaine", sens: 1 },
  colonnes: [
    { key: "equipement", label: "Équipement", priority: "primary", value: (m) => m.eq_id,
      render: (m) => `${m.eq_id} — ${m.categorie || ""}`.replace(/ — $/, "") },
    { key: "site", label: "Site", priority: "primary", trunc: true, horsCarte: true },
    { key: "prochaine", label: "Date", priority: "primary", render: (m) => `${fmt.date(m.prochaine)}${m.heure_debut ? ` ${m.heure_debut}` : ""}`, horsCarte: true },
    { key: "etat", label: "État", priority: "primary", value: etat, render: badgeEtat, horsCarte: true },
    { key: "prestataire", label: "Prestataire", priority: "secondary", trunc: true },
    { key: "statut", label: "Statut", priority: "secondary" },
    { key: "rapport", label: "Rapport reçu", priority: "optional", value: (m) => (m.rapport_recu ? "Oui" : "Non") },
    { key: "communication", label: "Communication site", priority: "optional",
      value: (m) => m.communication?.annuelle || m.communication?.j7 || "" },
    { key: "derniere", label: "Dernière", priority: "optional", render: (m) => fmt.date(m.derniere) },
  ],
  titreCarte: (m) => `${m.eq_id} — ${m.categorie || ""}`.replace(/ — $/, ""),
  sousTitreCarte: (m) => `${m.site || ""} · ${m.prochaine ? fmt.dateJour(m.prochaine) : "non planifiée"}`,
  badges: (m) => [badgeEtat(m)],
  filtres: [
    { key: "etat", label: "État", valeurs: etat },
    { key: "site", label: "Site", valeurs: (m) => m.site },
    { key: "prestataire", label: "Prestataire", valeurs: (m) => m.prestataire },
    { key: "type", label: "Type", valeurs: (m) => m.categorie },
    { key: "rapport", label: "Rapport reçu", valeurs: (m) => (m.rapport_recu ? "Oui" : "Non") },
  ],
  recherche: (m) => [m.eq_id, m.site, m.prestataire, m.categorie, m.marque, m.modele],
  titreFiche: (m) => m.eq_id,
  fiche: (m) => h("article", {},
    h("div", { class: "detail-head" }, h("h2", {}, `Maintenance — ${m.eq_id}`), badgeEtat(m),
      h("div", { class: "detail-sub" }, [m.categorie, m.marque, m.modele].filter(Boolean).join(" · "))),
    h("dl", { class: "dl" },
      champ("Équipement", lienEquipement(m.eq_id)),
      champ("Site", lienSite(m.site, m.site_key)),
      champ("Prestataire", lienFournisseur(m.prestataire)),
      champ("Périodicité", m.frequence_mois ? `${m.frequence_mois} mois` : null),
      champ("Prochaine", m.prochaine ? `${fmt.dateJour(m.prochaine)}${m.heure_debut ? ` ${m.heure_debut}` : ""}` : null),
      champ("Suivantes", m.suivantes?.length ? m.suivantes.map(fmt.date).join(", ") : null),
      champ("Dernière", m.derniere ? fmt.date(m.derniere) : null),
      champ("Statut", m.statut),
      champ("Rapport reçu", fmt.oui(m.rapport_recu)),
      champ("Planning bloqué", fmt.oui(m.planning_bloque)),
      champ("Équipes informées", fmt.oui(m.equipes_informees)),
      champ("Communication annuelle", m.communication?.annuelle),
      champ("Rappel J-7", m.communication?.j7),
    ),
    section("Historique", listeSimple((m.evenements || []).slice().reverse().map((ev) => ({
      href: `/interventions/${ev.intervention_id}`, titre: ev.type || "Maintenance", sous: ev.statut || "",
      date: `${fmt.date(ev.date)}${ev.heure_debut ? ` ${ev.heure_debut}` : ""}` })), "Aucune maintenance enregistrée."))),
});

const calendrier = {
  titre: "Maintenances",
  async render({ vue, store, router, requete }) {
    squelette(vue);
    let donnees;
    try { donnees = await store.dataset("maintenance"); } catch (e) { erreur(vue, e.message); return null; }

    // Les événements : maintenances enregistrées, et prochaine échéance.
    const parJour = new Map();
    const ajouter = (jour, evt) => { if (jour) { if (!parJour.has(jour)) parJour.set(jour, []); parJour.get(jour).push(evt); } };
    for (const m of donnees.items) {
      const vues = new Set();
      for (const ev of m.evenements || []) {
        vues.add(ev.date);
        ajouter(ev.date, { m, heure: ev.heure_debut, fait: ev.statut === "Réalisée", href: `/interventions/${ev.intervention_id}` });
      }
      if (m.prochaine && !vues.has(m.prochaine)) {
        ajouter(m.prochaine, { m, heure: m.heure_debut, retard: m.en_retard, href: `/maintenance/${encodeURIComponent(m.eq_id)}` });
      }
    }

    const aujourdhui = aujourdhuiIso();
    const [a0, m0] = (requete.get("mois") || aujourdhui.slice(0, 7)).split("-").map(Number);
    const annee = Number.isFinite(a0) ? a0 : Number(aujourdhui.slice(0, 4));
    const mois = Number.isFinite(m0) ? m0 - 1 : Number(aujourdhui.slice(5, 7)) - 1;
    const cleMois = (a, mm) => `${a}-${String(mm + 1).padStart(2, "0")}`;
    const decaler = (n) => { const d = new Date(annee, mois + n, 1); return cleMois(d.getFullYear(), d.getMonth()); };
    const aller = (cle) => { const p = new URLSearchParams(location.search); p.set("vue", "calendrier"); p.set("mois", cle); router.aller(`/maintenance?${p}`, { remplacer: true }); };

    const premier = new Date(annee, mois, 1);
    const decalage = (premier.getDay() + 6) % 7;             // semaine du lundi
    const debut = new Date(annee, mois, 1 - decalage);
    const jours = Array.from({ length: 42 }, (_, i) => new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const libelle = (e) => `${e.heure ? `${e.heure} ` : ""}${e.m.eq_id} ${e.m.categorie || ""}`.trim();
    const classe = (e) => `cal-evt${e.retard ? " retard" : e.fait ? " fait" : ""}`;

    const grille = h("div", { class: "cal-grid" },
      ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((j) => h("div", { class: "cal-dow" }, j)),
      jours.map((d) => {
        const cle = iso(d);
        const evts = (parJour.get(cle) || []).sort((x, y) => (x.heure || "").localeCompare(y.heure || ""));
        return h("div", { class: `cal-day${d.getMonth() !== mois ? " hors-mois" : ""}${cle === aujourdhui ? " aujourdhui" : ""}` },
          h("span", { class: "cal-num" }, String(d.getDate())),
          evts.slice(0, 3).map((e) => h("a", { class: classe(e), href: e.href, title: `${libelle(e)} — ${e.m.site || ""}` }, libelle(e))),
          evts.length > 3 ? h("div", { class: "cal-more" }, `+ ${evts.length - 3} autre(s)`) : null);
      }));

    const joursDuMois = jours.filter((d) => d.getMonth() === mois && parJour.has(iso(d)));
    const agenda = h("div", { class: "cal-agenda" }, joursDuMois.length ? joursDuMois.map((d) =>
      h("div", { class: "agenda-day" }, h("h3", {}, fmt.dateJour(iso(d))),
        listeSimple(parJour.get(iso(d)).map((e) => ({ href: e.href, titre: `${e.m.eq_id} — ${e.m.categorie || ""}`,
          sous: `${e.m.site || ""}${e.m.prestataire ? ` · ${e.m.prestataire}` : ""}`,
          badge: e.retard ? badge("En retard", "danger") : e.fait ? badge("Réalisée", "success") : null,
          date: e.heure || "" })))))
      : h("p", { class: "empty" }, "Aucune maintenance ce mois-ci."));

    remplacer(vue, 
      enTete("Maintenances", h("span", {}, "Calendrier en lecture seule  ", bascule("calendrier"))),
      h("section", { class: "cal" },
        h("div", { class: "cal-head" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "Mois précédent", onclick: () => aller(decaler(-1)) }, icon("chevron-left")),
          h("h2", {}, fmt.mois(annee, mois)),
          h("button", { class: "btn btn-secondary", type: "button", onclick: () => aller(aujourdhui.slice(0, 7)) }, "Aujourd'hui"),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Mois suivant", onclick: () => aller(decaler(1)) }, icon("chevron-right"))),
        grille, agenda));
    return null;
  },
};

export default {
  titre: "Maintenances",
  render(ctx) {
    return (ctx.requete.get("vue") === "calendrier" && !ctx.params.id ? calendrier : liste).render(ctx);
  },
};
