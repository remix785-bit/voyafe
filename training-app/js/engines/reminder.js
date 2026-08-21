// Rappel de séance du jour — logique pure (testable en Node) pour décider
// si une notification doit être proposée. Le déclenchement réel
// (permission navigateur, affichage) est fait par js/notifications.js, qui
// dépend de `Notification`/`document` et n'est donc pas testable ici.

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Séance planifiée précisément datée sur `maintenant`, encore à venir,
 * tous plans actifs confondus — même logique que trouverSeanceDuJour du
 * Dashboard. Ignore les séances déjà réalisées/manquées : inutile de
 * rappeler une séance déjà traitée.
 */
export function seanceDuJourPourRappel(plans, maintenant = new Date()) {
  for (const plan of plans ?? []) {
    if (plan.statut !== "actif") continue;
    for (const semaine of plan.semaines) {
      const seance = semaine.seances.find(
        (s) => s.date && s.statut === "a_venir" && memeJour(new Date(s.date), maintenant)
      );
      if (seance) return seance;
    }
  }
  return null;
}

/** True si un rappel a déjà été affiché aujourd'hui (dédoublonnage, 1 max/jour). */
export function rappelDejaAffiche(dernierRappelLe, maintenant = new Date()) {
  return Boolean(dernierRappelLe) && memeJour(new Date(dernierRappelLe), maintenant);
}

/** Titre + corps de la notification pour une séance donnée. */
export function texteRappel(seance) {
  const zone = seance.zoneDaniels ? `Zone ${seance.zoneDaniels} — ` : "";
  const distance = seance.distanceKm ? ` (${seance.distanceKm.toFixed(1)} km)` : "";
  return {
    titre: "Séance du jour",
    corps: `${zone}${seance.nom}${distance}`,
  };
}
