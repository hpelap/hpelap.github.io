/* Liste adaptable (§50-53).
 *
 * Chaque colonne déclare sa priorité :
 *   primary    toujours visible — en tête de carte sur téléphone
 *   secondary  tableau tablette et bureau ; dans la carte sur téléphone
 *   optional   tableau bureau ; « Voir plus » sur téléphone ; fiche sur tablette
 *
 * Quand même les colonnes principales ne tiennent pas (liste à côté du
 * panneau de fiche sur un iPad en paysage), la liste devient compacte :
 * titre, sous-titre et pastilles, une ligne par élément.
 *
 * Dans un tableau, les colonnes secondaires puis optionnelles ne sont
 * ajoutées que si la largeur réellement disponible les contient : un iPhone
 * en paysage, ou la liste à côté du panneau de fiche, n'affichent pas un
 * tableau qu'il faudrait faire défiler horizontalement.
 *
 * Le rendu change avec le gabarit — rotation comprise — sans recharger les
 * données. Les longues listes s'affichent par tranches de 50, la suivante
 * arrivant quand on approche de la fin (§67).
 */
import { h, vider, gabarit, surGabarit, fmt } from "./dom.js";
import { icon } from "./icons.js";

const TRANCHE = 50;
const LARGEUR_COLONNE = 120;      // estimation par colonne, en px
const LARGEUR_TRONQUEE = 170;     // colonnes de texte long (tronquées)

