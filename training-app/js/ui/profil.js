import * as repo from "../data/repo.js";
import { paceZonesFromVdot, nextRetestWindow } from "../engines/vdot.js";
import { escapeHtml, formatDateFr, zoneTag, card, emptyState } from "./components.js";

function zonesTable(zones) {
  return `
    <table>
      <thead><tr><th>Zone</th><th>%VO2max</th><th>Allure</th><th>RPE</th></tr></thead>
      <tbody>
        ${Object.entries(zones)
          .map(
            ([key, z]) => `
            <tr>
              <td>${zoneTag(key)} ${escapeHtml(z.label)}</td>
              <td>${Math.round(z.min * 100)}-${Math.round(z.max * 100)}%</td>
              <td>${z.fastPace} – ${z.slowPace}</td>
              <td>${escapeHtml(z.rpe)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export async function renderProfil(params, container) {
  const resultats = await repo.listResultats();
  const dernier = resultats[resultats.length - 1];
  const vdot = dernier?.vdot ?? 40;
  const zones = paceZonesFromVdot(vdot);

  let retestHtml = "";
  if (dernier) {
    const { minDate, maxDate } = nextRetestWindow(dernier.date);
    retestHtml = `<p class="muted" style="font-size:0.8rem">Prochain retest recommandé entre le ${formatDateFr(
      minDate
    )} et le ${formatDateFr(maxDate)}.</p>`;
  }

  container.innerHTML = `
    ${card(`
      <h2>VDOT actuel : ${vdot}</h2>
      ${dernier ? `<p class="muted">Dérivé du test du ${formatDateFr(dernier.date)} (${dernier.distanceM} m en ${Math.round(dernier.tempsS / 60)} min).</p>` : `<p class="muted">Aucun test enregistré — VDOT par défaut.</p>`}
      ${retestHtml}
    `)}
    ${card(`<h3>Zones d'allure</h3>${zonesTable(zones)}`)}
    ${card(`
      <h3>Historique VDOT</h3>
      ${
        resultats.length > 0
          ? `<table>
              <thead><tr><th>Date</th><th>Performance</th><th>VDOT</th></tr></thead>
              <tbody>
                ${resultats
                  .slice()
                  .reverse()
                  .map(
                    (r) => `<tr><td>${formatDateFr(r.date)}</td><td>${(r.distanceM / 1000).toFixed(2)} km en ${Math.round(
                      r.tempsS / 60
                    )} min</td><td>${r.vdot}</td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : emptyState("Aucun test de performance enregistré.")
      }
    `)}
    ${card(`
      <h3>Ajouter une performance de référence</h3>
      <form id="form-resultat">
        <label for="date">Date</label>
        <input id="date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />

        <label for="distanceM">Distance (m)</label>
        <input id="distanceM" name="distanceM" type="number" min="1500" step="1" required placeholder="10000" />

        <label for="tempsMin">Temps (minutes)</label>
        <input id="tempsMin" name="tempsMin" type="number" min="1" step="0.01" required placeholder="40" />

        <label for="altitudeM">Altitude du lieu (m, optionnel)</label>
        <input id="altitudeM" name="altitudeM" type="number" min="0" step="10" />

        <label for="contexte">Contexte</label>
        <input id="contexte" name="contexte" placeholder="Ex: 10km officiel, effort maximal" />

        <div style="margin-top:16px">
          <button type="submit" class="btn">Calculer et enregistrer</button>
        </div>
      </form>
      <p id="resultat-msg" class="muted" style="font-size:0.8rem"></p>
    `)}
  `;

  container.querySelector("#form-resultat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const record = await repo.addResultat({
      date: data.get("date"),
      distanceM: parseFloat(data.get("distanceM")),
      tempsS: parseFloat(data.get("tempsMin")) * 60,
      altitudeM: data.get("altitudeM") ? parseFloat(data.get("altitudeM")) : 0,
      contexte: data.get("contexte") ?? "",
    });
    await renderProfil(params, container);
    container.querySelector("#resultat-msg").textContent = `Nouveau VDOT : ${record.vdot}`;
  });
}
