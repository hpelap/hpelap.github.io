/* SnapshotStore — les données publiées, leur cache et leur fraîcheur.
 *
 * Règles :
 * - le manifeste est relu à l'ouverture et régulièrement ; un jeu de données
 *   n'est retéléchargé que si sa version a changé (§39) ;
 * - un jeu n'est chargé que lorsqu'une page le demande (§66) ;
 * - sans réseau, les dernières données en cache restent consultables (§40) ;
 * - **cohérence** : OneDrive ne garantit pas l'ordre de synchronisation. Si
 *   le manifeste annonce la version 120 d'un jeu et que le fichier reçu est
 *   encore en 119, on garde la version en cache et l'on signale
 *   « synchronisation en cours » plutôt que de mélanger deux états.
 *
 * Aucune méthode d'écriture vers la source : le cache local est la seule
 * chose que ce module écrit, et c'est une copie de lecture.
 */

const DB_NOM = "hpilot-web";
const DB_STORE = "snapshot";
const SCHEMA_ATTENDU = 1;

// ── Cache IndexedDB (fonctionne aussi hors contexte sécurisé) ───────────

function ouvrirBase() {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) return resolve(null);
    const requete = indexedDB.open(DB_NOM, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(DB_STORE);
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => resolve(null);
    requete.onblocked = () => resolve(null);
  });
}

class Cache {
  constructor() { this._db = ouvrirBase(); this._memoire = new Map(); }

  async get(cle) {
    if (this._memoire.has(cle)) return this._memoire.get(cle);
    const db = await this._db;
    if (!db) return null;
    return new Promise((resolve) => {
      const r = db.transaction(DB_STORE).objectStore(DB_STORE).get(cle);
      r.onsuccess = () => { if (r.result) this._memoire.set(cle, r.result); resolve(r.result || null); };
      r.onerror = () => resolve(null);
    });
  }

