/* Reconnaître l'équipement dans un ticket — exactement comme H-Pilot Desktop.
 *
 * Ce fichier est une **transcription fidèle** de `src/core/eq_matcher.py`
 * (`match_equipement`), de `site_alias.detecter`, de `demandeur_site.site_de`
 * et du découpage de `ticket_parser`. Même vocabulaire, mêmes poids, même
 * ordre de parcours — l'ordre départage les égalités —, et jusqu'aux mêmes
 * particularités : un modèle est cherché comme fragment du texte, pas comme
 * mot entier, parce que le Desktop le fait ainsi. Le but n'est pas un moteur
 * « aussi bon » : c'est le **même** classement pour le même texte.
 *
 * Les tables ne sont pas recopiées ici : elles arrivent dans le jeu
 * « matching », publié par le Desktop. Les couches apprises de vos
 * confirmations — abréviations de sites, site habituel de chaque demandeur,
 * mots retenus par appareil — y sont en **empreintes** (SHA-256 salé) :
 * elles portent des noms de personnes. On calcule donc l'empreinte de
 * chaque mot du ticket et on compare ; aucun nom n'est lisible nulle part.
 *
 * Toute modification de `eq_matcher.py` doit être reportée ici. Les tests
 * `tests/test_web_matching_parite.py` le rappellent, et la mesure de parité
 * sur les tickets réels le vérifie.
 */

// ── Normalisations : trois, comme au Desktop ──────────────────────────────

/** Ce que Python appelle un espace (`\s`, `str.strip()`, `str.split()`).
 * Celui de JavaScript en diffère : il compte aussi U+FEFF, un caractère
 * invisible que Windows glisse en tête de certains textes, et ignore
 * quelques séparateurs anciens. Mesuré sur les tickets réels, un seul texte
 * changeait — assez pour ne pas laisser coexister deux définitions. */
const ESPACE = "[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const BORDS = new RegExp(`^${ESPACE}+|${ESPACE}+$`, "g");
const BORDS_LIGNES = new RegExp(`^${ESPACE}+|${ESPACE}+$`, "gm");
const ESPACES = new RegExp(`${ESPACE}+`);

/** `str.strip()` de Python. */
function nettoyerBords(texte) {
  return String(texte).replace(BORDS, "");
}

/** `eq_matcher._norm` : minuscules, quelques accents, tiret et souligné en
 * espace — rien d'autre. La ponctuation reste : c'est ce que le Desktop
 * compare, virgules comprises. */
const ACCENTS = {
  "é": "e", "è": "e", "ê": "e", "ë": "e", "à": "a", "â": "a", "ä": "a",
  "î": "i", "ï": "i", "ô": "o", "ö": "o", "ù": "u", "û": "u", "ü": "u",
  "ç": "c", "-": " ", "_": " ",
};
export function normPC(texte) {
  if (!texte) return "";
  return nettoyerBords(String(texte).toLowerCase()
    .replace(/[éèêëàâäîïôöùûüç_-]/g, (c) => ACCENTS[c]));
}

/** `site_alias.normaliser` : accents retirés, toute autre chose qu'une
 * lettre ou un chiffre devient un espace. */
