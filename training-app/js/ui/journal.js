import * as repo from "../data/repo.js";
import { escapeHtml, formatDateFr, card, emptyState } from "./components.js";

function entryRow(entry) {
  return `
    <div class="session-row" style="cursor:default">
      <span>${formatDateFr(entry.date)}
        <br><span class="meta">RPE ${entry.rpe ?? "?"} · sommeil ${entry.sommeilQualite ?? "?"}/5 · ${
          entry.poidsKg ? `${entry.poidsKg} kg` : "poids non renseigné"
        }${entry.douleurs ? ` · douleurs : ${escapeHtml(entry.douleurs)}` : ""}</span>
        ${entry.sensations ? `<br><span class="meta">${escapeHtml(entry.sensations)}</span>` : ""}
      </span>
    </div>
  `;
}

export async function renderJournal(params, container) {
  const entries = await repo.listJournal();

  container.innerHTML = `
    ${card(`
      <h2>Journal quotidien</h2>
      <form id="form-journal">
        <label for="date">Date</label>
        <input id="date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />

        <label for="rpe">RPE global de la journée (1-10)</label>
        <input id="rpe" name="rpe" type="number" min="1" max="10" placeholder="5" />

        <label for="sensations">Sensations (texte libre)</label>
        <textarea id="sensations" name="sensations" rows="2" placeholder="Fatigue, motivation, forme générale..."></textarea>

        <label for="sommeilHeures">Sommeil (heures)</label>
        <input id="sommeilHeures" name="sommeilHeures" type="number" min="0" max="16" step="0.5" placeholder="7.5" />

        <label for="sommeilQualite">Qualité du sommeil (1-5)</label>
        <input id="sommeilQualite" name="sommeilQualite" type="number" min="1" max="5" placeholder="4" />

        <label for="poidsKg">Poids (kg)</label>
        <input id="poidsKg" name="poidsKg" type="number" min="0" step="0.1" placeholder="68.5" />

        <label for="douleurs">Douleurs (zones + intensité, texte libre)</label>
        <textarea id="douleurs" name="douleurs" rows="2" placeholder="Ex: genou droit 3/10, tendon d'Achille gauche léger"></textarea>

        <div style="margin-top:16px">
          <button type="submit" class="btn">Enregistrer l'entrée</button>
        </div>
      </form>
      <p id="journal-msg" class="muted" style="font-size:0.8rem"></p>
    `)}
    ${card(`
      <h3>Historique</h3>
      <div id="journal-history">
        ${entries.length > 0 ? entries.map(entryRow).join("") : emptyState("Aucune entrée de journal pour l'instant.")}
      </div>
    `)}
  `;

  container.querySelector("#form-journal").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await repo.addJournalEntry({
      date: data.get("date"),
      rpe: data.get("rpe") ? parseInt(data.get("rpe"), 10) : null,
      sensations: data.get("sensations") ?? "",
      sommeilHeures: data.get("sommeilHeures") ? parseFloat(data.get("sommeilHeures")) : null,
      sommeilQualite: data.get("sommeilQualite") ? parseInt(data.get("sommeilQualite"), 10) : null,
      poidsKg: data.get("poidsKg") ? parseFloat(data.get("poidsKg")) : null,
      douleurs: data.get("douleurs") ?? "",
    });
    await renderJournal(params, container);
    container.querySelector("#journal-msg").textContent = "Entrée enregistrée.";
  });
}
