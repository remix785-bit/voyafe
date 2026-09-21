import * as repo from "../data/repo.js";
import { escapeHtml, formatDateFr, card, emptyState, badge } from "./components.js";

function objectifRow(o) {
  return `
    <div class="session-row" style="cursor:default">
      <span>${o.principal ? badge("Principal", "ok") + " " : ""}${escapeHtml(o.nom)}
        <br><span class="meta">${o.type === "trail" ? "Trail" : "Route"} · ${escapeHtml(String(o.distanceKm))} km${
          o.deniveleM ? ` · ${escapeHtml(String(o.deniveleM))} m D+` : ""
        } · ${formatDateFr(o.dateCourse)}</span>
      </span>
      <a class="btn btn-secondary btn-small" href="#/plan?objectifId=${o.id}">Plan</a>
    </div>
  `;
}

async function ensureSaison() {
  const saisons = await repo.listSaisons();
  if (saisons.length > 0) return saisons[0];
  return repo.createSaison({
    nom: "Saison en cours",
    dateDebut: new Date().toISOString().slice(0, 10),
    dateFin: null,
  });
}

export async function renderSaison(params, container) {
  const saison = await ensureSaison();
  const objectifs = await repo.listObjectifs(saison.id);

  container.innerHTML = `
    ${card(`
      <h2>${escapeHtml(saison.nom)}</h2>
      ${
        objectifs.length > 0
          ? objectifs.map(objectifRow).join("")
          : emptyState("Aucun objectif pour cette saison.")
      }
    `)}
    ${card(`
      <h3>Nouvel objectif</h3>
      <form id="form-objectif">
        <label for="nom">Nom</label>
        <input id="nom" name="nom" required placeholder="Ex: Marathon de Paris" />

        <label for="type">Type</label>
        <select id="type" name="type">
          <option value="route">Route</option>
          <option value="trail">Trail</option>
        </select>

        <label for="distanceKm">Distance (km)</label>
        <input id="distanceKm" name="distanceKm" type="number" step="0.001" min="0" required />

        <label for="deniveleM">Dénivelé positif (m, trail)</label>
        <input id="deniveleM" name="deniveleM" type="number" step="10" min="0" />

        <label for="dateCourse">Date de la course</label>
        <input id="dateCourse" name="dateCourse" type="date" required />

        <label for="tempsViseHms">Temps visé (h:mm:ss, optionnel)</label>
        <input id="tempsViseHms" name="tempsViseHms" type="text" placeholder="Ex: 3:30:00" pattern="\\d{1,2}:\\d{2}(:\\d{2})?" />

        <label for="niveau">Niveau</label>
        <select id="niveau" name="niveau">
          <option value="debutant">Débutant</option>
          <option value="intermediaire" selected>Intermédiaire</option>
          <option value="avance">Avancé</option>
        </select>

        <label for="axeTravail">Axe de travail</label>
        <select id="axeTravail" name="axeTravail">
          <option value="equilibre" selected>Équilibre</option>
          <option value="vitesse">Vitesse (fort en vitesse, à consolider en endurance)</option>
          <option value="endurance">Endurance (fort en endurance, à consolider en vitesse)</option>
        </select>

        <label for="priorite">Priorité de la course</label>
        <select id="priorite" name="priorite">
          <option value="A">A — objectif principal (affûtage long et marqué)</option>
          <option value="B" selected>B — course secondaire (affûtage intermédiaire)</option>
          <option value="C">C — course d'entraînement (affûtage minimal)</option>
        </select>

        <label style="display:flex;align-items:center;gap:8px;flex-direction:row;">
          <input type="checkbox" id="principal" name="principal" style="width:auto" />
          Objectif principal de la saison
        </label>

        <div style="margin-top:16px">
          <button type="submit" class="btn">Créer l'objectif</button>
        </div>
      </form>
    `)}
  `;

  const form = container.querySelector("#form-objectif");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const principal = data.get("principal") === "on";
    const created = await repo.createObjectif({
      saisonId: saison.id,
      nom: data.get("nom"),
      type: data.get("type"),
      distanceKm: parseFloat(data.get("distanceKm")),
      deniveleM: data.get("deniveleM") ? parseFloat(data.get("deniveleM")) : null,
      dateCourse: data.get("dateCourse"),
      dateDebut: new Date().toISOString().slice(0, 10),
      niveau: data.get("niveau"),
      axeTravail: data.get("axeTravail"),
      priorite: data.get("priorite"),
      tempsViseS: parseHms(data.get("tempsViseHms")),
      principal,
    });
    if (principal) await repo.setObjectifPrincipal(saison.id, created.id);
    await renderSaison(params, container);
  });
}

/** Parse un temps "h:mm:ss" ou "mm:ss" saisi en formulaire, en secondes. */
function parseHms(str) {
  if (!str) return null;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
