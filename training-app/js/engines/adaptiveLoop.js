// Boucle adaptative — Étape ⑤, Partie II, Section 6 / Partie I, Section 12.
//
// Principe directeur : la boucle ne modifie JAMAIS le plan silencieusement.
// Elle génère des PROPOSITIONS tracables, jamais des modifications automatiques
// (point tranché en Partie I §14, point ouvert 1).

// Seuil de dégradation par marqueur : un même -10% n'a pas le même sens
// physiologique selon le marqueur (le RMSSD varie naturellement bien plus
// que le bien-être déclaratif, borné 1-10) — un seuil uniforme sous-
// détectait le bien-être et sur-détectait le RMSSD.
const SEUIL_DEGRADATION = { rmssd: 0.85, fcRepos: 0.92, bienEtre: 0.9 };

/**
 * Évalue si un marqueur quotidien est "dégradé" par rapport à sa baseline
 * (moyenne des 14 jours précédents, hors les 3 derniers jours évalués), sur
 * 3 JOURS CALENDAIRES réellement consécutifs — un jour sans saisie dans
 * cette fenêtre casse la série (auparavant on prenait juste les 3 dernières
 * valeurs renseignées, qui pouvaient être espacées de bien plus de 3 jours
 * si l'utilisateur avait sauté des jours de journal, contredisant le nom et
 * la justification affichée "3 jours consécutifs").
 * @param {{date:string, rmssd?:number, fcRepos?:number, bienEtre?:number}[]} logsQuotidiens trié du plus ancien au plus récent, peut contenir des trous
 * @param {"rmssd"|"fcRepos"|"bienEtre"} cle
 */
function estDegrade(logsQuotidiens, cle) {
  const avecValeur = logsQuotidiens.filter((l) => l[cle] != null);
  if (avecValeur.length < 4) return false;

  const dernierJour = new Date(avecValeur[avecValeur.length - 1].date);
  const recents = [];
  for (let i = 2; i >= 0; i--) {
    const jour = new Date(dernierJour);
    jour.setDate(jour.getDate() - i);
    const iso = jour.toISOString().slice(0, 10);
    const entree = avecValeur.find((l) => l.date === iso);
    if (!entree) return false;
    recents.push(entree[cle]);
  }

  const baseline = avecValeur.slice(0, -3).slice(-14).map((l) => l[cle]);
  if (!baseline.length) return false;
  const moyenneBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length;

  // RMSSD et bien-être : une baisse est dégradée. FC repos : une hausse est dégradée.
  const seuil = SEUIL_DEGRADATION[cle];
  if (cle === "fcRepos") {
    return recents.every((v) => v > moyenneBaseline * (2 - seuil));
  }
  return recents.every((v) => v < moyenneBaseline * seuil);
}

/**
 * Règle de décision de la boucle adaptative (Partie II §6, étape 4).
 * Si ≥2 marqueurs sur 3 sont dégradés pendant ≥3 jours consécutifs,
 * génère une proposition justifiée.
 * @param {{date:string, rmssd?:number, fcRepos?:number, bienEtre?:number}[]} logsQuotidiens trié du plus ancien au plus récent
 * @param {{acwrEwma:number, zone:string}} chargeActuelle sortie de load.js#loadSummary
 */
export function evaluerBoucleAdaptative(logsQuotidiens, chargeActuelle) {
  const marqueursDegrades = [];
  if (estDegrade(logsQuotidiens, "rmssd")) marqueursDegrades.push("RMSSD");
  if (estDegrade(logsQuotidiens, "fcRepos")) marqueursDegrades.push("FC repos");
  if (estDegrade(logsQuotidiens, "bienEtre")) marqueursDegrades.push("bien-être déclaratif");

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
    // Le volume brut (km) pèse au moins autant que l'intensité perçue dans
    // la zone retenue (loadSummary) — la justification nomme l'axe qui a
    // effectivement déclenché le rouge, pas systématiquement l'intensité.
    const volumeSeulDeclencheur = chargeActuelle.zoneVolume === "rouge" && chargeActuelle.zoneIntensite !== "rouge";
    const axe = volumeSeulDeclencheur
      ? `volume brut (${chargeActuelle.acwrVolumeEwma.toFixed(2)} > 1.5)`
      : `intensité perçue/ACWR (${chargeActuelle.acwrEwma.toFixed(2)} > 1.5)`;
    propositions.push({
      type: "decharge_anticipee",
      justification: `Zone rouge sur le ${axe} — tendance de charge à risque élevé.`,
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
