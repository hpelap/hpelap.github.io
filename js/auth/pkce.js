/* Connexion Microsoft Entra ID — Authorization Code + PKCE (§22, §24).
 *
 * Aucun secret : une application de type « SPA » s'authentifie par une
 * preuve à usage unique (PKCE), pas par un mot de passe d'application.
 *
 * Écrit ici plutôt que tiré de MSAL.js parce que le poste de développement
 * n'a ni Node ni npm : le protocole tient en quelques échanges standard,
 * et un code court se relit en entier.
 *
 * Les jetons vivent dans `sessionStorage` : ils disparaissent à la
 * fermeture de l'onglet. Rafraîchissement par le jeton de renouvellement
 * (valable 24 h pour une application SPA).
 */

const CLE = "hpilot.auth";
const CLE_FLUX = "hpilot.auth.flux";

function base64url(octets) {
  let texte = "";
  for (const b of new Uint8Array(octets)) texte += String.fromCharCode(b);
  return btoa(texte).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function aleatoire(taille = 32) {
  const octets = new Uint8Array(taille);
  crypto.getRandomValues(octets);
  return base64url(octets);
}

export async function empreinte(texte) {
  const octets = new TextEncoder().encode(texte);
  return base64url(await crypto.subtle.digest("SHA-256", octets));
}

function lireRevendications(idToken) {
  try {
    const charge = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(atob(charge).split("").map(
      (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export class AuthPKCE {
  constructor({ tenantId, clientId, redirectPath, scopes }) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.redirectUri = `${location.origin}${redirectPath}`;
    this.scopes = scopes;
    this.autorite = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
  }

  get configured() {
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guid.test(this.tenantId || "") && guid.test(this.clientId || "");
  }

  _session() {
    try { return JSON.parse(sessionStorage.getItem(CLE) || "null"); } catch { return null; }
  }

  _enregistrer(reponse) {
    const precedente = this._session() || {};
    const session = {
      accessToken: reponse.access_token,
      refreshToken: reponse.refresh_token || precedente.refreshToken,
      expiresAt: Date.now() + (Number(reponse.expires_in || 0) - 120) * 1000,
      account: reponse.id_token ? lireRevendications(reponse.id_token) : precedente.account,
    };
    sessionStorage.setItem(CLE, JSON.stringify(session));
    return session;
  }

  get account() {
    const a = (this._session() || {}).account || {};
    return a.name || a.preferred_username ? { name: a.name, username: a.preferred_username } : null;
  }

  get signedIn() { return Boolean(this._session()?.refreshToken || this._session()?.accessToken); }

  async login() {
    const verificateur = aleatoire(48);
    const etat = aleatoire(16);
    sessionStorage.setItem(CLE_FLUX, JSON.stringify({
      verificateur, etat, retour: location.pathname + location.search,
    }));
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      response_mode: "query",
      scope: this.scopes.join(" "),
      state: etat,
      code_challenge: await empreinte(verificateur),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    location.assign(`${this.autorite}/authorize?${params}`);
  }

  /** À appeler au chargement : termine la connexion si on revient d'Entra. */
  async handleRedirect() {
    const url = new URL(location.href);
    if (url.pathname !== new URL(this.redirectUri).pathname) return null;
    const flux = JSON.parse(sessionStorage.getItem(CLE_FLUX) || "null");
    sessionStorage.removeItem(CLE_FLUX);
    const erreur = url.searchParams.get("error");
    if (erreur) {
      throw new Error(url.searchParams.get("error_description") || erreur);
    }
    const code = url.searchParams.get("code");
    if (!code || !flux || url.searchParams.get("state") !== flux.etat) {
      throw new Error("Réponse de connexion invalide. Veuillez recommencer.");
    }
    await this._jeton({
      grant_type: "authorization_code", code,
      redirect_uri: this.redirectUri, code_verifier: flux.verificateur,
    });
    return flux.retour || "/";
  }

  async _jeton(champs) {
    const corps = new URLSearchParams({
      client_id: this.clientId, scope: this.scopes.join(" "), ...champs,
    });
    const reponse = await fetch(`${this.autorite}/token`, {
      method: "POST",   // échange de jeton auprès d'Entra — jamais vers H-Pilot
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps,
    });
    const json = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      throw new Error(json.error_description || "Échec de l'authentification Microsoft.");
    }
    return this._enregistrer(json);
  }

  async refresh() {
    const session = this._session();
    if (!session?.refreshToken) return null;
    try {
      return await this._jeton({ grant_type: "refresh_token", refresh_token: session.refreshToken });
    } catch {
      sessionStorage.removeItem(CLE);
      return null;
    }
  }

  async getToken() {
    const session = this._session();
    if (!session) return null;
    if (session.accessToken && session.expiresAt > Date.now()) return session.accessToken;
    return (await this.refresh())?.accessToken || null;
  }

  logout() {
    sessionStorage.removeItem(CLE);
    sessionStorage.removeItem(CLE_FLUX);
  }
}
