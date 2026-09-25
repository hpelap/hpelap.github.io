/* Construction du DOM et formatage.
 *
 * Aucune donnée n'est jamais insérée par `innerHTML` : tout texte passe par
 * des nœuds texte. Une valeur publiée ne peut donc pas devenir du code.
 */

export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attrs || {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === "class") el.className = valeur;
    else if (cle === "dataset") Object.assign(el.dataset, valeur);
    else if (cle.startsWith("on") && typeof valeur === "function") {
      el.addEventListener(cle.slice(2).toLowerCase(), valeur);
    } else if (cle === "text") el.textContent = valeur;
    else if (valeur === true) el.setAttribute(cle, "");
    else el.setAttribute(cle, String(valeur));
  }
  ajouter(el, enfants);
  return el;
}

function ajouter(el, enfants) {
  for (const enfant of enfants) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    if (Array.isArray(enfant)) ajouter(el, enfant);
    else if (enfant instanceof Node) el.appendChild(enfant);
    else el.appendChild(document.createTextNode(String(enfant)));
  }
}

export function vider(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Vide `el` puis y place les enfants, comme h() : null, undefined et false
 * sont ignorés (Element.append les écrirait en toutes lettres). */
export function remplacer(el, ...enfants) {
  ajouter(vider(el), enfants);
  return el;
}

export function debounce(fn, ms = 200) {
  let minuteur;
  return (...args) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fn(...args), ms);
  };
}

// ── Points de rupture (mêmes valeurs que css/tokens.css) ───────────────

const MQ_MOBILE = window.matchMedia("(max-width: 600px)");
const MQ_TABLETTE = window.matchMedia("(max-width: 1100px)");
const MQ_PANNEAU = window.matchMedia("(min-width: 900px)");

export function gabarit() {
  if (MQ_MOBILE.matches) return "mobile";
  if (MQ_TABLETTE.matches) return "tablette";
  return "bureau";
}

export function panneauPossible() { return MQ_PANNEAU.matches; }

/** Rappel à chaque changement de gabarit — rotation comprise (§63). */
export function surGabarit(fn) {
  const rappel = () => fn(gabarit());
  for (const mq of [MQ_MOBILE, MQ_TABLETTE, MQ_PANNEAU]) mq.addEventListener("change", rappel);
  return () => { for (const mq of [MQ_MOBILE, MQ_TABLETTE, MQ_PANNEAU]) mq.removeEventListener("change", rappel); };
}

// ── Formats français ────────────────────────────────────────────────────

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function versDate(iso) {
  if (!iso) return null;
  const texte = String(iso);
  const d = texte.length === 10 ? new Date(`${texte}T00:00:00`) : new Date(texte);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmt = {
  date(iso) {
    const d = versDate(iso);
    return d ? d.toLocaleDateString("fr-FR") : "—";
  },
  dateJour(iso) {
    const d = versDate(iso);
    return d ? `${JOURS[d.getDay()]} ${d.toLocaleDateString("fr-FR")}` : "—";
  },
  dateHeure(iso) {
    const d = versDate(iso);
    if (!d) return "—";
    return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  },
  mois(annee, mois) {
    return new Date(annee, mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  },
  nombre(n) { return n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR"); },
  euros(n) {
    return n === null || n === undefined || n === "" ? "—"
      : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  },
  texte(v) { return v === null || v === undefined || v === "" ? "—" : String(v); },
  oui(v) { return v ? "Oui" : "Non"; },
  duree(minutes) {
    if (!minutes && minutes !== 0) return "—";
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
  },
};

export function aujourdhuiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Recherche insensible aux accents et à la casse. */
export function normaliser(texte) {
  return String(texte ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function badge(texte, ton = "") {
  return h("span", { class: `badge ${ton}`.trim() }, texte);
}
