// Catalogue d'exercices de renforcement — cadrage produit Section 11.
// Catégories : gainage, proprioception, specifique_course, mobilite.

export const RENFO_CATEGORIES = {
  gainage: "Gainage",
  proprioception: "Proprioception / chevilles",
  specifique_course: "Spécifique course",
  mobilite: "Mobilité",
};

export const RENFO_EXERCISES = [
  { id: "gainage_planche", categorie: "gainage", nom: "Planche ventrale", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_planche_laterale", categorie: "gainage", nom: "Planche latérale", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_dead_bug", categorie: "gainage", nom: "Dead bug", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_bird_dog", categorie: "gainage", nom: "Bird dog", niveau: "debutant", materiel: "aucun" },
  { id: "gainage_pallof", categorie: "gainage", nom: "Pallof press", niveau: "intermediaire", materiel: "elastique" },

  { id: "proprio_appui_unipodal", categorie: "proprioception", nom: "Appui unipodal yeux ouverts/fermés", niveau: "debutant", materiel: "aucun" },
  { id: "proprio_coussin", categorie: "proprioception", nom: "Équilibre sur coussin proprioceptif", niveau: "intermediaire", materiel: "coussin" },
  { id: "proprio_montees_cheville", categorie: "proprioception", nom: "Montées sur pointe unipodal", niveau: "debutant", materiel: "aucun" },
  { id: "proprio_sauts_stabilisation", categorie: "proprioception", nom: "Sauts avec stabilisation unipodale", niveau: "avance", materiel: "aucun" },

  { id: "specifique_mollets_debout", categorie: "specifique_course", nom: "Extensions mollets debout", niveau: "debutant", materiel: "aucun" },
  { id: "specifique_mollets_genou_flechi", categorie: "specifique_course", nom: "Extensions mollets genou fléchi", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_ischios_nordic", categorie: "specifique_course", nom: "Nordic hamstring curl", niveau: "avance", materiel: "aucun", excentrique: true },
  { id: "specifique_ischios_pont", categorie: "specifique_course", nom: "Pont fessier unipodal", niveau: "intermediaire", materiel: "aucun" },
  { id: "specifique_fessiers_hip_thrust", categorie: "specifique_course", nom: "Hip thrust", niveau: "intermediaire", materiel: "banc" },
  { id: "specifique_quadriceps_excentrique", categorie: "specifique_course", nom: "Squat bulgare excentrique lent (descente)", niveau: "avance", materiel: "banc", excentrique: true },
  { id: "specifique_quadriceps_step_down", categorie: "specifique_course", nom: "Step-down excentrique", niveau: "intermediaire", materiel: "step", excentrique: true },
  { id: "specifique_mollets_excentrique", categorie: "specifique_course", nom: "Descente de mollets excentrique (drop calf raise)", niveau: "intermediaire", materiel: "step", excentrique: true },

  { id: "mobilite_hanches", categorie: "mobilite", nom: "Mobilité hanches (90/90)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_chevilles", categorie: "mobilite", nom: "Mobilité chevilles (dorsiflexion genou au mur)", niveau: "debutant", materiel: "aucun" },
  { id: "mobilite_colonne", categorie: "mobilite", nom: "Mobilité thoracique (cat-cow, rotations)", niveau: "debutant", materiel: "aucun" },
];

export function renfoByCategorie(categorie) {
  return RENFO_EXERCISES.filter((e) => e.categorie === categorie);
}
