// Catalogue de séances — Trail. Partie I, Section 7.
// Les allures sont GAP-ajustées (Minetti) à l'instanciation, cf. engines/gap.js.

export const SESSIONS_TRAIL = [
  {
    id: "trail_cotes_courtes",
    nom: "Côtes courtes",
    discipline: "trail",
    objectifPhysiologique: "Proche zone I, puissance en côte",
    phase: ["developpement"],
    zoneDaniels: "I",
    rpe: "8-9",
    corpsDeSeance: {
      format: "8-12 × 1-2 min montée forte pente, récup descente trot/marche",
      contrainteVolume: "≤8% du volume hebdo (règle I-pace)",
      ratioEffortRecup: "1:1 approx (descente active)",
    },
    frequenceRecommandee: "1×/semaine en alternance avec côtes longues (phase Développement)",
    precautions: null,
    gapAjuste: true,
  },
  {
    id: "trail_cotes_longues",
    nom: "Côtes longues",
    discipline: "trail",
    objectifPhysiologique: "Proche zone T, endurance de force en côte",
    phase: ["developpement"],
    zoneDaniels: "T",
    rpe: "6-7",
    corpsDeSeance: {
      format: "3-5 × 6-10 min montée pente modérée, récup descente active",
      contrainteVolume: "≤10% du volume hebdo",
      ratioEffortRecup: "5:1 approx",
    },
    frequenceRecommandee: "1×/semaine en alternance avec côtes courtes (phase Développement)",
    precautions: null,
    gapAjuste: true,
  },
  {
    id: "trail_sortie_dplus_progressif",
    nom: "Sortie D+ progressif",
    discipline: "trail",
    objectifPhysiologique: "Endurance spécifique dénivelé, calée sur le profil de la course cible",
    phase: ["base", "developpement"],
    zoneDaniels: "E",
    rpe: "3-5",
    corpsDeSeance: {
      format: "D+ cumulé croissant sur le cycle",
      contrainteVolume: "Calé sur le profil de la course cible",
      ratioEffortRecup: "continu",
    },
    frequenceRecommandee: "1×/semaine",
    precautions:
      "Au-delà de -15/-20% de pente en descente, piloter par le RPE et la tolérance musculaire, pas par l'allure GAP (coût de freinage excentrique).",
    gapAjuste: true,
  },
  {
    id: "trail_descente_technique",
    nom: "Descente technique — introduction progressive",
    discipline: "trail",
    objectifPhysiologique: "Effet de répétition (repeated bout effect) — réduit dommages musculaires et courbatures",
    phase: ["base", "developpement"],
    zoneDaniels: "E",
    rpe: "4-6",
    corpsDeSeance: {
      format:
        "Première exposition courte (5-8 min, pente modérée) 3-4 semaines avant d'intensifier, puis 5-8 × 3-5 min segments techniques, volume croissant",
      contrainteVolume: "Volume croissant progressivement",
      ratioEffortRecup: "n/a",
    },
    frequenceRecommandee: "1×/2 semaines en phase Base, jusqu'à 1×/semaine en Développement",
    precautions: "Jamais en fin de bloc avant une sortie longue ou une course.",
    gapAjuste: false, // piloté par RPE/tolérance, pas par l'allure
  },
  {
    id: "trail_sortie_longue_specifique",
    nom: "Sortie longue trail spécifique",
    discipline: "trail",
    objectifPhysiologique: "Répétition générale — durée/D+ proches du profil de course réelle, test nutrition/hydratation",
    phase: ["developpement"],
    zoneDaniels: "E",
    rpe: "3-5",
    corpsDeSeance: {
      format: "Durée/D+ proches du profil de course réelle",
      contrainteVolume: "n/a",
      ratioEffortRecup: "continu",
    },
    frequenceRecommandee: "1 répétition générale 3-4 semaines avant l'échéance",
    precautions: null,
    gapAjuste: true,
  },
];
