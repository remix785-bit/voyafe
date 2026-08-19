// Boucle adaptative — Étape ⑤, Partie II, Section 6 / Partie I, Section 12.
//
// Principe directeur : la boucle ne modifie JAMAIS le plan silencieusement.
// Elle génère des PROPOSITIONS tracables, jamais des modifications automatiques
// (point tranché en Partie I §14, point ouvert 1).

/**
 * Évalue si un marqueur quotidien est "dégradé" par rapport à sa baseline
 * (moyenne des 14 jours précédents, hors les 3 derniers jours évalués).
 * @param {number[]} historique valeurs quotidiennes, plus récent en dernier
 * @param {"rmssd"|"fcRepos"|"bienEtre"} type
 */
function estDegrade(historique, type) {
  if (historique.length < 4) return false;
  const recents = historique.slice(-3);
  const baseline = historique.slice(0, -3).slice(-14);
  if (!baseline.length) return false;
  const moyenneBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length;

  // RMSSD et bien-être : une baisse est dégradée. FC repos : une hausse est dégradée.
  const seuil = 0.9; // -10% ou inverse selon le sens
  if (type === "fcRepos") {
    return recents.every((v) => v > moyenneBaseline * (2 - seuil));
  }
  return recents.every((v) => v < moyenneBaseline * seuil);
}

/**
 * Règle de décision de la boucle adaptative (Partie II §6, étape 4).
 * Si ≥2 marqueurs sur 3 sont dégradés pendant ≥3 jours consécutifs,
 * génère une proposition justifiée.
 * @param {{rmssd?:number[], fcRepos?:number[], bienEtre?:number[]}} logs historiques quotidiens
 * @param {{acwrEwma:number, zone:string}} chargeActuelle sortie de load.js#loadSummary
 */
export function evaluerBoucleAdaptative(logs, chargeActuelle) {
  const marqueursDegrades = [];
  if (logs.rmssd && estDegrade(logs.rmssd, "rmssd")) marqueursDegrades.push("RMSSD");
  if (logs.fcRepos && estDegrade(logs.fcRepos, "fcRepos")) marqueursDegrades.push("FC repos");
  if (logs.bienEtre && estDegrade(logs.bienEtre, "bienEtre")) marqueursDegrades.push("bien-être déclaratif");

  const propositions = [];

  if (marqueursDegrades.length >= 2) {
    propositions.push({
      type: "conversion_qualite_vers_E",
      justification: `${marqueursDegrades.length} marqueurs dégradés sur 3 jours consécutifs : ${marqueursDegrades.join(", ")}.`,
      alternatives: [
        "Convertir la prochaine séance qualité en séance E",
        "Insérer une semaine de décharge anticipée",
        "Décaler le démarrage du taper",
      ],
    });
  }

  if (chargeActuelle && chargeActuelle.zone === "rouge") {
    propositions.push({
      type: "decharge_anticipee",
      justification: `ACWR/EWMA en zone rouge (${chargeActuelle.acwrEwma.toFixed(2)} > 1.5) — tendance de charge à risque élevé.`,
      alternatives: ["Insérer une semaine de décharge anticipée"],
    });
  }

  return {
    marqueursDegrades,
    propositions,
    modeAutomatique: false, // jamais d'application automatique
  };
}

/**
 * Détection de retest implicite : si une performance récente dépasse
 * significativement la prédiction du modèle VDOT actuel, propose un
 * recalcul du profil (retour à l'étape ①, Partie II §6, étape 5).
 * @param {number} vdotActuel
 * @param {number} vdotObserve calculé à partir d'une performance/séance récente
 * @param {number} seuilEcart fraction (0.03 = 3%) au-delà de laquelle proposer le retest
 */
export function detecterRetestImplicite(vdotActuel, vdotObserve, seuilEcart = 0.03) {
  const ecart = (vdotObserve - vdotActuel) / vdotActuel;
  if (ecart > seuilEcart) {
    return {
      proposer: true,
      ecartPct: ecart * 100,
      justification: `Performance récente correspond à un VDOT ${ecart > 0 ? "supérieur" : "inférieur"} de ${(ecart * 100).toFixed(1)}% au profil actuel.`,
    };
  }
  return { proposer: false, ecartPct: ecart * 100 };
}
