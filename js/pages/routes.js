/* Les routes, et le chargement paresseux des pages (§66, §78).
 * Une page n'est téléchargée que lorsqu'on l'ouvre. */

const page = (fichier) => () => import(fichier).then((m) => m.default);

export const ROUTES = [
  { path: "/", page: page("./dashboard.js") },
  { path: "/auth/callback", page: page("./dashboard.js") },
  { path: "/equipment", page: page("./equipment.js") },
  { path: "/equipment/:id", page: page("./equipment.js") },
  { path: "/sites", page: page("./sites.js") },
  { path: "/sites/:id", page: page("./sites.js") },
  { path: "/incidents", page: page("./incidents.js") },
  { path: "/incidents/nouvelle", page: page("./declaration.js") },
  { path: "/incidents/:id", page: page("./incidents.js") },
  { path: "/interventions", page: page("./interventions.js") },
  { path: "/interventions/:id", page: page("./interventions.js") },
  { path: "/maintenance", page: page("./maintenance.js") },
  { path: "/maintenance/:id", page: page("./maintenance.js") },
  { path: "/planning", page: page("./planning.js") },
  { path: "/planning/:id", page: page("./planning.js") },
  { path: "/tasks", page: page("./tasks.js") },
  { path: "/tasks/:id", page: page("./tasks.js") },
  { path: "/contracts", page: page("./contracts.js") },
  { path: "/contracts/:id", page: page("./contracts.js") },
  { path: "/suppliers", page: page("./suppliers.js") },
  { path: "/suppliers/:id", page: page("./suppliers.js") },
  { path: "*", page: page("./introuvable.js") },
];
