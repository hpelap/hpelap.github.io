/* Déclarer une panne depuis le téléphone.
 *
 * Le geste visé : un ticket Freshservice arrive par mail, on le colle ici,
 * l'application reconnaît l'appareil, et le mail au prestataire s'ouvre
 * déjà rédigé. On relit, on envoie. Rien n'est écrit dans H-Pilot depuis le
 * Web : c'est le mail — dont vous êtes en copie — que H-Pilot reprendra au
 * prochain démarrage.
 */
import { h, remplacer, fmt, badge, debounce, normaliser } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { analyser, gagnantNet, lireTicket } from "../matching.js";
import { squelette, erreur, enTete, champ, section } from "./commun.js";

const CLE_COURRIEL = "hpilot.courriel";
const TICKET = /#\s?(\d{5,7})\b/;

function courrielMemorise() {
  try { return localStorage.getItem(CLE_COURRIEL) || ""; } catch { return ""; }
}

function memoriserCourriel(valeur) {
  try { localStorage.setItem(CLE_COURRIEL, valeur); } catch { /* sans effet */ }
}

/** Le symptôme proposé : la première ligne utile du ticket. */
function symptomeProbable(texte) {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const utile = lignes.find((l) => l.length > 8 && !/^(de|à|objet|envoyé|cc)\s*:/i.test(l));
  return (utile || lignes[0] || "").slice(0, 200);
}

/** Le texte partagé depuis Outlook (Raccourci iPhone) : il arrive dans le
 * fragment de l'adresse — `#ticket=…` —, que le navigateur n'envoie jamais
 * au serveur. On le lit, puis on l'efface de l'adresse : il ne doit rester
 * ni dans l'historique, ni dans un favori. */
