// Export calendrier — Partie III §9. Génère un fichier .ics (RFC 5545)
// avec un événement par séance datée du plan, pour import dans n'importe
// quel calendrier (Google Calendar, Apple Calendar, Outlook...).
// Entièrement côté client, aucune dépendance.

import { formatPace } from "../engines/vdot.js";

/** Échappe une valeur de propriété ICS (RFC 5545 §3.3.11). */
function echapperTexte(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Replie une ligne dépassant 75 octets, comme l'exige RFC 5545 §3.1. */
function replierLigne(ligne) {
  const encoder = new TextEncoder();
  if (encoder.encode(ligne).length <= 75) return ligne;
  const morceaux = [];
  let reste = ligne;
  let premier = true;
  while (reste.length) {
    const limite = premier ? 75 : 74; // continuation commence par un espace (1 octet)
    let coupe = Math.min(limite, reste.length);
    // Ne jamais couper au milieu d'un caractère multi-octet (UTF-8).
    while (coupe > 0 && encoder.encode(reste.slice(0, coupe)).length > limite) coupe--;
    morceaux.push((premier ? "" : " ") + reste.slice(0, coupe));
    reste = reste.slice(coupe);
    premier = false;
  }
  return morceaux.join("\r\n");
}

function dateAujourdhuiICS(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function dateJourICS(dateISO) {
  return dateISO.slice(0, 10).replace(/-/g, "");
}

function lendemainICS(dateISO) {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const ZONE_LABEL = { E: "Endurance fondamentale", M: "Allure marathon", T: "Seuil", I: "Interval", R: "Répétition" };

/**
 * Construit la description texte d'une séance pour le champ DESCRIPTION.
 * @param {object} seance SeanceConcrete
 */
function decrireSeance(seance) {
  const lignes = [];
  lignes.push(`Zone ${seance.zoneDaniels} — ${ZONE_LABEL[seance.zoneDaniels] ?? seance.zoneDaniels}`);
  if (seance.distanceKm != null) lignes.push(`Distance : ${seance.distanceKm.toFixed(1)} km`);
  lignes.push(`Durée : ${Math.round(seance.volumeSeanceMin)} min`);
  if (seance.allureCibleMinParKm != null) lignes.push(`Allure cible : ${formatPace(seance.allureCibleMinParKm)}`);
  if (seance.structureDetaillee?.format) lignes.push(`Programme : ${seance.structureDetaillee.format}`);
  return lignes.join("\n");
}

/**
 * Génère un calendrier .ics contenant un événement (journée entière) par
 * séance datée du plan (les séances sans date précise — plan généré sans
 * jours d'entraînement choisis — sont ignorées, faute de savoir quel jour
 * leur attribuer).
 * @param {object} plan Plan complet (voir planGenerator.js)
 * @returns {{ics:string, nbEvenements:number}}
 */
export function genererIcs(plan) {
  const maintenant = dateAujourdhuiICS(new Date());
  const evenements = [];
  let nbEvenements = 0;

  for (const semaine of plan.semaines) {
    semaine.seances.forEach((seance, index) => {
      if (!seance.date) return; // pas de date précise -> pas d'événement possible
      nbEvenements++;
      const uid = `${plan.id}-s${semaine.numero}-${index}@voyafe-training`;
      const lignes = [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${maintenant}`,
        `DTSTART;VALUE=DATE:${dateJourICS(seance.date)}`,
        `DTEND;VALUE=DATE:${lendemainICS(seance.date)}`,
        `SUMMARY:${echapperTexte(`${seance.nom} (${seance.zoneDaniels})`)}`,
        `DESCRIPTION:${echapperTexte(decrireSeance(seance))}`,
        "END:VEVENT",
      ];
      evenements.push(...lignes.map(replierLigne));
    });
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coach Running pour Rémi//FR",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${echapperTexte(plan.objectif ?? "Plan d'entraînement Coach Running")}`,
    ...evenements,
    "END:VCALENDAR",
  ].join("\r\n");

  return { ics, nbEvenements };
}

export function telechargerIcs(icsString, nomFichier = `voyafe-training-plan-${Date.now()}.ics`) {
  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
