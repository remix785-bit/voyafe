import * as store from "../../store.js";
import {
  parseGpx,
  smoothElevation,
  decouperSegments,
  detecterPointsSignificatifs,
  construireTempsCumuleADistance,
  profilParcoursParDefaut,
  allurePlatEquivalenteCible,
  genererPlanPacing,
  agregerPacingParKm,
  fusionnerNutritionPacing,
  detecterAlertesPlan,
} from "../../engines/pacing.js";
import { latLonADistance } from "../../engines/geoMap.js";
import { parseDureeLabel, adjustPaceForAltitude } from "../../engines/vdot.js";
import { PacingTimeline, ProfilCourseChart, RouteMapFallback, formatDureeHM } from "../components.js";

let profilParcoursCourant = null;
let mapInstance = null;

/**
 * Style MapLibre : fond de carte OpenTopoMap — relief (estompage + courbes
 * de niveau) directement "cuit" dans les tuiles elles-mêmes, à la
 * différence d'un relief 3D en géométrie réelle (essayé au tour précédent
 * via une source raster-dem externe qui a laissé la carte entièrement
 * vide — cf. historique Git). Ici, chaque tuile est une simple image comme
 * n'importe quel autre fond de carte raster : même mécanisme, même
 * fiabilité que les tuiles plates utilisées juste avant, mais avec le
 * relief visible dessus. Pas de variante sombre chez OpenTopoMap (comme
 * une vraie carte IGN, le style topo reste identique quel que soit le
 * thème de l'appli) — seul le chrome autour (contrôles, cartes) suit le
 * thème sombre/clair.
 * IMPORTANT : `{z}/{x}/{y}` sont les SEULS tokens que le moteur de tuiles
 * MapLibre substitue dans une URL — pas de `{r}` façon Leaflet (retina),
 * qui resterait littéralement dans l'URL et ferait échouer toutes les
 * requêtes de tuiles (bug réel d'un essai précédent, corrigé).
 */
function construireStyleCarte() {
  const attribution =
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributeurs, SRTM | style : © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)';
  return {
    version: 8,
    sources: {
      "base-tiles": {
        type: "raster",
        tiles: [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution,
        maxzoom: 17,
      },
    },
    layers: [{ id: "base-tiles-layer", type: "raster", source: "base-tiles" }],
  };
}

/** Couleur CSS résolue (pas la chaîne var()) : les propriétés `paint` de
 * MapLibre sont interprétées par son propre moteur de style, pas par le CSS
 * du navigateur — un "var(--foo)" littéral y est une valeur de couleur
 * invalide (contrairement aux composants SVG de l'appli, où le navigateur
 * résout var() lui-même). Les marqueurs custom échappent à cette règle : ils
 * passent par un vrai élément DOM + une règle CSS, donc var() y fonctionne. */
function couleurResolue(nomVariable, secours) {
  const valeur = getComputedStyle(document.documentElement).getPropertyValue(nomVariable).trim();
  return valeur || secours;
}

/**
 * Carte du parcours : vraie carte (MapLibre GL, tuiles OpenTopoMap chargées
 * en CDN, cf. index.html — relief cuit dans les tuiles), caméra inclinée
 * pour une perspective 3D, sinon repli automatique sur RouteMapFallback
 * (tracé GPS exact, sans fond de carte, 100% local) — pas de connexion, CDN
 * bloqué, ou pas de GPX importé (mode dégradé, pas de coordonnées GPS à
 * afficher). Volontairement épurée : seuls départ/arrivée/ravitaillement
 * sont marqués — pas de pastille par km ni par sommet/creux (le relief du
 * fond de carte topo montre déjà où sont les bosses/creux, plus besoin de
 * le dupliquer en marqueurs ; le détail km par km reste dans le tableau de
 * pacing en dessous).
 */
