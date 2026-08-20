import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agregerPeriode,
  debutSemaineIso,
  debutMoisCalendaire,
  statsPerformance,
  distanceHebdoRecente,
  variationPct,
} from "../js/engines/performance.js";

function iso(date) {
  return date.toISOString();
}

test("debutSemaineIso — un jeudi retombe sur le lundi de la même semaine", () => {
  const jeudi = new Date(2026, 7, 20); // 20 août 2026 est un jeudi
  const lundi = debutSemaineIso(jeudi);
  assert.equal(lundi.getDay(), 1);
  assert.equal(lundi.getDate(), 17);
});

test("debutSemaineIso — un lundi reste sur lui-même", () => {
  const lundi = new Date(2026, 7, 17);
  const resultat = debutSemaineIso(lundi);
  assert.equal(resultat.getDate(), 17);
});

test("debutMoisCalendaire — retombe sur le 1er du mois", () => {
  const milieu = new Date(2026, 7, 20);
  const premier = debutMoisCalendaire(milieu);
  assert.equal(premier.getDate(), 1);
  assert.equal(premier.getMonth(), 7);
});

test("agregerPeriode — somme distance/durée/D+ uniquement pour les séances dans l'intervalle [debut, fin)", () => {
  const seances = [
    { date: "2026-08-10T08:00:00Z", distanceKm: 10, dureeMin: 60, deniveleM: 100 },
    { date: "2026-08-17T08:00:00Z", distanceKm: 15, dureeMin: 90, deniveleM: 200 }, // hors période
    { date: "2026-08-12T08:00:00Z", distanceKm: 5, dureeMin: 30, deniveleM: 0 },
  ];
  const debut = new Date("2026-08-10T00:00:00Z");
  const fin = new Date("2026-08-17T00:00:00Z");
  const stats = agregerPeriode(seances, debut, fin);
  assert.equal(stats.distanceKm, 15);
  assert.equal(stats.dureeMin, 90);
  assert.equal(stats.deniveleM, 100);
  assert.equal(stats.nbSeances, 2);
  assert.ok(Math.abs(stats.allureMoyenneMinParKm - 6) < 0.001); // 90min / 15km
});

test("agregerPeriode — aucune séance dans l'intervalle -> stats à zéro, allure null", () => {
  const stats = agregerPeriode([], new Date("2026-01-01"), new Date("2026-01-08"));
  assert.equal(stats.distanceKm, 0);
  assert.equal(stats.nbSeances, 0);
  assert.equal(stats.allureMoyenneMinParKm, null);
});

test("statsPerformance — sépare bien semaine/mois en cours de la période précédente", () => {
  const maintenant = new Date(2026, 7, 20); // jeudi 20 août 2026 -> semaine du 17 au 24
  const seances = [
    { date: iso(new Date(2026, 7, 18)), distanceKm: 10, dureeMin: 60, deniveleM: 0 }, // cette semaine
    { date: iso(new Date(2026, 7, 12)), distanceKm: 8, dureeMin: 50, deniveleM: 0 }, // semaine précédente, ce mois
    { date: iso(new Date(2026, 6, 30)), distanceKm: 20, dureeMin: 120, deniveleM: 0 }, // mois précédent
  ];
  const stats = statsPerformance(seances, maintenant);
  assert.equal(stats.semaine.distanceKm, 10);
  assert.equal(stats.semainePrecedente.distanceKm, 8);
  assert.equal(stats.mois.distanceKm, 18); // 10 + 8, toutes deux en août
  assert.equal(stats.moisPrecedent.distanceKm, 20);
});

test("distanceHebdoRecente — 1 valeur par semaine sur la fenêtre demandée, la plus récente en dernier", () => {
  const maintenant = new Date(2026, 7, 20); // semaine du 17 août
  const seances = [
    { date: iso(new Date(2026, 7, 18)), distanceKm: 10 }, // semaine courante
    { date: iso(new Date(2026, 7, 11)), distanceKm: 20 }, // semaine -1
  ];
  const semaines = distanceHebdoRecente(seances, 4, maintenant);
  assert.equal(semaines.length, 4);
  assert.equal(semaines[3], 10); // dernière = semaine courante
  assert.equal(semaines[2], 20); // avant-dernière = semaine -1
  assert.equal(semaines[1], 0);
  assert.equal(semaines[0], 0);
});

test("variationPct — calcule la variation relative, null si période précédente vide", () => {
  assert.equal(variationPct(12, 10), 20);
  assert.equal(variationPct(8, 10), -20);
  assert.equal(variationPct(5, 0), null);
});
