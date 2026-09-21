// Catalogue d'exercices de renforcement — cadrage produit Section 11.
// Catégories : gainage, proprioception, specifique_course, mobilite.
// `type` (doc technique Section 9) distingue la modalité de travail :
// renfo lourd (charge/résistance) et pliométrie (impact/explosivité) sont
// deux formes complémentaires du renfo course à pied, à côté du gainage
// isométrique, du travail dynamique léger et de la mobilité.

export const RENFO_CATEGORIES = {
  gainage: "Gainage",
  proprioception: "Proprioception / chevilles",
  specifique_course: "Spécifique course",
  mobilite: "Mobilité",
};

export const RENFO_TYPES = {
  isometrique: "Isométrique",
  dynamique: "Dynamique",
  lourd: "Renfo lourd",
  pliometrie: "Pliométrie",
  mobilite: "Mobilité",
};

export const RENFO_EXERCISES = [
  { id: "gainage_planche", categorie: "gainage", type: "isometrique", nom: "Planche ventrale", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_planche_laterale", categorie: "gainage", type: "isometrique", nom: "Planche latérale", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_dead_bug", categorie: "gainage", type: "dynamique", nom: "Dead bug", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_bird_dog", categorie: "gainage", type: "dynamique", nom: "Bird dog", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_pallof", categorie: "gainage", type: "isometrique", nom: "Pallof press", niveau: "intermediaire", materiel: "elastique" },
  { id: "gainage_pallof_rotation", categorie: "gainage", type: "dynamique", nom: "Pallof press avec rotation", niveau: "intermediaire", materiel: "elastique" },
  { id: "gainage_roulette_abdominale", categorie: "gainage", type: "lourd", nom: "Roulette abdominale (ab wheel)", niveau: "avance", materiel: "roulette" },

  { id: "proprio_appui_unipodal", categorie: "proprioception", type: "isometrique", nom: "Appui unipodal yeux ouverts/fermés", niveau: "debutant", materiel: "aucun" },
  { id: "proprio_coussin", categorie: "proprioception", type: "isometrique", nom: "Équilibre sur coussin proprioceptif", niveau: "intermediaire", materiel: "coussin" },
  { id: "proprio_montees_cheville", categorie: "proprioception", type: "dynamique", nom: "Montées sur pointe unipodal", niveau: "debutant", materiel: "aucun" },
  { id: "proprio_sauts_stabilisation", categorie: "proprioception", type: "pliometrie", nom: "Sauts avec stabilisation unipodale", niveau: "avance", materiel: "aucun" },
  { id: "proprio_bosu_squat", categorie: "proprioception", type: "dynamique", nom: "Squat sur bosu/plateau instable", niveau: "intermediaire", materiel: "bosu" },
  { id: "proprio_saut_lateral_stabilisation", categorie: "proprioception", type: "pliometrie", nom: "Saut latéral avec stabilisation unipodale", niveau: "avance", materiel: "aucun" },

  { id: "specifique_mollets_debout", categorie: "specifique_course", type: "dynamique", nom: "Extensions mollets debout", niveau: "debutant", materiel: "aucun" },
  { id: "specifique_mollets_genou_flechi", categorie: "specifique_course", type: "dynamique", nom: "Extensions mollets genou fléchi", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_mollets_lourd", categorie: "specifique_course", type: "lourd", nom: "Mollets lourds (barre ou presse)", niveau: "avance", materiel: "barre/presse" },
  { id: "specifique_ischios_nordic", categorie: "specifique_course", type: "lourd", nom: "Nordic hamstring curl", niveau: "avance", materiel: "aucun", excentrique: true },
  { id: "specifique_ischios_pont", categorie: "specifique_course", type: "dynamique", nom: "Pont fessier unipodal", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_ischios_souleve_terre_unipodal", categorie: "specifique_course", type: "lourd", nom: "Soulevé de terre roumain unipodal", niveau: "avance", materiel: "haltères" },
  { id: "specifique_fessiers_hip_thrust", categorie: "specifique_course", type: "lourd", nom: "Hip thrust", niveau: "intermediaire", materiel: "banc" },
  { id: "specifique_quadriceps_excentrique", categorie: "specifique_course", type: "lourd", nom: "Squat bulgare excentrique lent (descente)", niveau: "avance", materiel: "banc", excentrique: true },
  { id: "specifique_quadriceps_squat_gobelet", categorie: "specifique_course", type: "lourd", nom: "Squat gobelet (goblet squat)", niveau: "intermediaire", materiel: "haltère/kettlebell" },
  { id: "specifique_quadriceps_fentes_lestees", categorie: "specifique_course", type: "lourd", nom: "Fentes marchées lestées", niveau: "intermediaire", materiel: "haltères" },
  { id: "specifique_quadriceps_step_down", categorie: "specifique_course", type: "dynamique", nom: "Step-down excentrique", niveau: "intermediaire", materiel: "step", excentrique: true },
  { id: "specifique_mollets_excentrique", categorie: "specifique_course", type: "lourd", nom: "Descente de mollets excentrique (drop calf raise)", niveau: "intermediaire", materiel: "step", excentrique: true },
  { id: "specifique_pliometrie_bondissements", categorie: "specifique_course", type: "pliometrie", nom: "Bondissements alternés (bounding)", niveau: "avance", materiel: "aucun" },
  { id: "specifique_pliometrie_squat_jump", categorie: "specifique_course", type: "pliometrie", nom: "Squat jump", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_pliometrie_skipping", categorie: "specifique_course", type: "pliometrie", nom: "Skipping genoux hauts explosif", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_pliometrie_drop_jump", categorie: "specifique_course", type: "pliometrie", nom: "Drop jump (saut en contrebas)", niveau: "avance", materiel: "step" },

  { id: "mobilite_hanches", categorie: "mobilite", type: "mobilite", nom: "Mobilité hanches (90/90)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_chevilles", categorie: "mobilite", type: "mobilite", nom: "Mobilité chevilles (dorsiflexion genou au mur)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_colonne", categorie: "mobilite", type: "mobilite", nom: "Mobilité thoracique (cat-cow, rotations)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_ischios", categorie: "mobilite", type: "mobilite", nom: "Étirement dynamique ischio-jambiers (montées de jambe)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_pieds", categorie: "mobilite", type: "mobilite", nom: "Mobilité des pieds et des orteils", niveau: "debutant", materiel: "aucun" },
];

export function renfoByCategorie(categorie) {
  return RENFO_EXERCISES.filter((e) => e.categorie === categorie);
}

export function renfoByType(type) {
  return RENFO_EXERCISES.filter((e) => e.type === type);
}