function initierCarte(container, pointsProfil, timeline) {
  const mapEl = container.querySelector("#route-map");
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  if (typeof window.maplibregl === "undefined" || pointsProfil[0]?.lat == null) {
    mapEl.innerHTML = RouteMapFallback(pointsProfil, timeline);
    return;
  }
  mapEl.innerHTML = "";

  // Une carte reste un tiers technique de plus que le reste de l'appli
  // (CDN, tuiles) : si quoi que ce soit échoue de façon inattendue à la
  // construction, on retombe sur la carte schématique plutôt que de
  // laisser toute la fiche de pacing (graphique + tableau, générés juste
  // après cet appel) plantée par une exception non rattrapée.
  try {
    const lons = pointsProfil.map((p) => p.lon);
    const lats = pointsProfil.map((p) => p.lat);
    const bounds = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];

    const map = new window.maplibregl.Map({
      container: mapEl,
      style: construireStyleCarte(),
      pitch: 55,
      bearing: -12,
    });
    map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.scrollZoom.disable();

    // Diagnostic visible sans les outils dev (utile pour un utilisateur non
    // technique) : si la carte ne finit jamais de charger (tuiles bloquées,
    // connexion très lente...), un message apparaît directement dans la
    // carte plutôt qu'un rectangle vide muet.
    let carteChargee = false;
    const diagTimeout = setTimeout(() => {
      if (!carteChargee) {
        const msg = document.createElement("p");
        msg.className = "muted";
        msg.style.cssText = "position:absolute; left:8px; right:8px; bottom:8px; margin:0; font-size:0.72rem; z-index:5;";
        msg.textContent = "La carte met du temps à charger (connexion lente, ou fond de carte indisponible) — vérifie ta connexion, ou réessaie.";
        mapEl.appendChild(msg);
      }
    }, 6000);
    map.on("error", (e) => console.warn("Carte du parcours — erreur MapLibre (tuile indisponible) :", e?.error ?? e));

    const marqueur = (lonLat, color, texte) => {
      const el = document.createElement("div");
      el.className = "route-map-marker";
      el.style.setProperty("--marker-color", color);
      new window.maplibregl.Marker({ element: el })
        .setLngLat(lonLat)
        .setPopup(new window.maplibregl.Popup({ offset: 14, closeButton: false }).setText(texte))
        .addTo(map);
    };

    map.on("load", () => {
      carteChargee = true;
      clearTimeout(diagTimeout);
      // fitBounds APRÈS le chargement du style (plutôt que bounds+pitch dans
      // le constructeur) : plus fiable avec une caméra déjà inclinée.
      map.fitBounds(bounds, { padding: 40, pitch: 55, bearing: -12, duration: 0 });

      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: pointsProfil.map((p) => [p.lon, p.lat]) } },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": couleurResolue("--color-accent-strong", "#0b7ba6"), "line-width": 4, "line-opacity": 0.95 },
      });

      marqueur([pointsProfil[0].lon, pointsProfil[0].lat], "var(--color-structural-strong)", "Départ");
      const dernier = pointsProfil[pointsProfil.length - 1];
      marqueur([dernier.lon, dernier.lat], "var(--color-functional-strong)", "Arrivée");

      for (const t of timeline) {
        if (!t.actionNutrition) continue;
        const ll = latLonADistance(pointsProfil, t.km * 1000);
        if (ll) marqueur([ll.lon, ll.lat], "var(--color-warning, #e0a800)", t.actionNutrition);
      }
    });

    mapInstance = map;
    // #pacing-result vient de passer de display:none à block juste avant cet
    // appel : MapLibre a pu mesurer un conteneur de taille nulle au premier
    // rendu — un resize() au tick suivant force un recalcul correct.
    requestAnimationFrame(() => map.resize());
  } catch (err) {
    console.warn("Carte du parcours — échec de l'initialisation MapLibre, repli sur la carte schématique :", err);
    mapEl.innerHTML = RouteMapFallback(pointsProfil, timeline);
  }
}

