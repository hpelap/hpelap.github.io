/* MicrosoftGraphSnapshotProvider — le dossier OneDrive, via Microsoft Graph.
 *
 * Permissions déléguées : `Files.Read` — lecture des seuls fichiers de
 * l'utilisateur connecté. Aucune requête d'écriture n'est émise : ce module
 * ne fait que des GET.
 *
 * Deux temps, pour éviter les pièges de redirection et de CORS :
 *   1. une requête authentifiée liste le dossier et rend, pour chaque
 *      fichier, une adresse de téléchargement **pré-signée** et temporaire ;
 *   2. le fichier est lu à cette adresse, sans jeton — l'en-tête
 *      d'autorisation ne quitte jamais graph.microsoft.com.
 */
import { SnapshotProvider, ProviderError, lireJson } from "./provider.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const LISTE_VALIDE_MS = 5 * 60 * 1000;   // adresses valables environ une heure

function encoderChemin(chemin) {
  return chemin.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export class MicrosoftGraphSnapshotProvider extends SnapshotProvider {
  constructor(auth, drivePath) {
    super();
    this.auth = auth;
    this.drivePath = drivePath;
    this._liste = null;
    this._listeLe = 0;
  }

  get label() { return "OneDrive"; }

  async _graph(url, reessai = true) {
    const jeton = await this.auth.getToken();
    if (!jeton) throw new ProviderError("Connexion Microsoft requise", { kind: "auth" });
    let reponse;
    try {
      reponse = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${jeton}` },
        cache: "no-store",
      });
    } catch {
      throw new ProviderError("Microsoft Graph injoignable", { kind: "network" });
    }
    if (reponse.status === 401 && reessai) {
      await this.auth.refresh();
      return this._graph(url, false);
    }
    if (reponse.status === 404) {
      throw new ProviderError(
        `Dossier OneDrive introuvable : ${this.drivePath}`, { kind: "config", status: 404 });
    }
    return lireJson(reponse, "Microsoft Graph");
  }

  async _fichiers(forcer = false) {
    if (!forcer && this._liste && Date.now() - this._listeLe < LISTE_VALIDE_MS) {
      return this._liste;
    }
    const url = `${GRAPH}/me/drive/root:/${encoderChemin(this.drivePath)}:/children?$top=200`;
    const reponse = await this._graph(url);
    const fichiers = new Map();
    for (const item of reponse.value || []) {
      const adresse = item["@microsoft.graph.downloadUrl"];
      if (item.file && adresse) fichiers.set(item.name, adresse);
    }
    this._liste = fichiers;
    this._listeLe = Date.now();
    return fichiers;
  }

  async _lire(nom) {
    for (const forcer of [false, true]) {
      const fichiers = await this._fichiers(forcer);
      const adresse = fichiers.get(nom);
      if (!adresse) {
        if (forcer) throw new ProviderError(`${nom} absent du dossier OneDrive`, { kind: "not_found" });
        continue;
      }
      let reponse;
      try {
        reponse = await fetch(adresse, { method: "GET", cache: "no-store", credentials: "omit" });
      } catch {
        throw new ProviderError(`${nom} : téléchargement impossible`, { kind: "network" });
      }
      // Adresse expirée : on redemande la liste une fois.
      if ((reponse.status === 401 || reponse.status === 403) && !forcer) continue;
      return lireJson(reponse, nom);
    }
    throw new ProviderError(`${nom} : lecture impossible`, { kind: "network" });
  }

  manifest() { return this._lire("manifest.json"); }

  dataset(name) {
    if (!/^[a-z0-9_]+$/.test(name)) {
      return Promise.reject(new ProviderError("nom de jeu invalide", { kind: "invalid" }));
    }
    return this._lire(`${name}.json`);
  }
}
