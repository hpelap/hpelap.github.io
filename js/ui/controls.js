/* Recherche et filtres d'une liste (§68-69).
 *
 * - recherche avec attente de 200 ms, insensible aux accents ;
 * - bureau : filtres visibles en ligne ; tablette et téléphone : bouton
 *   « Filtres (n) » qui ouvre une feuille ;
 * - filtres actifs rappelés en pastilles, chacune retirable ;
 * - l'état vit dans l'URL (partageable, bouton retour) et dans la session
 *   (retrouvé en revenant sur la page).
 */
import { h, remplacer, debounce, normaliser, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { ouvrirFeuille } from "./sheet.js";

export function controlesListe({ router, page, placeholder, filtres, champsRecherche, surChangement }) {
  const cleSession = `hpilot.filtres.${page}`;
  const url = new URLSearchParams(location.search);
  let memoire = {};
  try { memoire = JSON.parse(sessionStorage.getItem(cleSession) || "{}"); } catch { /* sans effet */ }
  const depuisUrl = [...url.keys()].some((k) => k === "q" || filtres.some((f) => f.key === k));

  const etat = { q: "", valeurs: {} };
  if (depuisUrl) {
    etat.q = url.get("q") || "";
    for (const f of filtres) if (url.get(f.key)) etat.valeurs[f.key] = url.get(f.key);
  } else {
    etat.q = memoire.q || "";
    etat.valeurs = memoire.valeurs || {};
  }

  let lignes = [];
  let resultats = 0;

  const enregistrer = () => {
    try { sessionStorage.setItem(cleSession, JSON.stringify(etat)); } catch { /* sans effet */ }
    const params = { q: etat.q || null };
    for (const f of filtres) params[f.key] = etat.valeurs[f.key] || null;
    router.requete(params);
  };

  const changer = () => { enregistrer(); majInterface(); surChangement(); };

  // Recherche
  const saisie = h("input", { class: "input", type: "search", placeholder, value: etat.q,
    "aria-label": placeholder, autocomplete: "off", enterkeyhint: "search" });
  saisie.addEventListener("input", debounce(() => { etat.q = saisie.value.trim(); changer(); }, 200));

  // Filtres en ligne (bureau)
  const enLigne = h("div", { class: "filters-inline" });
  const boutonFiltres = h("button", { class: "btn btn-secondary filters-toggle", type: "button",
    onclick: () => ouvrirFeuilleFiltres() }, icon("filter", "icon icon-sm"), "Filtres");
  const compteur = h("span", { class: "result-count", "aria-live": "polite" });
  const puces = h("div", { class: "active-filters" });

  const el = h("div", {},
    h("div", { class: "toolbar" },
      h("div", { class: "field" }, icon("search"), saisie), boutonFiltres, compteur, enLigne),
    puces);

  function options(f) {
    const vues = new Map();
    for (const ligne of lignes) {
      for (const v of [].concat(f.valeurs(ligne))) {
        if (v === null || v === undefined || v === "") continue;
        vues.set(String(v), (vues.get(String(v)) || 0) + 1);
      }
    }
    const ordre = f.ordre || ((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    return [...vues.keys()].sort(ordre);
  }

  function select(f, surChoix) {
    const s = h("select", { class: "select", "aria-label": f.label },
      h("option", { value: "" }, `${f.label} : tous`),
      options(f).map((v) => h("option", { value: v, selected: etat.valeurs[f.key] === v }, f.libelle ? f.libelle(v) : v)));
    s.addEventListener("change", () => surChoix(s.value));
    return s;
  }

  function majInterface() {
    remplacer(enLigne, ...filtres.map((f) => select(f, (v) => {
      if (v) etat.valeurs[f.key] = v; else delete etat.valeurs[f.key];
      changer();
    })));
    const actifs = filtres.filter((f) => etat.valeurs[f.key]);
    remplacer(boutonFiltres, icon("filter", "icon icon-sm"), "Filtres",
      actifs.length ? h("span", { class: "count" }, String(actifs.length)) : null);
    remplacer(puces, ...actifs.map((f) => h("span", { class: "chip-filter" },
      `${f.label} : ${f.libelle ? f.libelle(etat.valeurs[f.key]) : etat.valeurs[f.key]}`,
      h("button", { type: "button", "aria-label": `Retirer le filtre ${f.label}`,
        onclick: () => { delete etat.valeurs[f.key]; changer(); } }, icon("close", "icon icon-sm")))));
    compteur.textContent = `${fmt.nombre(resultats)} résultat${resultats > 1 ? "s" : ""}`;
  }

  function ouvrirFeuilleFiltres() {
    const brouillon = { ...etat.valeurs };
    const corps = h("div", { class: "sheet-body-inner" }, filtres.map((f) =>
      h("label", {}, f.label, select(f, (v) => { if (v) brouillon[f.key] = v; else delete brouillon[f.key]; }))));
    let fermer;
    const pied = [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => {
        etat.valeurs = {}; changer(); fermer();
      } }, "Réinitialiser"),
      h("button", { class: "btn", type: "button", onclick: () => {
        etat.valeurs = brouillon; changer(); fermer();
      } }, "Appliquer"),
    ];
    fermer = ouvrirFeuille({ titre: "Filtres", corps, pied });
  }

  return {
    el,
    etat,
    /** Filtre et recherche ; rend les lignes retenues. */
    appliquer(toutes) {
      lignes = toutes;
      const q = normaliser(etat.q);
      const retenues = toutes.filter((ligne) => {
        for (const f of filtres) {
          const v = etat.valeurs[f.key];
          if (v && ![].concat(f.valeurs(ligne)).map(String).includes(v)) return false;
        }
        if (!q) return true;
        return champsRecherche(ligne).some((c) => normaliser(c).includes(q));
      });
      resultats = retenues.length;
      majInterface();
      return retenues;
    },
  };
}
