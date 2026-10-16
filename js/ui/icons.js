/* Icônes SVG intégrées : aucune police d'icônes, aucun téléchargement,
 * aucun emoji (§71). Tracés simples, couleur héritée du texte. */

const NS = "http://www.w3.org/2000/svg";

const TRACES = {
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  dashboard: ["M4 4h7v7H4z", "M13 4h7v4h-7z", "M13 10h7v10h-7z", "M4 13h7v7H4z"],
  equipment: ["M4 5h16v11H4z", "M9 20h6", "M12 16v4"],
  incident: ["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"],
  intervention: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"],
  maintenance: ["M5 5h14v15H5z", "M5 9h14", "M9 3v4", "M15 3v4", "M9 15l2 2 4-4"],
  planning: ["M4 5h16v15H4z", "M4 9h16", "M8 3v4", "M16 3v4", "M8 13h3", "M13 13h3", "M8 16h3"],
  tasks: ["M5 5h14v14H5z", "M8 12l3 3 5-6"],
  contracts: ["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 12h5", "M10 16h5"],
  suppliers: ["M3 8h11v9H3z", "M14 11h4l3 3v3h-7z", "M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  sites: ["M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z", "M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.5-3.5"],
  filter: ["M4 5h16l-6 7v6l-4 2v-8z"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  "chevron-left": ["M15 6l-6 6 6 6"],
  "chevron-right": ["M9 6l6 6-6 6"],
  "chevron-down": ["M6 9l6 6 6-6"],
  sort: ["M8 4v16", "M5 7l3-3 3 3", "M16 20V4", "M13 17l3 3 3-3"],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 5v6h-6"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M14 3h6v18h-6"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  calendar: ["M4 5h16v15H4z", "M4 9h16", "M8 3v4", "M16 3v4"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  edit: ["M4 20h4L18 10l-4-4L4 16z", "M13 7l4 4"],
};

export function icon(nom, classe = "icon") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", classe);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of TRACES[nom] || []) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
