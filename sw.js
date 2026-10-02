/* Service worker de H-Pilot Web (§84).
 *
 * Il ne met en cache QUE l'application elle-même (HTML, CSS, JS, icônes),
 * pour qu'elle s'ouvre sans réseau. Il ne touche jamais :
 *   - aux données publiées (/web_data/, Microsoft Graph, OneDrive) : elles
 *     sont conservées par l'application dans IndexedDB, et effacées à la
 *     déconnexion ;
 *   - à l'authentification (login.microsoftonline.com) ni aux jetons ;
 *   - à toute requête autre que GET, ou portant un en-tête Authorization.
 *
 * Mettre à jour VERSION à chaque déploiement : l'ancien cache est supprimé.
 */
const VERSION = "hpilot-web-39c5e9ad1718";

const COQUILLE = [
  "/",
  "/index.html",
  "/config.js",
  "/manifest.webmanifest",
  "/css/tokens.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/js/main.js",
  "/js/router.js",
  "/js/store.js",
  "/js/coffre.js",
  "/js/auth/pkce.js",
  "/js/providers/provider.js",
  "/js/providers/local.js",
  "/js/providers/graph.js",
  "/js/ui/dom.js",
  "/js/ui/icons.js",
  "/js/ui/sheet.js",
  "/js/ui/shell.js",
  "/js/ui/rlist.js",
  "/js/ui/controls.js",
  "/js/pages/routes.js",
  "/js/pages/commun.js",
  "/js/pages/dashboard.js",
  "/js/pages/equipment.js",
  "/js/pages/sites.js",
  "/js/matching.js",
  "/js/pages/declaration.js",
  "/js/pages/incidents.js",
  "/js/pages/interventions.js",
  "/js/pages/maintenance.js",
  "/js/pages/planning.js",
  "/js/pages/tasks.js",
  "/js/pages/contracts.js",
  "/js/pages/suppliers.js",
  "/js/pages/introuvable.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(COQUILLE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

function horsCoquille(requete, url) {
  return requete.method !== "GET"
    || url.origin !== self.location.origin
    || requete.headers.has("Authorization")
    || url.pathname.startsWith("/web_data/")
    || url.pathname.startsWith("/auth/")
    || url.pathname === "/sw.js";
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  const url = new URL(requete.url);
  if (horsCoquille(requete, url)) return;          // le navigateur s'en charge

  // Navigation (/equipment/EQ-0212…) : le réseau d'abord, la coquille
  // en secours hors ligne — le routeur de l'application fait le reste.
  if (requete.mode === "navigate") {
    event.respondWith(
      fetch(requete).catch(() => caches.match("/index.html", { cacheName: VERSION })));
    return;
  }

  // Fichiers de l'application : réponse immédiate depuis le cache, puis
  // mise à jour en arrière-plan.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const enCache = await cache.match(requete, { ignoreSearch: true });
      const reseau = fetch(requete).then((reponse) => {
        if (reponse.ok && reponse.type === "basic") cache.put(requete, reponse.clone());
        return reponse;
      }).catch(() => enCache);
      return enCache || reseau;
    }));
});
