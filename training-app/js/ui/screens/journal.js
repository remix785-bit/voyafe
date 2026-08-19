import * as store from "../../store.js";
import { QuickLogScale } from "../components.js";

export async function render(container) {
  const today = new Date().toISOString().slice(0, 10);
  const existant = store.getState().logsQuotidiens.find((l) => l.date === today);

  container.innerHTML = `
    <div class="app-main">
      <div class="card card--action">
        <h1>Journal quotidien</h1>
        <p class="muted">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <form id="form-journal" class="stack">
          <div class="field">
            <label for="fc-repos">FC repos (bpm, optionnel)</label>
            <input type="number" id="fc-repos" value="${existant?.fcRepos ?? ""}" min="30" max="120" />
          </div>
          <div class="field">
            <label for="rmssd">RMSSD (ms, optionnel, si capteur)</label>
            <input type="number" id="rmssd" value="${existant?.rmssd ?? ""}" min="0" max="300" />
          </div>
          <div class="field">
            <label for="poids-journal">Poids (kg, optionnel)</label>
            <input type="number" id="poids-journal" value="${existant?.poids ?? ""}" min="30" max="150" step="0.1" />
          </div>
          <div class="field">
            <label>Bien-être (1 = très mauvais, 10 = excellent)</label>
            ${QuickLogScale("bienEtre", existant?.bienEtre ?? 7)}
          </div>
          <div class="field">
            <label>RPE de la journée (1-10)</label>
            ${QuickLogScale("rpe", existant?.rpe ?? 5)}
          </div>
          <button class="btn btn--primary" type="submit">Enregistrer</button>
        </form>
      </div>
    </div>`;

  const state = {
    bienEtre: existant?.bienEtre ?? 7,
    rpe: existant?.rpe ?? 5,
  };

  container.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.scale;
      state[group] = Number(btn.dataset.value);
      container.querySelectorAll(`[data-scale="${group}"]`).forEach((b) => b.classList.toggle("selected", b === btn));
    });
  });

  container.querySelector("#form-journal").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fcRepos = numOrNull(container.querySelector("#fc-repos").value);
    const rmssd = numOrNull(container.querySelector("#rmssd").value);
    const poids = numOrNull(container.querySelector("#poids-journal").value);
    await store.ajouterLogQuotidien({ fcRepos, rmssd, poids, bienEtre: state.bienEtre, rpe: state.rpe });
    location.hash = "#/dashboard";
  });
}

function numOrNull(v) {
  return v === "" ? null : Number(v);
}
