// Protocoles standard d'échauffement et de retour au calme — Partie I §5.1/5.2.
// Ne s'appliquent qu'aux séances à intensité (T/I/R et équivalents trail) pour
// l'échauffement ; le retour au calme s'applique à toute séance qualité.

export const ECHAUFFEMENT_INTENSITE = {
  applicableZones: ["T", "I", "R"],
  dureeTotaleMin: [30, 35],
  phases: [
    {
      nom: "Mise en route aérobie",
      dureeMin: [15, 20],
      contenu: "Footing en zone E basse (60-65% VO2max) — élève la température musculaire et le débit sanguin.",
    },
    {
      nom: "Gammes / éducatifs",
      dureeMin: [8, 10],
      contenu:
        "Talons-fesses, montées de genoux, pas chassés, skipping bas, fentes marchées — 2-3 séries de 20-30 m par exercice, focus amplitude et posture, pas de vitesse.",
    },
    {
      nom: "Accélérations progressives",
      format: "4-6 × 80-100 m",
      contenu:
        "Accélération progressive jusqu'à ~90-95% de l'allure R, retour marché/trot entre chaque — active le système neuromusculaire sans créer de fatigue avant le corps de séance.",
    },
  ],
};

export const RETOUR_AU_CALME = {
  phases: [
    {
      nom: "Footing",
      dureeMin: [10, 15],
      contenu: "Zone E basse / récupération — favorise la clairance progressive du lactate.",
    },
    {
      nom: "Routine de mobilité",
      dureeMin: [5, 8],
      contenu:
        "Étirements doux, non forcés (pas de rebond), sur mollets/ischio-jambiers/quadriceps/fessiers — confort, pas gain d'amplitude.",
    },
  ],
  precaution:
    "La littérature sur les étirements post-effort est mitigée quant à leur effet sur la récupération — protocole volontairement doux, pas présenté comme un levier de performance démontré.",
};
