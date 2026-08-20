import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculerEcart,
  estimerChargeJournaliere,
  urlAutorisation,
  echangerCode,
  rafraichirToken,
} from "../js/data/stravaSync.js";

// Fixture réaliste (champs REST Strava v3 : distance en m, moving_time/elapsed_time
// en s, total_elevation_gain en m, start_date en ISO) — dérivée d'une vraie
// activité de trail (multi-jours, longues pauses -> gros écart moving/elapsed).
const activiteReelle = {
  id: 19742607109,
  name: "Gr34 en courant jour 5/8",
  distance: 19799.7,
  moving_time: 7891,
  elapsed_time: 30824,
  total_elevation_gain: 284.8,
  start_date: "2026-08-14T10:43:48Z",
};

test("calculerEcart — utilise moving_time (pas elapsed_time) pour l'allure, correct sur une activité avec longues pauses", () => {
  const { distanceKm, dureeMin, deniveleM, allureMoyenneMinParKm } = calculerEcart(activiteReelle, null);
  assert.ok(Math.abs(distanceKm - 19.7997) < 0.001);
  assert.ok(Math.abs(dureeMin - 7891 / 60) < 0.001);
  assert.equal(deniveleM, 284.8);
  // 7891s / 60 / 19.7997km ≈ 6.64 min/km — pas 30824/60/19.7997 ≈ 25.9 (elapsed, faussé par les pauses)
  assert.ok(Math.abs(allureMoyenneMinParKm - 6.64) < 0.05, `allure inattendue: ${allureMoyenneMinParKm}`);
});

test("calculerEcart — sans séance planifiée, ecart est null", () => {
  const { ecart } = calculerEcart(activiteReelle, null);
  assert.equal(ecart, null);
});

test("calculerEcart — avec séance planifiée, calcule l'écart de volume et d'allure", () => {
  const seancePlanifiee = { volumeSeanceMin: 90, allureCibleMinParKm: 6.0 };
  const { ecart } = calculerEcart(activiteReelle, seancePlanifiee);
  assert.ok(ecart);
  assert.ok(Math.abs(ecart.ecartVolumeMin - (7891 / 60 - 90)) < 0.01);
  assert.ok(ecart.ecartAllureMinParKm > 0, "allure réelle plus lente que la cible -> écart positif");
});

test("estimerChargeJournaliere — proportionnelle à la durée réelle (moving_time) et au RPE", () => {
  const chargeRpe5 = estimerChargeJournaliere(activiteReelle, 5);
  const chargeRpe8 = estimerChargeJournaliere(activiteReelle, 8);
  assert.ok(Math.abs(chargeRpe5 - (7891 / 60) * 5) < 0.01);
  assert.ok(chargeRpe8 > chargeRpe5, "RPE plus élevé -> charge plus élevée");
});

test("estimerChargeJournaliere — active sans moving_time renseigné ne casse pas (0)", () => {
  assert.equal(estimerChargeJournaliere({}, 5), 0);
});

test("urlAutorisation — construit l'URL OAuth avec les bons scopes (lecture activités privées incluses)", () => {
  const url = new URL(urlAutorisation({ clientId: "12345", redirectUri: "https://example.test/app/" }));
  assert.equal(url.origin + url.pathname, "https://www.strava.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "12345");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/app/");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "read,activity:read_all");
});

test("echangerCode — POST vers /oauth/token avec grant_type=authorization_code et renvoie les jetons", async () => {
  const appels = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    appels.push({ url: String(url), body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ access_token: "acc-1", refresh_token: "ref-1", expires_at: 1234567890 }),
    };
  };
  try {
    const jetons = await echangerCode({ clientId: "id", clientSecret: "secret", code: "code-abc" });
    assert.equal(appels[0].url, "https://www.strava.com/oauth/token");
    assert.equal(appels[0].body.grant_type, "authorization_code");
    assert.equal(appels[0].body.code, "code-abc");
    assert.equal(jetons.access_token, "acc-1");
    assert.equal(jetons.refresh_token, "ref-1");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("rafraichirToken — POST vers /oauth/token avec grant_type=refresh_token", async () => {
  const appels = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    appels.push({ url: String(url), body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ access_token: "acc-2", refresh_token: "ref-2", expires_at: 1234567999 }),
    };
  };
  try {
    const jetons = await rafraichirToken({ clientId: "id", clientSecret: "secret", refreshToken: "ref-old" });
    assert.equal(appels[0].body.grant_type, "refresh_token");
    assert.equal(appels[0].body.refresh_token, "ref-old");
    assert.equal(jetons.access_token, "acc-2");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("echangerCode / rafraichirToken — propagent une erreur explicite si Strava refuse", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => "invalid_grant" });
  try {
    await assert.rejects(() => echangerCode({ clientId: "id", clientSecret: "secret", code: "bad" }), /400/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
