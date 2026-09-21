// Pacing jour de course (doc technique Section 11) — version minimale.
// Le doc demande une allure GAP-ajustée sur le PROFIL RÉEL du parcours
// (segment par segment), ce qui suppose un import GPX/trace de la course.
// Cet import n'existe pas dans l'app (hors scope de cette itération) : cet
// écran affiche donc une allure GAP cible MOYENNE (pente moyenne déduite du
// D+/distance de l'objectif, comme dans la fiche séance), pas un profil
// détaillé. C'est un repli assumé, à ne pas confondre avec le pacing
// segment par segment que le doc décrit.
import * as repo from "../data/repo.js";
import { paceZonesFromVdot, formatPace } from "../engines/vdot.js";
import { rawPaceToGap, averageGrade } from "../engines/gap.js";
import { escapeHtml, formatDateFr, card, emptyState, badge } from "./components.js";

export async function renderPacing(params, container) {
  const objectifId = params.objectifId ?? (await repo.getObjectifPrincipal())?.id;
  if (!objectifId) {
    container.innerHTML = card(emptyState("Aucun objectif sélectionné.", `<a class="btn" href="#/saison">Créer un objectif</a>`));
    return;
  }
  const objectif = await repo.getObjectif(objectifId);
  if (!objectif) {
    container.innerHTML = card(emptyState("Objectif introuvable."));
    return;
  }
  const vdot = await repo.currentVdot();
  const zones = paceZonesFromVdot(vdot);
  const zoneCourse = objectif.type === "trail" ? zones.E : zones.M;

  let gapHtml = "";
  if (objectif.type === "trail" && objectif.deniveleM) {
    const grade = averageGrade(objectif.distanceKm * 1000, objectif.deniveleM, 0);
    const gapPace = rawPaceToGap(zoneCourse.slowPaceMinPerKm, grade);
    gapHtml = `
      <p>Allure GAP cible <strong>moyenne</strong> (équivalent-plat, pente moyenne ~${(grade * 100).toFixed(1)}%) :
        <strong>${formatPace(gapPace)}</strong>, soit une allure brute moyenne attendue de ~${formatPace(zoneCourse.slowPaceMinPerKm)}.</p>
      <p class="muted" style="font-size:0.8rem">${badge("Limite connue", "warning")} Cette allure est une moyenne sur tout le parcours, pas un pacing segment par segment.
        L'app ne permet pas encore d'importer le profil réel de la course (trace GPX) : les montées seront plus lentes et les descentes plus rapides que cette moyenne.</p>
    `;
  }

  container.innerHTML = `
    ${card(`
      <h2>Pacing — ${escapeHtml(objectif.nom)}</h2>
      <p class="muted">${formatDateFr(objectif.dateCourse)} · ${objectif.distanceKm} km${objectif.deniveleM ? ` · ${objectif.deniveleM} m D+` : ""}</p>
      <p>Allure cible : <strong>${zoneCourse.fastPace} – ${zoneCourse.slowPace}</strong> (zone ${objectif.type === "trail" ? "E, au ressenti" : "M"})</p>
      ${gapHtml}
    `)}
    ${card(`
      <h3>Stratégie course</h3>
      <ul>
        <li>Départ volontairement contenu — ne pas partir plus vite que l'allure cible, même dans le rush du départ.</li>
        <li>Nutrition/hydratation : reproduire exactement ce qui a été testé à l'entraînement (voir <a href="#/nutrition">écran nutrition</a>) — jamais un produit nouveau le jour J.</li>
        <li>Sur terrain vallonné/trail : gérer l'effort à la sensation en montée (GAP), se laisser porter en descente sans forcer le freinage.</li>
      </ul>
    `)}
  `;
}
