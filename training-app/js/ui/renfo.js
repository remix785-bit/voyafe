import * as repo from "../data/repo.js";
import { RENFO_CATEGORIES, RENFO_EXERCISES, renfoByCategorie } from "../catalog/renfo.js";
import { escapeHtml, formatDateFr, card, emptyState, badge } from "./components.js";

function categorieOptions(selected) {
  return `
    <option value="" ${!selected ? "selected" : ""}>Toutes catégories</option>
    ${Object.entries(RENFO_CATEGORIES)
      .map(([key, label]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("")}
  `;
}

function exerciceRow(ex, checked) {
  return `
    <label class="session-row" style="cursor:pointer">
      <span>
        <input type="checkbox" name="exercice" value="${ex.id}" ${checked ? "checked" : ""} style="width:auto;margin-right:8px" />
        ${escapeHtml(ex.nom)}
        <br><span class="meta">${escapeHtml(RENFO_CATEGORIES[ex.categorie])} · niveau ${escapeHtml(ex.niveau)}${
          ex.materiel !== "aucun" ? ` · ${escapeHtml(ex.materiel)}` : ""
        }</span>
      </span>
    </label>
  `;
}

function logRow(log) {
  const nbExercices = log.exercices?.length ?? 0;
  return `
    <div class="session-row" style="cursor:default">
      <span>${formatDateFr(log.date)} · ${nbExercices} exercice${nbExercices > 1 ? "s" : ""}
        <br><span class="meta">${log.dureeMin ?? "?"} min · RPE ${log.rpe ?? "?"}</span>
      </span>
    </div>
  `;
}

export async function renderRenfo(params, container) {
  const categorieFiltre = params.categorie ?? "";
  const exercices = categorieFiltre ? renfoByCategorie(categorieFiltre) : RENFO_EXERCISES;
  const logs = await repo.listRenfoLogs();

  container.innerHTML = `
    ${card(`
      <h2>Renforcement musculaire</h2>
      <label for="filtre-categorie">Filtrer par catégorie</label>
      <select id="filtre-categorie">${categorieOptions(categorieFiltre)}</select>
    `)}
    ${card(`
      <h3>Logger une séance de renfo</h3>
      <form id="form-renfo">
        <label for="date">Date</label>
        <input id="date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />

        <fieldset style="border:none;padding:0;margin:12px 0 0">
          <legend class="muted" style="font-size:0.8rem">Exercices effectués</legend>
          <div id="exercices-list">${exercices.map((ex) => exerciceRow(ex, false)).join("")}</div>
        </fieldset>

        <label for="dureeMin">Durée totale (min)</label>
        <input id="dureeMin" name="dureeMin" type="number" min="1" step="1" required placeholder="30" />

        <label for="rpe">RPE (1-10)</label>
        <input id="rpe" name="rpe" type="number" min="1" max="10" required placeholder="6" />

        <label for="notes">Notes (séries/reps/charge, ressenti)</label>
        <textarea id="notes" name="notes" rows="2" placeholder="Ex: planche 3x40s, hip thrust 3x12 @20kg"></textarea>

        <div style="margin-top:16px">
          <button type="submit" class="btn">Enregistrer la séance</button>
        </div>
      </form>
      <p id="renfo-msg" class="muted" style="font-size:0.8rem"></p>
    `)}
    ${card(`
      <h3>Historique</h3>
      <div id="renfo-history">
        ${logs.length > 0 ? logs.map(logRow).join("") : emptyState("Aucune séance de renfo loggée pour l'instant.")}
      </div>
    `)}
  `;

  container.querySelector("#filtre-categorie").addEventListener("change", (e) => {
    window.location.hash = `#/renfo${e.target.value ? `?categorie=${e.target.value}` : ""}`;
  });

  container.querySelector("#form-renfo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const exerciceIds = data.getAll("exercice");
    const exerciceDetails = exerciceIds
      .map((id) => RENFO_EXERCISES.find((ex) => ex.id === id))
      .filter(Boolean)
      .map((ex) => ({ id: ex.id, nom: ex.nom, categorie: ex.categorie }));

    await repo.addRenfoLog({
      date: data.get("date"),
      exercices: exerciceDetails,
      dureeMin: parseFloat(data.get("dureeMin")),
      rpe: parseInt(data.get("rpe"), 10),
      notes: data.get("notes") ?? "",
    });
    await renderRenfo(params, container);
    container.querySelector("#renfo-msg").textContent = "Séance de renfo enregistrée.";
  });
}
