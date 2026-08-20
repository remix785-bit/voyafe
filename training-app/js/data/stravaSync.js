// Intégration Strava (Partie III §5) : flux OAuth "Authorization Code"
// complet exécuté entièrement côté client (pas de backend disponible pour un
// relais serveur). Client ID/Secret propres à l'appli Strava de l'utilisateur
// sont saisis et stockés localement (jamais commités), au même titre que le
// PAT GitHub — l'échange initial produit un refresh_token durable qui permet
// de renouveler l'access_token indéfiniment sans ressaisie manuelle (celui-ci
// expire au bout de 6h côté Strava).

const API_BASE = "https://www.strava.com/api/v3";
const OAUTH_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const OAUTH_TOKEN_URL = "https://www.strava.com/oauth/token";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * URL vers laquelle rediriger l'utilisateur pour autoriser l'appli une seule
 * fois (flux OAuth Authorization Code). Après acceptation, Strava redirige
 * vers redirectUri avec `?code=...` — ce code s'échange ensuite (echangerCode)
 * contre un access_token + refresh_token durable, ce qui évite d'avoir à
 * recoller un token toutes les 6h.
 * @param {{clientId:string, redirectUri:string}} params
 */
export function urlAutorisation({ clientId, redirectUri }) {
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all");
  return url.toString();
}

async function poserJetons(payload) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Échange de jetons Strava échoué (${res.status}): ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_at, athlete? }
}

/** Échange le `code` reçu après autorisation contre le premier couple de jetons. */
export async function echangerCode({ clientId, clientSecret, code }) {
  return poserJetons({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" });
}

/** Renouvelle l'access_token (expiré ou sur le point de l'être) via le refresh_token. */
export async function rafraichirToken({ clientId, clientSecret, refreshToken }) {
  return poserJetons({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/**
 * Liste les activités récentes de l'athlète (pour l'ingestion — Étape ⑤).
 * @param {{token:string, after?:number, before?:number, page?:number, perPage?:number}} params
 */
export async function listerActivites({ token, after, before, page = 1, perPage = 30 }) {
  const url = new URL(`${API_BASE}/athlete/activities`);
  if (after) url.searchParams.set("after", String(after));
  if (before) url.searchParams.set("before", String(before));
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 401) {
    throw new Error("Token Strava invalide ou expiré — le renouveler depuis les Réglages.");
  }
  if (!res.ok) throw new Error(`Lecture Strava échouée (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Vérifie que le token a bien accès (lecture) à l'API Strava — même rôle
 * que githubSync.js#verifierAcces, pour un "Tester la connexion" cohérent
 * dans Réglages.
 */
export async function verifierAcces({ token }) {
  const res = await fetch(`${API_BASE}/athlete`, { headers: authHeaders(token) });
  if (res.status === 401) return { ok: false, raison: "Token invalide ou expiré." };
  if (!res.ok) return { ok: false, raison: `Erreur inattendue (${res.status}).` };
  const athlete = await res.json();
  return { ok: true, athlete: { prenom: athlete.firstname, nom: athlete.lastname } };
}

/**
 * Convertit une activité Strava brute en écart exploitable par la boucle
 * adaptative (Partie II §6, étape 1 : séance_réalisée vs séance_planifiée).
 * @param {object} activiteStrava
 * @param {object|null} seancePlanifiee
 */
export function calculerEcart(activiteStrava, seancePlanifiee) {
  const distanceKm = (activiteStrava.distance ?? 0) / 1000;
  const dureeMin = (activiteStrava.moving_time ?? 0) / 60;
  const deniveleM = activiteStrava.total_elevation_gain ?? 0;
  const allureMoyenneMinParKm = distanceKm > 0 ? dureeMin / distanceKm : null;

  if (!seancePlanifiee) {
    return { distanceKm, dureeMin, deniveleM, allureMoyenneMinParKm, ecart: null };
  }

  const ecartVolumeMin = dureeMin - (seancePlanifiee.volumeSeanceMin ?? dureeMin);
  const ecartAllure =
    allureMoyenneMinParKm != null && seancePlanifiee.allureCibleMinParKm
      ? allureMoyenneMinParKm - seancePlanifiee.allureCibleMinParKm
      : null;

  return {
    distanceKm,
    dureeMin,
    deniveleM,
    allureMoyenneMinParKm,
    ecart: { ecartVolumeMin, ecartAllureMinParKm: ecartAllure },
  };
}

/**
 * Estime une charge journalière simple (TRIMP approximatif par défaut :
 * durée × facteur d'intensité RPE) pour alimenter le moteur de charge
 * (ACWR/EWMA, Partie I §10) à partir des activités Strava ingérées.
 * @param {object} activiteStrava
 * @param {number} rpeEstime 1-10, à défaut de fréquence cardiaque exploitable
 */
export function estimerChargeJournaliere(activiteStrava, rpeEstime = 5) {
  const dureeMin = (activiteStrava.moving_time ?? 0) / 60;
  return dureeMin * rpeEstime;
}
