/* Déchiffrement des fichiers publiés (§ publication chiffrée).
 *
 * Publiés hors de l'établissement, les fichiers sont chiffrés par H-Pilot
 * Desktop. L'hébergeur ne stocke que des octets illisibles ; le contenu
 * n'existe en clair que dans cet onglet, le temps de l'affichage.
 *
 * Format — identique à `src/core/web_snapshot/chiffrement.py` :
 *     "HPW1"   4 octets    repère de format
 *     iv       12 octets   propre à chaque fichier
 *     chiffré  le reste    AES-256-GCM, tag d'authenticité inclus
 *
 * La phrase de passe ne quitte jamais l'appareil : elle sert à dériver une
 * clé (PBKDF2-HMAC-SHA256) avec le sel publié en clair. Ce qui est gardé
 * sur l'appareil, c'est la clé dérivée — pas la phrase, qui pourrait servir
 * ailleurs.
 */

const MAGIC = [0x48, 0x50, 0x57, 0x31];      // "HPW1"
const TAILLE_IV = 12;
const CLE_MEMORISEE = "hpilot.coffre";

export class PhraseIncorrecte extends Error {}

function base64Vers(octets) {
  const binaire = atob(octets);
  const sortie = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) sortie[i] = binaire.charCodeAt(i);
  return sortie;
}

function versBase64(octets) {
  let binaire = "";
  for (const o of new Uint8Array(octets)) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

export class Coffre {
  constructor(cle) { this.cle = cle; }

  /** Dérive la clé depuis la phrase de passe et les paramètres publiés. */
  static async depuisPhrase(phrase, parametres) {
    if (!phrase) throw new PhraseIncorrecte("Phrase de passe vide.");
    const sel = base64Vers(parametres.sel);
    const iterations = Number(parametres.iterations) || 0;
    if (!sel.length || !iterations) {
      throw new Error("Paramètres de chiffrement illisibles.");
    }
    const matiere = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: sel, iterations, hash: "SHA-256" },
      matiere, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    return new Coffre(cle);
  }

  /** La clé gardée sur cet appareil, s'il y en a une. */
  static async memorisee() {
    let brut = null;
    try { brut = localStorage.getItem(CLE_MEMORISEE); } catch { /* indisponible */ }
    if (!brut) return null;
    try {
      const cle = await crypto.subtle.importKey(
        "raw", base64Vers(brut), { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      return new Coffre(cle);
    } catch {
      return null;
    }
  }

  async memoriser() {
    try {
      const brut = await crypto.subtle.exportKey("raw", this.cle);
      localStorage.setItem(CLE_MEMORISEE, versBase64(brut));
    } catch { /* stockage indisponible : on redemandera la phrase */ }
  }

  static oublier() {
    try { localStorage.removeItem(CLE_MEMORISEE); } catch { /* sans effet */ }
  }

  /** Déchiffre un fichier publié et rend l'objet JSON qu'il contenait. */
  async ouvrir(octets, quoi = "fichier") {
    const blob = new Uint8Array(octets);
    if (blob.length <= MAGIC.length + TAILLE_IV
        || MAGIC.some((o, i) => blob[i] !== o)) {
      throw new PhraseIncorrecte(`${quoi} : ce n'est pas un fichier chiffré H-Pilot.`);
    }
    const iv = blob.slice(MAGIC.length, MAGIC.length + TAILLE_IV);
    let clair;
    try {
      clair = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, this.cle, blob.slice(MAGIC.length + TAILLE_IV));
    } catch {
      throw new PhraseIncorrecte(
        "Phrase de passe incorrecte, ou fichier abîmé.");
    }
    try {
      return JSON.parse(new TextDecoder().decode(clair));
    } catch {
      throw new PhraseIncorrecte(`${quoi} : contenu illisible après déchiffrement.`);
    }
  }
}
