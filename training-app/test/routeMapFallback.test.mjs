import { test } from "node:test";
import assert from "node:assert/strict";
import { RouteMapFallback } from "../js/ui/components.js";

function pointsRectangle() {
  // Un tracé formé de deux segments perpendiculaires de longueurs réelles
  // connues (2000m nord, puis 1000m est) — sert à vérifier que le rendu ne
  // déforme pas la forme réelle (échelle x = échelle y).
  const R = 6371000;
  const lat0 = 45.0;
  const lon0 = 5.0;
  const dLatFor2km = (2000 / R) * (180 / Math.PI);
  const latRad = (lat0 * Math.PI) / 180;
  const dLonFor1km = (1000 / (R * Math.cos(latRad))) * (180 / Math.PI);
  return [
    { lat: lat0, lon: lon0, distanceCumulee: 0 },
    { lat: lat0 + dLatFor2km, lon: lon0, distanceCumulee: 2000 },
    { lat: lat0 + dLatFor2km, lon: lon0 + dLonFor1km, distanceCumulee: 3000 },
  ];
}

function parsePolylinePoints(svg) {
  const match = svg.match(/<polyline points="([^"]+)"/);
  return match[1].split(" ").map((pair) => pair.split(",").map(Number));
}

test("RouteMapFallback — message dédié si les points n'ont pas de coordonnées GPS (mode dégradé sans GPX)", () => {
  const html = RouteMapFallback([{ distanceCumulee: 0, altitude: 0 }, { distanceCumulee: 1000, altitude: 0 }]);
  assert.ok(html.includes("Carte indisponible"));
  assert.ok(!html.includes("<svg"));
});

test("RouteMapFallback — rend un SVG avec le tracé pour des points GPS valides", () => {
  const html = RouteMapFallback(pointsRectangle());
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("<polyline"));
  assert.ok(html.includes("Départ"));
  assert.ok(html.includes("Arrivée"));
});

test("RouteMapFallback — ne déforme jamais la forme réelle du tracé (échelle identique en x et en y)", () => {
  const html = RouteMapFallback(pointsRectangle());
  const pts = parsePolylinePoints(html);
  assert.equal(pts.length, 3);
  const distPx = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const segmentNordPx = distPx(pts[0], pts[1]); // 2000m réels
  const segmentEstPx = distPx(pts[1], pts[2]); // 1000m réels
  const ratioPx = segmentNordPx / segmentEstPx;
  assert.ok(Math.abs(ratioPx - 2) < 0.05, `le ratio à l'écran (${ratioPx.toFixed(3)}) doit refléter le ratio réel 2:1, pas être déformé`);
});

test("RouteMapFallback — place les marqueurs sommet/creux et ravitaillement demandés", () => {
  const points = pointsRectangle();
  const html = RouteMapFallback(
    points,
    [{ distanceM: 1000, label: "1" }],
    [{ distanceM: 2000, altitude: 120, type: "sommet" }],
    [{ km: 1.5, actionNutrition: "Ravitaillement : ~20 g glucides" }]
  );
  assert.ok(html.includes("▲ 120m"));
  assert.ok(html.match(/fill="var\(--color-warning/));
});

test("RouteMapFallback — inclut une flèche nord et une barre d'échelle", () => {
  const html = RouteMapFallback(pointsRectangle());
  assert.ok(html.includes(">N<"));
  assert.ok(html.includes("km</text>") || html.includes(" m</text>"));
});
