// Calculateur distance / allure / temps — utile sur piste ou sur une ligne
// droite chronométrée (fractionné, répétitions) : connaissant deux des
// trois valeurs, affiche la troisième. Voir engines/pacing.js
// (resoudreDistanceAllureTemps) pour la relation elle-même.

import * as store from "../../store.js";
import { resoudreDistanceAllureTemps } from "../../engines/pacing.js";
import { vdotFromPerformance, paceZonesForVdot, formatPace, parsePaceLabel, parseDureeLabel, formatDureeCompacte } from "../../engines/vdot.js";

const DISTANCES_RAPIDES = [100, 200, 300, 400, 600, 800, 1000, 1200, 1600, 2000];

export async function render(container) {
  const { profil } = store.getState();

  let zones = null;
  if (profil?.performanceRef) {
    const { vdot } = vdotFromPerformance(profil.performanceRef.distanceM, profil.performanceRef.tempsS);
    zones = paceZonesForVdot(vdot);
  }

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Calculateur distance / allure / temps</h1>
        <p class="muted">Sur piste ou sur une ligne droite chronométrée : renseigne deux valeurs, la troisième se calcule. Laisse vide le champ à trouver.</p>
      </div>

      <div class="card">
        <div class="field">
          <label for="calc-distance">Distance (m)</label>
          <input type="number" id="calc-distance" min="1" placeholder="ex : 400" />
        </div>
        <div class="field-row" id="calc-distances-rapides">
          ${DISTANCES_RAPIDES.map((d) => `<button type="button" class="btn btn--sm" data-distance="${d}">${d} m</button>`).join("")}
        </div>

        <div class="field">
          <label for="calc-allure">Allure (min:s / km)</label>
          <input type="text" id="calc-allure" placeholder="ex : 4:00" />
        </div>
        ${
          zones
            ? `<div class="field-row" id="calc-zones-rapides">
                ${Object.entries(zones)
                  .map(([zone, z]) => `<button type="button" class="btn btn--sm" data-allure="${z.targetLabel}">${zone} · ${z.targetLabel}</button>`)
                  .join("")}
              </div>`
            : ""
        }

        <div class="field">
          <label for="calc-temps">Temps (m:ss ou h:mm:ss)</label>
          <input type="text" id="calc-temps" placeholder="ex : 1:36" />
        </div>

        <button type="button" class="btn btn--primary" id="calc-go">Calculer</button>

        <div id="calc-resultat" style="margin-top:1rem;"></div>
      </div>
    </div>`;

  const champDistance = container.querySelector("#calc-distance");
  const champAllure = container.querySelector("#calc-allure");
  const champTemps = container.querySelector("#calc-temps");
  const resultat = container.querySelector("#calc-resultat");

  container.querySelector("#calc-distances-rapides").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-distance]");
    if (!btn) return;
    champDistance.value = btn.dataset.distance;
  });

  container.querySelector("#calc-zones-rapides")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-allure]");
    if (!btn) return;
    champAllure.value = btn.dataset.allure;
  });

  container.querySelector("#calc-go").addEventListener("click", () => {
    const distanceM = Number(champDistance.value) || null;
    const allureMinParKm = parsePaceLabel(champAllure.value);
    const tempsS = parseDureeLabel(champTemps.value) || null;

    const res = resoudreDistanceAllureTemps({ distanceM, allureMinParKm, tempsS });
    if (!res) {
      resultat.innerHTML = `<p class="muted">Renseigne au moins deux des trois valeurs (distance, allure, temps).</p>`;
      return;
    }

    champDistance.value = Math.round(res.distanceM);
    champAllure.value = formatPace(res.allureMinParKm).replace("/km", "");
    champTemps.value = formatDureeCompacte(res.tempsS);

    resultat.innerHTML = `
      <p><strong>${Math.round(res.distanceM)} m</strong> à <strong>${formatPace(res.allureMinParKm)}</strong> → <strong>${formatDureeCompacte(res.tempsS)}</strong></p>`;
  });
}
