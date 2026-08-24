// Système de composants UI — Partie III §8.
// Fonctions de rendu (chaînes HTML) + petites classes pour les composants
// interactifs (TrainingTimer, QuickLog). Pas de framework : re-rendu ciblé.

import { formatPace, paceZonesForVdot, ZONES } from "../../js/engines/vdot.js";
import { latLonADistance, projeterPlan, arrondirEchelle } from "../../js/engines/geoMap.js";

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/** ZoneBadge — étiquette couleur E/M/T/I/R (Section 2, palette). Le titre au
 * survol rappelle le nom complet de la zone (rappel pour les lettres). */
export function ZoneBadge(zone) {
  if (!zone) return "";
  const label = ZONES[zone]?.label ?? zone;
  return `<span class="zone-badge zone-badge--${zone}" title="${escapeHtml(label)}">${zone}</span>`;
}

/**
 * ZoneLegend — rappel permanent (pas seulement au survol, utile sur mobile)
 * de ce que signifie chaque lettre de zone E/M/T/I/R, avec sa fourchette
 * d'allure rapide–cible quand un VDOT est fourni.
 * @param {number} [vdot] optionnel — sans lui, affiche juste badge + nom (compat)
 */
export function ZoneLegend(vdot) {
  const zones = vdot != null ? paceZonesForVdot(vdot) : null;
  const rows = Object.entries(ZONES)
    .map(([zone, def]) => {
      const fourchette = zones?.[zone] ? formatFourchettePace(zones[zone].fast, zones[zone].target) : "";
      return `
      <div style="display:grid; grid-template-columns:auto 1fr auto; align-items:center; column-gap:8px;">
        <span class="zone-badge zone-badge--${zone}">${zone}</span>
        <span class="muted">${escapeHtml(def.label)}</span>
        <span class="data" style="white-space:nowrap;">${fourchette}</span>
      </div>`;
    })
    .join("");
  return `<div class="stack" style="gap:8px;">${rows}</div>`;
}

/**
 * Sparkline — mini courbe d'évolution (VDOT, ACWR/EWMA...), réutilisée sur
 * le Dashboard et l'écran Historique & Stats.
 * @param {number[]} values
 */
