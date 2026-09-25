/* L'enveloppe : en-tête, navigation, bandeaux d'état.
 *
 * Toujours visibles, sur tous les écrans (§37, §80) : « Lecture seule » et
 * l'état de fraîcheur. Un appui sur l'état donne l'heure exacte de la
 * dernière synchronisation.
 */
import { h, remplacer, vider } from "./dom.js";
import { icon } from "./icons.js";
import { ouvrirFeuille } from "./sheet.js";
import { fraicheur, formatDateHeure } from "../store.js";
import { Coffre } from "../coffre.js";

export const NAVIGATION = [
  { path: "/", label: "Tableau de bord", court: "Accueil", icone: "dashboard", bas: true },
  { path: "/equipment", label: "Parc", court: "Parc", icone: "equipment", bas: true },
  { path: "/incidents", label: "Pannes", court: "Pannes", icone: "incident", bas: true, compte: "open_incidents" },
  { path: "/interventions", label: "Interventions", court: "Interv.", icone: "intervention" },
  { path: "/maintenance", label: "Maintenances", court: "Maint.", icone: "maintenance", bas: true, compte: "overdue_maintenance", alerte: true },
  { path: "/planning", label: "Planning N+1", court: "Planning", icone: "planning" },
  { path: "/tasks", label: "Tâches", court: "Tâches", icone: "tasks", bas: true, compte: "overdue_tasks", alerte: true },
  { path: "/contracts", label: "Contrats", court: "Contrats", icone: "contracts" },
  { path: "/suppliers", label: "Fournisseurs", court: "Fourn.", icone: "suppliers" },
];

