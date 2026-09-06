import { test } from "node:test";
import assert from "node:assert/strict";
import { ajusterHydratationChaleur } from "../js/engines/nutrition.js";

test("ajusterHydratationChaleur — aucune majoration en dessous de 20°C (cibles de base déjà calibrées tempéré)", () => {
  const r = ajusterHydratationChaleur([450, 750], 15);
  assert.deepEqual(r, { min: 450, max: 750, majorationPct: 0 });
});

test("ajusterHydratationChaleur — majore la cible au-dessus de 20°C, proportionnellement à l'écart", () => {
  const r30 = ajusterHydratationChaleur([450, 750], 30);
  const r25 = ajusterHydratationChaleur([450, 750], 25);
  assert.ok(r30.min > r25.min && r30.max > r25.max, "une chaleur plus forte doit majorer davantage");
  assert.ok(r25.min > 450, "au-dessus de 20°C, la cible basse doit être majorée");
});

test("ajusterHydratationChaleur — une humidité élevée majore davantage qu'une humidité modérée, à température égale", () => {
  const rHumide = ajusterHydratationChaleur([450, 750], 28, 90);
  const rSec = ajusterHydratationChaleur([450, 750], 28, 40);
  assert.ok(rHumide.min > rSec.min, "l'humidité élevée doit ajouter à la majoration liée à la chaleur");
});

test("ajusterHydratationChaleur — la majoration est plafonnée (pas d'explosion à température extrême)", () => {
  const r = ajusterHydratationChaleur([450, 750], 45, 95);
  assert.ok(r.majorationPct <= 60, `majoration attendue plafonnée à 60%, obtenu ${r.majorationPct}%`);
});
