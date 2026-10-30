/* Le modèle commun des pages « liste + fiche ».
 *
 * /equipment           la liste
 * /equipment/EQ-0212   la liste et la fiche en panneau (≥ 900 px),
 *                      ou la fiche en pleine page (téléphone)
 *
 * Le passage d'un gabarit à l'autre (rotation d'un iPad, fenêtre
 * redimensionnée) réorganise l'affichage sans recharger les données.
 */
import { h, remplacer, vider, fmt, panneauPossible, surGabarit, badge } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { listeAdaptable } from "../ui/rlist.js";
import { controlesListe } from "../ui/controls.js";

export function squelette(vue, { kpis = false } = {}) {
  remplacer(vue, 
    h("div", { class: "page-head" }, h("div", { class: "skeleton skeleton-title" })),
    kpis ? h("div", { class: "kpi-grid" }, Array.from({ length: 8 }, () => h("div", { class: "skeleton skeleton-kpi" }))) : null,
    h("div", { class: "skeleton-rows" }, Array.from({ length: 8 }, () => h("div", { class: "skeleton skeleton-row" }))),
  );
}

export function erreur(vue, message) {
  remplacer(vue, h("div", { class: "empty" },
    h("h2", {}, "Données indisponibles"),
    h("p", {}, message || "Impossible de charger ces données pour le moment."),
    h("p", { class: "muted" }, "Les données déjà consultées restent accessibles hors ligne.")));
}

export function enTete(titre, meta, ...actions) {
  return h("div", { class: "page-head" },
    h("div", {}, h("h1", { class: "page-title" }, titre), meta ? h("div", { class: "page-meta" }, meta) : null),
    actions.length ? h("div", { class: "page-actions" }, actions) : null);
}

export function champ(libelle, valeur) {
  const contenu = valeur instanceof Node ? valeur : fmt.texte(valeur);
  return h("div", {}, h("dt", {}, libelle), h("dd", {}, contenu));
}

export function section(titre, ...contenu) {
  return h("section", { class: "subsection" }, h("h3", {}, titre), ...contenu);
}

export function lienEquipement(id) {
  return id ? h("a", { href: `/equipment/${encodeURIComponent(id)}` }, id) : "—";
}

export function lienSite(nom, cle) {
  return nom ? h("a", { href: `/sites/${encodeURIComponent(cle)}` }, nom) : "—";
}

/** Même clé que `site_key` côté Desktop : accents retirés, caractères
 * non ASCII ignorés, tout le reste réduit à des tirets. */
export function cleUrl(texte) {
  return String(texte ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sans-site";
}

export function lienFournisseur(nom) {
  if (!nom) return "—";
  return h("a", { href: `/suppliers/${encodeURIComponent(cleUrl(nom))}` }, nom);
}

export function listeSimple(elements, vide = "Aucun élément.") {
  if (!elements.length) return h("p", { class: "muted" }, vide);
  return h("ul", { class: "mini-list card" }, elements.map((e) => h("li", {},
    h(e.href ? "a" : "div", { class: "mini-item", href: e.href || null },
      h("div", { class: "mini-main" }, h("div", { class: "mini-title" }, e.titre), e.sous ? h("div", { class: "mini-sub" }, e.sous) : null),
      e.badge || null,
      e.date ? h("div", { class: "mini-date" }, e.date) : null))));
}

export { badge };

/**
 * Page liste + fiche.
 * @param {object} p
 *   titre, chemin, datasets, lignes(donnees), cle(ligne), colonnes, filtres,
 *   recherche(ligne) → string[], titreCarte, sousTitreCarte, badges,
 *   fiche(ligne, donnees, ctx) → Node, meta(donnees, lignes) → string,
 *   triInitial, trouver(lignes, id) → ligne
 */
export function pageListe(p) {
  return {
    titre: p.titre,
    async render(ctx) {
      const { vue, store, router, params } = ctx;
      squelette(vue);
      let donnees;
      try {
        donnees = Object.fromEntries(await Promise.all(
          p.datasets.map(async (nom) => [nom, await store.dataset(nom)])));
      } catch (e) {
        erreur(vue, e.message);
        return null;
      }
      const toutes = p.lignes(donnees);
      const lien = (ligne) => `${p.chemin}/${encodeURIComponent(p.cle(ligne))}`;
      const aller = (href) => router.aller(href + location.search);
      const liste = listeAdaptable({
        colonnes: p.colonnes, cle: p.cle, lien: (l) => lien(l) + location.search, aller: (href) => router.aller(href),
        titre: p.titreCarte, sousTitre: p.sousTitreCarte, badges: p.badges,
        triInitial: p.triInitial, vide: p.vide,
      });
      const controles = controlesListe({
        router, page: p.chemin, placeholder: p.placeholder || "Rechercher",
        filtres: p.filtres || [], champsRecherche: p.recherche,
        surChangement: () => majListe(),
      });

      const id = params.id !== undefined ? String(params.id) : null;
      const trouvee = id !== null
        ? (p.trouver ? p.trouver(toutes, id) : toutes.find((l) => String(p.cle(l)) === id)) : null;

      function majListe() {
        liste.maj(controles.appliquer(toutes), { selection: trouvee ? p.cle(trouvee) : null });
      }

      function fiche() {
        if (id === null) return null;
        if (!trouvee) {
          return h("div", { class: "card card-body" }, h("h2", {}, "Élément introuvable"),
            h("p", { class: "muted" }, `« ${id} » ne figure pas dans la dernière publication.`));
        }
        return p.fiche(trouvee, donnees, ctx);
      }

      function disposer() {
        vider(vue);
        const contenuFiche = fiche();
        if (contenuFiche && !panneauPossible()) {
          // Téléphone : la fiche en pleine page, avec retour à la liste.
          vue.append(h("a", { class: "back-link", href: p.chemin + location.search },
            icon("chevron-left", "icon icon-sm"), `Retour : ${p.titre}`), contenuFiche);
          ctx.shell.page(p.titreFiche ? p.titreFiche(trouvee) : p.titre, location.pathname);
          window.scrollTo(0, 0);
          return;
        }
        const colonneListe = h("div", {}, enTete(p.titre, p.meta ? p.meta(donnees, toutes) : ""), controles.el, liste.el);
        if (contenuFiche) {
          const fermer = h("a", { class: "back-link", href: p.chemin + location.search }, icon("close", "icon icon-sm"), "Fermer la fiche");
          vue.append(h("div", { class: "detail-layout has-panel" }, colonneListe,
            h("aside", { class: "detail-panel card card-body", "aria-label": "Fiche" }, fermer, contenuFiche)));
        } else {
          vue.append(h("div", { class: "detail-layout" }, colonneListe));
        }
        majListe();
      }

      disposer();
      const arreter = surGabarit(() => disposer());
      return () => { arreter(); liste.detruire(); };
    },
  };
}
