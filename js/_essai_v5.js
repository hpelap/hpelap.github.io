/* Reconnaître l'équipement dans un ticket, comme le fait H-Pilot Desktop.
 *
 * Le raisonnement est celui de `src/core/eq_matcher.py`, et les tables qu'il
 * utilise — alias de sites, vocabulaire des catégories, poids, seuils — ne
 * sont pas recopiées ici : elles arrivent dans le jeu « matching », publié
 * par le Desktop. Une correction faite là-bas profite donc au téléphone sans
 * qu'on retouche ce fichier.
 *
 * Signaux, par confiance décroissante :
 *   1. EQ-NNNN écrit dans le texte        → certitude
 *   2. numéro de série exact              → certitude
 *   3. site nommé (alias compris)         → restreint le vivier
 *   4. catégorie, marque, modèle, salle   → pondération
 *   5. panne récente sur l'appareil       → petit bonus
 *
 * Ce que la version téléphone ne fait pas : les jetons appris de vos
 * confirmations passées, et le site déduit du demandeur. Ils restent sur le
 * poste — ils viennent de textes de tickets, qui portent des noms de
 * personnes.
 */
import { normaliser as sansAccents } from "./ui/dom.js";

const EQ_ID = /\b(EQ[-_ ]?\d{3,5})\b/i;

/** La normalisation du moteur Desktop : minuscules, accents retirés, et
 * **tiret, apostrophe ou ponctuation valent un espace**. Sans cette
 * dernière règle, « CLICHY- » ne contient pas le mot « clichy » et le site
 * passe à la trappe — c'est exactement ce qui faisait diverger les deux
 * moteurs sur un ticket sur trois. */