const THEMES = [["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]];

export function appliquerTheme() {
  let choix = "system";
  try { choix = localStorage.getItem("hpilot.theme") || "system"; } catch { /* stockage indisponible */ }
  if (choix === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choix);
  return choix;
}

export class Shell {
  constructor({ store, auth, router }) {
    this.store = store;
    this.auth = auth;
    this.router = router;
    this.app = document.getElementById("app");
    this._construire();
    store.abonner(() => this._majEtat());
    this._majEtat();
    setInterval(() => this._majEtat(), 30_000);
  }

  _construire() {
    const app = vider(this.app);

    // En-tête
    this.titre = h("h1", { class: "topbar-title" }, "H-Pilot Web");
    this.chip = h("button", { class: "sync-chip", type: "button", "aria-label": "État de la synchronisation",
      onclick: () => this._ouvrirEtat() },
    h("span", { class: "sync-dot" }), h("span", { class: "sync-court" }, "…"), h("span", { class: "sync-long" }));
    const recherche = h("form", { class: "topbar-search", role: "search", onsubmit: (e) => {
      e.preventDefault();
      const q = e.target.elements.q.value.trim();
      this.router.aller(`/equipment${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    } }, h("div", { class: "field" }, icon("search"),
      h("input", { class: "input", name: "q", type: "search", placeholder: "Rechercher un équipement, un site, un modèle",
        "aria-label": "Rechercher dans le parc", autocomplete: "off" })));

    const topbar = h("header", { class: "topbar" },
      this.boutonMenu = h("button", { class: "icon-btn menu-btn", type: "button", "aria-label": "Ouvrir le menu",
        "aria-controls": "navigation", "aria-expanded": "false", onclick: () => this.basculerMenu() }, icon("menu")),
      h("a", { class: "brand", href: "/" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "H"), "H-Pilot Web"),
      this.titre,
      recherche,
      h("div", { class: "topbar-actions" },
        h("span", { class: "readonly-badge", title: "Consultation seule : aucune modification possible depuis le Web" },
          icon("lock"), h("span", { class: "label-long" }, "Lecture seule"), h("span", { class: "label-short" }, "Lecture")),
        this.chip),
    );

    // Navigation latérale / tiroir
    this.liensNav = new Map();
    const liste = h("ul", { class: "nav-list" }, NAVIGATION.map((item) => {
      const compte = item.compte ? h("span", { class: `nav-count${item.alerte ? " alerte" : ""}`, hidden: true }) : null;
      const lien = h("a", { class: "nav-link", href: item.path, onclick: () => this.fermerMenu() },
        icon(item.icone), h("span", { class: "nav-label-long" }, item.label),
        h("span", { class: "nav-label-short" }, item.court), compte);
      this.liensNav.set(item.path, { lien, compte, item });
      return h("li", {}, lien);
    }));
    this.pied = h("div", { class: "sidebar-foot" });
    const sidebar = this.sidebar = h("nav", { class: "sidebar", id: "navigation", "aria-label": "Navigation principale" },
      h("div", { class: "sidebar-head" },
        h("a", { class: "brand", href: "/", onclick: () => this.fermerMenu() }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "H"), "H-Pilot Web"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Fermer le menu", onclick: () => this.fermerMenu() }, icon("close"))),
      liste, this.pied);

    // Barre du bas (téléphone)
    this.liensBas = new Map();
    const bas = h("nav", { class: "bottom-nav", "aria-label": "Navigation rapide" },
      NAVIGATION.filter((i) => i.bas).map((item) => {
        const lien = h("a", { class: "bottom-link", href: item.path }, icon(item.icone), h("span", {}, item.court));
        this.liensBas.set(item.path, lien);
        return lien;
      }));

    this.banniere = h("div", { class: "status-zone" });
    this.vue = h("div", { class: "view", id: "view", tabindex: "-1" });
    const main = h("main", { class: "main", id: "main" }, this.banniere, this.vue);

    app.append(
      h("a", { class: "skip-link", href: "#main" }, "Aller au contenu"),
      topbar, h("div", { class: "nav-overlay", onclick: () => this.fermerMenu() }), sidebar, main, bas);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.fermerMenu(); });
  }

  basculerMenu() {
    if (this.app.classList.contains("nav-open")) { this.fermerMenu(); return; }
    this.app.classList.add("nav-open");
    this.boutonMenu.setAttribute("aria-expanded", "true");
    // Le focus entre dans le tiroir (lien de la page courante, sinon le premier).
    const cible = this.sidebar.querySelector('.nav-link[aria-current="page"]') || this.sidebar.querySelector(".nav-link");
    requestAnimationFrame(() => cible?.focus({ preventScroll: true }));
  }

  fermerMenu() {
    if (!this.app.classList.contains("nav-open")) return;
    this.app.classList.remove("nav-open");
    this.boutonMenu.setAttribute("aria-expanded", "false");
    if (this.sidebar.contains(document.activeElement)) this.boutonMenu.focus({ preventScroll: true });
  }

  /** Titre de la page et lien actif. */
  page(titre, chemin) {
    this.titre.textContent = titre;
    document.title = `${titre} — H-Pilot Web`;
    let racine = "/" + (chemin.split("/")[1] || "");
    if (racine === "/sites") racine = "/equipment";         // un site se consulte depuis le parc
    for (const [path, { lien }] of this.liensNav) {
      if (path === racine) lien.setAttribute("aria-current", "page");
      else lien.removeAttribute("aria-current");
    }
    for (const [path, lien] of this.liensBas) {
      if (path === racine) lien.setAttribute("aria-current", "page");
      else lien.removeAttribute("aria-current");
    }
  }

  _majEtat() {
    const statut = this.store.statut;
    const etat = fraicheur(statut);
    this.chip.dataset.etat = etat.etat;
    this.chip.querySelector(".sync-court").textContent =
      statut.mode === "loading" ? "Chargement…" : (etat.court || etat.libelle);
    this.chip.querySelector(".sync-long").textContent =
      statut.manifest ? `· ${etat.libelle === "À jour" ? "À jour" : etat.libelle}` : "";

    vider(this.banniere);
    if (statut.mode === "auth" && this.auth) {
      this.banniere.append(h("div", { class: "banner warning", role: "status" },
        icon("info"), h("span", {}, "Session Microsoft expirée. "),
        h("button", { class: "btn btn-secondary", type: "button", onclick: () => this.auth.login() }, "Se reconnecter")));
    } else if (etat.banniere) {
      this.banniere.append(h("div", { class: `banner ${etat.ton || ""}`, role: "status" }, icon("info"), h("span", {}, etat.banniere)));
    }
    if (statut.syncing?.size) {
      this.banniere.append(h("div", { class: "banner neutral", role: "status" }, icon("refresh"),
        h("span", {}, "Synchronisation OneDrive en cours : certaines données affichées sont celles de la publication précédente.")));
    }

    const comptes = statut.manifest?.counts || {};
    for (const { compte, item } of this.liensNav.values()) {
      if (!compte) continue;
      const n = comptes[item.compte];
      compte.hidden = !n;
      compte.textContent = n ? String(n) : "";
    }
    remplacer(this.pied, 
      h("div", {}, "Consultation en lecture seule."),
      h("div", {}, statut.manifest ? `Snapshot ${statut.manifest.snapshot_version}` : ""),
    );
  }

  _ouvrirEtat() {
    const statut = this.store.statut;
    const m = statut.manifest;
    const etat = fraicheur(statut);
    let choix = appliquerTheme();
    const lignes = h("dl", { class: "dl" },
      ligne("État", etat.libelle),
      ligne("Dernière synchronisation", m ? formatSecondes(m.verified_at) : "—"),
      ligne("Dernière modification des données", m ? formatSecondes(m.generated_at) : "—"),
      ligne("Snapshot", m ? String(m.snapshot_version) : "—"),
      ligne("Source", this.store.provider.label),
      ligne("H-Pilot Desktop", m?.publisher?.state === "closed" ? "Fermé" : m ? "Ouvert" : "—"),
    );
    const theme = h("div", { class: "segmented", role: "group", "aria-label": "Thème" },
      THEMES.map(([valeur, libelle]) => h("button", { type: "button", "aria-pressed": String(valeur === choix),
        onclick: (e) => {
          try { localStorage.setItem("hpilot.theme", valeur); } catch { /* sans effet */ }
          choix = appliquerTheme();
          for (const b of e.target.parentNode.children) b.setAttribute("aria-pressed", String(b === e.target));
        } }, libelle)));
    const corps = h("div", {},
      h("p", { class: "soft" }, "H-Pilot Web est une vue en lecture seule. Toutes les modifications se font dans H-Pilot Desktop."),
      h("div", { class: "subsection" }, lignes),
      h("div", { class: "subsection" }, h("h3", {}, "Affichage"), theme),
      this.auth?.account ? h("div", { class: "subsection" }, h("h3", {}, "Compte"),
        h("p", {}, this.auth.account.name || ""), h("p", { class: "muted" }, this.auth.account.username || "")) : null,
    );
    const pied = [h("button", { class: "btn btn-secondary", type: "button", onclick: async (e) => {
      e.target.disabled = true;
      await this.store.rafraichir();
      e.target.disabled = false;
    } }, icon("refresh", "icon icon-sm"), "Actualiser")];
    if (this.store.provider?.coffre) {
      pied.push(h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
        Coffre.oublier();
        await this.store.viderCache();
        location.assign("/");
      } }, icon("logout", "icon icon-sm"), "Oublier sur cet appareil"));
    }
    if (this.auth?.signedIn) {
      pied.push(h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
        this.auth.logout();
        await this.store.viderCache();
        location.assign("/");
      } }, icon("logout", "icon icon-sm"), "Se déconnecter"));
    }
    ouvrirFeuille({ titre: "Synchronisation", corps, pied });
  }
}

function ligne(libelle, valeur) {
  return h("div", {}, h("dt", {}, libelle), h("dd", {}, valeur));
}

function formatSecondes(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${formatDateHeure(ms).split(" à ")[0]} ${d.toLocaleTimeString("fr-FR")}`;
}
