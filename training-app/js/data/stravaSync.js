// Scaffold de synchro Strava — flow OAuth + import des activités.
//
// LIMITE DE SÉCURITÉ ASSUMÉE : cette app n'a pas de backend. L'échange de
// code OAuth Strava exige normalement un client_secret gardé côté serveur ;
// ici, faute de serveur, le client_secret est saisi et stocké par
// l'utilisateur lui-même dans son propre navigateur (localStorage), comme
// son token d'accès. Ce n'est PAS un stockage sécurisé — quiconque a accès
// au navigateur/à l'appareil peut le lire. Ne pas utiliser cette app avec un
// compte Strava sensible sans en avoir conscience. Une v2 avec un vrai
// backend (proxy d'échange de token) lèverait cette limite.

const STRAVA_CONFIG_KEY = "voyafe.strava.config";
const STRAVA_TOKEN_KEY = "voyafe.strava.token";
const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

export function getStravaConfig() {
  try {
    return JSON.parse(localStorage.getItem(STRAVA_CONFIG_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setStravaConfig({ clientId, clientSecret, redirectUri }) {
  localStorage.setItem(STRAVA_CONFIG_KEY, JSON.stringify({ clientId, clientSecret, redirectUri }));
}

/** Construit l'URL de redirection OAuth Strava. */
export function buildAuthorizeUrl() {
  const config = getStravaConfig();
  if (!config?.clientId || !config?.redirectUri) {
    throw new Error("Configuration Strava incomplète (clientId / redirectUri manquants).");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Échange le code d'autorisation reçu en redirect contre un token. */
export async function exchangeCodeForToken(code) {
  const config = getStravaConfig();
  if (!config?.clientId || !config?.clientSecret) {
    throw new Error("Configuration Strava incomplète (clientId / clientSecret manquants).");
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Échange de code Strava échoué (${response.status})`);
  const token = await response.json();
  storeToken(token);
  return token;
}

export function storeToken(token) {
  localStorage.setItem(STRAVA_TOKEN_KEY, JSON.stringify(token));
}

export function getStoredToken() {
  try {
    return JSON.parse(localStorage.getItem(STRAVA_TOKEN_KEY) ?? "null");
  } catch {
    return null;
  }
}

async function refreshTokenIfNeeded() {
  const token = getStoredToken();
  if (!token) throw new Error("Aucun token Strava stocké — lance l'authentification.");
  const nowSeconds = Date.now() / 1000;
  if (token.expires_at && token.expires_at > nowSeconds + 60) return token;

  const config = getStravaConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Rafraîchissement du token Strava échoué (${response.status})`);
  const refreshed = await response.json();
  storeToken(refreshed);
  return refreshed;
}

/**
 * Récupère les activités récentes de l'athlète connecté.
 * @param {{page?: number, perPage?: number, after?: number}} options after = timestamp unix
 */
export async function fetchAthleteActivities(options = {}) {
  const token = await refreshTokenIfNeeded();
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 30),
  });
  if (options.after) params.set("after", String(options.after));
  const response = await fetch(`${API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Récupération des activités Strava échouée (${response.status})`);
  return response.json();
}

/** Convertit une activité Strava brute au format "résultat" interne. */
export function mapStravaActivityToResultat(activite) {
  return {
    source: "strava",
    stravaId: activite.id,
    date: activite.start_date_local,
    label: activite.name,
    distanceM: activite.distance,
    dureeS: activite.moving_time,
    deniveleM: activite.total_elevation_gain,
    avgHr: activite.average_heartrate ?? null,
    maxHr: activite.max_heartrate ?? null,
    type: activite.type,
  };
}
