import * as store from "../../store.js";
import { dailyMacros, preRaceCarbLoad, raceFuelingTargets } from "../../engines/nutrition.js";

export async function render(container) {
  const { profil } = store.getState();
  const poids = profil?.weightKg ?? 70;

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Nutrition</h1>
        <div class="field">
          <label for="poids-nutrition">Poids (kg)</label>
          <input type="number" id="poids-nutrition" value="${poids}" min="30" max="150" />
        </div>
        <div class="field">
          <label for="charge-nutrition">Niveau de charge d'entraînement</label>
          <select id="charge-nutrition">
            <option value="faible">Faible</option>
            <option value="moderee" selected>Modérée</option>
            <option value="elevee">Élevée</option>
          </select>
        </div>
      </div>

      <div class="card" id="macros-card"></div>

      <div class="card" id="preload-card"></div>

      <div class="card">
        <h2>Ravitaillement en course</h2>
        <div class="field-row">
          <div class="field">
            <label for="duree-course">Durée estimée (min)</label>
            <input type="number" id="duree-course" value="180" min="30" />
          </div>
          <div class="field">
            <label for="type-course">Type</label>
            <select id="type-course">
              <option value="route">Route</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>
        </div>
        <div id="fueling-card"></div>
      </div>
    </div>`;

  const update = () => {
    const p = Number(container.querySelector("#poids-nutrition").value) || 70;
    const charge = container.querySelector("#charge-nutrition").value;
    const macros = dailyMacros(p, charge);
    container.querySelector("#macros-card").innerHTML = `
      <h2>Apports quotidiens</h2>
      <table class="pacing-timeline">
        <thead><tr><th>Macronutriment</th><th>Cible</th><th>Plage</th></tr></thead>
        <tbody>
          <tr><td>Glucides</td><td class="data">${macros.glucidesG} g</td><td class="data">${macros.glucidesRange.join("-")} g</td></tr>
          <tr><td>Protéines</td><td class="data">${macros.proteinesG} g</td><td class="data">${macros.proteinesRange.join("-")} g</td></tr>
          <tr><td>Lipides</td><td class="data">${macros.lipidesG} g</td><td class="data">${macros.lipidesRange.join("-")} g</td></tr>
        </tbody>
      </table>`;

    const preload = preRaceCarbLoad(p);
    container.querySelector("#preload-card").innerHTML = `
      <h2>Charge glucidique pré-course</h2>
      <p>Courses &gt;90 min : <span class="data">${preload.glucidesGParJourMin}-${preload.glucidesGParJourMax} g/j</span> sur les ${preload.dureeHeures.join("-")}h précédentes.</p>
      <p class="muted">${preload.consigne}</p>`;
  };

  const updateFueling = () => {
    const duree = Number(container.querySelector("#duree-course").value) || 0;
    const type = container.querySelector("#type-course").value;
    const targets = raceFuelingTargets(duree, type);
    const el = container.querySelector("#fueling-card");
    if (!targets.applicable) {
      el.innerHTML = `<p class="muted">${targets.note}</p>`;
      return;
    }
    el.innerHTML = `
      <table class="pacing-timeline">
        <tbody>
          <tr><td>Glucides</td><td class="data">${targets.glucidesGParH.join("-")} g/h</td></tr>
          ${targets.proteinesGParH ? `<tr><td>Protéines</td><td class="data">${targets.proteinesGParH.join("-")} g/h</td></tr>` : ""}
          <tr><td>Hydratation</td><td class="data">${targets.hydratationMlParH.join("-")} mL/h</td></tr>
        </tbody>
      </table>
      <p class="muted">${targets.sodiumNote}</p>
      ${targets.testAvertissement ? `<p class="badge-warning">${targets.testAvertissement}</p>` : ""}`;
  };

  update();
  updateFueling();
  container.querySelector("#poids-nutrition").addEventListener("input", update);
  container.querySelector("#charge-nutrition").addEventListener("change", update);
  container.querySelector("#duree-course").addEventListener("input", updateFueling);
  container.querySelector("#type-course").addEventListener("change", updateFueling);
}
