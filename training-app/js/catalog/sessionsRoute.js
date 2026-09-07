// Catalogue de séances — Route. Partie I, Section 6.
// Schéma commun "fiche séance standard" (Partie I §5).

export const SESSIONS_ROUTE = [
  {
    id: "route_footing_recup",
    nom: "Footing récupération",
    discipline: "route",
    objectifPhysiologique: "Récupération active, clairance métabolique",
    phase: ["base", "developpement", "entretien", "taper"],
    zoneDaniels: "E",
    zoneCiblePct: { min: 0.59, max: 0.7 },
    rpe: "2-3",
    corpsDeSeance: {
      format: "Continu",
      dureeMin: [20, 40],
      contrainteVolume: "Bas de la fourchette E",
      ratioEffortRecup: "n/a",
    },
    frequenceRecommandee: "Lendemain de séance qualité",
    precautions: null,
  },
  {
    id: "route_endurance_fondamentale",
    nom: "Endurance fondamentale",
    discipline: "route",
    objectifPhysiologique: "Développement de la capacité aérobie de base, densité mitochondriale",
    phase: ["base", "developpement", "entretien", "taper"],
    zoneDaniels: "E",
    zoneCiblePct: { min: 0.65, max: 0.74 },
    rpe: "3-4",
    corpsDeSeance: {
      // La variante "lignes droites" ne s'applique qu'en phase Développement
      // (Partie I §6.1) — résolue dynamiquement selon la phase de la semaine,
      // voir resoudreEnduranceFondamentale (structureSeance.js). Auparavant
      // annoncée en dur pour toutes les phases (Base, Affûtage y compris),
      // ce qui ne correspondait pas à la fiche.
      type: "endurance_fondamentale",
      dureeMin: [45, 150],
      contrainteVolume: "≤30% du volume hebdo si volume hebdo <64 km",
      ratioEffortRecup: "n/a",
    },
    frequenceRecommandee: "Cœur du volume hebdomadaire (70-80%)",
    precautions: null,
  },
  {
    id: "route_sortie_longue",
    nom: "Sortie longue (E + bloc M)",
    discipline: "route",
    objectifPhysiologique: "Endurance, résistance à la fatigue, spécificité allure course",
    phase: ["base", "developpement"],
    zoneDaniels: "M",
    zoneCiblePct: { min: 0.75, max: 0.84 },
    rpe: "5",
    corpsDeSeance: {
      format: "Majorité en E, bloc M inséré",
      contrainteVolume: "Portion M ≤ min(110 min, 29 km) ; ≤20% volume hebdo pour la séance M",
      ratioEffortRecup: "continu ou blocs",
      progression: "+10%/semaine max (heuristique de sécurité, pas une loi physiologique stricte)",
    },
    frequenceRecommandee: "1×/semaine, fin de semaine",
    precautions: null,
  },
  {
    id: "route_fartlek",
    nom: "Fartlek libre",
    discipline: "route",
    objectifPhysiologique: "Variation de rythme, transition ludique base -> développement, tolérance au changement d'allure",
    phase: ["base", "entretien"],
    zoneDaniels: "E",
    zoneCiblePct: { min: 0.7, max: 1.0 },
    rpe: "4-6",
    corpsDeSeance: {
      // Résolu en une prescription précise (nombre ET durée de relance),
      // progressive avec la position dans la phase — voir resoudreFartlek
      // (structureSeance.js) et son appel dans instancierSeance.
      type: "fartlek",
      relancesNbRange: [8, 12],
      relanceDureeMinRange: [0.5, 2],
      dureeMin: [40, 60],
      contrainteVolume: "≤15% du volume hebdo",
      ratioEffortRecup: "1:1",
    },
    frequenceRecommandee: "Fin de phase Base / transition vers Développement",
    precautions: null,
  },
  {
    id: "route_progressif",
    nom: "Sortie progressive (négative split)",
    discipline: "route",
    objectifPhysiologique: "Transition aérobie -> seuil, gestion d'allure en fin d'effort fatigué",
    phase: ["base", "entretien"],
    zoneDaniels: "E",
    zoneCiblePct: { min: 0.65, max: 0.88 },
    rpe: "4-7",
    corpsDeSeance: {
      // Résolu en repères de temps précis (0-X min en E, accélération jusqu'à
      // Y min) — voir resoudreProgressif (structureSeance.js).
      type: "progressif",
      finPhaseEFraction: 0.5,
      debutPhaseSeuilFraction: 0.67,
      dureeMin: [40, 70],
      contrainteVolume: "≤20% du volume hebdo",
      ratioEffortRecup: "n/a",
    },
    frequenceRecommandee: "Fin de phase Base / transition vers Développement",
    precautions: null,
  },
  {
    id: "route_seuil_cruise",
    nom: "Seuil fractionné (cruise intervals)",
    discipline: "route",
    objectifPhysiologique: "Repousser le seuil lactique sur un volume supérieur à la version continue, moins de fatigue en fin de session",
    phase: ["developpement"],
    zoneDaniels: "T",
    zoneCiblePct: { min: 0.86, max: 0.88 },
    rpe: "6-7",
    corpsDeSeance: {
      type: "repetitions",
      repDureeMinRange: [6, 10],
      nbRepsRange: [3, 5],
      // Volume total cible (Partie I §5, dureeMin) — sans lui, instancierSeance()
      // retombait sur un volume générique de 30 min sans lien avec cette séance
      // (3-5 × 6-10 min + récup ≈ 28-46 min réels), produisant parfois un
      // nombre de répétitions écrasé (jusqu'à 1 seule) et donc une prescription
      // ("1 × 8 min") très inférieure au volume/distance affichés en en-tête.
      dureeMin: [28, 46],
      contrainteVolume: "≤10% du volume hebdo",
      // "Cruise intervals" (Daniels) : récupération COURTE (≈1 min), pas
      // proportionnellement longue — "1:6" (6× la durée de l'effort, ~48 min
      // de récup pour un effort de 8 min) était inversé par rapport à la
      // convention effort:récup du reste du catalogue (ex. côtes longues
      // "5:1") et à l'esprit même des cruise intervals.
      ratioEffortRecup: "6:1",
      recupLabel: "trot",
    },
    frequenceRecommandee: "Alternative au tempo continu, notamment quand l'axe de travail est l'endurance/durabilité aérobie",
    precautions: null,
    protocoleEchauffement: true,
  },
  {
    id: "route_seuil",
    nom: "Seuil (T)",
    discipline: "route",
    objectifPhysiologique: "Repousser le seuil lactique, tolérance à l'effort soutenu",
    phase: ["developpement"],
    zoneDaniels: "T",
    zoneCiblePct: { min: 0.86, max: 0.88 },
    rpe: "6-7",
    corpsDeSeance: {
      format: "Tempo continu",
      contrainteVolume: "≤10% du volume hebdo",
      ratioEffortRecup: "n/a",
    },
    frequenceRecommandee: "1×/semaine (phase Développement)",
    precautions: null,
    protocoleEchauffement: true,
  },
  {
    id: "route_interval",
    nom: "Interval (I — VMA/VO2max)",
    discipline: "route",
    objectifPhysiologique: "Développement du VO2max",
    phase: ["developpement"],
    zoneDaniels: "I",
    zoneCiblePct: { min: 0.95, max: 1.0 },
    rpe: "7-8",
    corpsDeSeance: {
      type: "repetitions",
      repDureeMinRange: [3, 5],
      nbRepsRange: [4, 6],
      // Volume total cible (4-6 × 3-5 min + récup ≈ 32-48 min réels) — sans
      // lui, retombait sur un volume générique de 30 min sans lien direct
      // avec cette séance (cf. route_seuil_cruise, même bug).
      dureeMin: [32, 48],
      contrainteVolume: "≤8% du volume hebdo — au-delà, le risque dépasse le bénéfice marginal",
      ratioEffortRecup: "1:1",
      recupLabel: "trot",
    },
    frequenceRecommandee: "1×/semaine en alternance avec R (phase Développement)",
    precautions: null,
    protocoleEchauffement: true,
  },
  {
    id: "route_repetition",
    nom: "Repetition (R — vitesse/économie)",
    discipline: "route",
    objectifPhysiologique: "Mécanique de course et économie, pas filière aérobie",
    phase: ["developpement"],
    zoneDaniels: "R",
    zoneCiblePct: { min: 1.05, max: 1.2 },
    rpe: "8-9",
    corpsDeSeance: {
      type: "repetitions",
      repDistanceKmRange: [0.2, 0.4],
      nbRepsRange: [8, 12],
      // Volume total cible (8-12 × 200-400 m + récup ≈ 28-42 min réels) —
      // sans lui, retombait sur un volume générique de 30 min sans lien
      // direct avec cette séance (cf. route_seuil_cruise, même bug).
      dureeMin: [28, 42],
      contrainteVolume: "≤5% du volume hebdo",
      ratioEffortRecup: "1:2 à 1:3",
      recupLabel: "marche/trot",
    },
    frequenceRecommandee: "1×/semaine en alternance avec I (phase Développement)",
    precautions: null,
    protocoleEchauffement: true,
  },
];
