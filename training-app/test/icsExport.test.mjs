import { test } from "node:test";
import assert from "node:assert/strict";
import { genererIcs } from "../js/data/icsExport.js";

function planFixture(seances) {
  return {
    id: "plan_test",
    discipline: "route",
    objectif: "10K, avec virgule",
    semaines: [{ numero: 1, phase: "developpement", seances }],
  };
}

test("genererIcs — ignore les séances sans date précise", () => {
  const { ics, nbEvenements } = genererIcs(
    planFixture([
      { nom: "Endurance", zoneDaniels: "E", volumeSeanceMin: 40, distanceKm: 8, date: null },
      { nom: "Seuil", zoneDaniels: "T", volumeSeanceMin: 35, distanceKm: 6, allureCibleMinParKm: 4.2, date: "2026-09-01T06:00:00.000Z" },
    ])
  );
  assert.equal(nbEvenements, 1);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("genererIcs — événement journée entière avec DTEND = lendemain (exclusif, convention ICS)", () => {
  const { ics } = genererIcs(
    planFixture([{ nom: "Sortie longue", zoneDaniels: "E", volumeSeanceMin: 90, distanceKm: 15, date: "2026-09-05T06:00:00.000Z" }])
  );
  assert.match(ics, /DTSTART;VALUE=DATE:20260905/);
  assert.match(ics, /DTEND;VALUE=DATE:20260906/);
});

test("genererIcs — échappe virgules/points-virgules dans SUMMARY et DESCRIPTION (RFC 5545)", () => {
  const { ics } = genererIcs(
    planFixture([
      { nom: "Fractionné: 6x800m, récup 90s", zoneDaniels: "I", volumeSeanceMin: 45, distanceKm: 10, date: "2026-09-02T06:00:00.000Z" },
    ])
  );
  // Après dépliage (une ligne logique peut être repliée sur plusieurs lignes physiques)
  const depliee = ics.replace(/\r\n /g, "");
  assert.match(depliee, /SUMMARY:Fractionné: 6x800m\\, récup 90s \(I\)/);
});

test("genererIcs — replie les lignes DESCRIPTION dépassant 75 octets (RFC 5545 §3.1)", () => {
  const { ics } = genererIcs(
    planFixture([
      {
        nom: "Sortie longue avec un nom de séance volontairement très très long pour dépasser 75 octets",
        zoneDaniels: "E",
        volumeSeanceMin: 120,
        distanceKm: 22,
        allureCibleMinParKm: 5.5,
        structureDetaillee: { format: "Continu, variante développement: 4-6 lignes droites 15-20s allure R en fin de séance" },
        date: "2026-09-06T06:00:00.000Z",
      },
    ])
  );
  const lignes = ics.split("\r\n");
  for (const ligne of lignes) {
    assert.ok(new TextEncoder().encode(ligne).length <= 75, `ligne trop longue (${ligne.length} car.): ${ligne}`);
  }
  // La ligne repliée doit être reconstructible en supprimant "\r\n " (CRLF + espace de continuation).
  // La virgule est échappée ("\," ) dans la valeur TEXT, conformément à RFC 5545 §3.3.11.
  assert.match(ics.replace(/\r\n /g, ""), /Programme : Continu\\, variante développement/);
});

test("genererIcs — calendrier vide si aucune séance datée, mais structure ICS valide", () => {
  const { ics, nbEvenements } = genererIcs(planFixture([{ nom: "Endurance", zoneDaniels: "E", volumeSeanceMin: 40, date: null }]));
  assert.equal(nbEvenements, 0);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});
