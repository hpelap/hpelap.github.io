/* LocalSnapshotProvider — les fichiers publiés servis à côté de l'application.
 *
 * Deux cas, le même code :
 *   - dossier `./web_data/` en développement, fichiers en clair ;
 *   - fichiers publiés chez un hébergeur, **chiffrés** : un coffre est
 *     fourni, les noms prennent le suffixe `.enc` et le contenu est
 *     déchiffré dans l'onglet.
 *
 * Requêtes GET uniquement, ici comme ailleurs.
 */
import { SnapshotProvider, ProviderError, lireJson } from "./provider.js";

export class LocalSnapshotProvider extends SnapshotProvider {
  constructor(base = "/web_data", { coffre = null } = {}) {
    super();
    this.base = base.replace(/\/$/, "");
    this.coffre = coffre;
  }

  get label() { return this.coffre ? "Fichiers chiffrés" : "Dossier local"; }

  async _reponse(fichier) {
    try {
      return await fetch(`${this.base}/${fichier}`, {
        method: "GET", cache: "no-store", credentials: "same-origin",
      });
    } catch {
      throw new ProviderError(`${fichier} : réseau indisponible`, { kind: "network" });
    }
  }

  async _get(nom) {
    const fichier = this.coffre ? `${nom}.enc` : nom;
    const reponse = await this._reponse(fichier);
    if (!this.coffre) return lireJson(reponse, fichier);
    if (!reponse.ok) {
      const kind = reponse.status === 404 ? "not_found" : "network";
      throw new ProviderError(`${fichier} : HTTP ${reponse.status}`,
        { kind, status: reponse.status });
    }
    return this.coffre.ouvrir(await reponse.arrayBuffer(), fichier);
  }

  /** Les paramètres de dérivation, publiés en clair à côté des fichiers. */
  async parametresChiffrement() {
    return lireJson(await this._reponse("chiffrement.json"), "chiffrement.json");
  }

  manifest() { return this._get("manifest.json"); }

  dataset(name) {
    if (!/^[a-z0-9_]+$/.test(name)) {
      return Promise.reject(new ProviderError("nom de jeu invalide", { kind: "invalid" }));
    }
    return this._get(`${name}.json`);
  }
}
