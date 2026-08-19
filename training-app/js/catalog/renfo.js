// Catalogue Renforcement musculaire — Partie I, Section 9.
// Référence clé : Eihara et al. (2022) — renfo lourd (g=-0.32) prioritaire sur
// la pliométrie seule (g=-0.13) pour l'économie de course.

export const RENFO_CATALOG = [
  {
    id: "renfo_force_max",
    nom: "Force max / renfo lourd",
    phase: ["base"],
    priorite: 1,
    frequenceParSemaine: 2,
    exercices: [
      { nom: "Squat", format: "3-5 séries × 3-6 reps à 85-90% 1RM, récup 2-3 min" },
      { nom: "Presse à cuisses ou fentes chargées", format: "3-5 séries × 3-6 reps à 85-90% 1RM, récup 2-3 min" },
      { nom: "Soulevé de terre", format: "3-5 séries × 3-6 reps à 85-90% 1RM, récup 2-3 min" },
      { nom: "Complément PPG (gainage, chaîne postérieure légère, mollets)", format: "2-3 × 12-15 reps" },
    ],
    note: "Prioritaire sur la pliométrie seule pour l'économie de course (Eihara et al. 2022).",
  },
  {
    id: "renfo_excentrique",
    nom: "Renfo excentrique",
    phase: ["developpement"],
    priorite: 2,
    frequenceParSemaine: [1, 2],
    delaiMinAvecSeanceQualiteH: 48,
    exercices: [
      { nom: "Squat bulgare excentrique lent", format: "3-4 séries × 6-10 reps, tempo 3-4s phase excentrique" },
      { nom: "Descente de step contrôlée", format: "3-4 séries × 6-10 reps, tempo 3-4s phase excentrique" },
      { nom: "Mollets excentrique unilatéral", format: "3-4 séries × 6-10 reps, tempo 3-4s phase excentrique" },
    ],
    note: "Clé pour la descente en trail — voir introduction progressive (repeated bout effect), catalogue trail.",
  },
  {
    id: "renfo_pliometrie",
    nom: "Pliométrie",
    phase: ["developpement"],
    priorite: 3,
    frequenceParSemaine: 1,
    exercices: [
      { nom: "Sauts sur banc", format: "3-4 séries × 6-8 reps, récup complète" },
      { nom: "Skipping", format: "3-4 séries × 6-8 reps, récup complète" },
      { nom: "Bondissements", format: "3-4 séries × 6-8 reps, récup complète" },
      { nom: "Sauts unilatéraux", format: "3-4 séries × 6-8 reps, récup complète" },
    ],
    note: "Effet démontré surtout aux vitesses ≤12 km/h — pertinent en particulier pour le trail/D+.",
    contreIndiqueEnAffutage: true,
  },
  {
    id: "renfo_maintenance",
    nom: "Renfo maintenance",
    phase: ["affutage"],
    priorite: 4,
    frequenceParSemaine: 1,
    exercices: [{ nom: "Gainage + proprioception légère", format: "Volume -50% vs phase Développement" }],
    note: null,
  },
];

export function renfoPourPhase(phase) {
  return RENFO_CATALOG.filter((r) => r.phase.includes(phase));
}
