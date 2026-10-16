/* SnapshotProvider — d'où viennent les fichiers publiés.
 *
 * Le reste de l'application ne sait pas si les données arrivent d'un
 * dossier local ou de Microsoft Graph. Toute implémentation ne propose que
 * deux lectures, et **aucune écriture** : il n'existe pas de méthode pour
 * modifier quoi que ce soit, ni ici ni dans les implémentations (§25).
 */

export class ProviderError extends Error {
  constructor(message, { kind = "network", status = 0 } = {}) {
    super(message);
    this.kind = kind;     // "network" | "auth" | "not_found" | "config" | "invalid"
    this.status = status;
  }
}

export class SnapshotProvider {
  /** Libellé affichable de la source. */
  get label() { return ""; }

  /** Le manifeste publié. */
  async manifest() { throw new Error("non implémenté"); }

  /** Un jeu de données publié, tel qu'écrit par H-Pilot Desktop. */
  async dataset(_name) { throw new Error("non implémenté"); }
}

/** Refuse tout ce qui n'est pas du JSON attendu : jamais d'exécution. */
export async function lireJson(reponse, quoi) {
  if (!reponse.ok) {
    const kind = reponse.status === 401 || reponse.status === 403 ? "auth"
      : reponse.status === 404 ? "not_found" : "network";
    throw new ProviderError(`${quoi} : HTTP ${reponse.status}`, { kind, status: reponse.status });
  }
  try {
    return await reponse.json();
  } catch {
    throw new ProviderError(`${quoi} : contenu illisible`, { kind: "invalid" });
  }
}
