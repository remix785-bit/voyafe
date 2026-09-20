// Catalogue de séances route — cadrage produit Section 4 (types de séances)
// et doc technique Section 4. Plusieurs variantes par type pour casser la
// monotonie du plan. `phases` = phases de macrocycle où la séance est éligible.

export const SESSIONS_ROUTE = [
  {
    id: "route_e_footing",
    type: "E",
    zone: "E",
    label: "Footing fondamental",
    phases: ["base", "developpement", "affutage"],
    structure: [{ bloc: "corps", zone: "E", description: "Footing continu allure E" }],
  },
  {
    id: "route_e_vallonne",
    type: "E",
    zone: "E",
    label: "Footing vallonné",
    phases: ["base", "developpement"],
    structure: [{ bloc: "corps", zone: "E", description: "Footing sur parcours vallonné, allure E au ressenti" }],
  },
  {
    id: "route_e_progressif",
    type: "E",
    zone: "E",
    label: "Footing progressif",
    phases: ["base", "developpement"],
    structure: [
      { bloc: "corps_1", zone: "E", description: "2/3 du volume en allure E facile" },
      { bloc: "corps_2", zone: "M", description: "1/3 final en accélérant vers allure M" },
    ],
  },
  {
    id: "route_longue_standard",
    type: "longue",
    zone: "E",
    label: "Sortie longue",
    phases: ["base", "developpement"],
    structure: [{ bloc: "corps", zone: "E", description: "Sortie longue continue, allure E" }],
  },
  {
    id: "route_longue_allure_marathon",
    type: "longue",
    zone: "M",
    label: "Sortie longue avec finish allure M",
    phases: ["developpement", "affutage"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "1h à 1h30 en allure E" },
      { bloc: "corps", zone: "M", description: "20-40 min finale en allure M" },
    ],
  },
  {
    id: "route_seuil_continu",
    type: "T",
    zone: "T",
    label: "Seuil continu (tempo)",
    phases: ["developpement"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "15-20 min" },
      { bloc: "corps", zone: "T", description: "20-40 min continu allure T" },
      { bloc: "retour_calme", zone: "E", description: "10 min" },
    ],
  },
  {
    id: "route_seuil_cruise",
    type: "T",
    zone: "T",
    label: "Cruise intervals (seuil fractionné)",
    phases: ["developpement"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "15-20 min" },
      { bloc: "corps", zone: "T", description: "4-6 x 1200-1600 m allure T, récup 1 min trot" },
      { bloc: "retour_calme", zone: "E", description: "10 min" },
    ],
  },
  {
    id: "route_intervalles_vo2",
    type: "I",
    zone: "I",
    label: "Intervalles VO2max",
    phases: ["developpement"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "20 min + gammes" },
      { bloc: "corps", zone: "I", description: "5-8 x 800-1000 m allure I, récup complète (trot égal au temps d'effort)" },
      { bloc: "retour_calme", zone: "E", description: "10-15 min" },
    ],
  },
  {
    id: "route_intervalles_courts",
    type: "I",
    zone: "I",
    label: "Intervalles courts VO2max",
    phases: ["developpement"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "20 min + gammes" },
      { bloc: "corps", zone: "I", description: "10-12 x 400 m allure I, récup 200 m trot" },
      { bloc: "retour_calme", zone: "E", description: "10-15 min" },
    ],
  },
  {
    id: "route_repetitions_vitesse",
    type: "R",
    zone: "R",
    label: "Répétitions vitesse/économie",
    phases: ["base", "developpement", "affutage"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "20 min + gammes + lignes droites" },
      { bloc: "corps", zone: "R", description: "8-12 x 200 m allure R, récup complète marchée" },
      { bloc: "retour_calme", zone: "E", description: "10 min" },
    ],
  },
  {
    id: "route_repetitions_cotes",
    type: "R",
    zone: "R",
    label: "Répétitions côtes courtes",
    phases: ["base", "developpement"],
    structure: [
      { bloc: "echauffement", zone: "E", description: "20 min" },
      { bloc: "corps", zone: "R", description: "8-10 x côte 15-20s effort maximal, récup descente marchée" },
      { bloc: "retour_calme", zone: "E", description: "10 min" },
    ],
  },
  {
    id: "route_footing_recuperation",
    type: "recuperation",
    zone: "E",
    label: "Footing de récupération",
    phases: ["base", "developpement", "affutage"],
    structure: [{ bloc: "corps", zone: "E", description: "20-35 min très facile, plus court qu'un footing E standard" }],
  },
];
