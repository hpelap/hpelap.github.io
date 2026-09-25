/* H-Pilot Web — démarrage.
 *
 * Choisit la source des données selon la configuration, gère la connexion
 * Microsoft en production, puis lance la navigation. Rien ici ne peut
 * écrire vers H-Pilot : les fournisseurs n'ont que des lectures.
 */
import config from "../config.js";
import { h, vider } from "./ui/dom.js";
import { Coffre, PhraseIncorrecte } from "./coffre.js";
import { LocalSnapshotProvider } from "./providers/local.js";
import { MicrosoftGraphSnapshotProvider } from "./providers/graph.js";
import { AuthPKCE } from "./auth/pkce.js";
import { SnapshotStore } from "./store.js";
import { Router } from "./router.js";
import { Shell, appliquerTheme } from "./ui/shell.js";
import { ROUTES } from "./pages/routes.js";

appliquerTheme();

function ecranMessage(titre, texte, action) {
  const app = vider(document.getElementById("app"));
  app.append(h("div", { class: "login" },
    h("div", { class: "brand-mark", "aria-hidden": "true" }, "H"),
    h("h1", {}, titre), h("p", {}, texte), action || null));
}

/** Demande la phrase de passe, et rend le coffre une fois qu'elle ouvre
 * vraiment le manifeste — pas avant. */
function demanderPhrase(parametres, essayer, message = "") {
  return new Promise((resoudre) => {
    // Sur un téléphone, une phrase de 20 caractères tapée en aveugle est
    // une source de refus à elle seule : on peut l'afficher. Et le clavier
    // ne doit ni la corriger, ni lui mettre une majuscule.
    const champ = h("input", { class: "input", type: "password", name: "phrase",
      autocomplete: "current-password", "aria-label": "Phrase de passe",
      placeholder: "Phrase de passe", required: true,
      autocapitalize: "none", autocorrect: "off", spellcheck: "false" });
    const oeil = h("button", { class: "btn btn-ghost champ-oeil", type: "button",
      "aria-label": "Afficher la phrase de passe", onclick: () => {
        const cache = champ.type === "password";
        champ.type = cache ? "text" : "password";
        oeil.textContent = cache ? "Masquer" : "Afficher";
        oeil.setAttribute("aria-label", cache ? "Masquer la phrase de passe"
          : "Afficher la phrase de passe");
        champ.focus();
      } }, "Afficher");
    const memoire = h("input", { type: "checkbox", name: "memoire", checked: true });
    const erreur = h("p", { class: "form-erreur", role: "alert" }, message);
    const bouton = h("button", { class: "btn", type: "submit" }, "Ouvrir");
    const formulaire = h("form", { class: "login-form", onsubmit: async (e) => {
      e.preventDefault();
      bouton.disabled = true;
      erreur.textContent = "";
      try {
        const coffre = await Coffre.depuisPhrase(champ.value, parametres);
        await essayer(coffre);                       // lit vraiment le manifeste
        if (memoire.checked) await coffre.memoriser();
        resoudre(coffre);
      } catch (exc) {
        erreur.textContent = exc instanceof PhraseIncorrecte
          ? "Phrase de passe incorrecte." : exc.message;
        bouton.disabled = false;
        champ.select();
      }
    } }, h("div", { class: "champ-avec-action" }, champ, oeil),
    h("label", { class: "login-memoire" }, memoire, "Se souvenir sur cet appareil"),
    bouton, erreur);
    ecranMessage("H-Pilot Web",
      "Les données publiées sont chiffrées. Entrez la phrase de passe "
      + "définie dans H-Pilot Desktop.", formulaire);
    champ.focus();
  });
}

/** Le fournisseur des fichiers chiffrés, une fois la phrase acceptée. */
async function providerChiffre(chemin) {
  const nu = new LocalSnapshotProvider(chemin);
  let parametres;
  try {
    parametres = await nu.parametresChiffrement();
  } catch (exc) {
    ecranMessage("Données indisponibles",
      "Impossible de lire les paramètres de chiffrement (" + exc.message
      + "). Vérifiez que H-Pilot Desktop a bien publié.");
    return null;
  }
  const essayer = async (coffre) => {
    await new LocalSnapshotProvider(chemin, { coffre }).manifest();
  };
  let coffre = await Coffre.memorisee();
  if (coffre) {
    try {
      await essayer(coffre);                  // la phrase a pu changer depuis
    } catch {
      Coffre.oublier();
      coffre = null;
    }
  }
  if (!coffre) coffre = await demanderPhrase(parametres, essayer);
  return new LocalSnapshotProvider(chemin, { coffre });
}

async function demarrer() {
  let provider;
  let auth = null;

  if (config.mode === "graph") {
    auth = new AuthPKCE({ ...config.graph });
    if (!auth.configured) {
      ecranMessage("Configuration incomplète",
        "Les identifiants Entra ID (tenantId, clientId) ne sont pas renseignés dans config.js. " +
        "Voir la procédure dans docs/H-Pilot-Web.md.");
      return;
    }
    try {
      const retour = await auth.handleRedirect();
      if (retour) history.replaceState({}, "", retour);
    } catch (e) {
      ecranMessage("Connexion impossible", e.message,
        h("button", { class: "btn", type: "button", onclick: () => auth.login() }, "Réessayer"));
      return;
    }
    if (!auth.signedIn) {
      ecranMessage("H-Pilot Web",
        "Consultation en lecture seule des données de H-Pilot. Connectez-vous avec votre compte Microsoft professionnel.",
        h("button", { class: "btn", type: "button", onclick: () => auth.login() }, "Se connecter avec Microsoft"));
      return;
    }
    provider = new MicrosoftGraphSnapshotProvider(auth, config.graph.drivePath);
  } else if (config.mode === "chiffre") {
    provider = await providerChiffre((config.chiffre || config.local).path);
    if (!provider) return;
  } else {
    provider = new LocalSnapshotProvider(config.local.path);
  }

  const store = new SnapshotStore(provider, { pollSeconds: config.pollSeconds });
  let nettoyage = null;
  let rendu = 0;

  const router = new Router(ROUTES, async (correspondance, requete) => {
    const numero = ++rendu;
    if (typeof nettoyage === "function") { try { nettoyage(); } catch { /* sans effet */ } }
    nettoyage = null;
    const route = correspondance?.route || ROUTES.find((r) => r.path === "*");
    const page = await route.page();
    if (numero !== rendu) return;          // une navigation plus récente a pris le relais
    shell.page(page.titre, location.pathname);
    shell.fermerMenu();
    const vue = shell.vue;
    const resultat = await page.render({
      vue, store, router, shell, params: correspondance?.params || {}, requete,
    });
    if (numero === rendu) nettoyage = resultat;
  });

  const shell = new Shell({ store, auth, router });
  // Le manifeste d'abord : la page affichée en dépend pour ses versions.
  await store.demarrer();
  router.demarrer();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const pwa = config.pwa === true
      || (config.pwa !== false && config.mode !== "local");
    if (pwa) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* hors ligne réduit, sans gravité */ });
    } else {
      // Un service worker laissé par un essai précédent servirait d'anciens fichiers.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
  }
}

demarrer();
