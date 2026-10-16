/* Navigation côté client, URL propres et liens profonds (§77-78).
 *
 * /equipment/EQ-0212 ouvre directement la fiche ; le bouton « retour » du
 * navigateur fonctionne ; les filtres vivent dans la chaîne de requête, donc
 * une liste filtrée se partage et se retrouve.
 */

function compiler(chemin) {
  // « * » est la page de repli : elle ne correspond à rien directement.
  if (chemin === "*") return { regex: /(?!)/, noms: [] };
  const noms = [];
  const motif = chemin.replace(/\/:([a-zA-Z_]+)/g, (_, nom) => {
    noms.push(nom);
    return "/([^/]+)";
  });
  return { regex: new RegExp(`^${motif}/?$`), noms };
}

export class Router {
  constructor(routes, rendu) {
    this.routes = routes.map((r) => ({ ...r, ...compiler(r.path) }));
    this.rendu = rendu;
  }

  demarrer() {
    window.addEventListener("popstate", () => this._rendre());
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const lien = e.target.closest("a[href]");
      if (!lien || lien.target || lien.hasAttribute("download")) return;
      const url = new URL(lien.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/web_data/")) return;
      e.preventDefault();
      this.aller(url.pathname + url.search);
    });
    this._rendre();
  }

  aller(url, { remplacer = false } = {}) {
    const actuelle = location.pathname + location.search;
    if (url === actuelle && !remplacer) return;
    history[remplacer ? "replaceState" : "pushState"]({}, "", url);
    this._rendre();
  }

  /** Met à jour la requête sans recharger la page (filtres, recherche). */
  requete(params) {
    const url = new URL(location.href);
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur === null || valeur === undefined || valeur === "") url.searchParams.delete(cle);
      else url.searchParams.set(cle, valeur);
    }
    history.replaceState({}, "", url.pathname + url.search);
  }

  correspondance(chemin = location.pathname) {
    for (const route of this.routes) {
      const m = route.regex.exec(chemin);
      if (m) {
        const params = {};
        route.noms.forEach((nom, i) => { params[nom] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
    }
    return null;
  }

  _rendre() {
    this.rendu(this.correspondance(), new URLSearchParams(location.search));
  }
}
