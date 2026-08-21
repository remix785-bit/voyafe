import { test } from "node:test";
import assert from "node:assert/strict";
import { seanceDuJourPourRappel, rappelDejaAffiche, texteRappel } from "../js/engines/reminder.js";

function planActif(seances) {
  return { statut: "actif", semaines: [{ numero: 1, seances }] };
}

test("seanceDuJourPourRappel — trouve la séance à venir datée sur aujourd'hui, sur un plan actif", () => {
  const maintenant = new Date(2026, 7, 20);
  const plans = [
    planActif([
      { date: new Date(2026, 7, 19).toISOString(), statut: "a_venir", nom: "Sortie facile" },
      { date: new Date(2026, 7, 20).toISOString(), statut: "a_venir", nom: "Séance de seuil" },
    ]),
  ];
  const seance = seanceDuJourPourRappel(plans, maintenant);
  assert.equal(seance?.nom, "Séance de seuil");
});

test("seanceDuJourPourRappel — ignore les plans non actifs et les séances déjà traitées", () => {
  const maintenant = new Date(2026, 7, 20);
  const plans = [
    planActif([{ date: new Date(2026, 7, 20).toISOString(), statut: "realisee", nom: "Déjà faite" }]),
    { statut: "en_attente", semaines: [{ numero: 1, seances: [{ date: new Date(2026, 7, 20).toISOString(), statut: "a_venir", nom: "Plan en attente" }] }] },
  ];
  assert.equal(seanceDuJourPourRappel(plans, maintenant), null);
});

test("seanceDuJourPourRappel — null si aucune séance datée sur aujourd'hui", () => {
  const maintenant = new Date(2026, 7, 20);
  const plans = [planActif([{ date: new Date(2026, 7, 21).toISOString(), statut: "a_venir", nom: "Demain" }])];
  assert.equal(seanceDuJourPourRappel(plans, maintenant), null);
});

test("rappelDejaAffiche — false si jamais affiché, true seulement le même jour calendaire", () => {
  const maintenant = new Date(2026, 7, 20, 18, 0);
  assert.equal(rappelDejaAffiche(null, maintenant), false);
  assert.equal(rappelDejaAffiche(new Date(2026, 7, 20, 7, 0).toISOString(), maintenant), true);
  assert.equal(rappelDejaAffiche(new Date(2026, 7, 19, 23, 59).toISOString(), maintenant), false);
});

test("texteRappel — inclut la zone et la distance quand disponibles", () => {
  const { titre, corps } = texteRappel({ nom: "Sortie longue", zoneDaniels: "E", distanceKm: 18 });
  assert.equal(titre, "Séance du jour");
  assert.equal(corps, "Zone E — Sortie longue (18.0 km)");
});

test("texteRappel — reste correct sans zone ni distance renseignées", () => {
  const { corps } = texteRappel({ nom: "Renfo" });
  assert.equal(corps, "Renfo");
});