export function Sparkline(values, { height = 60 } = {}) {
  if (!values.length) return `<p class="muted">—</p>`;
  if (values.length < 2) return `<p class="data">${values[0].toFixed(1)}</p>`;
  const w = 400;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / range) * (height - 8) - 4}`)
    .join(" ");
  return `
    <svg viewBox="0 0 ${w} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="var(--color-accent-strong)" stroke-width="2" />
    </svg>
    <p class="muted">Min ${min.toFixed(1)} — Max ${max.toFixed(1)}</p>`;
}

/**
 * ZoneRepartition — répartition du volume hebdo par zone E/M/T/I/R, en %.
 * @param {{seances: Array<{zoneDaniels:string, volumeSeanceMin:number}>}} semaine
 */
export function ZoneRepartition(semaine) {
  const total = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0) || 1;
  const parZone = {};
  for (const s of semaine.seances) parZone[s.zoneDaniels] = (parZone[s.zoneDaniels] ?? 0) + s.volumeSeanceMin;
  const ordre = ["E", "M", "T", "I", "R"];
  const zones = Object.keys(parZone).sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  return `<div class="stack" style="gap:6px;">${zones
    .map((z) => `<div class="row"><span class="zone-badge zone-badge--${z}">${z}</span><span class="data">${Math.round((parZone[z] / total) * 100)}%</span></div>`)
    .join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Graphiques interactifs (barres, camembert, courbes) — Dashboard graphique.
// Pas de librairie : SVG généré en chaîne + interactions attachées après coup
// (attachChartInteractions), même convention que le reste de l'appli.
// ---------------------------------------------------------------------------

/** Chemin d'une barre verticale : coins arrondis en haut, carrés à la base (mark spec). */
function cheminBarre(x, yHaut, largeur, yBase, rayon) {
  const r = Math.min(rayon, largeur / 2, Math.max(0, yBase - yHaut));
  return `M${x},${yBase} L${x},${yHaut + r} Q${x},${yHaut} ${x + r},${yHaut} L${x + largeur - r},${yHaut} Q${x + largeur},${yHaut} ${x + largeur},${yHaut + r} L${x + largeur},${yBase} Z`;
}

/**
 * BarChart — barres verticales (ex : distance courue par semaine/mois).
 * Une seule série : pas de légende (le titre de la carte suffit). La
 * dernière barre (l'histoire du graphe : "où j'en suis maintenant") porte
 * son étiquette directe ; les autres restent accessibles au survol/focus.
 * @param {{label:string, value:number}[]} barres
 * @param {{height?:number, formatValue?:(v:number)=>string, colorVar?:string, unite?:string}} options
 */
export function BarChart(barres, options = {}) {
  const { height = 150, formatValue = (v) => v.toFixed(1), colorVar = "--color-accent-strong", unite = "" } = options;
  if (!barres.length) return `<p class="muted">—</p>`;

  const slot = 44;
  const largeurBarre = 20;
  const w = barres.length * slot;
  const padTop = 24; // place pour l'étiquette directe au-dessus de la barre max
  const padBottom = 22; // libellés d'axe X
  const yBase = height - padBottom;
  const plotH = yBase - padTop;
  const max = Math.max(...barres.map((b) => b.value), 1);

  const idBase = `bar-${Math.random().toString(36).slice(2, 8)}`;
  const marks = barres
    .map((b, i) => {
      const x = i * slot + (slot - largeurBarre) / 2;
      const hauteur = max > 0 ? (b.value / max) * plotH : 0;
      const yHaut = yBase - hauteur;
      const estDerniere = i === barres.length - 1;
      const valeurTxt = `${formatValue(b.value)}${unite}`;
      return `
      <g class="chart-mark" tabindex="0" role="img" aria-label="${escapeHtml(b.label)} : ${escapeHtml(valeurTxt)}" data-tip-label="${escapeHtml(b.label)}" data-tip-value="${escapeHtml(valeurTxt)}" data-tip-color="var(${colorVar})">
        <rect x="${i * slot}" y="${padTop}" width="${slot}" height="${plotH}" fill="transparent" />
        <path d="${cheminBarre(x, yHaut, largeurBarre, yBase, 4)}" fill="var(${colorVar})" />
        ${estDerniere ? `<text x="${x + largeurBarre / 2}" y="${Math.max(10, yHaut - 6)}" font-size="10" text-anchor="middle" fill="var(--color-text)" font-weight="600">${escapeHtml(valeurTxt)}</text>` : ""}
        <text x="${x + largeurBarre / 2}" y="${height - 6}" font-size="9" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(b.label)}</text>
      </g>`;
    })
    .join("");

  return `
    <svg id="${idBase}" class="chart-svg" viewBox="0 0 ${w} ${height}" width="100%" style="height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="${yBase}" x2="${w}" y2="${yBase}" stroke="var(--color-border)" stroke-width="1" />
      ${marks}
    </svg>`;
}

/**
 * DonutChart — répartition catégorielle en anneau (ex : zones E/M/T/I/R de
 * la semaine). Couleurs = palette catégorielle validée (tokens.css --zone-*).
 * Pas de légende propre : la carte l'associe à ZoneRepartition juste en
 * dessous, qui sert à la fois de légende et de table de valeurs exactes.
 * @param {{label:string, value:number, colorVar:string}[]} segments
 * @param {{size?:number, epaisseur?:number, centreValeur?:string, centreLabel?:string}} options
 */
export function DonutChart(segments, options = {}) {
  const { size = 168, epaisseur = 26, centreValeur = "", centreLabel = "" } = options;
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return `<p class="muted">—</p>`;

  const r = (size - epaisseur) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circonference = 2 * Math.PI * r;
  const ecartDeg = 2.2; // écart angulaire entre segments (équivalent du "surface gap")

  let angleCumule = -90; // départ en haut
  const arcs = segments
    .map((s) => {
      const part = s.value / total;
      const angleSegment = part * 360;
      const angleUtile = Math.max(0, angleSegment - ecartDeg);
      const longueurArc = (angleUtile / 360) * circonference;
      const decalage = (angleCumule / 360) * circonference;
      const pct = Math.round(part * 100);
      const angleMid = angleCumule + angleSegment / 2;
      angleCumule += angleSegment;

      const labelExterne =
        pct >= 10
          ? (() => {
              const rad = (angleMid * Math.PI) / 180;
              const lx = cx + (r + epaisseur / 2 + 12) * Math.cos(rad);
              const ly = cy + (r + epaisseur / 2 + 12) * Math.sin(rad);
              return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="var(--color-text)">${pct}%</text>`;
            })()
          : "";

      return `
      <circle class="chart-mark" tabindex="0" role="img" aria-label="${escapeHtml(s.label)} : ${pct}%"
        data-tip-label="${escapeHtml(s.label)}" data-tip-value="${pct}%" data-tip-color="${s.colorVar.startsWith("var(") ? s.colorVar : `var(${s.colorVar})`}"
        cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${s.colorVar.startsWith("var(") ? s.colorVar : `var(${s.colorVar})`}" stroke-width="${epaisseur}"
        stroke-dasharray="${longueurArc.toFixed(2)} ${(circonference - longueurArc).toFixed(2)}"
        stroke-dashoffset="${(-decalage).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})" />
      ${labelExterne}`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${size} ${size}" width="100%" style="height:auto; display:block; max-width:${size + 40}px; margin:0 auto;" preserveAspectRatio="xMidYMid meet">
      ${arcs}
      ${centreValeur ? `<text x="${cx}" y="${cy - 4}" font-size="20" font-weight="700" text-anchor="middle" fill="var(--color-text)">${escapeHtml(centreValeur)}</text>` : ""}
      ${centreLabel ? `<text x="${cx}" y="${cy + 16}" font-size="10" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(centreLabel)}</text>` : ""}
    </svg>`;
}

/**
 * LineChart — courbe avec aire, point final mis en évidence (valeur directe),
 * axe Y min/max, axe X premier/dernier libellé, tooltip par point au survol.
 * Une seule série : pas de légende (le titre de la carte la nomme).
 * @param {{label:string, value:number}[]} points
 * @param {{height?:number, formatValue?:(v:number)=>string, colorVar?:string}} options
 */
export function LineChart(points, options = {}) {
  const { height = 150, formatValue = (v) => v.toFixed(1), colorVar = "--color-accent-strong" } = options;
  const pts = points.filter((p) => p.value != null);
  if (pts.length < 2) return `<p class="muted">Pas encore assez de données.</p>`;

  const w = 420;
  const padX = 8;
  const padTop = 22;
  const padBottom = 20;
  const plotW = w - padX * 2;
  const plotH = height - padTop - padBottom;
  const min = Math.min(...pts.map((p) => p.value));
  const max = Math.max(...pts.map((p) => p.value));
  const range = max - min || 1;

  const xAt = (i) => padX + (i / (pts.length - 1)) * plotW;
  const yAt = (v) => padTop + plotH - ((v - min) / range) * plotH;

  const ligne = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ");
  const aire = `${xAt(0).toFixed(1)},${(padTop + plotH).toFixed(1)} ${ligne} ${xAt(pts.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)}`;

  const dernier = pts[pts.length - 1];
  const marks = pts
    .map((p, i) => {
      const x = xAt(i);
      const y = yAt(p.value);
      const estDernier = i === pts.length - 1;
      const valeurTxt = formatValue(p.value);
      return `
      <g class="chart-mark" tabindex="0" role="img" aria-label="${escapeHtml(p.label)} : ${escapeHtml(valeurTxt)}" data-tip-label="${escapeHtml(p.label)}" data-tip-value="${escapeHtml(valeurTxt)}" data-tip-color="var(${colorVar})">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="transparent" />
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${estDernier ? 5 : 3.5}" fill="var(${colorVar})" stroke="var(--color-surface)" stroke-width="2" />
      </g>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${w} ${height}" width="100%" style="height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
      <text x="${padX}" y="12" font-size="9" fill="var(--color-text-muted)">${formatValue(max)}</text>
      <text x="${padX}" y="${height - 4}" font-size="9" fill="var(--color-text-muted)">${formatValue(min)}</text>
      <polygon points="${aire}" fill="var(${colorVar})" opacity="0.1" />
      <polyline points="${ligne}" fill="none" stroke="var(${colorVar})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <text x="${xAt(pts.length - 1).toFixed(1)}" y="${(yAt(dernier.value) - 12).toFixed(1)}" font-size="10" font-weight="600" text-anchor="end" fill="var(--color-text)">${formatValue(dernier.value)}</text>
      <text x="${padX}" y="${height - padBottom + 14}" font-size="9" fill="var(--color-text-muted)">${escapeHtml(pts[0].label)}</text>
      <text x="${w - padX}" y="${height - padBottom + 14}" font-size="9" text-anchor="end" fill="var(--color-text-muted)">${escapeHtml(dernier.label)}</text>
      ${marks}
    </svg>`;
}

/**
 * Attache la tooltip commune à tous les graphiques (.chart-mark[data-tip-*])
 * d'un conteneur — à appeler une fois après avoir inséré le HTML des
 * graphiques. Un seul élément tooltip flottant partagé, positionné au
 * pointeur ; mêmes infos accessibles au clavier via focus (role=img +
 * aria-label déjà posés sur chaque marque).
 * @param {HTMLElement} root
 */
export function attachChartInteractions(root) {
  let tooltip = document.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
  }

  const afficher = (mark, x, y) => {
    const label = mark.dataset.tipLabel ?? "";
    const value = mark.dataset.tipValue ?? "";
    const color = mark.dataset.tipColor;
    tooltip.innerHTML = "";
    if (color) {
      const swatch = document.createElement("span");
      swatch.className = "chart-tooltip__swatch";
      swatch.style.background = color;
      tooltip.appendChild(swatch);
    }
    const valEl = document.createElement("span");
    valEl.className = "chart-tooltip__value";
    valEl.textContent = value;
    const labEl = document.createElement("span");
    labEl.className = "chart-tooltip__label";
    labEl.textContent = label;
    tooltip.appendChild(valEl);
    tooltip.appendChild(labEl);
    tooltip.style.display = "flex";
    positionner(x, y);
  };

  const positionner = (x, y) => {
    const marge = 12;
    const rect = tooltip.getBoundingClientRect();
    let left = x + marge;
    let top = y - rect.height - marge;
    if (left + rect.width > window.innerWidth - 4) left = x - rect.width - marge;
    if (top < 4) top = y + marge;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const masquer = () => {
    tooltip.style.display = "none";
  };

  root.querySelectorAll(".chart-mark").forEach((mark) => {
    mark.addEventListener("pointerenter", (e) => afficher(mark, e.clientX, e.clientY));
    mark.addEventListener("pointermove", (e) => positionner(e.clientX, e.clientY));
    mark.addEventListener("pointerleave", masquer);
    mark.addEventListener("focus", () => {
      const box = mark.getBoundingClientRect();
      afficher(mark, box.left + box.width / 2, box.top);
    });
    mark.addEventListener("blur", masquer);
  });
}

/** Longueur et décalage d'un arc [debutDeg, finDeg] sur un cercle de circonférence donnée. */
function segmentArc(debutDeg, finDeg, circonference) {
  const debut = Math.max(0, debutDeg);
  const fin = Math.min(360, finDeg);
  if (fin <= debut) return null;
  return { longueur: ((fin - debut) / 360) * circonference, decalage: (debut / 360) * circonference };
}

/**
 * CountdownRing — anneau de compte à rebours vers l'échéance : le nombre de
 * jours restants en grand au centre, un anneau qui matérialise tout le plan
 * (Base/Développement/Affûtage, chaque phase sa couleur) et se remplit au fil
 * de la progression, un marqueur à la position actuelle. Remplace l'ancienne
 * ElevationBar (barre linéaire) — modélisation plus ludique de l'échéance.
 * @param {{base:number, developpement:number, taper:number}} macrocycle nombre de semaines par phase
 * @param {number} pctProgression 0-100
 * @param {{size?:number, epaisseur?:number, centreValeur?:string, centreLabel?:string, centreSous?:string}} options
 */
export function CountdownRing(macrocycle, pctProgression, options = {}) {
  const { size = 200, epaisseur = 20, centreValeur = "", centreLabel = "", centreSous = "" } = options;
  const totalSemaines = (macrocycle.base ?? 0) + (macrocycle.developpement ?? 0) + (macrocycle.taper ?? 0);
  if (!totalSemaines) return "";

  const PHASES = [
    { label: "Base", n: macrocycle.base ?? 0, colorVar: "--phase-base" },
    { label: "Développement", n: macrocycle.developpement ?? 0, colorVar: "--phase-developpement" },
    { label: "Affûtage", n: macrocycle.taper ?? 0, colorVar: "--phase-taper" },
  ].filter((p) => p.n > 0);

  const r = (size - epaisseur) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circonference = 2 * Math.PI * r;
  const ecartDeg = 1.5; // équivalent du "surface gap" entre phases
  const angleFin = Math.max(0, Math.min(360, (pctProgression / 100) * 360));

  let cumAngle = 0;
  let semaineDebut = 1;
  const pistes = [];
  const remplis = [];

  for (const p of PHASES) {
    const angleSeg = (p.n / totalSemaines) * 360;
    const debut = cumAngle;
    const fin = cumAngle + angleSeg;
    const debutUtile = debut + (debut > 0 ? ecartDeg / 2 : 0);
    const finUtile = fin - (fin < 360 ? ecartDeg / 2 : 0);
    const semaineFin = semaineDebut + p.n - 1;

    const piste = segmentArc(debutUtile, finUtile, circonference);
    if (piste) {
      const label = `${p.label} — semaine${p.n > 1 ? "s" : ""} ${semaineDebut}${p.n > 1 ? `-${semaineFin}` : ""}`;
      pistes.push(`
        <circle class="chart-mark" tabindex="0" role="img" aria-label="${escapeHtml(label)}"
          data-tip-label="${escapeHtml(p.label)}" data-tip-value="${p.n} semaine${p.n > 1 ? "s" : ""}" data-tip-color="var(${p.colorVar})"
          cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(${p.colorVar})" stroke-width="${epaisseur}" opacity="0.28"
          stroke-dasharray="${piste.longueur.toFixed(2)} ${(circonference - piste.longueur).toFixed(2)}"
          stroke-dashoffset="${(-piste.decalage).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})" />`);
    }

    const rempli = segmentArc(debutUtile, Math.min(finUtile, angleFin), circonference);
    if (rempli) {
      remplis.push(`
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(${p.colorVar})" stroke-width="${epaisseur}"
          stroke-dasharray="${rempli.longueur.toFixed(2)} ${(circonference - rempli.longueur).toFixed(2)}"
          stroke-dashoffset="${(-rempli.decalage).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})" style="pointer-events:none;" />`);
    }

    cumAngle = fin;
    semaineDebut = semaineFin + 1;
  }

  const angleRad = ((angleFin - 90) * Math.PI) / 180;
  const mx = cx + r * Math.cos(angleRad);
  const my = cy + r * Math.sin(angleRad);

  return `
    <svg viewBox="0 0 ${size} ${size}" width="100%" style="height:auto; display:block; max-width:${size + 20}px; margin:0 auto;" preserveAspectRatio="xMidYMid meet">
      ${pistes.join("")}
      ${remplis.join("")}
      <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="6" fill="var(--color-text)" stroke="var(--color-surface)" stroke-width="2" />
      ${centreValeur ? `<text x="${cx}" y="${cy - 6}" font-size="30" font-weight="700" text-anchor="middle" fill="var(--color-text)">${escapeHtml(centreValeur)}</text>` : ""}
      ${centreLabel ? `<text x="${cx}" y="${cy + 16}" font-size="11" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(centreLabel)}</text>` : ""}
      ${centreSous ? `<text x="${cx}" y="${cy + 32}" font-size="9" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(centreSous)}</text>` : ""}
    </svg>`;
}

/** LoadGauge — jauge ACWR/EWMA avec zone verte/orange/rouge (Partie I §10). */
export function LoadGauge(loadSummary) {
  const value = loadSummary.acwrEwma;
  const pct = Math.max(0, Math.min(100, (value / 2) * 100)); // échelle 0-2.0
  return `
    <div class="load-gauge">
      <div class="load-gauge__track">
        <div class="load-gauge__marker" style="left:${pct}%"></div>
      </div>
      <div class="load-gauge__value data">${value.toFixed(2)}</div>
    </div>
    <div class="load-gauge__disclaimer">${escapeHtml(loadSummary.disclaimer)}</div>`;
}

/** WeekStrip — bande de visualisation du macrocycle (phases). */
export function WeekStrip(semaines, semaineActuelleNumero) {
  const segs = semaines
    .map((s) => {
      const classes = ["week-strip__seg", `week-strip__seg--${s.phase}`];
      if (s.numero === semaineActuelleNumero) classes.push("week-strip__seg--current");
      if (s.statut === "decharge") classes.push("week-strip__seg--decharge");
      return `<div class="${classes.join(" ")}" title="Semaine ${s.numero} — ${s.phase}${s.statut === "decharge" ? " (décharge)" : ""}"></div>`;
    })
    .join("");
  return `
    <div class="week-strip">${segs}</div>
    <div class="week-strip__legend">
      <span class="leg-base">Base</span>
      <span class="leg-dev">Développement</span>
      <span class="leg-taper">Affûtage</span>
    </div>`;
}

/**
 * Formate une fourchette d'allure "rapide – cible" (ex: "4:41/km – 5:09/km").
 * Retombe sur la seule allure cible si la borne rapide n'est pas disponible.
 */
export function formatFourchettePace(rapideMinParKm, cibleMinParKm) {
  if (cibleMinParKm == null) return "—";
  if (rapideMinParKm == null) return formatPace(cibleMinParKm);
  return `${formatPace(rapideMinParKm)} – ${formatPace(cibleMinParKm)}`;
}

/** SessionCard — carte séance (résumé), utilisée sur Dashboard et Plan. */
export function SessionCard(seance, href) {
  const statusClass =
    seance.statut === "realisee"
      ? "session-card__status--realisee"
      : seance.statut === "manquee"
        ? "session-card__status--manquee"
        : "";
  const statusLabel = { a_venir: "à venir", realisee: "réalisée", manquee: "manquée" }[seance.statut] ?? seance.statut;
  const allure = formatFourchettePace(seance.allureRapideMinParKm, seance.allureCibleMinParKm);
  const distance = seance.distanceKm ? `${seance.distanceKm.toFixed(1)} km` : null;
  const jourLabel = seance.date
    ? new Date(seance.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
    : null;
  const inner = `
    ${ZoneBadge(seance.zoneDaniels)}
    <div class="session-card__body">
      <div class="session-card__title">${escapeHtml(seance.nom)}</div>
      <div class="session-card__meta">
        ${jourLabel ? `<span class="muted">${jourLabel}</span>` : ""}
        ${distance ? `<span class="data">${distance}</span>` : ""}
        <span>${Math.round(seance.volumeSeanceMin)} min</span>
        <span class="data">${allure}</span>
      </div>
    </div>
    <span class="session-card__status ${statusClass}">${statusLabel}</span>`;
  return href
    ? `<a class="card session-card" href="${href}">${inner}</a>`
    : `<div class="card session-card">${inner}</div>`;
}

/** TrainingTimer — minuteur intégré pour le mode entraînement. */
export class TrainingTimer {
  constructor(phases) {
    this.phases = phases; // [{nom, dureeSec}]
    this.index = 0;
    this.remaining = phases[0]?.dureeSec ?? 0;
    this.interval = null;
    this.onTick = null;
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.remaining--;
      if (this.remaining <= 0) {
        this.index = Math.min(this.index + 1, this.phases.length - 1);
        this.remaining = this.phases[this.index]?.dureeSec ?? 0;
      }
      this.onTick?.(this.state());
    }, 1000);
  }

  pause() {
    clearInterval(this.interval);
    this.interval = null;
  }

  reset() {
    this.pause();
    this.index = 0;
    this.remaining = this.phases[0]?.dureeSec ?? 0;
  }

  state() {
    return {
      phaseNom: this.phases[this.index]?.nom ?? "Terminé",
      remaining: this.remaining,
      index: this.index,
      total: this.phases.length,
    };
  }

  static formatClock(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
}

/** QuickLog — formulaire de saisie rapide du journal quotidien. */
export function QuickLogScale(name, value, min = 1, max = 10) {
  const buttons = [];
  for (let i = min; i <= max; i++) {
    buttons.push(
      `<button type="button" data-scale="${name}" data-value="${i}" class="${i === value ? "selected" : ""}">${i}</button>`
    );
  }
  return `<div class="quick-log__scale" data-scale-group="${name}">${buttons.join("")}</div>`;
}

/** Formate un temps en minutes (décimal) en "h:mm". */
export function formatDureeHM(minutes) {
  // Arrondit d'abord en secondes entières avant de dériver h/m : arrondir
  // minutes%60 directement peut afficher "00:60" au lieu de "01:00" quand
  // le cumul flotte tout près d'un multiple de 60 (ex. 59.999999...).
  const totalSec = Math.round(minutes * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * PacingTimeline — timeline allure cible + mode (course/marche, §4 du
 * document de stratégie de pacing) + marqueurs nutrition.
 * @param {{km:number, tempsCumule:number, allureCible:number, mode?:"run"|"hike", actionNutrition:string|null}[]} timeline
 */
export function PacingTimeline(timeline) {
  const rows = timeline
    .map((row) => {
      const modeLabel = row.mode === "hike" ? "Marche" : "Course";
      return `
      <tr class="${row.actionNutrition ? "ravito" : ""}">
        <td class="data">${row.km.toFixed(1)} km</td>
        <td class="data">${formatDureeHM(row.tempsCumule)}</td>
        <td class="data">${formatPace(row.allureCible)}</td>
        <td class="data">${row.mode ? `<span class="zone-badge zone-badge--${row.mode}">${modeLabel}</span>` : ""}</td>
        <td>${row.actionNutrition ? escapeHtml(row.actionNutrition) : ""}</td>
      </tr>`;
    })
    .join("");
  return `
    <table class="pacing-timeline">
      <thead><tr><th>Km</th><th>Temps</th><th>Allure</th><th>Mode</th><th>Nutrition</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Interpole l'altitude d'un tracé (points {distanceCumulee, altitude}
 * triés par distance) à une distance donnée — utilisé pour placer les
 * repères sur le profil (ils ne tombent pas forcément pile sur un point du GPX).
 */
function altitudeADistance(points, distanceM) {
  if (distanceM <= points[0].distanceCumulee) return points[0].altitude;
  for (let i = 1; i < points.length; i++) {
    if (distanceM <= points[i].distanceCumulee) {
      const a = points[i - 1];
      const b = points[i];
      const ratio = b.distanceCumulee > a.distanceCumulee ? (distanceM - a.distanceCumulee) / (b.distanceCumulee - a.distanceCumulee) : 0;
      return a.altitude + ratio * (b.altitude - a.altitude);
    }
  }
  return points[points.length - 1].altitude;
}

/** Réduit le nombre de points d'un tracé pour un rendu SVG léger, en gardant premier/dernier. */
function decimerPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const pas = (points.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.round(i * pas)]);
  return out;
}

/**
 * ProfilCourseChart — modélisation du parcours propre à la trace importée :
 * courbe altimétrique réelle (issue du GPX, pas une grille générique) avec
 * les temps de passage à chaque km et aux points significatifs du relief
 * (sommets/creux détectés sur CE tracé) et les marqueurs de ravitaillement.
 * @param {{distanceCumulee:number, altitude:number}[]} profilPoints tracé lissé (ou 2 points plats en mode dégradé)
 * @param {{distanceM:number, tempsCumuleMin:number, label:string}[]} reperesKm
 * @param {{distanceM:number, altitude:number, type:"sommet"|"creux", tempsCumuleMin:number}[]} reperesSignificatifs
 * @param {{km:number, actionNutrition:string|null}[]} ravitosTimeline
 */
export function ProfilCourseChart(profilPoints, reperesKm, reperesSignificatifs = [], ravitosTimeline = []) {
  if (!profilPoints || profilPoints.length < 2) return `<p class="muted">—</p>`;

  const w = 800;
  const h = 240;
  const padLeft = 6;
  const padRight = 6;
  const padTop = 34;
  const padBottom = 40;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const distMax = profilPoints[profilPoints.length - 1].distanceCumulee || 1;
  const altitudes = profilPoints.map((p) => p.altitude);
  const altMin = Math.min(...altitudes);
  const altMax = Math.max(...altitudes);
  const altRange = altMax - altMin || 10;
  const altPad = altRange * 0.15;

  // L'encodage x/y (distance -> position horizontale, altitude -> position
  // verticale) reste strictement le même qu'en 2D — aucune perspective ni
  // rotation qui fausserait la lecture du dénivelé ou des repères. Le rendu
  // "3D" vient d'une extrusion en aplat (ruban de terrain avec une face
  // d'ombre décalée) et d'un lavis en dégradé, pas d'une déformation des
  // données : les temps de passage/km et les sommets/creux restent au pixel
  // près ce qu'ils étaient en 2D.
  const xAt = (d) => padLeft + (d / distMax) * plotW;
  const yAt = (alt) => padTop + plotH - ((alt - (altMin - altPad)) / (altRange + altPad * 2)) * plotH;

  const decimes = decimerPoints(profilPoints, 300);
  const ligne = decimes.map((p) => `${xAt(p.distanceCumulee).toFixed(1)},${yAt(p.altitude).toFixed(1)}`).join(" ");
  const aire = `${xAt(0).toFixed(1)},${(padTop + plotH).toFixed(1)} ${ligne} ${xAt(distMax).toFixed(1)},${(padTop + plotH).toFixed(1)}`;

  // Ruban extrudé (Étape "3D") : une fine face d'ombre décalée sous la
  // ligne de crête, un quadrilatère par segment décimé pour pouvoir foncer
  // l'ombre là où la pente est la plus marquée (hillshading simplifié) —
  // le relief se lit donc un peu plus fort à la pente qu'à la simple
  // couleur, en plus de l'effet de profondeur.
  const EXT_DX = 12;
  const EXT_DY = 9;
  let reliefSvg = "";
  for (let i = 0; i < decimes.length - 1; i++) {
    const a = decimes[i];
    const b = decimes[i + 1];
    const ax = xAt(a.distanceCumulee);
    const ay = yAt(a.altitude);
    const bx = xAt(b.distanceCumulee);
    const by = yAt(b.altitude);
    const dDist = b.distanceCumulee - a.distanceCumulee;
    const pente = dDist > 0 ? Math.abs((b.altitude - a.altitude) / dDist) : 0;
    const opacite = Math.min(0.6, 0.16 + pente * 3.2).toFixed(2);
    reliefSvg += `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${(bx + EXT_DX).toFixed(1)},${(by + EXT_DY).toFixed(1)} ${(ax + EXT_DX).toFixed(1)},${(ay + EXT_DY).toFixed(1)}" fill="color-mix(in srgb, var(--color-accent-strong) 55%, black)" opacity="${opacite}" />`;
  }

  const reperesKmSvg = reperesKm
    .map((r) => {
      const x = xAt(r.distanceM);
      const yPoint = yAt(altitudeADistance(profilPoints, r.distanceM));
      return `
      <line x1="${x.toFixed(1)}" y1="${yPoint.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="var(--color-border)" stroke-dasharray="2,2" />
      <circle cx="${x.toFixed(1)}" cy="${yPoint.toFixed(1)}" r="2.5" fill="var(--color-accent-strong)" />
      <text x="${x.toFixed(1)}" y="${h - 24}" font-size="9" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(r.label)}</text>
      <text x="${x.toFixed(1)}" y="${h - 12}" font-size="9" text-anchor="middle" fill="var(--color-text-muted)">${formatDureeHM(r.tempsCumuleMin)}</text>`;
    })
    .join("");

  const reperesSigSvg = reperesSignificatifs
    .map((r) => {
      const x = xAt(r.distanceM);
      const y = yAt(r.altitude);
      const estSommet = r.type === "sommet";
      const yLabel = estSommet ? y - 8 : y + 16;
      return `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${estSommet ? "var(--color-danger, #d9534f)" : "var(--color-accent, #4a90d9)"}" />
      <text x="${x.toFixed(1)}" y="${yLabel.toFixed(1)}" font-size="9" text-anchor="middle" fill="var(--color-text)">${estSommet ? "▲" : "▼"} ${Math.round(r.altitude)}m · ${formatDureeHM(r.tempsCumuleMin)}</text>`;
    })
    .join("");

  const ravitosSvg = ravitosTimeline
    .filter((t) => t.actionNutrition)
    .map((t) => {
      const x = xAt(t.km * 1000);
      return `<circle cx="${x.toFixed(1)}" cy="${(padTop - 10).toFixed(1)}" r="3" fill="var(--color-warning, #e0a800)" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Profil altimétrique du parcours (relief en volume)">
      <defs>
        <linearGradient id="profil-course-aire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--color-accent-strong);stop-opacity:0.28" />
          <stop offset="100%" style="stop-color:var(--color-accent-strong);stop-opacity:0" />
        </linearGradient>
      </defs>
      <polygon points="${aire}" fill="url(#profil-course-aire)" />
      ${reliefSvg}
      <polyline points="${ligne}" fill="none" stroke="var(--color-accent-strong)" stroke-width="2" stroke-linejoin="round" />
      ${reperesKmSvg}
      ${reperesSigSvg}
      ${ravitosSvg}
    </svg>
    <p class="muted" style="margin-top:4px;">▲ sommet · ▼ creux · point orange = ravitaillement · D+ ${Math.round(altitudes.reduce((acc, _, i) => (i > 0 && altitudes[i] > altitudes[i - 1] ? acc + (altitudes[i] - altitudes[i - 1]) : acc), 0))} m</p>`;
}

/**
 * RouteMapFallback — carte schématique du tracé GPS (forme réelle, nord en
 * haut, échelle) quand MapLibre/les tuiles ne sont pas disponibles (pas de
 * connexion, ou usage terrain hors-ligne — cf. jourCourse.js). Pas de fond
 * de carte réel (rues/relief) : uniquement la géométrie exacte du parcours,
 * projetée localement (geoMap.js) — jamais de distorsion de la forme
 * (échelle x et y identique, contrairement à ProfilCourseChart qui étire
 * volontairement l'altitude). Volontairement épurée : seuls départ, arrivée
 * et ravitaillement sont marqués — ni un point par km, ni un marqueur par
 * sommet/creux (déjà visibles sur le graphique de relief juste en dessous,
 * pas besoin de les dupliquer ici).
 * @param {{lat:number, lon:number, distanceCumulee:number}[]} profilPoints
 * @param {{km:number, actionNutrition:string|null}[]} ravitosTimeline
 */
export function RouteMapFallback(profilPoints, ravitosTimeline = []) {
  if (!profilPoints || profilPoints.length < 2 || profilPoints[0].lat == null) {
    return `<p class="muted">Carte indisponible — importe un GPX pour voir le tracé (mode dégradé sans GPX : pas de coordonnées GPS).</p>`;
  }

  const w = 800;
  const h = 700; // ratio proche du conteneur .route-map (360px) sur mobile — moins de bandes vides autour du tracé projeté
  const pad = 44;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const reference = { lat: profilPoints[0].lat, lon: profilPoints[0].lon };
  const decimes = decimerPoints(profilPoints, 400);
  const plan = projeterPlan(decimes, reference).map((p) => ({ x: p.x, y: -p.y })); // y inversé : nord = haut

  const minX = Math.min(...plan.map((p) => p.x));
  const maxX = Math.max(...plan.map((p) => p.x));
  const minY = Math.min(...plan.map((p) => p.y));
  const maxY = Math.max(...plan.map((p) => p.y));
  const largeurM = maxX - minX || 1;
  const hauteurM = maxY - minY || 1;
  // Échelle unique en x et y : ne jamais déformer la forme réelle du tracé.
  const echelle = Math.min(plotW / largeurM, plotH / hauteurM);
  const offsetX = pad + (plotW - largeurM * echelle) / 2;
  const offsetY = pad + (plotH - hauteurM * echelle) / 2;
  const screenX = (x) => offsetX + (x - minX) * echelle;
  const screenY = (y) => offsetY + (y - minY) * echelle;

  const ligne = plan.map((p) => `${screenX(p.x).toFixed(1)},${screenY(p.y).toFixed(1)}`).join(" ");

  const projeterDistance = (distanceM) => {
    const ll = latLonADistance(profilPoints, distanceM);
    const [p] = projeterPlan([ll], reference);
    return { x: screenX(p.x), y: screenY(-p.y) };
  };

  const ravitoSvg = ravitosTimeline
    .filter((t) => t.actionNutrition)
    .map((t) => {
      const { x, y } = projeterDistance(t.km * 1000);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--color-warning, #e0a800)" />`;
    })
    .join("");

  const depart = plan[0];
  const arrivee = plan[plan.length - 1];

  // Barre d'échelle : ~25% de la largeur du tracé, arrondie à une valeur
  // lisible (1/2/5 × 10ⁿ), en bas à gauche.
  const echelleValeurM = arrondirEchelle((plotW * 0.25) / echelle);
  const echelleLongueurPx = echelleValeurM * echelle;
  const echelleLabel = echelleValeurM >= 1000 ? `${(echelleValeurM / 1000).toFixed(echelleValeurM % 1000 === 0 ? 0 : 1)} km` : `${echelleValeurM} m`;
  const echelleX = pad;
  const echelleY = h - 16;

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte schématique du tracé (mode hors-ligne, sans fond de carte)">
      <polyline points="${ligne}" fill="none" stroke="var(--color-accent-strong)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      ${ravitoSvg}
      <circle cx="${screenX(depart.x).toFixed(1)}" cy="${screenY(depart.y).toFixed(1)}" r="5" fill="var(--color-structural-strong)" stroke="var(--color-surface)" stroke-width="2" />
      <text x="${screenX(depart.x).toFixed(1)}" y="${(screenY(depart.y) + 18).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--color-text-muted)">Départ</text>
      <circle cx="${screenX(arrivee.x).toFixed(1)}" cy="${screenY(arrivee.y).toFixed(1)}" r="5" fill="var(--color-functional-strong)" stroke="var(--color-surface)" stroke-width="2" />
      <text x="${screenX(arrivee.x).toFixed(1)}" y="${(screenY(arrivee.y) + 18).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--color-text-muted)">Arrivée</text>
      <g aria-hidden="true">
        <polygon points="${w - 34},${20} ${w - 28},${34} ${w - 40},${34}" fill="var(--color-text-muted)" />
        <text x="${w - 34}" y="${48}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--color-text-muted)">N</text>
      </g>
      <g aria-hidden="true">
        <line x1="${echelleX}" y1="${echelleY}" x2="${(echelleX + echelleLongueurPx).toFixed(1)}" y2="${echelleY}" stroke="var(--color-text-muted)" stroke-width="1.5" />
        <line x1="${echelleX}" y1="${echelleY - 4}" x2="${echelleX}" y2="${echelleY + 4}" stroke="var(--color-text-muted)" stroke-width="1.5" />
        <line x1="${(echelleX + echelleLongueurPx).toFixed(1)}" y1="${echelleY - 4}" x2="${(echelleX + echelleLongueurPx).toFixed(1)}" y2="${echelleY + 4}" stroke="var(--color-text-muted)" stroke-width="1.5" />
        <text x="${(echelleX + echelleLongueurPx / 2).toFixed(1)}" y="${echelleY - 8}" font-size="10" text-anchor="middle" fill="var(--color-text-muted)">${echelleLabel}</text>
      </g>
    </svg>
    <p class="muted" style="margin-top:4px;">Carte schématique (hors-ligne ou fond de carte indisponible) — tracé GPS exact, sans rues ni relief. Point orange = ravitaillement.</p>`;
}