export function texteDuPartage(fragment = location.hash) {
  const brut = String(fragment || "").replace(/^#/, "");
  if (!brut) return "";
  const params = new URLSearchParams(brut);
  return (params.get("ticket") || params.get("texte") || "").trim();
}

function oublierLePartage() {
  if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
}

function referenceTicket(texte) {
  const trouve = TICKET.exec(texte || "");
  return trouve ? trouve[1] : "";
}

function contratDe(eq, contrats) {
  const lignes = (contrats || []).filter((c) => c.eq_id === eq.id && c.actif);
  if (!lignes.length) return null;
  lignes.sort((a, b) => String(b.date_fin || "").localeCompare(String(a.date_fin || "")));
  return lignes[0];
}

function texteContrat(contrat) {
  if (!contrat) return "hors contrat (à confirmer)";
  const fin = contrat.date_fin ? ` jusqu'au ${fmt.date(contrat.date_fin)}` : "";
  return `${contrat.type_contrat || "Contrat"} — ${contrat.prestataire || ""}${fin}`.trim();
}

/** Le mail au prestataire : mêmes informations que le brouillon du PC.
 *
 * **Aucun numéro d'équipement** (EQ-…) : il ne veut rien dire pour le
 * prestataire, et les modèles du PC l'excluent déjà. H-Pilot reconnaît
 * l'appareil au retour par son numéro de série, comme pour un ticket.
 * L'objet suit celui du PC — « Panne – appareil – site » — et c'est lui,
 * avec la phrase d'ouverture, qui permet au PC de retrouver ce mail. */
export function composerMail({ eq, contrat, symptome, bloquante, ticket, signature }) {
  const identite = [eq.marque, eq.modele].filter(Boolean).join(" ");
  const appareil = identite || eq.categorie || "équipement";
  const objet = `${bloquante ? "Urgent – " : ""}Panne – ${appareil}`
    + (eq.site ? ` – ${eq.site}` : "");
  const corps = [
    "Bonjour,",
    "",
    "Nous constatons une panne sur l'équipement suivant :",
    "",
    `Site : ${eq.site || ""}${eq.salle ? ` — ${eq.salle}` : ""}`,
    eq.categorie ? `Équipement : ${eq.categorie}` : null,
    identite ? `Marque et modèle : ${identite}` : null,
    eq.numero_serie ? `N° de série : ${eq.numero_serie}` : null,
    `Contrat : ${texteContrat(contrat)}`,
    ticket ? `Ticket interne : ${ticket}` : null,
    "",
    `Symptôme constaté : ${symptome || "à préciser"}`,
    bloquante ? "Impact : équipement à l'arrêt, activité bloquée."
      : "Impact : activité dégradée, équipement encore utilisable.",
    "",
    "Merci de nous indiquer votre délai d'intervention.",
    "",
    "Cordialement,",
    signature || "",
  ].filter((l) => l !== null).join("\n");
  return { objet, corps };
}

/** Les données remises à Claude : celles que le PC lui remet
 * (`mail_panne.contexte_panne`), dans le même ordre et avec les mêmes
 * libellés — la consigne est la même, les mails se ressemblent donc. */
export function contextePanne({ eq, symptome, bloquante, numeroManips }) {
  const appareil = [eq.categorie, eq.marque, eq.modele].filter(Boolean).join(" ");
  const lignes = [
    "Données de la panne :",
    `- Équipement : ${appareil}`,
    `- Site : ${eq.site || ""}`,
    `- Salle : ${eq.salle || ""}`,
    `- N° de série : ${eq.numero_serie || ""}`,
    `- Bloquante : ${bloquante ? "OUI — équipement immobilisé" : "non"}`,
    `- Commentaire : ${symptome || "(aucun)"}`,
  ];
  if (numeroManips) lignes.push(`- Numéro des manipulateurs : ${numeroManips}`);
  if (eq.prestataire) lignes.push(`- Prestataire : ${eq.prestataire}`);
  return `${lignes.join("\n")}\n\nRédige l'email.`;
}

/** Demande la rédaction à l'assistant. Rend {objet, corps}, ou lève avec
 * un message lisible. Rien d'autre que ces données ne part. */
async function rediger(assistant, contexte) {
  const annulation = new AbortController();
  const minuterie = setTimeout(() => annulation.abort(), 45000);
  try {
    const reponse = await fetch(`${assistant.url}/redaction`, {
      method: "POST",
      headers: { authorization: `Bearer ${assistant.jeton}`,
                 "content-type": "application/json" },
      body: JSON.stringify({ contexte }),
      signal: annulation.signal,
      credentials: "omit",
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(donnees.erreur || `service indisponible (${reponse.status})`);
    if (!donnees.corps) throw new Error("réponse vide");
    return donnees;
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "pas de réponse en 45 secondes" : e.message);
  } finally {
    clearTimeout(minuterie);
  }
}

function lienMail({ objet, corps }, copie) {
  const params = new URLSearchParams({ subject: objet, body: corps });
  if (copie) params.set("cc", copie);
  // mailto n'accepte pas « + » comme espace : URLSearchParams l'écrit ainsi.
  return `mailto:?${params.toString().replace(/\+/g, "%20")}`;
}

export default {
  titre: "Déclarer une panne",

  async render(ctx) {
    const { vue, store, shell, requete } = ctx;
    squelette(vue);
    const partage = texteDuPartage();
    oublierLePartage();
    let equipements;
    let tables;
    let contrats;
    let assistant;
    try {
      [equipements, tables, contrats, assistant] = await Promise.all([
        store.dataset("equipment"), store.dataset("matching"),
        store.dataset("contracts"),
        // Publié seulement dans le site chiffré, et seulement si la
        // rédaction par l'IA est en service : son absence n'est pas une
        // erreur, le modèle fixe prend le relais.
        store.dataset("assistant").catch(() => null),
      ]);
    } catch (e) {
      erreur(vue, e.message);
      return null;
    }
    const iaDisponible = Boolean(assistant?.url && assistant?.jeton);
    const numeros = new Map((assistant?.manips || []).map((m) => [m.eq, m.numero_manips]));

    const parc = equipements.items.filter((e) => e.actif !== false);
    const etat = {
      texte: partage || requete.get("texte") || "",
      choisi: null,
      symptome: "",
      bloquante: false,
      recherche: "",
      // Le mail rédigé par l'IA, s'il y en a un — modifiable avant l'envoi.
      redaction: null,
    };

    // Le moteur est celui du PC : il lit le ticket comme le poste le lit
    // (objet, demandeur, description), et compare des empreintes — d'où
    // l'attente. Une frappe plus récente l'emporte sur une lecture en cours.
    let lecture = 0;
    const relire = async () => {
      const numero = ++lecture;
      const ticket = lireTicket(etat.texte);
      const lu = await analyser(ticket.texte, tables, equipements.items,
        { demandeur: ticket.demandeur });
      if (numero !== lecture) return;
      etat.candidats = lu.candidats;
      etat.reconnu = lu;
      if (!etat.symptome) etat.symptome = symptomeProbable(etat.texte);
      if (gagnantNet(lu.candidats, tables)) etat.choisi = lu.candidats[0].eq;
      dessiner();
    };

    // ── Les morceaux d'écran ────────────────────────────────────────
    const zoneTicket = () => {
      const saisie = h("textarea", { class: "input zone-ticket", rows: 6,
        placeholder: "Collez ici le ticket Freshservice, ou décrivez la panne en une phrase.",
        "aria-label": "Texte du ticket" });
      saisie.value = etat.texte;
      saisie.addEventListener("input", debounce(() => {
        etat.texte = saisie.value;
        if (etat.texte.trim().length > 12) relire();
      }, 400));
      return section("Le ticket", saisie,
        h("p", { class: "muted" },
          "Rien n'est envoyé : le texte reste sur cet appareil, le temps de "
          + "reconnaître l'appareil concerné."));
    };

    const ligneCandidat = (candidat, choisi) => {
      const { eq, score, raisons, certain } = candidat;
      return h("li", {}, h("button", {
        class: `candidat${choisi ? " choisi" : ""}`, type: "button",
        "aria-pressed": choisi ? "true" : "false",
        onclick: () => { etat.choisi = eq; dessiner(); },
      },
      h("div", { class: "candidat-titre" }, `${eq.id} — ${eq.categorie || ""}`,
        certain ? badge("Certain", "success")
          : badge(`${Math.round(score * 100)} %`, score > 0.5 ? "info" : "")),
      h("div", { class: "candidat-sous" },
        [eq.marque, eq.modele, eq.site, eq.salle].filter(Boolean).join(" · ")),
      raisons?.length ? h("div", { class: "candidat-raisons" }, raisons.join(" · ")) : null));
    };

    const zonePropositions = () => {
      const candidats = etat.candidats || [];
      if (!etat.texte.trim()) return null;
      if (!candidats.length) {
        return section("Appareil concerné",
          h("p", { class: "muted" },
            "Rien de reconnu dans ce texte. Cherchez l'appareil ci-dessous."),
          zoneRecherche());
      }
      return section("Appareil concerné", resume(),
        h("ul", { class: "candidats" },
          candidats.map((c) => ligneCandidat(c, etat.choisi?.id === c.eq.id))),
        zoneRecherche());
    };

    /** Ce que le texte a permis de reconnaître — dit franchement, y compris
     * quand il n'a rien donné. */
    const resume = () => {
      const lu = etat.reconnu || {};
      const morceaux = [
        lu.site ? `site ${lu.site}` : "aucun site reconnu",
        lu.categorie ? `type ${lu.categorie}` : null,
        lu.salle ? `salle ${lu.salle}` : null,
      ].filter(Boolean);
      return h("p", { class: "muted" }, `Reconnu : ${morceaux.join(" · ")}.`
        + (lu.site ? "" : " La liste ci-dessous porte donc sur tout le parc."));
    };

    const zoneRecherche = () => {
      const saisie = h("input", { class: "input", type: "search",
        placeholder: "Autre appareil : nom, site, modèle…",
        "aria-label": "Chercher un autre appareil" });
      saisie.value = etat.recherche;
      const resultats = h("ul", { class: "candidats" });
      const remplir = () => {
        const q = normaliser(etat.recherche);
        remplacer(resultats, ...(q.length < 2 ? [] : parc
          .filter((e) => normaliser([e.id, e.categorie, e.marque, e.modele, e.site, e.salle]
            .filter(Boolean).join(" ")).includes(q))
          .slice(0, 8)
          .map((eq) => ligneCandidat({ eq, score: 0, raisons: [] },
            etat.choisi?.id === eq.id))));
      };
      saisie.addEventListener("input", debounce(() => {
        etat.recherche = saisie.value; remplir();
      }, 200));
      remplir();
      return h("div", { class: "recherche-appareil" }, saisie, resultats);
    };

    const zoneMail = () => {
      const eq = etat.choisi;
      if (!eq) return null;
      const contrat = contratDe(eq, contrats.items);
      const ticket = referenceTicket(etat.texte);

      const symptome = h("textarea", { class: "input", rows: 3,
        "aria-label": "Symptôme constaté" });
      symptome.value = etat.symptome;
      symptome.addEventListener("input", () => { etat.symptome = symptome.value; majLien(); });

      const bloquante = h("input", { type: "checkbox" });
      bloquante.checked = etat.bloquante;
      bloquante.addEventListener("change", () => {
        etat.bloquante = bloquante.checked; majLien();
      });

      const copie = h("input", { class: "input", type: "email",
        placeholder: "votre adresse, pour la copie",
        "aria-label": "Votre adresse e-mail, mise en copie" });
      copie.value = courrielMemorise();
      copie.addEventListener("change", () => {
        memoriserCourriel(copie.value.trim()); majLien();
      });

      const apercu = h("pre", { class: "apercu-mail" });
      const bouton = h("a", { class: "btn btn-large", href: "#" },
        icon("mail", "icon icon-sm"), "Ouvrir le mail au prestataire");

      // Le mail rédigé par l'IA se relit et se corrige ici, avant de partir.
      const objetIA = h("input", { class: "input", type: "text",
        "aria-label": "Objet du mail" });
      const corpsIA = h("textarea", { class: "input", rows: 14,
        "aria-label": "Texte du mail" });
      objetIA.addEventListener("input", () => { etat.redaction.objet = objetIA.value; majLien(); });
      corpsIA.addEventListener("input", () => { etat.redaction.corps = corpsIA.value; majLien(); });
      const messageIA = h("p", { class: "muted", role: "status" });
      const boutonIA = h("button", { class: "btn btn-secondary", type: "button" },
        icon("edit", "icon icon-sm"), "Rédiger avec l'IA");
      const retourModele = h("button", { class: "btn btn-ghost btn-inline", type: "button",
        onclick: () => { etat.redaction = null; dessiner(); } }, "Revenir au modèle");
      boutonIA.addEventListener("click", async () => {
        boutonIA.disabled = true;
        remplacer(boutonIA, "Rédaction en cours…");
        remplacer(messageIA);
        try {
          const mail = await rediger(assistant, contextePanne({
            eq, symptome: etat.symptome, bloquante: etat.bloquante,
            numeroManips: numeros.get(eq.id) || "",
          }));
          etat.redaction = { objet: mail.objet || "", corps: mail.corps };
          dessiner();
        } catch (e) {
          boutonIA.disabled = false;
          remplacer(boutonIA, icon("edit", "icon icon-sm"), "Rédiger avec l'IA");
          remplacer(messageIA, `L'IA n'a pas pu rédiger ce mail : ${e.message}. `
            + "Le modèle ci-dessous reste utilisable.");
        }
      });

      function majLien() {
        const mail = etat.redaction || composerMail({
          eq, contrat, symptome: etat.symptome, bloquante: etat.bloquante,
          ticket, signature: "",
        });
        apercu.textContent = `${mail.objet}\n\n${mail.corps}`;
        bouton.href = lienMail(mail, copie.value.trim());
      }
      if (etat.redaction) {
        objetIA.value = etat.redaction.objet;
        corpsIA.value = etat.redaction.corps;
      }
      majLien();

      const zoneTexte = etat.redaction
        ? section("Le mail, rédigé par l'IA",
          h("label", { class: "label-champ" }, "Objet"), objetIA,
          h("label", { class: "label-champ" }, "Texte"), corpsIA,
          h("p", { class: "muted" },
            "Relisez et corrigez : c'est ce texte qui part. Symptôme ou impact "
            + "modifié entre-temps ? Revenez au modèle, puis relancez l'IA."),
          retourModele,
          h("p", { class: "muted" },
            "Le destinataire reste à compléter dans Outlook : tapez le nom du "
            + "prestataire, l'auto-complétion fait le reste."),
          bouton)
        : section("Le mail", apercu,
          iaDisponible ? h("div", { class: "actions-ia" }, boutonIA, messageIA) : null,
          h("p", { class: "muted" },
            "Le destinataire reste à compléter dans Outlook : tapez le nom du "
            + "prestataire, l'auto-complétion fait le reste."),
          bouton);

      return h("div", {},
        section("Appareil retenu",
          h("dl", { class: "dl" },
            champ("Équipement", `${eq.id} — ${eq.categorie || ""}`),
            champ("Marque et modèle", [eq.marque, eq.modele].filter(Boolean).join(" ")),
            champ("N° de série", eq.numero_serie),
            champ("Site", `${eq.site || ""}${eq.salle ? ` — ${eq.salle}` : ""}`),
            champ("Prestataire", eq.prestataire),
            champ("Contrat", texteContrat(contrat)),
            ticket ? champ("Ticket", ticket) : null)),
        section("Ce que vous déclarez",
          h("label", { class: "label-champ" }, "Symptôme constaté"), symptome,
          h("label", { class: "login-memoire" }, bloquante,
            "Équipement à l'arrêt (panne bloquante)"),
          h("label", { class: "label-champ" }, "Vous mettre en copie"), copie,
          h("p", { class: "muted" },
            "La copie sert à H-Pilot : au prochain démarrage, il reconnaît "
            + "votre déclaration et passe la panne en « transmise au "
            + "prestataire », sans ressaisie.")),
        zoneTexte);
    };

    function dessiner() {
      remplacer(vue,
        enTete("Déclarer une panne",
          "Le mail part de votre messagerie ; H-Pilot reprendra la panne."),
        zoneTicket(), zonePropositions(), zoneMail());
      shell.page("Déclarer une panne", location.pathname);
    }

    if (etat.texte.trim().length > 12) relire(); else dessiner();
    return null;
  },
};