  async set(cle, valeur) {
    this._memoire.set(cle, valeur);
    const db = await this._db;
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(valeur, cle);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  async vider() {
    this._memoire.clear();
    const db = await this._db;
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
}

// ── Fraîcheur ───────────────────────────────────────────────────────────

export function fraicheur(statut, maintenant = Date.now()) {
  const m = statut.manifest;
  if (!m) {
    return { etat: statut.mode === "offline" ? "hors-ligne" : "erreur",
      libelle: "Aucune donnée", detail: statut.message || "" };
  }
  const verifie = Date.parse(m.verified_at || m.generated_at);
  const minutes = Math.max(0, Math.round((maintenant - verifie) / 60000));
  const frais = m.freshness?.fresh_minutes ?? 15;
  const ancien = m.freshness?.stale_minutes ?? 60;
  const quand = formatDateHeure(verifie);

  if (statut.mode === "offline") {
    return { etat: "hors-ligne", libelle: "Hors ligne", court: "Hors ligne",
      banniere: `Mode hors ligne — données du ${quand}.`, ton: "neutral", minutes, quand };
  }
  if (statut.mode === "error") {
    return { etat: "erreur", libelle: "Dernière version indisponible", court: "Erreur",
      banniere: "Impossible de récupérer la dernière version. Affichage des dernières données disponibles.",
      ton: "danger", minutes, quand };
  }
  if (m.publisher?.state === "closed") {
    const ferme = formatDateHeure(Date.parse(m.publisher.closed_at || m.verified_at));
    return { etat: "ferme", libelle: "H-Pilot fermé", court: relatif(minutes),
      banniere: `H-Pilot Desktop est fermé depuis le ${ferme} : les données sont celles de sa fermeture, rien n'a pu les modifier depuis.`,
      ton: "neutral", minutes, quand };
  }
  if (minutes < frais) {
    return { etat: "frais", libelle: "À jour", court: relatif(minutes), minutes, quand };
  }
  if (minutes < ancien) {
    return { etat: "recent", libelle: `Données datant de ${minutes} min`, court: relatif(minutes), minutes, quand };
  }
  return { etat: "ancien", libelle: "Synchronisation ancienne", court: relatif(minutes),
    banniere: `Données potentiellement obsolètes — dernière synchronisation le ${quand}.`,
    ton: "warning", minutes, quand };
}

function relatif(minutes) {
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

export function formatDateHeure(ms) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Magasin ─────────────────────────────────────────────────────────────

export class SnapshotStore {
  constructor(provider, { pollSeconds = 120 } = {}) {
    this.provider = provider;
    this.cache = new Cache();
    this.pollSeconds = pollSeconds;
    this.statut = { mode: "loading", manifest: null, message: "", syncing: new Set() };
    this._abonnes = new Set();
    this._enCours = new Map();
    this._memoire = new Map();       // nom → {version, data}
  }

  abonner(fn) { this._abonnes.add(fn); return () => this._abonnes.delete(fn); }
  _publier() { for (const fn of this._abonnes) { try { fn(this.statut); } catch { /* un abonné cassé n'arrête pas les autres */ } } }

  async demarrer() {
    const enCache = await this.cache.get("manifest");
    if (enCache) this.statut = { ...this.statut, manifest: enCache, mode: "cache" };
    await this.rafraichir();
    this._minuteur = setInterval(() => this.rafraichir(), this.pollSeconds * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.rafraichir();
    });
    window.addEventListener("online", () => this.rafraichir());
    window.addEventListener("offline", () => { this.statut = { ...this.statut, mode: "offline" }; this._publier(); });
  }

  async rafraichir() {
    let manifeste;
    try {
      manifeste = await this.provider.manifest();
    } catch (erreur) {
      const horsLigne = !navigator.onLine || erreur.kind === "network";
      this.statut = {
        ...this.statut,
        mode: erreur.kind === "auth" ? "auth" : horsLigne ? "offline" : "error",
        message: erreur.message,
      };
      this._publier();
      return this.statut;
    }
    if (manifeste.schema_version !== SCHEMA_ATTENDU) {
      this.statut = { ...this.statut, mode: "error",
        message: `Format de données ${manifeste.schema_version} non pris en charge par cette version de H-Pilot Web.` };
      this._publier();
      return this.statut;
    }
    const precedent = this.statut.manifest;
    await this.cache.set("manifest", manifeste);
    this.statut = { ...this.statut, manifest: manifeste, mode: "online", message: "" };
    // Un jeu déjà affiché dont la version a changé : on le recharge.
    const modifies = [];
    for (const [nom, info] of Object.entries(manifeste.datasets || {})) {
      const avant = precedent?.datasets?.[nom]?.version;
      if (avant !== undefined && avant !== info.version && this._memoire.has(nom)) modifies.push(nom);
    }
    this._publier();
    if (modifies.length) {
      await Promise.all(modifies.map((nom) => this.dataset(nom, { forcer: true }).catch(() => null)));
      this._publier();
    }
    return this.statut;
  }

  /** Les données d'un jeu, dans la version annoncée par le manifeste. */
  dataset(nom, { forcer = false } = {}) {
    if (this._enCours.has(nom) && !forcer) return this._enCours.get(nom);
    const promesse = this._charger(nom).finally(() => this._enCours.delete(nom));
    this._enCours.set(nom, promesse);
    return promesse;
  }

  async _charger(nom) {
    const attendue = this.statut.manifest?.datasets?.[nom]?.version;
    const memoire = this._memoire.get(nom);
    if (memoire && memoire.version === attendue) return memoire.data;

    const enCache = await this.cache.get(`dataset:${nom}`);
    if (enCache && enCache.version === attendue) {
      this._memoire.set(nom, enCache);
      return enCache.data;
    }
    if (this.statut.mode === "offline" || this.statut.mode === "auth") {
      if (enCache) { this._memoire.set(nom, enCache); return enCache.data; }
      throw new Error("Données non disponibles hors ligne.");
    }
    let fichier;
    try {
      fichier = await this.provider.dataset(nom);
    } catch (erreur) {
      if (enCache) { this._memoire.set(nom, enCache); return enCache.data; }
      throw erreur;
    }
    if (fichier.schema_version !== SCHEMA_ATTENDU || fichier.dataset !== nom) {
      throw new Error(`${nom} : fichier inattendu.`);
    }
    if (attendue !== undefined && fichier.version !== attendue) {
      // Manifeste et fichier pas encore synchronisés ensemble.
      this.statut.syncing.add(nom);
      if (enCache) { this._memoire.set(nom, enCache); return enCache.data; }
    } else {
      this.statut.syncing.delete(nom);
    }
    const entree = { version: fichier.version, data: fichier.data };
    this._memoire.set(nom, entree);
    await this.cache.set(`dataset:${nom}`, entree);
    return fichier.data;
  }

  async viderCache() {
    this._memoire.clear();
    await this.cache.vider();
  }
}
