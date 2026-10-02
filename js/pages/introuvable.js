/* Adresse inconnue. */
import { h, remplacer } from "../ui/dom.js";

export default {
  titre: "Page introuvable",
  async render({ vue }) {
    remplacer(vue, h("div", { class: "empty" },
      h("h2", {}, "Page introuvable"),
      h("p", {}, "Cette adresse ne correspond à aucune page de H-Pilot Web."),
      h("p", {}, h("a", { class: "btn", href: "/" }, "Retour au tableau de bord"))));
    return null;
  },
};
