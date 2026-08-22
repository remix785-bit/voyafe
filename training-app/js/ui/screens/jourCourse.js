import * as store from "../../store.js";
import {
  parseGpx,
  smoothElevation,
  decouperSegments,
  detecterPointsSignificatifs,
  construireTempsCumuleADistance,
  profilParcoursParDefaut,
  calculerPacingEffortConstant,
  agregerPacingParKm,
  fusionnerNutritionPacing,
} from "../../engines/pacing.js";
import { latLonADistance } from "../../engines/geoMap.js";
import { PacingTimeline, ProfilCourseChart, RouteMapFallback, formatDureeHM } from "../components.js";

let profilParcoursCourant = null;
let mapInstance = null;

/**
 * Carte du parcours : vraie carte (Leaflet + tuiles OpenStreetMap/CartoDB,
 * chargées en CDN, cf. index.html) quand elle est disponible, sinon repli
 * automatique sur RouteMapFallback (tracé GPS exact, sans fond de carte,
 * 100% local) — pas de connexion, CDN bloqué, ou pas de GPX importé (mode
 * dégradé, pas de coordonnées GPS à afficher).
 */
function initierCarte(container, pointsProfil, reperesKm, reperesSignificatifs, timeline) {
  const mapEl = container.querySelector("#route-map");
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  if (typeof window.L === "undefined" || pointsProfil[0]?.lat == null) {
    mapEl.innerHTML = RouteMapFallback(pointsProfil, reperesKm, reperesSignificatifs, timeline);
    return;
  }
  mapEl.innerHTML = "";

  const themeSombre = document.documentElement.getAttribute("data-theme") !== "light";
  const tileUrl = themeSombre
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = themeSombre
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  const map = window.L.map(mapEl, { scrollWheelZoom: false });
  window.L.tileLayer(tileUrl, { attribution, maxZoom: 18 }).addTo(map);

  const latlngs = pointsProfil.map((p) => [p.lat, p.lon]);
  const route = window.L.polyline(latlngs, { color: "var(--color-accent-strong)", weight: 4, opacity: 0.9, lineJoin: "round" }).addTo(map);
  map.fitBounds(route.getBounds(), { padding: [24, 24] });

  const marqueur = (latlng, color, tooltip) =>
    window.L.circleMarker(latlng, { radius: 6, color: "var(--color-surface)", weight: 2, fillColor: color, fillOpacity: 1 })
      .bindTooltip(tooltip, { direction: "top" })
      .addTo(map);

  marqueur(latlngs[0], "var(--color-structural-strong)", "Départ");
  marqueur(latlngs[latlngs.length - 1], "var(--color-functional-strong)", "Arrivée");

  for (const r of reperesKm) {
    const ll = latLonADistance(pointsProfil, r.distanceM);
    if (ll) window.L.circleMarker([ll.lat, ll.lon], { radius: 4, color: "var(--color-surface)", weight: 1.5, fillColor: "var(--color-accent-strong)", fillOpacity: 1 })
      .bindTooltip(`${r.label} km — ${formatDureeHM(r.tempsCumuleMin)}`, { direction: "top" })
      .addTo(map);
  }

  for (const r of reperesSignificatifs) {
    const ll = latLonADistance(pointsProfil, r.distanceM);
    if (!ll) continue;
    const estSommet = r.type === "sommet";
    marqueur(
      [ll.lat, ll.lon],
      estSommet ? "var(--color-danger, #d9534f)" : "var(--color-accent, #4a90d9)",
      `${estSommet ? "▲" : "▼"} ${Math.round(r.altitude)} m — ${formatDureeHM(r.tempsCumuleMin)}`
    );
  }

  for (const t of timeline) {
    if (!t.actionNutrition) continue;
    const ll = latLonADistance(pointsProfil, t.km * 1000);
    if (ll) marqueur([ll.lat, ll.lon], "var(--color-warning, #e0a800)", t.actionNutrition);
  }

  mapInstance = map;
  // #pacing-result vient de passer de display:none à block juste avant cet
  // appel : Leaflet a pu mesurer un conteneur de taille nulle au premier
  // rendu — un invalidateSize() au tick suivant force un recalcul correct.
  requestAnimationFrame(() => map.invalidateSize());
}

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
        <div id="route-map" class="route-map"></div>
        <div id="profil-course-chart"></div>
        <p id="pacing-plafond-note" class="muted" style="display:none;">Certaines descentes ont été plafonnées à une allure réaliste (jamais plus de ~18% plus rapide que ton allure à plat) — le modèle Minetti pur suggérerait des allures intenables sur ces portions ; le temps a été redistribué sur le reste du parcours pour conserver ton objectif exact.</p>
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
      profilParcoursCourant = { segments: decouperSegments(smoothed), points: smoothed, source: "gpx_upload" };
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

    const distanceTotaleM = distanceKm * 1000;
    const profilParcours = profilParcoursCourant ?? profilParcoursParDefaut(distanceTotaleM);
    const facteurGapCalibre = store.planActif()?.profilCourant?.facteurGapCalibre ?? 1;
    const { segments, plafonnageApplique } = calculerPacingEffortConstant(
      profilParcours.segments,
      tempsCibleS,
      altitudeM > 0 ? { altitudeM, acclimatation } : {},
      facteurGapCalibre
    );
    // Le pacing est calculé par segment à pente homogène (précision GAP), mais
    // affiché par km — ré-agrégation nécessaire pour une fiche lisible.
    const segmentsParKm = agregerPacingParKm(segments, distanceTotaleM);
    const timeline = fusionnerNutritionPacing(segmentsParKm, { glucidesGParH, frequenceMin });

    // Modélisation propre à la trace : profil altimétrique réel du GPX importé
    // (ou une ligne plate en mode dégradé), avec temps de passage à chaque km
    // et aux points significatifs du relief (sommets/creux) de CE parcours.
    const pointsProfil = profilParcoursCourant?.points ?? [
      { distanceCumulee: 0, altitude: 0 },
      { distanceCumulee: distanceTotaleM, altitude: 0 },
    ];
    const tempsADistance = construireTempsCumuleADistance(segments);
    let distCumKm = 0;
    const reperesKm = segmentsParKm.map((s, i) => {
      distCumKm += s.distance;
      const estPartiel = i === segmentsParKm.length - 1 && distCumKm < distanceTotaleM - 1;
      return {
        distanceM: distCumKm,
        tempsCumuleMin: s.tempsCumuleMin,
        label: estPartiel ? `${(distCumKm / 1000).toFixed(1)}` : `${Math.round(distCumKm / 1000)}`,
      };
    });
    const reperesSignificatifs = profilParcoursCourant?.points
      ? detecterPointsSignificatifs(profilParcoursCourant.points).map((r) => ({
          ...r,
          tempsCumuleMin: tempsADistance(r.distanceM),
        }))
      : [];

    container.querySelector("#pacing-result").style.display = "block";
    initierCarte(container, pointsProfil, reperesKm, reperesSignificatifs, timeline);
    container.querySelector("#profil-course-chart").innerHTML = ProfilCourseChart(
      pointsProfil,
      reperesKm,
      reperesSignificatifs,
      timeline
    );
    container.querySelector("#pacing-table").innerHTML = PacingTimeline(timeline);
    container.querySelector("#pacing-plafond-note").style.display = plafonnageApplique ? "block" : "none";
  });

  container.querySelector("#print-pacing").addEventListener("click", () => window.print());
}

function labelVersSecondes(label) {
  const parts = label.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(label) || 0;
}