function normaliser(texte) {
  return sansAccents(texte).replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliserId(brut) {
  return String(brut || "").toUpperCase().replace(/[_ ]/g, "-");
}

function mots(texte) {
  return normaliser(texte).split(" ").filter(Boolean);
}

/** Un mot court doit être un mot entier ; un mot long peut être un préfixe. */
function contientMot(texteNormalise, motsDuTexte, terme, prefixeMinimal) {
  const cible = normaliser(terme).trim();
  if (!cible) return false;
  if (cible.includes(" ")) return texteNormalise.includes(cible);
  if (cible.length >= prefixeMinimal) {
    return motsDuTexte.some((m) => m.startsWith(cible));
  }
  return motsDuTexte.includes(cible);
}

/** Le site nommé dans le texte.
 *
 * Deux règles, dans cet ordre :
 *  - **le site cité le plus tôt gagne.** Un ticket qui parle de Clichy dans
 *    son objet et cite Aulnay dans un pied de mail parle de Clichy ;
 *  - à position égale, l'expression la plus longue l'emporte : « claye
 *    souilly » doit battre « claye ».
 */
function detecterSite(texteNormalise, vocabulaire) {
  const aiguille = ` ${texteNormalise} `;
  let meilleur = null;
  for (const { terme, site } of vocabulaire || []) {
    const cible = ` ${normaliser(terme)} `;
    const ou = aiguille.indexOf(cible);
    if (ou < 0) continue;
    if (!meilleur || ou < meilleur.ou
        || (ou === meilleur.ou && terme.length > meilleur.longueur)) {
      meilleur = { site, ou, longueur: terme.length };
    }
  }
  return meilleur ? meilleur.site : null;
}

/** La catégorie désignée par le texte : le mot-clé **le plus long** gagne.
 * « injecteur scan » parle de l'injecteur, pas du scanner. */
function detecterCategorie(texteNormalise, categories, vocabulaireModeles,
                           prefixeMinimal) {
  const candidats = [];
  const ecrits = new Set();
  for (const { nom, mots: vocabulaire } of categories || []) {
    for (const terme of vocabulaire) {
      const cle = normaliser(terme);
      ecrits.add(cle);
      candidats.push([cle, nom]);
    }
  }
  const connues = new Set((categories || []).map((c) => c.nom));
  for (const { mot, categorie } of vocabulaireModeles || []) {
    const cle = normaliser(mot);
    // Les mots du parc s'ajoutent, ils ne remplacent jamais un mot-clé écrit.
    if (!ecrits.has(cle) && connues.has(categorie)) candidats.push([cle, categorie]);
  }
  let meilleur = null;
  for (const [cle, categorie] of candidats) {
    if (!cle) continue;
    // Un mot-clé court doit être un mot entier ; un long peut n'être qu'un
    // début — « mammograph » attrape aussi « mammographie ».
    const fin = cle.length >= prefixeMinimal ? "" : "(?![a-z0-9])";
    let motif;
    try {
      motif = new RegExp(`(?<![a-z0-9])${echapper(cle)}${fin}`);
    } catch {
      motif = new RegExp(`\\b${echapper(cle)}${fin}`);   // sans lookbehind
    }
    if (motif.test(texteNormalise) && (!meilleur || cle.length > meilleur[0])) {
      meilleur = [cle.length, categorie];
    }
  }
  return meilleur ? meilleur[1] : null;
}

function echapper(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detecterSalle(texte, motifs) {
  for (const motif of motifs) {
    try {
      const trouve = new RegExp(motif, "i").exec(texte);
      if (trouve && trouve[1]) return trouve[1];
    } catch { /* motif que ce navigateur ne sait pas lire : on passe */ }
  }
  return null;
}

/**
 * @param {string} texte        le ticket, collé tel quel
 * @param {object} tables       le jeu « matching » publié
 * @param {Array}  equipements  le jeu « equipment » (actifs seulement)
 * @param {Set}    recents      ids ayant eu une panne récente
 * @returns {Array} candidats {eq, score, raisons, certain}
 */
export function reconnaitre(texte, tables, equipements, recents = new Set(), combien = 5) {
  return analyser(texte, tables, equipements, recents, combien).candidats;
}

/**
 * Comme `reconnaitre`, mais rend aussi **ce qui a été reconnu** : le site,
 * la catégorie, la salle. L'écran de déclaration l'affiche — une proposition
 * qu'on ne comprend pas ne se confirme pas les yeux fermés.
 */
export function analyser(texte, tables, equipements, recents = new Set(), combien = 5) {
  const vide = { site: null, categorie: null, salle: null, candidats: [] };
  if (!texte || !tables || !equipements?.length) return vide;
  const actifs = equipements.filter((e) => e.actif !== false);
  const texteNormalise = normaliser(texte);
  const motsDuTexte = mots(texte);

  // 1. L'identifiant, s'il est écrit.
  const trouve = EQ_ID.exec(texte);
  if (trouve) {
    const id = normaliserId(trouve[1]);
    const eq = actifs.find((e) => e.id === id);
    if (eq) {
      return { ...vide, candidats: [{ eq, score: 1, certain: true,
        raisons: [`Identifiant explicite ${id}`] }] };
    }
  }

  // 2. Le numéro de série.
  const enMajuscules = texte.toUpperCase();
  for (const eq of actifs) {
    const serie = String(eq.numero_serie || "").trim();
    if (serie.length >= (tables.serie_longueur_min || 5)
        && enMajuscules.includes(serie.toUpperCase())) {
      return { ...vide, candidats: [{ eq, score: 1, certain: true,
        raisons: [`N° de série exact (${serie})`] }] };
    }
  }

  // 3. Le site : il restreint le vivier, il ne pondère pas seulement.
  const site = detecterSite(texteNormalise, tables.vocabulaire_sites);
  let vivier = actifs;
  let siteFiltre = false;
  if (site) {
    const cible = normaliser(site);
    const retenus = actifs.filter((e) => normaliser(e.site) === cible);
    if (retenus.length) { vivier = retenus; siteFiltre = true; }
  }

  const prefixe = tables.prefixe_minimal || 7;
  const categorie = detecterCategorie(texteNormalise, tables.categories,
    tables.vocabulaire_modeles, prefixe);
  const salle = detecterSalle(texte, tables.salle_motifs || []);
  const trompeurs = new Set((tables.modeles_trompeurs || []).map(normaliser));
  const poids = tables.poids || {};
  const maximum = poids.maximum || 145;

  const candidats = [];
  for (const eq of vivier) {
    let score = 0;
    const raisons = [];

    if (siteFiltre) {
      score += poids.site || 0;
      raisons.push(`site ${eq.site} nommé dans le ticket`);
    }
    if (categorie) {
      const categorieEq = normaliser(eq.categorie || "");
      const cible = normaliser(categorie);
      if (categorieEq && (categorieEq.includes(cible) || cible.includes(categorieEq))) {
        score += poids.categorie || 0;
        raisons.push(`catégorie ${eq.categorie}`);
      }
    }
    const marque = normaliser(eq.marque || "");
    if (marque.length >= 3 && texteNormalise.includes(marque)) {
      score += poids.marque || 0;
      raisons.push(`marque ${eq.marque}`);
    }
    const motsModele = normaliser(eq.modele || "").split(/\s+/)
      .filter((m) => m.length >= 3 && !trompeurs.has(m));
    if (motsModele.length) {
      const reconnus = motsModele.filter((m) => motsDuTexte.includes(m));
      if (reconnus.length) {
        score += (poids.modele || 0) * (reconnus.length / motsModele.length);
        raisons.push(reconnus.length === motsModele.length
          ? `modèle ${eq.modele} (complet)`
          : `modèle partiel (${reconnus.join(", ")})`);
      }
    }
    if (salle && eq.salle && normaliser(eq.salle).includes(normaliser(salle))) {
      score += poids.salle || 0;
      raisons.push(`salle ${salle}`);
    }
    if (recents.has(eq.id)) {
      score += poids.historique || 0;
      raisons.push("panne récente sur cet équipement");
    }
    if (score > 0) {
      candidats.push({ eq, score: Math.min(score / maximum, 0.95), certain: false, raisons });
    }
  }

  candidats.sort((a, b) => b.score - a.score);
  return { site: siteFiltre ? site : null, categorie, salle,
           candidats: candidats.slice(0, combien) };
}

/** Vrai si le premier candidat se détache assez pour être proposé seul. */
export function gagnantNet(candidats, tables) {
  if (!candidats.length) return false;
  if (candidats[0].certain) return true;
  const seuils = tables?.seuils || {};
  const ecart = candidats.length > 1 ? candidats[0].score - candidats[1].score : 1;
  return candidats[0].score >= (seuils.certain ?? 0.65)
    && ecart >= (seuils.ecart ?? 0.15);
}

/** Les équipements ayant connu une panne récente, d'après le jeu incidents. */
export function pannesRecentes(incidents, jours = 180) {
  const limite = new Date();
  limite.setDate(limite.getDate() - jours);
  const ids = new Set();
  for (const p of incidents || []) {
    const jour = p.date_declaration ? new Date(`${p.date_declaration}T00:00:00`) : null;
    if (jour && jour >= limite) ids.add(p.eq_id);
  }
  return ids;
}
