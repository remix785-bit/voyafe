import * as store from "../../store.js";
import {
  parseGpx,
  smoothElevation,
  decouperSegments,
  profilParcoursParDefaut,
  calculerPacingEffortConstant,
  agregerPacingParKm,
  fusionnerNutritionPacing,
} from "../../engines/pacing.js";
import { PacingTimeline } from "../components.js";

let profilParcoursCourant = null;

export async function render(container) {
  const { profil } = store.getState();

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Jour de course</h1>
        <p class="muted">Stratégie : effort métabolique constant GAP-ajusté (Minetti). Import GPX entièrement côté client.</p>
        <div class="field">
          <label for="gpx-input">Fichier GPX du parcours (optionnel)</label>
          <input type="file" id="gpx-input" accept=".gpx" />
        </div>
        <p id="gpx-status" class="muted">Aucun GPX importé — profil plat par défaut utilisé (mode dégradé).</p>
      </div>

      <div class="card">
        <div class="field-row">
          <div class="field">
            <label for="distance-course">Distance totale (km)</label>
            <input type="number" id="distance-course" value="42.195" step="0.001" min="1" />
          </div>
          <div class="field">
            <label for="temps-cible">Temps cible (hh:mm:ss)</label>
            <input type="text" id="temps-cible" value="3:30:00" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="altitude-course">Altitude moyenne (m, optionnel)</label>
            <input type="number" id="altitude-course" value="0" />
          </div>
          <div class="field">
            <label for="acclimatation">Acclimatation altitude</label>
            <select id="acclimatation">
              <option value="aucune">Aucune</option>
              <option value="1-2semaines">1-2 semaines</option>
              <option value="3semaines+">3 semaines +</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="ravito-glucides">Ravitaillement — glucides (g/h)</label>
            <input type="number" id="ravito-glucides" value="60" />
          </div>
          <div class="field">
            <label for="ravito-freq">Fréquence ravitaillement (min)</label>
            <input type="number" id="ravito-freq" value="20" />
          </div>
        </div>
        <button class="btn btn--primary" id="calc-pacing">Générer la fiche de pacing</button>
      </div>

      <div class="card" id="pacing-result" style="display:none;">
        <div class="card__header">
          <h2>Fiche de pacing</h2>
          <button class="btn btn--sm" id="print-pacing">Imprimer / exporter</button>
        </div>
        <div id="pacing-table"></div>
      </div>
    </div>`;

  container.querySelector("#gpx-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const statusEl = container.querySelector("#gpx-status");
    if (!file) return;
    try {
      const text = await file.text();
      const points = parseGpx(text);
      const smoothed = smoothElevation(points);
      profilParcoursCourant = { segments: decouperSegments(smoothed), source: "gpx_upload" };
      const distanceKm = smoothed[smoothed.length - 1].distanceCumulee / 1000;
      const dPlus = profilParcoursCourant.segments.filter((s) => s.denivele > 0).reduce((a, s) => a + s.denivele, 0);
      container.querySelector("#distance-course").value = distanceKm.toFixed(2);
      statusEl.textContent = `GPX importé : ${distanceKm.toFixed(1)} km, D+ ${Math.round(dPlus)} m, ${profilParcoursCourant.segments.length} segments détectés.`;
    } catch (err) {
      statusEl.textContent = `Erreur GPX : ${err.message}`;
      profilParcoursCourant = null;
    }
  });

  container.querySelector("#calc-pacing").addEventListener("click", () => {
    const distanceKm = Number(container.querySelector("#distance-course").value);
    const tempsCibleS = labelVersSecondes(container.querySelector("#temps-cible").value);
    const altitudeM = Number(container.querySelector("#altitude-course").value) || 0;
    const acclimatation = container.querySelector("#acclimatation").value;
    const glucidesGParH = Number(container.querySelector("#ravito-glucides").value);
    const frequenceMin = Number(container.querySelector("#ravito-freq").value);

    const profilParcours = profilParcoursCourant ?? profilParcoursParDefaut(distanceKm * 1000);
    const { segments } = calculerPacingEffortConstant(
      profilParcours.segments,
      tempsCibleS,
      altitudeM > 0 ? { altitudeM, acclimatation } : {}
    );
    // Le pacing est calculé par segment à pente homogène (précision GAP), mais
    // affiché par km — ré-agrégation nécessaire pour une fiche lisible.
    const segmentsParKm = agregerPacingParKm(segments, distanceKm * 1000);
    const timeline = fusionnerNutritionPacing(segmentsParKm, { glucidesGParH, frequenceMin });

    container.querySelector("#pacing-result").style.display = "block";
    container.querySelector("#pacing-table").innerHTML = PacingTimeline(timeline);
  });

  container.querySelector("#print-pacing").addEventListener("click", () => window.print());
}

function labelVersSecondes(label) {
  const parts = label.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(label) || 0;
}
