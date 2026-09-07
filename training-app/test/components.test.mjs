import { test } from "node:test";
import assert from "node:assert/strict";
import { libellePhase, StatStrip } from "../js/ui/components.js";

test("libellePhase — libellés français accentués pour les clés internes de phase, clé inconnue renvoyée telle quelle", () => {
  assert.equal(libellePhase("entretien"), "Entretien");
  assert.equal(libellePhase("base"), "Base");
  assert.equal(libellePhase("developpement"), "Développement");
  assert.equal(libellePhase("taper"), "Affûtage");
  assert.equal(libellePhase("inconnue"), "inconnue");
});

test("StatStrip — une valeur longue (>7 caractères, ex. un libellé de phase) reçoit la classe compacte pour éviter de déborder de sa tuile sur mobile", () => {
  const html = StatStrip([
    { label: "Distance", value: "54.3 km" },
    { label: "Phase", value: "Développement" },
  ]);
  assert.ok(html.includes('stat-tile__value--compact">Développement<'), "valeur longue -> classe compacte");
  assert.ok(!html.match(/stat-tile__value--compact">54\.3 km</), "valeur courte -> pas de classe compacte");
});