export function listeAdaptable(options) {
  const {
    colonnes, cle, lien, titre, sousTitre, badges = () => [], aller,
    vide = "Aucun résultat.", triInitial = null, surTri,
  } = options;
  const el = h("div", { class: "rlist" });
  let lignes = [];
  let visibles = TRANCHE;
  let tri = triInitial;
  let selection = null;
  let observateur = null;
  let signature = "";
  let plafond = Infinity;   // colonnes non principales admises, fixé après mesure
  let nonPrincipales = 0;   // colonnes non principales du dernier tableau rendu
  let largeurMesuree = 0;
  let compacte = false;     // le tableau ne tient pas du tout

  const rendre = () => {
    if (observateur) { observateur.disconnect(); observateur = null; }
    vider(el);
    if (!lignes.length) {
      el.append(h("div", { class: "empty" }, h("h2", {}, "Aucun résultat"), h("p", {}, vide)));
      return;
    }
    const tranche = lignes.slice(0, visibles);
    const g = gabarit();
    if (g === "mobile") { signature = "cartes"; el.append(cartes(tranche)); }
    else if (compacte) { signature = "compacte"; el.append(listeCompacte(tranche)); }
    else {
      el.append(tableau(tranche, g));
      // L'estimation ne suffit pas toujours (badges, dates longues) : si le
      // tableau déborde malgré tout, la dernière colonne non principale part.
      // (L'apparition de la barre de défilement verticale peut aussi réduire
      // la largeur entre l'estimation et la mesure.)
      const wrap = el.lastElementChild;
      if (el.isConnected && wrap.clientWidth > 0 && wrap.scrollWidth > wrap.clientWidth + 2) {
        if (nonPrincipales > 0) plafond = nonPrincipales - 1;
        else compacte = true;
        rendre();
        return;
      }
    }
    if (visibles < lignes.length) {
      const reste = lignes.length - visibles;
      const bouton = h("button", { class: "btn btn-secondary", type: "button",
        onclick: () => { visibles += TRANCHE; rendre(); } },
      `Afficher plus (${fmt.nombre(reste)} restant${reste > 1 ? "s" : ""})`);
      const zone = h("div", { class: "list-more" }, bouton);
      el.append(zone);
      if ("IntersectionObserver" in window) {
        observateur = new IntersectionObserver((entrees) => {
          if (entrees.some((e) => e.isIntersecting)) { visibles += TRANCHE; rendre(); }
        }, { rootMargin: "400px" });
        observateur.observe(zone);
      }
    }
  };

  const valeur = (col, ligne) => (col.value ? col.value(ligne) : ligne[col.key]);
  const contenu = (col, ligne) => {
    if (col.render) return col.render(ligne);
    const v = valeur(col, ligne);
    return v === null || v === undefined || v === "" ? "—" : String(v);
  };

  function colonnesVisibles(g) {
    const largeur = el.clientWidth || document.documentElement.clientWidth;
    const poids = (c) => c.largeur || (c.trunc ? LARGEUR_TRONQUEE : LARGEUR_COLONNE);
    let reste = largeur - colonnes.filter((c) => c.priority === "primary").reduce((n, c) => n + poids(c), 0);
    const retenues = new Set(colonnes.filter((c) => c.priority === "primary"));
    const niveaux = g === "bureau" ? ["secondary", "optional"] : ["secondary"];
    ajout: for (const niveau of niveaux) {
      for (const c of colonnes.filter((x) => x.priority === niveau)) {
        if (poids(c) > reste) break ajout;       // l'ordre de priorité est respecté
        reste -= poids(c);
        retenues.add(c);
      }
    }
    let admises = plafond;
    return colonnes.filter((c) => retenues.has(c) && (c.priority === "primary" || admises-- > 0));
  }

  function tableau(tranche, g) {
    const cols = colonnesVisibles(g);
    signature = cols.map((c) => c.key).join("|");
    nonPrincipales = cols.filter((c) => c.priority !== "primary").length;
    const entete = h("tr", {}, cols.map((col) => {
      const actif = tri && tri.key === col.key;
      const th = h("th", { scope: "col", class: col.num ? "num" : "",
        "aria-sort": actif ? (tri.sens > 0 ? "ascending" : "descending") : null });
      if (col.sort === false) th.append(col.label);
      else th.append(h("button", { type: "button", onclick: () => trier(col.key) }, col.label, icon("sort", "icon icon-sm")));
      return th;
    }));
    const corps = h("tbody", {}, tranche.map((ligne) => {
      const href = lien(ligne);
      const tr = h("tr", { "aria-selected": String(selection !== null && cle(ligne) === selection),
        onclick: (e) => { if (!e.target.closest("a")) aller(href); } },
      cols.map((col, i) => {
        const c = contenu(col, ligne);
        const cellule = i === 0 ? h("a", { href, class: "cell-main" }, c) : c;
        return h("td", { class: col.num ? "num" : "" }, col.trunc ? h("span", { class: "cell-trunc", title: typeof c === "string" ? c : null }, cellule) : cellule);
      }));
      return tr;
    }));
    return h("div", { class: "rtable-wrap" }, h("table", { class: "rtable" }, h("thead", {}, entete), corps));
  }

  function cartes(tranche) {
    const secondaires = colonnes.filter((c) => c.priority === "secondary" && !c.horsCarte);
    const optionnelles = colonnes.filter((c) => c.priority === "optional" && !c.horsCarte);
    return h("div", { class: "rcards" }, tranche.map((ligne) => {
      const href = lien(ligne);
      const champs = (cols) => h("dl", { class: "rcard-fields" }, cols.map((col) =>
        h("div", { class: "rcard-field" }, h("dt", {}, col.label), h("dd", {}, contenu(col, ligne)))));
      const plus = optionnelles.length ? h("details", { class: "rcard-more", onclick: (e) => e.stopPropagation() },
        h("summary", {}, "Voir plus"), champs(optionnelles)) : null;
      return h("article", { class: "rcard" },
        h("div", { class: "rcard-top" },
          h("div", { class: "rcard-title" }, h("a", { href }, titre(ligne))),
          ...badges(ligne)),
        sousTitre ? h("div", { class: "rcard-sub" }, sousTitre(ligne)) : null,
        secondaires.length ? champs(secondaires) : null,
        plus,
        // Toute la carte ouvre la fiche (lien étendu en CSS) : une seule
        // cible, grande, et un seul arrêt de tabulation par carte.
        h("div", { class: "rcard-open", "aria-hidden": "true" }, h("span", {}, "Voir la fiche", icon("chevron-right", "icon icon-sm"))));
    }));
  }

  function listeCompacte(tranche) {
    return h("ul", { class: "rcompact" }, tranche.map((ligne) => {
      const choisie = selection !== null && cle(ligne) === selection;
      return h("li", {}, h("a", { class: "rcompact-item", href: lien(ligne), "aria-current": choisie ? "true" : null },
        h("div", { class: "rcompact-main" },
          h("div", { class: "rcompact-title" }, titre(ligne)),
          sousTitre ? h("div", { class: "rcompact-sub" }, sousTitre(ligne)) : null),
        h("div", { class: "rcompact-badges" }, ...badges(ligne))));
    }));
  }

  function trier(key) {
    tri = tri && tri.key === key ? { key, sens: -tri.sens } : { key, sens: 1 };
    if (surTri) surTri(tri);
    appliquerTri();
    rendre();
  }

  function appliquerTri() {
    if (!tri) return;
    const col = colonnes.find((c) => c.key === tri.key);
    if (!col) return;
    const cmp = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
    lignes = [...lignes].sort((a, b) => {
      const va = valeur(col, a), vb = valeur(col, b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === "") return 1;
      if (vb === null || vb === undefined || vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * tri.sens;
      return cmp.compare(String(va), String(vb)) * tri.sens;
    });
  }

  const arreter = surGabarit(() => rendre());
  // Largeur de la liste modifiée (panneau ouvert, fenêtre redimensionnée) :
  // nouveau rendu seulement si l'ensemble des colonnes change.
  const redim = "ResizeObserver" in window ? new ResizeObserver(() => {
    if (!lignes.length || gabarit() === "mobile" || !el.isConnected) return;
    if (Math.abs(el.clientWidth - largeurMesuree) < 2) return;     // hauteur seulement
    largeurMesuree = el.clientWidth;
    plafond = Infinity;
    compacte = false;
    if (colonnesVisibles(gabarit()).map((c) => c.key).join("|") !== signature) rendre();
  }) : null;
  redim?.observe(el);

  return {
    el,
    maj(nouvelles, { selection: sel = null, garderPosition = false } = {}) {
      lignes = nouvelles;
      selection = sel;
      plafond = Infinity;
      compacte = false;
      largeurMesuree = el.clientWidth;
      if (!garderPosition) visibles = TRANCHE;
      appliquerTri();
      // La ligne sélectionnée doit être rendue, même loin dans la liste.
      if (sel !== null) {
        const rang = lignes.findIndex((l) => cle(l) === sel);
        if (rang >= visibles) visibles = rang + 1;
      }
      rendre();
    },
    detruire() { arreter(); redim?.disconnect(); if (observateur) observateur.disconnect(); },
  };
}