export async function render(container) {
  const { profil } = store.getState();

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Jour de course</h1>
        <p class="muted">Stratégie : effort constant, pas allure constante — l'allure fluctue avec la pente (GAP Minetti), bascule en marche active au-delà du seuil réglé, et le rythme se pilote par l'effort, jamais l'inverse. Import GPX entièrement côté client.</p>
        <div class="field">
          <label>Fichier GPX du parcours (optionnel)</label>
          <label class="btn" for="gpx-input" style="cursor:pointer; display:inline-flex;">Choisir un fichier GPX</label>
          <input type="file" id="gpx-input" accept=".gpx" style="display:none;" />
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
            <label for="dplus-heure">Capacité D+/heure en marche (m/h)</label>
            <input type="number" id="dplus-heure" value="550" min="100" />
          </div>
          <div class="field">
            <label for="seuil-marche">Seuil bascule course/marche (%)</label>
            <input type="number" id="seuil-marche" value="15" min="1" max="60" />
          </div>
        </div>
        <div class="field">
          <label for="technicite">Technicité du terrain</label>
          <select id="technicite">
            <option value="roulant">Chemin roulant / piste large</option>
            <option value="modere">Sentier technique modéré (racines, cailloux épars)</option>
            <option value="technique">Sentier très technique (pierrier, passages exposés)</option>
            <option value="extreme">Terrain extrême (câbles, désescalade)</option>
          </select>
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
            <label for="ravito-freq">Fréquence rappel nutrition (min)</label>
            <input type="number" id="ravito-freq" value="35" />
          </div>
        </div>
        <button class="btn btn--primary" id="calc-pacing">Générer la fiche de pacing</button>
      </div>

      <div class="card" id="pacing-result" style="display:none;">
        <div class="card__header">
          <h2>Fiche de pacing</h2>
          <button class="btn btn--sm" id="print-pacing">Imprimer / exporter</button>
        </div>
        <p id="pacing-totaux" class="muted"></p>
        <div id="pacing-alertes"></div>
        <div id="route-map" class="route-map"></div>
        <div id="profil-course-chart"></div>
        <p class="muted">Reste en zone d'effort Z2 sur l'ensemble des montées en première moitié de course, quelle que soit l'allure GPS qui en résulte — le plan de pacing est un guide d'effort, pas un chrono à respecter au segment près.</p>
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
    const tempsCibleS = parseDureeLabel(container.querySelector("#temps-cible").value);
    const dplusParHeure = Number(container.querySelector("#dplus-heure").value) || 550;
    const seuilMarchePct = (Number(container.querySelector("#seuil-marche").value) || 15) / 100;
    const technicite = container.querySelector("#technicite").value;
    const altitudeM = Number(container.querySelector("#altitude-course").value) || 0;
    const acclimatation = container.querySelector("#acclimatation").value;
    const glucidesGParH = Number(container.querySelector("#ravito-glucides").value);
    const frequenceMin = Number(container.querySelector("#ravito-freq").value);

    const distanceTotaleM = distanceKm * 1000;
    const profilParcours = profilParcoursCourant ?? profilParcoursParDefaut(distanceTotaleM);
    const facteurGapCalibre = store.planActif()?.profilCourant?.facteurGapCalibre ?? 1;

    // §13 : allure plat-équivalente cible, calibrée une fois à partir de
    // l'objectif global (distance + D+/100 en km-équivalent), puis appliquée
    // segment par segment (§7/§12) — pas une résolution rétroactive forcée
    // à coller exactement à l'objectif (cf. genererPlanPacing).
    const dPlusTotal = profilParcours.segments.filter((s) => s.denivele > 0).reduce((a, s) => a + s.denivele, 0);
    let flatEquivalentPaceMinKm = allurePlatEquivalenteCible(distanceKm, dPlusTotal, tempsCibleS / 60);
    if (altitudeM > 1500) {
      flatEquivalentPaceMinKm = adjustPaceForAltitude(flatEquivalentPaceMinKm, altitudeM, acclimatation).paceAjustee;
    }

    const plan = genererPlanPacing(
      profilParcours.segments,
      { flatEquivalentPaceMinKm, dplusParHeure, seuilMarchePct, technicite, facteurGapCalibre },
      { tempsCibleSecondes: tempsCibleS }
    );
    // Le pacing est calculé par segment à pente homogène (précision GAP), mais
    // affiché par km — ré-agrégation nécessaire pour une fiche lisible.
    const segmentsParKm = agregerPacingParKm(plan.segments, distanceTotaleM);
    const timeline = fusionnerNutritionPacing(segmentsParKm, { glucidesGParH, frequenceMin });
    const alertes = detecterAlertesPlan(profilParcours.segments, plan, { frequenceMin });

    // Modélisation propre à la trace : profil altimétrique réel du GPX importé
    // (ou une ligne plate en mode dégradé), avec temps de passage à chaque km
    // et aux points significatifs du relief (sommets/creux) de CE parcours.
    const pointsProfil = profilParcoursCourant?.points ?? [
      { distanceCumulee: 0, altitude: 0 },
      { distanceCumulee: distanceTotaleM, altitude: 0 },
    ];
    const tempsADistance = construireTempsCumuleADistance(plan.segments);
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
    initierCarte(container, pointsProfil, timeline);
    container.querySelector("#profil-course-chart").innerHTML = ProfilCourseChart(
      pointsProfil,
      reperesKm,
      reperesSignificatifs,
      timeline
    );
    container.querySelector("#pacing-table").innerHTML = PacingTimeline(timeline);

    const { predictedTimeMin, targetTimeMin, deltaMin } = plan.totals;
    const signe = deltaMin >= 0 ? "+" : "−";
    container.querySelector("#pacing-totaux").textContent =
      `Temps prédit : ${formatDureeHM(predictedTimeMin)} — Objectif : ${formatDureeHM(targetTimeMin)} (écart : ${signe}${formatDureeHM(Math.abs(deltaMin))})`;
    container.querySelector("#pacing-alertes").innerHTML = alertes
      .map((a) => `<p class="muted" style="color:var(--color-warning, #e0a800);">${a}</p>`)
      .join("");
  });

  container.querySelector("#print-pacing").addEventListener("click", () => window.print());
}
