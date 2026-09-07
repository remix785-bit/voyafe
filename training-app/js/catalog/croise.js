// Catalogue Croisé (cross-training) — activité complémentaire à la course
// (vélo, natation, ski, elliptique…) à faible impact articulaire. Présente
// CHAQUE semaine dans les deux plans de référence dépouillés (Le Coaching du
// Coureur, plans PDF 42,2 km route et 50 km trail) au même titre que le
// renforcement — jusqu'ici absente de toute recommandation générée par
// l'app (seulement une case "activité au choix" laissée à l'utilisateur,
// jamais suggérée). Mirror volontaire du schéma renfo.js (catalogue +
// `xPourPhase(phase)`) : une recommandation affichée à côté du plan, qui ne
// consomme pas un des créneaux de course choisis par l'utilisateur.

export const CROISE_CATALOG = [
  {
    id: "croise_endurance",
    nom: "Croisé (activité complémentaire)",
    phase: ["base", "developpement", "entretien"],
    frequenceParSemaine: 1,
    dureeMinRange: [40, 90],
    exemples: ["Vélo", "Natation", "Ski de fond", "Elliptique", "Aviron"],
    note: "Intensité basse à modérée (Z1-Z2, cf. plans de référence) — renforce le système cardiovasculaire sans l'impact répété de la course. En complément des séances de course, pas en remplacement ; utile aussi pour ménager une articulation fragile sans perdre de forme.",
  },
];

export function croisePourPhase(phase) {
  return CROISE_CATALOG.filter((c) => c.phase.includes(phase));
}
