import * as repo from "../data/repo.js";
import { acwr } from "../engines/load.js";
import { dailyMacroNeeds, fuelingCarbsPerHour, hydrationNeeds } from "../engines/nutrition.js";
import { escapeHtml, formatDateFr, card, emptyState, badge } from "./components.js";
import { buildDailyLoads } from "./monitoring.js";

function joursAvant(dateCourse) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateCourse);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (24 * 3600 * 1000));
}

export async function renderNutrition(params, container) {
  const journal = await repo.listJournal();
  const poidsKg = journal.find((e) => e.poidsKg)?.poidsKg ?? null;
  const objectifPrincipal = await repo.getObjectifPrincipal();
  const dailyLoads = await buildDailyLoads();
  const { ratio } = acwr(dailyLoads, new Date().toISOString().slice(0, 10));
  const joursAvantCourse = objectifPrincipal ? joursAvant(objectifPrincipal.dateCourse) : null;

  const macros = poidsKg
    ? dailyMacroNeeds({
        weightKg: poidsKg,
        acwrRatio: ratio,
        joursAvantCourse,
        distanceCourseKm: objectifPrincipal?.distanceKm,
      })
    : null;

  const macrosCard = macros
    ? card(`
        <h2>Besoins quotidiens</h2>
        <p class="muted" style="font-size:0.8rem">Basé sur un poids de ${poidsKg} kg (dernière entrée journal) et la charge d'entraînement actuelle (ACWR ${
          Number.isFinite(ratio) ? ratio.toFixed(2) : "--"
        } → ${escapeHtml(macros.chargeNiveau)}).</p>
        ${macros.carbLoading ? `<p>${badge("Charge glucidique pré-course", "warning")} course dans ${joursAvantCourse} jour(s) — apport en glucides maximisé pour saturer les réserves de glycogène.</p>` : ""}
        <div class="grid-3">
          <div class="stat"><div class="value">${macros.glucidesG} g</div><div class="label">Glucides (${macros.glucidesGKg} g/kg)</div></div>
          <div class="stat"><div class="value">${macros.proteinesG} g</div><div class="label">Protéines (${macros.proteinesGKg} g/kg)</div></div>
          <div class="stat"><div class="value">${macros.lipidesG} g</div><div class="label">Lipides (${macros.lipidesGKg} g/kg)</div></div>
        </div>
      `)
    : card(emptyState("Renseigne ton poids dans le journal quotidien pour calculer tes besoins.", `<a class="btn" href="#/journal">Aller au journal</a>`));

  container.innerHTML = `
    ${macrosCard}
    ${card(`
      <h3>Ravitaillement course</h3>
      <p class="muted" style="font-size:0.8rem">Apport glucidique en g/h selon la durée de l'effort (épreuves longues : apport régulier plutôt que concentré).</p>
      <form id="form-fueling">
        <label for="dureeMin">Durée prévue (min)</label>
        <input id="dureeMin" name="dureeMin" type="number" min="0" step="5" value="90" />
        <label for="temperatureC">Température estimée (°C)</label>
        <input id="temperatureC" name="temperatureC" type="number" step="1" value="18" />
      </form>
      <div id="fueling-result" style="margin-top:12px"></div>
    `)}
  `;

  const form = container.querySelector("#form-fueling");
  function updateFueling() {
    const dureeMin = parseFloat(form.dureeMin.value) || 0;
    const temperatureC = parseFloat(form.temperatureC.value);
    const carbsPerHour = fuelingCarbsPerHour(dureeMin);
    const hydration = hydrationNeeds({ dureeMin, temperatureC });
    container.querySelector("#fueling-result").innerHTML = `
      <div class="grid-3">
        <div class="stat"><div class="value">${carbsPerHour} g/h</div><div class="label">Glucides</div></div>
        <div class="stat"><div class="value">${hydration?.mlPerHour ?? 0} ml/h</div><div class="label">Hydratation</div></div>
        <div class="stat"><div class="value">${hydration?.sodiumMgPerHour ?? 0} mg/h</div><div class="label">Sodium</div></div>
      </div>
      ${hydration?.hyponatremieAlerte ? `<p>${badge("Vigilance hyponatrémie", "danger")} épreuve longue par forte chaleur — ne jamais s'hydrater sans électrolytes.</p>` : ""}
      <p class="muted" style="font-size:0.78rem">Rappel : ne jamais tester un nouveau produit le jour de la course — reproduire strictement ce qui a été validé à l'entraînement.</p>
    `;
  }
  form.addEventListener("input", updateFueling);
  updateFueling();
}
