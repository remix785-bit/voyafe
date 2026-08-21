// Résolution de la structure précise d'une séance à répétitions —
// transforme une fourchette de catalogue ("8-12 × 1-2 min") en UNE seule
// prescription concrète (nombre de répétitions, durée ou distance par
// répétition, récupération), calée sur le volume cible déjà calculé pour
// cette instance de séance. Le coureur ne doit jamais avoir à choisir entre
// deux options ou à interpréter une fourchette au moment de courir — c'est
// le générateur qui tranche, une fois pour toutes, à la génération du plan.

/** Parse "5:1", "1:2 à 1:3", "1:1 approx (...)" -> ratio numérique récupération/effort (moyenne des bornes si fourchette). */
export function parserRatioRecuperation(ratioTexte) {
  const matches = [...(ratioTexte ?? "").matchAll(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  const ratios = matches.map((m) => Number(m[2]) / Number(m[1]));
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

function arrondirVersPas(valeur, pas) {
  // Le *1e6/1e6 nettoie le bruit flottant de l'arrondi (ex. 6*0.05 -> 0.30000000000000004)
  // — sans effet sur la précision réelle utile ici (minutes/km arrondis à 0.05-1 près).
  return Math.round((Math.round(valeur / pas) * pas) * 1e6) / 1e6;
}

/**
 * Résout une structure à répétitions calées en DURÉE (côtes, intervalles I) :
 * durée de répétition fixée au milieu de la fourchette, nombre de
 * répétitions choisi pour approcher au mieux volumeSeanceMin (plafonné à
 * nbRepsMax, mais PAS plancher à nbRepsMin : si le volume alloué à cette
 * séance a été fortement réduit ailleurs — plafond hebdo par zone, budget
 * horaire — la structure doit rester cohérente avec ce volume réduit plutôt
 * que forcer un nombre de répétitions "typique" qui dépasserait largement le
 * temps réellement disponible).
 */
export function resoudreRepetitionsDuree(corpsDeSeance, volumeSeanceMin) {
  const [repMin, repMax] = corpsDeSeance.repDureeMinRange;
  const repDureeMin = arrondirVersPas((repMin + repMax) / 2, repMin < 3 ? 0.5 : 1);
  const recupRatio = parserRatioRecuperation(corpsDeSeance.ratioEffortRecup);
  const recupMin = recupRatio != null ? arrondirVersPas(repDureeMin * recupRatio, 0.25) : null;
  const [, repsMax] = corpsDeSeance.nbRepsRange;
  const nbReps =
    recupMin != null
      ? Math.min(repsMax, Math.max(1, Math.round(volumeSeanceMin / (repDureeMin + recupMin))))
      : Math.round((corpsDeSeance.nbRepsRange[0] + repsMax) / 2);
  return { nbReps, repDureeMin, recupMin: nbReps > 1 ? recupMin : null, uniteRep: "duree" };
}

/**
 * Idem mais pour des répétitions calées en DISTANCE (allure R, 200-400 m) —
 * convertie en durée via l'allure cible pour pouvoir résoudre le nombre de
 * répétitions à partir du volume cible. Même choix que ci-dessus : pas de
 * plancher à nbRepsMin, pour rester cohérent avec un volume réduit.
 */
export function resoudreRepetitionsDistance(corpsDeSeance, volumeSeanceMin, allureCibleMinParKm) {
  const [repMinKm, repMaxKm] = corpsDeSeance.repDistanceKmRange;
  const repDistanceKm = arrondirVersPas((repMinKm + repMaxKm) / 2, 0.05);
  const repDureeMin = allureCibleMinParKm != null ? repDistanceKm * allureCibleMinParKm : null;
  const recupRatio = parserRatioRecuperation(corpsDeSeance.ratioEffortRecup);
  const recupMin = repDureeMin != null && recupRatio != null ? arrondirVersPas(repDureeMin * recupRatio, 0.25) : null;
  const [repsMin, repsMax] = corpsDeSeance.nbRepsRange;
  const nbReps =
    repDureeMin != null && recupMin != null
      ? Math.min(repsMax, Math.max(1, Math.round(volumeSeanceMin / (repDureeMin + recupMin))))
      : Math.round((repsMin + repsMax) / 2);
  return { nbReps, repDistanceKm, repDureeMin, recupMin: nbReps > 1 ? recupMin : null, uniteRep: "distance" };
}

/** "4" -> "4 min" ; "1.5" -> "1 min 30 s" ; "0.5" -> "30 s". */
export function formatDureeCourte(min) {
  if (min < 1) return `${Math.round(min * 60)} s`;
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** Construit le texte final "N × [durée|distance] [contexte] — récup X [label]". */
export function formaterStructure(structure, contexteLabel, recupLabel) {
  const unite =
    structure.uniteRep === "distance"
      ? structure.repDistanceKm < 1
        ? `${Math.round(structure.repDistanceKm * 1000)} m`
        : `${structure.repDistanceKm} km`
      : formatDureeCourte(structure.repDureeMin);
  const contexte = contexteLabel ? ` ${contexteLabel}` : "";
  const recup = structure.recupMin != null ? ` — récup ${formatDureeCourte(structure.recupMin)}${recupLabel ? ` ${recupLabel}` : ""}` : "";
  return `${structure.nbReps} × ${unite}${contexte}${recup}`;
}

/**
 * Point d'entrée : résout `corpsDeSeance` en une structure précise si
 * `type === "repetitions"`, sinon le renvoie inchangé (séance continue —
 * déjà non ambiguë, sa durée précise est affichée ailleurs). `ratioEffortRecup`
 * est délibérément conservé tel quel (pas remplacé) : les plafonds hebdo
 * (appliquerPlafondsHebdo, plafonnerVolumeHebdoTotal) peuvent réduire
 * volumeSeanceMin après cette première résolution et doivent pouvoir
 * rappeler cette fonction sur le résultat précédent avec le nouveau volume —
 * la garder permet à cette fonction de rester idempotente/re-résolvable.
 * seanceDetail.js n'affiche donc pas ratioEffortRecup séparément quand
 * type === "repetitions" (déjà intégré au texte de `format` ci-dessus).
 */
export function resoudreStructureDetaillee(corpsDeSeance, volumeSeanceMin, allureCibleMinParKm) {
  if (corpsDeSeance.type !== "repetitions") return corpsDeSeance;
  const structure = corpsDeSeance.repDistanceKmRange
    ? resoudreRepetitionsDistance(corpsDeSeance, volumeSeanceMin, allureCibleMinParKm)
    : resoudreRepetitionsDuree(corpsDeSeance, volumeSeanceMin);
  return {
    ...corpsDeSeance,
    format: formaterStructure(structure, corpsDeSeance.contexteLabel, corpsDeSeance.recupLabel),
  };
}