export function normSite(texte) {
  return String(texte ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Mn}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** `demandeur_site.normaliser` : les mots triés — « PELAP Happi » et
 * « Happi Pelap » sont la même personne. */
export function normDemandeur(nom) {
  return normSite(nom).split(" ").filter(Boolean).sort().join(" ");
}

// ── Empreintes ───────────────────────────────────────────────────────────

const _empreintes = new Map();

/** Même calcul que `jeux.empreinte` : SHA-256(sel|texte), 16 caractères. */
export async function empreinte(sel, texte) {
  const cle = `${sel}|${texte}`;
  if (_empreintes.has(cle)) return _empreintes.get(cle);
  const octets = new TextEncoder().encode(cle);
  const somme = new Uint8Array(await crypto.subtle.digest("SHA-256", octets));
  const hex = Array.from(somme, (o) => o.toString(16).padStart(2, "0")).join("")
    .slice(0, 16);
  _empreintes.set(cle, hex);
  return hex;
}

// ── Lire un ticket Freshservice collé (ticket_parser) ────────────────────

const S = ESPACE;
const DESCRIPTION = new RegExp(`Description${S}*:${S}*\\n([\\s\\S]*?)(?=\\n${S}*(?:Ticket${S}+attachments|Lien${S}+vers${S}+le${S}+ticket|Bonne${S}+journ[ée]e|L'?[ée]quipe${S}+informatique|$))`, "i");
const DEMANDEUR = new RegExp(`^${S}*Demandeur${S}*:${S}*(.+?)${S}*$`, "im");
const OBJET = new RegExp(`^${S}*Objet${S}*:${S}*(.+?)${S}*$`, "im");
const PREFIXE_FRESH = new RegExp(`^${S}*\\[FRESH\\]${S}*BIOMED${S}*-${S}*(.*)$`, "im");

/**
 * Ce que le Desktop donnerait au moteur pour ce texte.
 *
 * Une notification Freshservice collée telle quelle est découpée comme au
 * poste — objet, demandeur, description — pour que le pied de mail et les
 * mots de Freshservice ne pèsent pas. Un texte libre (le mail d'un manip,
 * une phrase tapée) est pris tel quel.
 */
export function lireTicket(texte) {
  const brut = String(texte || "");
  const demandeur = nettoyerBords(DEMANDEUR.exec(brut)?.[1] || "");
  const description = DESCRIPTION.exec(brut);
  if (!description) return { texte: brut, demandeur };
  const objet = nettoyerBords(PREFIXE_FRESH.exec(brut)?.[1] || OBJET.exec(brut)?.[1] || "");
  const desc = nettoyerBords(nettoyerBords(description[1]).replace(BORDS_LIGNES, ""));
  return { texte: [objet, demandeur, desc].filter(Boolean).join(" "), demandeur };
}

// ── Les détecteurs, un par un ────────────────────────────────────────────

const MOT = "[\\p{L}\\p{N}_]";           // le \w de Python, lettres accentuées comprises
const EQ_ID = new RegExp(`(?<!${MOT})(EQ[-_ ]?\\d{3,5})(?!${MOT})`, "iu");
const SALLES = [
  new RegExp(`(?<!${MOT})salle${ESPACE}*n?°?${ESPACE}*(${MOT}+)`, "iu"),
  new RegExp(`(?<!${MOT})(?:irm|scanner|scan)${ESPACE}*(\\p{Nd}+)(?!${MOT})`, "iu"),
  new RegExp(`(?<!${MOT})salle${ESPACE}+([a-z])(?!${MOT})`, "iu"),
];
/** Les motifs du Desktop dont `SALLES` est la transcription. S'ils changent
 * là-bas, le test de parité le signale : il faut reprendre ceux d'ici. */
export const SALLE_MOTIFS_TRANSCRITS = [
  "\\bsalle\\s*n?°?\\s*(\\w+)\\b",
  "\\b(?:irm|scanner|scan)\\s*(\\d+)\\b",
  "\\bsalle\\s+([a-z])\\b",
];

function extraireEqId(texte) {
  const trouve = EQ_ID.exec(texte);
  if (!trouve) return null;
  return `EQ-${trouve[1].match(/\d+/)[0].padStart(4, "0")}`;
}

function detecterSiteCle(texteNorm, siteAlias) {
  for (const { cle, alias } of siteAlias) {
    for (const a of alias) if (texteNorm.includes(normPC(a))) return cle;
  }
  return null;
}

function siteCorrespond(siteEq, cle, siteAlias) {
  if (!siteEq || !cle) return false;
  const eqNorm = normPC(siteEq);
  const entree = siteAlias.find((s) => s.cle === cle);
  for (const a of entree ? entree.alias : []) {
    if (eqNorm.includes(normPC(a)) || eqNorm.includes(normPC(cle))) return true;
  }
  return false;
}

function echapper(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detecterCategorie(texteNorm, tables) {
  const candidats = [];
  const ecrits = new Set();
  const connues = new Set();
  for (const { nom, mots } of tables.categories) {
    connues.add(nom);
    for (const mot of mots) {
      candidats.push([mot, nom]);
      ecrits.add(normPC(mot));
    }
  }
  for (const { mot, categorie } of tables.vocabulaire_modeles || []) {
    if (!ecrits.has(mot) && connues.has(categorie)) candidats.push([mot, categorie]);
  }
  let meilleur = null;
  for (const [mot, categorie] of candidats) {
    const k = normPC(mot);
    if (!k) continue;
    const fin = k.length >= tables.prefixe_minimal ? "" : "(?![a-z0-9])";
    if (new RegExp(`(?<![a-z0-9])${echapper(k)}${fin}`).test(texteNorm)
        && (!meilleur || k.length > meilleur[0])) {
      meilleur = [k.length, categorie];
    }
  }
  return meilleur ? meilleur[1] : null;
}

function detecterSalle(texte) {
  for (const motif of SALLES) {
    const trouve = motif.exec(texte);
    if (trouve) return trouve[1].toUpperCase();
  }
  return null;
}

/** `site_alias.detecter` : l'expression la plus longue d'abord ; à
 * longueur égale, l'ordre de la table. Les entrées apprises sont comparées
 * par empreinte — ce sont toujours des mots isolés. */
async function detecterSite(texte, tables, inclureAppris) {
  const aiguille = ` ${normSite(texte)} `;
  const mots = new Set(normSite(texte).split(" ").filter(Boolean));
  let empreintesMots = null;
  const entrees = (tables.vocabulaire_sites || [])
    .map((e, rang) => ({ ...e, longueur: e.terme ? e.terme.length : e.n, rang }))
    .filter((e) => inclureAppris || e.terme)
    .sort((a, b) => b.longueur - a.longueur || a.rang - b.rang);
  for (const e of entrees) {
    if (e.terme) {
      if (aiguille.includes(` ${e.terme} `)) return e.site;
    } else {
      if (!empreintesMots) {
        empreintesMots = new Set(await Promise.all(
          [...mots].map((m) => empreinte(tables.sel, m))));
      }
      if (empreintesMots.has(e.h)) return e.site;
    }
  }
  return null;
}

async function siteDuDemandeur(demandeur, tables) {
  const cle = normDemandeur(demandeur);
  if (!cle) return null;
  const h = await empreinte(tables.sel, cle);
  return (tables.demandeurs || []).find((d) => d.h === h)?.site || null;
}

function jetonsDuTexte(texte, siteCle, categorie, salle, motsVides) {
  const jetons = new Set();
  if (siteCle) jetons.add(`site:${siteCle}`);
  if (categorie) jetons.add(`cat:${normPC(categorie)}`);
  if (salle) jetons.add(`salle:${salle.toLowerCase()}`);
  for (const w of normPC(texte).match(/[a-z]{4,}/g) || []) {
    if (!motsVides.has(w)) jetons.add(`w:${w}`);
  }
  return [...jetons];
}

let _apprisCache = null;
function jetonsAppris(tables) {
  if (_apprisCache?.tables === tables) return _apprisCache.parEq;
  const parEq = new Map();
  for (const { eq, total, jetons } of tables.jetons_appris || []) {
    const t = new Map();
    for (const paire of (jetons || "").split(" ").filter(Boolean)) {
      const [h, n] = paire.split(":");
      t.set(h, Number(n));
    }
    parEq.set(eq, { total, jetons: t });
  }
  _apprisCache = { tables, parEq };
  return parEq;
}

function bonusAppris(eqId, empreintesJetons, parEq, tables) {
  const appris = parEq.get(eqId);
  if (!appris || !empreintesJetons.length) return [0, ""];
  const plafond = tables.plafond_jeton || 5;
  let trouves = 0;
  let hits = 0;
  for (const h of empreintesJetons) {
    const n = appris.jetons.get(h) || 0;
    if (n > 0) { hits += Math.min(n, plafond); trouves += 1; }
  }
  if (!trouves) return [0, ""];
  const ratio = Math.min(hits / (plafond * Math.max(empreintesJetons.length, 1)), 1.0);
  const total = appris.total;
  return [tables.poids.appris * ratio,
    `apprentissage (${trouves} signal${trouves > 1 ? "s" : ""}, `
    + `${total} confirmation${total > 1 ? "s" : ""})`];
}

function pannesRecentes(tables, aujourdhui = new Date()) {
  const limite = new Date(aujourdhui);
  limite.setDate(limite.getDate() - (tables.historique_jours || 180));
  const iso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
  return new Set((tables.pannes_recentes || []).filter((p) => p.date >= iso).map((p) => p.eq));
}

// ── Le moteur ────────────────────────────────────────────────────────────

/**
 * `match_equipement`, transcrit. Rend aussi ce qui a été reconnu — site,
 * catégorie, salle — pour que l'écran puisse le dire.
 *
 * @param {string} texte          le texte à lire (voir `lireTicket`)
 * @param {object} tables         le jeu « matching »
 * @param {Array}  equipements    le jeu « equipment »
 * @param {object} options        { demandeur, combien, aujourdhui }
 */
export async function analyser(texte, tables, equipements, options = {}) {
  const { demandeur = "", combien = 5, aujourdhui } = options;
  const vide = { site: null, categorie: null, salle: null, candidats: [] };
  if (!texte || !tables?.categories) return vide;
  // `get_equipements(actif=True)` : les actifs, dans l'ordre des identifiants.
  const tous = (equipements || []).filter((e) => e.actif !== false && e.actif !== 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!tous.length) return vide;
  const texteNorm = normPC(texte);

  // 1. L'identifiant explicite.
  const eqId = extraireEqId(texte);
  if (eqId) {
    const eq = tous.find((e) => e.id === eqId);
    if (eq) {
      return { ...vide, candidats: [{ eq, score: 1.0, certain: true,
        raisons: [`Identifiant explicite ${eqId}`] }] };
    }
  }

  // 2. Le numéro de série exact.
  const majuscules = texte.toUpperCase();
  for (const eq of tous) {
    const serie = eq.numero_serie;
    if (serie && serie.length >= tables.serie_longueur_min
        && majuscules.includes(serie.toUpperCase())) {
      return { ...vide, candidats: [{ eq, score: 1.0, certain: true,
        raisons: [`N° de série exact (${serie})`] }] };
    }
  }

  // 3. Le site, d'où qu'il vienne. Pas d'expéditeur ici : sur un ticket
  //    Freshservice, c'est toujours l'adresse de Freshservice, qui ne
  //    désigne aucun site — le Desktop n'en tire rien non plus.
  let siteSur = await detecterSite(texte, tables, false);
  let siteAppris = null;
  let origine = siteSur ? "site nommé dans le ticket" : "";
  if (!siteSur) {
    siteAppris = await detecterSite(texte, tables, true);
    if (siteAppris) origine = "abréviation apprise de vos confirmations";
  }
  if (!siteSur && !siteAppris && demandeur) {
    const duDemandeur = await siteDuDemandeur(demandeur, tables);
    if (duDemandeur) {
      if (tables.restreindre_demandeur) siteSur = duDemandeur;
      else siteAppris = duDemandeur;
      origine = `site habituel de ${demandeur}`;
    }
  }

  let vivier = tous;
  let siteFiltre = false;
  if (siteSur) {
    const cible = normPC(siteSur);
    const retenus = tous.filter((e) => siteCorrespond(e.site, siteSur, tables.site_alias)
      || normPC(e.site).includes(cible) || normPC(e.site) === cible);
    if (retenus.length) { vivier = retenus; siteFiltre = true; }
  }

  const siteCle = detecterSiteCle(texteNorm, tables.site_alias);
  const categorie = detecterCategorie(texteNorm, tables);
  const salle = detecterSalle(texte);
  const recents = pannesRecentes(tables, aujourdhui);

  if (tables.restreindre_categorie && categorie) {
    const c = normPC(categorie);
    const filtres = vivier.filter((e) => c.includes(normPC(e.categorie || ""))
      || normPC(e.categorie || "").includes(c));
    if (filtres.length) vivier = filtres;
  }

  const motsVides = new Set(tables.mots_vides || []);
  const jetons = jetonsDuTexte(texte, siteCle, categorie, salle, motsVides);
  const empreintesJetons = await Promise.all(jetons.map((j) => empreinte(tables.sel, j)));
  const parEq = jetonsAppris(tables);
  const p = tables.poids;

  const candidats = [];
  for (const eq of vivier) {
    let score = 0;
    const raisons = [];
    const marque = normPC(eq.marque || "");
    const modele = normPC(eq.modele || "");
    const catEq = normPC(eq.categorie || "");
    const salleEq = normPC(eq.salle || "");

    if (siteFiltre) {
      score += p.site;
      raisons.push(origine ? `site ${eq.site} (${origine})` : `site ${eq.site}`);
    } else if (siteCle && siteCorrespond(eq.site, siteCle, tables.site_alias)) {
      score += p.site;
      raisons.push(`site ${siteCle} détecté dans le texte`);
    } else if (siteAppris && siteCorrespond(eq.site, siteAppris, tables.site_alias)) {
      score += p.site * 0.5;
      raisons.push(`site ${siteAppris} (${origine})`);
    }

    if (categorie) {
      if (catEq.includes(normPC(categorie)) || normPC(categorie).includes(normPC(eq.categorie || ""))) {
        score += p.categorie;
        raisons.push(`catégorie ${eq.categorie}`);
      }
    }

    if (marque && marque.length >= 3 && texteNorm.includes(marque)) {
      score += p.marque;
      raisons.push(`marque ${eq.marque}`);
    }

    if (modele) {
      const motsModele = modele.split(ESPACES).filter((w) => w.length >= 3);
      const trouves = motsModele.filter((w) => texteNorm.includes(w));
      if (trouves.length) {
        score += p.modele * (trouves.length / Math.max(motsModele.length, 1));
        raisons.push(trouves.length === motsModele.length && motsModele.length
          ? `modèle ${eq.modele} (complet)`
          : `modèle partiel (${trouves.join(", ")})`);
      }
    }

    if (salle && salleEq && salleEq.includes(salle.toLowerCase())) {
      score += p.salle;
      raisons.push(`salle ${salle}`);
    }

    if (recents.has(eq.id)) {
      score += p.historique;
      raisons.push("panne récente sur cet équipement");
    }

    const [bonus, raison] = bonusAppris(eq.id, empreintesJetons, parEq, tables);
    if (bonus > 0) { score += bonus; raisons.push(raison); }

    if (score > 0) {
      candidats.push({ eq, score: Math.min(score / p.maximum, 0.95), certain: false,
        raisons, siteFiltre });
    }
  }

  candidats.sort((a, b) => b.score - a.score);
  return { site: siteFiltre ? siteSur : null, categorie, salle,
           candidats: candidats.slice(0, combien) };
}

/** `has_clear_winner` : le premier dépasse le seuil et se détache. */
export function gagnantNet(candidats, tables) {
  if (!candidats?.length) return false;
  const seuils = tables?.seuils || {};
  if (candidats[0].score < (seuils.certain ?? 0.65)) return false;
  if (candidats.length < 2) return true;
  return candidats[0].score - candidats[1].score >= (seuils.ecart ?? 0.15);
}

/** Raccourci : les candidats seuls. */
export async function reconnaitre(texte, tables, equipements, options = {}) {
  return (await analyser(texte, tables, equipements, options)).candidats;
}
