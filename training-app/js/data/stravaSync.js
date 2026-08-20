// Intégration Strava — Option A retenue (Partie III §5) : token d'accès
// personnel généré depuis la page des paramètres API Strava, sans flux OAuth
// complet. Le client secret n'est jamais exposé (site statique public).
// Évolution possible documentée : Option B, relais OAuth léger (serverless).

const API_BASE = "https://www.strava.com/api/v3";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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
