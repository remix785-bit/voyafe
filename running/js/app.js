(function () {
  "use strict";

  var STORAGE_KEY = "runplan:v1";
  var DAY_MS = 86400000;

  var WEEKDAY_OFFSETS = { 1: [5], 2: [1, 5], 3: [1, 3, 5] };

  // ---------- storage ----------

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : {};
      data.goals = data.goals || [];
      data.planSessions = data.planSessions || [];
      data.runs = data.runs || [];
      data.profile = data.profile || {};
      data.profile.refTimes = data.profile.refTimes || { t1k: null, t5k: null, t10k: null, tSemi: null };
      data.profile.zonesMode = data.profile.zonesMode || "auto";
      data.profile.manualZones = data.profile.manualZones || { z1: null, z2: null, z3: null, z4: null, z5: null, speed: null };
      data.profile.level = data.profile.level || "intermediaire";
      data.profile.zonesHistory = data.profile.zonesHistory || [];
      data.goals.forEach(function (g) {
        if (!g.sport) g.sport = "route";
        if (g.elevationGain === undefined) g.elevationGain = null;
        if (g.elevationLoss === undefined) g.elevationLoss = null;
        if (g.targetTimeSec === undefined) g.targetTimeSec = null;
      });
      return data;
    } catch (e) {
      return { goals: [], planSessions: [], runs: [], profile: { refTimes: {}, zonesMode: "auto", manualZones: {}, level: "intermediaire", zonesHistory: [] } };
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  var state = loadData();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- date utils ----------

  function todayDate() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseISO(s) {
    var parts = s.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / DAY_MS);
  }

  function mondayOf(d) {
    var day = (d.getDay() + 6) % 7;
    return addDays(d, -day);
  }

  function nextMonday(d) {
    var day = (d.getDay() + 6) % 7;
    return day === 0 ? d : addDays(d, 7 - day);
  }

  function formatDateShort(iso) {
    var d = parseISO(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  }

  function formatDateFull(iso) {
    var d = parseISO(iso);
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
  }

  function formatPace(minPerKm) {
    if (!isFinite(minPerKm) || minPerKm <= 0) return "--";
    var min = Math.floor(minPerKm);
    var sec = Math.round((minPerKm - min) * 60);
    if (sec === 60) { min += 1; sec = 0; }
    return min + ":" + String(sec).padStart(2, "0") + "/km";
  }

  function formatPaceSec(secPerKm) {
    if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return null;
    var m = Math.floor(secPerKm / 60);
    var s = Math.round(secPerKm % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ":" + String(s).padStart(2, "0") + "/km";
  }

  function fmtKm(n) {
    return (Math.round(n * 10) / 10).toString().replace(".", ",") + " km";
  }

  function fmtNum(n) {
    return (Math.round(n * 10) / 10).toString().replace(".", ",");
  }

  function parseTimeToSeconds(str) {
    if (!str) return null;
    str = str.trim();
    if (!str) return null;
    var parts = str.split(":").map(function (p) { return parseInt(p, 10); });
    if (parts.some(function (p) { return isNaN(p); })) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }

  function formatSecondsToTime(sec) {
    if (sec == null || !isFinite(sec) || sec <= 0) return "";
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  }

  // ---------- coaching engine: pace zones ----------

  function riegelPredict(t, d1, d2) {
    return t * Math.pow(d2 / d1, 1.06);
  }

  function computeZonesFromRefTimes(refTimes) {
    var known = [];
    if (refTimes.t1k) known.push([1, refTimes.t1k]);
    if (refTimes.t5k) known.push([5, refTimes.t5k]);
    if (refTimes.t10k) known.push([10, refTimes.t10k]);
    if (refTimes.tSemi) known.push([21.0975, refTimes.tSemi]);
    if (!known.length) return null;

    function paceAt(d) {
      var estimates = known.map(function (e) {
        var dk = e[0], tk = e[1];
        var predicted = dk === d ? tk : riegelPredict(tk, dk, d);
        return predicted / d;
      });
      return estimates.reduce(function (a, b) { return a + b; }, 0) / estimates.length;
    }

    var T = paceAt(16);
    var E = T + 70;
    return {
      z1: E + 40,
      z2: E,
      z3: paceAt(42.195),
      z4: T,
      z5: paceAt(5),
      speed: paceAt(1)
    };
  }

  function getActiveZones(profile) {
    if (!profile) return null;
    if (profile.zonesMode === "manual") {
      var mz = profile.manualZones;
      if (mz && mz.z1 && mz.z2 && mz.z3 && mz.z4 && mz.z5) return mz;
      return null;
    }
    return computeZonesFromRefTimes(profile.refTimes || {});
  }

  function isAmbitiousGoal(goal, profile) {
    if (!goal.targetTimeSec) return false;
    var zones = getActiveZones(profile);
    if (!zones) return false;
    var goalPace = goal.targetTimeSec / goal.targetDistance;
    return goalPace < zones.z4 * 0.98;
  }

  var LEVEL_PARAMS = {
    debutant: { growthCap: 1.10, cutbackEvery: 3, longRunCapRatio: 0.65, startLongRatio: 0.30 },
    intermediaire: { growthCap: 1.15, cutbackEvery: 4, longRunCapRatio: 0.75, startLongRatio: 0.35 },
    confirme: { growthCap: 1.20, cutbackEvery: 5, longRunCapRatio: 0.85, startLongRatio: 0.40 }
  };

  function levelParams(profile) {
    return LEVEL_PARAMS[(profile && profile.level) || "intermediaire"];
  }

  function snapshotZones() {
    var zones = getActiveZones(state.profile);
    if (!zones) return;
    var today = toISO(todayDate());
    var history = state.profile.zonesHistory;
    var last = history[history.length - 1];
    if (last && last.date === today) {
      last.z4 = zones.z4;
    } else {
      history.push({ date: today, z4: zones.z4 });
    }
  }

  // ---------- coaching engine: plan generation ----------

  function taperWeeksFor(goal, totalWeeks) {
    if (totalWeeks < 3) return 0;
    var d = goal.targetDistance;
    var isUltraTrail = goal.sport === "trail" && d >= 60;
    if (isUltraTrail) return Math.min(3, totalWeeks - 1);
    if (d >= 35) return Math.min(2, totalWeeks - 1);
    if (d >= 18) return Math.min(2, totalWeeks - 1);
    return Math.min(1, totalWeeks - 1);
  }

  function phaseForWeek(goal, w) {
    if (w >= goal.progWeeks) return "taper";
    var baseEnd = Math.max(1, Math.round(goal.progWeeks * 0.35));
    var devEnd = Math.max(baseEnd + 1, Math.round(goal.progWeeks * 0.7));
    if (w < baseEnd) return "base";
    if (w < devEnd) return "dev";
    return "peak";
  }

  var PHASE_LABELS = {
    base: "Base",
    dev: "Développement",
    peak: "Pic",
    taper: "Affûtage"
  };

  function sessionTypesForWeek(goal, w, phase) {
    var n = goal.sessionsPerWeek;
    if (n === 1) return ["Sortie longue"];
    if (n === 2) return ["Endurance fondamentale", "Sortie longue"];

    var isFinalWeek = w === goal.totalWeeks - 1;
    var quality;

    if (phase === "taper") {
      if (isFinalWeek) quality = "Activation";
      else if (goal.sport === "trail") quality = "Côtes";
      else quality = "Seuil";
    } else if (phase === "base") {
      quality = "Côtes";
    } else if (phase === "dev") {
      if (goal.sport === "trail") {
        quality = (w % 2 === 0) ? "Côtes" : "VMA longue";
      } else {
        var cycle = w % 3;
        quality = cycle === 0 ? "VMA courte" : cycle === 1 ? "Seuil" : "VMA longue";
      }
    } else {
      if (goal.sport === "trail") {
        quality = (w % 2 === 0) ? "Allure spécifique" : "Côtes";
      } else {
        quality = (w % 2 === 0) ? "Allure spécifique" : "Seuil";
      }
    }
    return [quality, "Endurance fondamentale", "Sortie longue"];
  }

  function zonePaceFor(type, zones) {
    if (!zones) return null;
    switch (type) {
      case "Fractionné": return zones.z5;
      case "VMA courte": return Math.round((zones.z5 + (zones.speed || zones.z5)) / 2);
      case "VMA longue": return zones.z5;
      case "Côtes": return zones.z5;
      case "Seuil": return zones.z4;
      case "Endurance fondamentale": return zones.z2;
      case "Sortie longue": return Math.round((zones.z2 + zones.z3) / 2);
      case "Récupération": return zones.z1;
      case "Activation": return zones.z1;
      default: return null;
    }
  }

  function parisTrainingSpot(type, sport) {
    switch (type) {
      case "Fractionné":
      case "VMA courte":
      case "VMA longue":
      case "Seuil":
      case "Allure spécifique":
        return "Idéal sur piste d'athlétisme, quais de Seine ou Champ de Mars pour des repères de distance fiables.";
      case "Côtes":
        return "Buttes-Chaumont ou Montmartre : les seuls vrais reliefs praticables intra-muros.";
      case "Endurance fondamentale":
      case "Activation":
      case "Récupération":
        return "Bois de Vincennes, Bois de Boulogne ou berges de Seine.";
      case "Sortie longue":
        return sport === "trail"
          ? "Pars en forêt si possible (Fontainebleau, Meudon, Saint-Cloud) pour du vrai dénivelé ; sinon grandes boucles au Bois de Vincennes/Boulogne."
          : "Bois de Vincennes ou Bois de Boulogne, grandes boucles à plat.";
      default:
        return null;
    }
  }

  function buildSessionPaceAndDetail(type, distanceKm, zones, opts) {
    var pace = zonePaceFor(type, zones);
    if (type === "Allure spécifique") {
      pace = opts.goalPace || (zones ? zones.z3 : null);
    }
    var paceStr = formatPaceSec(pace);
    var detail;

    switch (type) {
      case "Fractionné": {
        var repM = distanceKm <= 4 ? 400 : distanceKm <= 6 ? 600 : 1000;
        var reps = Math.max(4, Math.round((distanceKm * 1000 * 0.6) / repM));
        var recover = repM <= 400 ? "1min30" : repM <= 600 ? "2min" : "2min30";
        detail = "Échauffement 15min facile. " + reps + " x " + repM + "m" +
          (paceStr ? " à " + paceStr + " (zone 5)" : " en fractionné soutenu") +
          ", récupération " + recover + " trot très facile entre les répétitions. Retour au calme 10min.";
        break;
      }
      case "VMA courte": {
        var reps3 = Math.max(8, Math.min(16, Math.round(distanceKm * 3)));
        detail = "Échauffement 15min facile + gammes/lignes droites. " + reps3 + " x 30sec rapide" +
          (paceStr ? " (proche " + paceStr + ", zone 5+)" : "") +
          " / 30sec récupération active trot, en 1-2 blocs avec 2-3min de récupération entre les blocs si besoin. Retour au calme 10min.";
        break;
      }
      case "VMA longue": {
        var repMin = distanceKm <= 5 ? 3 : 4;
        var reps4 = Math.max(4, Math.min(8, Math.round(distanceKm / 1.2)));
        detail = "Échauffement 15min facile. " + reps4 + " x " + repMin + "min" +
          (paceStr ? " à " + paceStr + " (zone 5)" : " à allure VO2max") +
          ", récupération " + repMin + "min trot très facile entre les répétitions. Retour au calme 10min.";
        break;
      }
      case "Allure spécifique": {
        detail = "Échauffement 15min facile. " + fmtNum(distanceKm) + "km au total à l'allure objectif" +
          (paceStr ? " (" + paceStr + ")" : "") +
          ", en 2-3 blocs avec 2-3min de récupération trot entre chaque, pour habituer le corps au rythme de course. Retour au calme 10min.";
        break;
      }
      case "Côtes": {
        var reps2 = Math.max(5, Math.round(distanceKm * 2));
        detail = "Échauffement 15min. " + reps2 + " x 45sec en côte (pente 6-8%) à effort soutenu" +
          (paceStr ? " (proche zone 5, " + paceStr + " à plat)" : "") +
          ", redescente lente en récupération. " +
          (opts.elevTarget ? "D+ cumulé de la séance ~" + opts.elevTarget + "m. " : "") +
          "Retour au calme 10min.";
        break;
      }
      case "Seuil": {
        var mins = pace ? Math.round(((distanceKm * pace) / 60) * 0.7) : null;
        detail = "Échauffement 15min facile. " +
          (mins ? mins + "min continu" : fmtNum(distanceKm) + "km") +
          (paceStr ? " en zone 4 (" + paceStr + ")" : " à allure soutenue mais tenable") +
          ", effort régulier sans à-coups. Retour au calme 10min.";
        break;
      }
      case "Endurance fondamentale": {
        detail = fmtNum(distanceKm) + "km en zone 2" + (paceStr ? " (" + paceStr + ")" : "") +
          ", effort confortable, tu dois pouvoir parler.";
        break;
      }
      case "Sortie longue": {
        detail = fmtNum(distanceKm) + "km en zone 2-3" + (paceStr ? " (autour de " + paceStr + ")" : "") + ", régulier";
        if (opts.sport === "trail" && opts.elevTarget) {
          detail += ", D+ ~" + opts.elevTarget + "m, gère l'effort en montée, mouline en descente";
        }
        if (opts.isGoalPaceWeek && opts.goalPace) {
          detail += ". Termine les 2-3 derniers km à l'allure objectif (" + formatPaceSec(opts.goalPace) + ")";
        }
        detail += ".";
        break;
      }
      case "Activation": {
        detail = fmtNum(distanceKm) + "km très facile (zone 1) avec 4 à 6 accélérations progressives de 15-20sec (retour au calme entre chaque), pour rester réactif sans fatiguer.";
        break;
      }
      case "Récupération": {
        detail = "Footing très facile " + fmtNum(distanceKm) + "km (zone 1" + (paceStr ? ", " + paceStr + " ou plus lent" : "") + "), focus relâchement et respiration.";
        break;
      }
      default:
        detail = "";
    }
    var spot = parisTrainingSpot(type, opts.sport);
    if (spot) detail += " " + spot;
    return { pace: pace, detail: detail };
  }

  function computeWeeklyLongDistances(goal, profile) {
    var params = levelParams(profile);
    var totalWeeks = goal.totalWeeks, taperWeeks = goal.taperWeeks, progWeeks = goal.progWeeks;
    var isLongRace = goal.targetDistance > 32;
    var longRunCap = isLongRace ? Math.round(goal.targetDistance * params.longRunCapRatio * 10) / 10 : goal.targetDistance;
    var startLong = Math.max(2, Math.round(longRunCap * params.startLongRatio * 10) / 10);
    var arr = [];
    var prev = startLong;

    for (var w = 0; w < progWeeks; w++) {
      var isCutback = w > 0 && (w + 1) % params.cutbackEvery === 0 && w < progWeeks - 1;
      var val;
      if (w === 0) {
        val = startLong;
      } else if (isCutback) {
        val = Math.max(startLong, prev * 0.75);
      } else {
        var linearTarget = startLong + (longRunCap - startLong) * ((w + 1) / progWeeks);
        val = Math.min(linearTarget, prev * params.growthCap);
      }
      val = Math.round(val * 10) / 10;
      arr.push(val);
      prev = val;
    }
    var peakActual = prev;
    for (var t = 0; t < taperWeeks; t++) {
      var taperRatio = Math.max(0.35, 0.70 - t * 0.15);
      arr.push(Math.round(peakActual * taperRatio * 10) / 10);
    }
    return arr;
  }

  function generatePlan(goal, profile) {
    var startMonday = nextMonday(todayDate());
    var targetDate = parseISO(goal.targetDate);
    var totalWeeks = Math.max(1, Math.ceil(diffDays(targetDate, startMonday) / 7));
    var taperWeeks = taperWeeksFor(goal, totalWeeks);
    var progWeeks = Math.max(1, totalWeeks - taperWeeks);
    var offsets = WEEKDAY_OFFSETS[goal.sessionsPerWeek];
    var zones = getActiveZones(profile);
    var goalPace = goal.targetTimeSec ? goal.targetTimeSec / goal.targetDistance : null;
    var elevRatio = (goal.sport === "trail" && goal.elevationGain) ? goal.elevationGain / goal.targetDistance : 0;

    goal.totalWeeks = totalWeeks;
    goal.taperWeeks = taperWeeks;
    goal.progWeeks = progWeeks;
    goal.startMonday = toISO(startMonday);
    goal.level = (profile && profile.level) || "intermediaire";

    var weeklyLongDist = computeWeeklyLongDistances(goal, profile);
    var sessions = [];

    for (var w = 0; w < totalWeeks; w++) {
      var weekStart = addDays(startMonday, w * 7);
      var phase = phaseForWeek(goal, w);
      var isTaper = phase === "taper";
      var longDist = weeklyLongDist[w];

      var types = sessionTypesForWeek(goal, w, phase);

      offsets.forEach(function (offset, i) {
        var date = addDays(weekStart, offset);
        if (diffDays(date, targetDate) > 0) return;
        var type = types[i];
        var dist;
        if (type === "Sortie longue") dist = longDist;
        else if (type === "Endurance fondamentale") dist = Math.round(longDist * 0.6 * 10) / 10;
        else if (type === "Activation") dist = Math.max(3, Math.round(longDist * 0.25 * 10) / 10);
        else dist = Math.round(longDist * 0.45 * 10) / 10;

        var elevTarget = (elevRatio && (type === "Sortie longue" || type === "Côtes")) ? Math.round(dist * elevRatio) : 0;
        var isGoalPaceWeek = !isTaper && !!goalPace && (w >= progWeeks - 2);

        var built = buildSessionPaceAndDetail(type, dist, zones, {
          goalPace: goalPace,
          isGoalPaceWeek: isGoalPaceWeek,
          elevTarget: elevTarget,
          sport: goal.sport
        });

        sessions.push({
          id: uid(),
          goalId: goal.id,
          week: w + 1,
          phase: phase,
          date: toISO(date),
          type: type,
          targetDistance: dist,
          elevTarget: elevTarget || null,
          paceSecPerKm: built.pace,
          description: built.detail,
          done: false,
          linkedRunId: null
        });
      });
    }
    return sessions;
  }

  function recalcSessionsForProfile() {
    var zones = getActiveZones(state.profile);
    state.planSessions.forEach(function (s) {
      if (s.done) return;
      var goal = state.goals.find(function (g) { return g.id === s.goalId; });
      if (!goal || goal.progWeeks == null) return;
      var w = s.week - 1;
      var isTaper = w >= goal.progWeeks;
      var goalPace = goal.targetTimeSec ? goal.targetTimeSec / goal.targetDistance : null;
      var isGoalPaceWeek = !isTaper && !!goalPace && (w >= goal.progWeeks - 2);
      var built = buildSessionPaceAndDetail(s.type, s.targetDistance, zones, {
        goalPace: goalPace,
        isGoalPaceWeek: isGoalPaceWeek,
        elevTarget: s.elevTarget,
        sport: goal.sport
      });
      s.paceSecPerKm = built.pace;
      s.description = built.detail;
    });
  }

  // ---------- derived data ----------

  function activeGoals() {
    return state.goals.filter(function (g) { return g.status === "active"; });
  }

  function sessionsForGoal(goalId) {
    return state.planSessions.filter(function (s) { return s.goalId === goalId; });
  }

  function weekRange(d) {
    var start = mondayOf(d);
    return [start, addDays(start, 6)];
  }

  function last8WeeksData() {
    var today = todayDate();
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = addDays(mondayOf(today), -7 * i);
      var end = addDays(start, 6);
      var km = state.runs.reduce(function (sum, r) {
        var rd = parseISO(r.date);
        return (rd >= start && rd <= end) ? sum + r.distance : sum;
      }, 0);
      weeks.push({ label: (start.getMonth() + 1) + "/" + start.getDate(), km: km });
    }
    return weeks;
  }

  // ---------- rendering: dashboard ----------

  var INTENSITY_FACTOR = {
    "Récupération": 0.7,
    "Endurance fondamentale": 1.0,
    "Activation": 0.9,
    "Sortie longue": 1.15,
    "Seuil": 1.35,
    "VMA courte": 1.6,
    "VMA longue": 1.55,
    "Fractionné": 1.5,
    "Côtes": 1.45,
    "Allure spécifique": 1.4,
    "Course": 1.7
  };

  function runLoad(run) {
    var factor = INTENSITY_FACTOR[run.type] || 1.0;
    return run.distance * factor;
  }

  function computeACWR() {
    var today = todayDate();
    var acuteStart = addDays(today, -6);
    var chronicStart = addDays(today, -27);
    var acute = 0;
    var chronic = 0;
    var hasChronicData = false;
    state.runs.forEach(function (r) {
      var rd = parseISO(r.date);
      if (rd < chronicStart || rd > today) return;
      var load = runLoad(r);
      chronic += load;
      hasChronicData = true;
      if (rd >= acuteStart) acute += load;
    });
    if (!hasChronicData) return { acute: 0, chronic: 0, ratio: null, status: "insuffisant" };
    var chronicWeekly = chronic / 4;
    if (chronicWeekly <= 0) return { acute: acute, chronic: 0, ratio: null, status: "insuffisant" };
    var ratio = acute / chronicWeekly;
    var status;
    if (ratio < 0.8) status = "sous-charge";
    else if (ratio <= 1.3) status = "optimale";
    else if (ratio <= 1.5) status = "vigilance";
    else status = "risque";
    return { acute: acute, chronic: chronicWeekly, ratio: ratio, status: status };
  }

  var ACWR_LABELS = {
    "insuffisant": ["Pas assez de données", "Ajoute au moins 2 semaines de courses pour calculer ta charge (ACWR)."],
    "sous-charge": ["Sous-charge", "Charge en dessous de ta moyenne récente : marge de progression."],
    "optimale": ["Zone optimale", "Charge d'entraînement équilibrée par rapport à tes 4 dernières semaines."],
    "vigilance": ["Vigilance", "Charge en hausse rapide, sois attentif aux signaux de fatigue."],
    "risque": ["Risque élevé", "Hausse de charge trop rapide : envisage une semaine plus légère."]
  };

  function renderACWR() {
    var acwr = computeACWR();
    var labels = ACWR_LABELS[acwr.status];
    var valueStr = acwr.ratio === null ? "--" : acwr.ratio.toFixed(2);
    document.getElementById("acwr-display").innerHTML =
      '<div class="acwr-value">' + valueStr + '</div>' +
      '<div class="acwr-status acwr-' + acwr.status + '">' + labels[0] + '</div>' +
      '<div class="dlg-hint" style="margin:8px 0 0;">' + labels[1] + '</div>';
  }

  function goalProgress(goal) {
    var sessions = sessionsForGoal(goal.id);
    var total = sessions.length;
    var done = sessions.filter(function (s) { return s.done; }).length;
    return { done: done, total: total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function renderDashboard() {
    var today = todayDate();
    var range = weekRange(today);

    var goalsEl = document.getElementById("goals-countdown");
    var upcoming = activeGoals()
      .filter(function (g) { return diffDays(parseISO(g.targetDate), today) >= 0; })
      .sort(function (a, b) { return parseISO(a.targetDate) - parseISO(b.targetDate); });

    goalsEl.innerHTML = upcoming.length ? upcoming.map(function (g) {
      var days = diffDays(parseISO(g.targetDate), today);
      var prog = goalProgress(g);
      return '<div class="goal-countdown">' +
        '<div class="g-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="g-days">J-' + days + '</div>' +
        '<div class="g-meta">' + g.targetDistance + ' km · ' + formatDateFull(g.targetDate) + '</div>' +
        '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + prog.percent + '%"></div></div>' +
        '<div class="g-meta">' + prog.done + '/' + prog.total + ' séances réalisées (' + prog.percent + '%)</div>' +
        '</div>';
    }).join("") : '<div class="empty-state">Aucun objectif actif. Crée ton premier plan dans l\'onglet Plan.</div>';

    var weekRuns = state.runs.filter(function (r) {
      var rd = parseISO(r.date);
      return rd >= range[0] && rd <= range[1];
    });
    var weekDistance = weekRuns.reduce(function (s, r) { return s + r.distance; }, 0);
    var plannedThisWeek = state.planSessions.filter(function (s) {
      var sd = parseISO(s.date);
      return sd >= range[0] && sd <= range[1];
    });
    var plannedDistance = plannedThisWeek.reduce(function (s, p) { return s + p.targetDistance; }, 0);

    document.getElementById("week-stats").innerHTML =
      stat(fmtKm(weekDistance), "Parcouru") +
      stat(String(weekRuns.length), "Sorties") +
      stat(fmtKm(plannedDistance), "Prévu");

    var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    var yearStart = new Date(today.getFullYear(), 0, 1);
    var monthDistance = state.runs.reduce(function (s, r) {
      return parseISO(r.date) >= monthStart ? s + r.distance : s;
    }, 0);
    var yearDistance = state.runs.reduce(function (s, r) {
      return parseISO(r.date) >= yearStart ? s + r.distance : s;
    }, 0);

    document.getElementById("totals-stats").innerHTML =
      stat(fmtKm(monthDistance), "Ce mois-ci") +
      stat(fmtKm(yearDistance), "Cette année");

    renderACWR();

    drawWeekChart(document.getElementById("week-chart"), last8WeeksData());

    var trendCanvas = document.getElementById("trend-chart");
    var trendEmpty = document.getElementById("trend-empty");
    var history = state.profile.zonesHistory;
    if (history.length >= 2) {
      trendCanvas.hidden = false;
      trendEmpty.hidden = true;
      drawTrendChart(trendCanvas, history);
    } else {
      trendCanvas.hidden = true;
      trendEmpty.hidden = false;
    }

    var upcomingWeekSessions = state.planSessions
      .filter(function (s) {
        if (s.done) return false;
        var sd = parseISO(s.date);
        return sd >= today && sd <= addDays(today, 6);
      })
      .sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
    var overdueSessions = state.planSessions
      .filter(function (s) { return !s.done && diffDays(parseISO(s.date), today) < 0; })
      .sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
    var weekListSessions = overdueSessions.concat(upcomingWeekSessions);

    var upcomingEl = document.getElementById("upcoming-week");
    if (weekListSessions.length) {
      upcomingEl.innerHTML = weekListSessions.map(function (s) {
        var overdue = diffDays(parseISO(s.date), today) < 0;
        var paceStr = formatPaceSec(s.paceSecPerKm);
        return '<div class="session-item">' +
          '<div class="session-check next-check' + (overdue ? ' overdue' : '') + '"></div>' +
          '<div class="session-body">' +
          '<div class="session-type">' + s.type + (overdue ? ' (en retard)' : '') + '</div>' +
          '<div class="session-meta">' + formatDateShort(s.date) + ' · ' + fmtKm(s.targetDistance) + (paceStr ? ' · ' + paceStr : '') + '</div>' +
          '</div></div>';
      }).join("");
    } else {
      upcomingEl.innerHTML = '<div class="empty-state">Aucune séance planifiée.</div>';
    }

    var runsWithDistance = state.runs.filter(function (r) { return r.distance > 0; });
    var longest = runsWithDistance.reduce(function (m, r) { return r.distance > m ? r.distance : m; }, 0);
    var bestPace = runsWithDistance.reduce(function (m, r) {
      var p = r.duration / r.distance;
      return (m === null || p < m) ? p : m;
    }, null);
    var totalDistance = state.runs.reduce(function (s, r) { return s + r.distance; }, 0);

    document.getElementById("personal-records").innerHTML =
      stat(fmtKm(longest), "Plus longue") +
      stat(bestPace === null ? "--" : formatPace(bestPace), "Meilleure allure") +
      stat(fmtKm(totalDistance), "Total cumulé") +
      stat(String(state.runs.length), "Courses");
  }

  function stat(value, label) {
    return '<div class="stat"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawWeekChart(canvas, data) {
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || 300;
    var cssHeight = 200;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.km; })));
    var gap = 8;
    var barWidth = (cssWidth - gap * (data.length - 1)) / data.length;
    var bottomPad = 20;
    var topPad = 14;
    var chartHeight = cssHeight - bottomPad - topPad;
    var mutedColor = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#888";

    var grad = ctx.createLinearGradient(0, topPad, 0, topPad + chartHeight);
    grad.addColorStop(0, "#FF5A36");
    grad.addColorStop(1, "#F72585");

    data.forEach(function (d, i) {
      var h = (d.km / max) * chartHeight;
      if (h < 2 && d.km > 0) h = 2;
      var x = i * (barWidth + gap);
      var y = topPad + (chartHeight - h);
      ctx.fillStyle = grad;
      roundRectPath(ctx, x, y, barWidth, h, 4);
      ctx.fill();
      ctx.fillStyle = mutedColor;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.label, x + barWidth / 2, cssHeight - 6);
    });
  }

  function drawTrendChart(canvas, history) {
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || 300;
    var cssHeight = 140;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var values = history.map(function (h) { return h.z4; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (minV === maxV) { minV -= 10; maxV += 10; }

    var padX = 6;
    var topPad = 16;
    var bottomPad = 20;
    var chartW = cssWidth - padX * 2;
    var chartH = cssHeight - topPad - bottomPad;
    var mutedColor = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#888";

    function pointAt(i) {
      var x = padX + (history.length === 1 ? chartW / 2 : chartW * (i / (history.length - 1)));
      var t = (history[i].z4 - minV) / (maxV - minV);
      var y = topPad + t * chartH;
      return [x, y];
    }

    var grad = ctx.createLinearGradient(0, topPad, 0, topPad + chartH);
    grad.addColorStop(0, "#FF5A36");
    grad.addColorStop(1, "#F72585");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    history.forEach(function (h, i) {
      var p = pointAt(i);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();

    ctx.fillStyle = "#FF5A36";
    history.forEach(function (h, i) {
      var p = pointAt(i);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = mutedColor;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(formatDateShort(history[0].date), padX, cssHeight - 4);
    ctx.textAlign = "right";
    ctx.fillText(formatDateShort(history[history.length - 1].date), cssWidth - padX, cssHeight - 4);
    ctx.textAlign = "left";
    ctx.fillText("Zone 4 (seuil) : " + formatPaceSec(minV) + " au mieux", padX, topPad - 5);
  }

  // ---------- rendering: plan ----------

  function renderPlan() {
    var el = document.getElementById("goals-list");
    var goals = state.goals.slice().sort(function (a, b) { return parseISO(a.targetDate) - parseISO(b.targetDate); });

    if (!goals.length) {
      el.innerHTML = '<div class="empty-state">Aucun objectif pour le moment. Crée ton premier plan d\'entraînement.</div>';
      return;
    }

    el.innerHTML = goals.map(renderGoalCard).join("");
  }

  function renderGoalCard(goal) {
    var today = todayDate();
    var days = diffDays(parseISO(goal.targetDate), today);
    var sessions = sessionsForGoal(goal.id).sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
    var byWeek = {};
    sessions.forEach(function (s) {
      (byWeek[s.week] = byWeek[s.week] || []).push(s);
    });

    var weeksHtml = Object.keys(byWeek).sort(function (a, b) { return a - b; }).map(function (w) {
      var items = byWeek[w].map(renderSessionItem).join("");
      var phase = byWeek[w][0] && byWeek[w][0].phase;
      var phaseLabel = phase ? ' <span class="phase-badge phase-' + phase + '">' + PHASE_LABELS[phase] + '</span>' : "";
      return '<div class="week-block"><h4>Semaine ' + w + phaseLabel + '</h4>' + items + '</div>';
    }).join("");

    var metaParts = [goal.targetDistance + " km", formatDateFull(goal.targetDate)];
    if (goal.sport === "trail" && goal.elevationGain) {
      metaParts.push("D+ " + goal.elevationGain + "m" + (goal.elevationLoss ? " / D- " + goal.elevationLoss + "m" : ""));
    }
    if (goal.targetTimeSec) metaParts.push("objectif " + formatSecondsToTime(goal.targetTimeSec));
    metaParts.push(days >= 0 ? "J-" + days : "terminé");

    var badge = goal.sport === "trail" ?
      '<span class="sport-badge trail">Trail</span>' : '<span class="sport-badge route">Route</span>';
    var warning = isAmbitiousGoal(goal, state.profile) ?
      '<div class="goal-warning">Objectif ambitieux par rapport à tes temps de référence actuels.</div>' : "";

    return '<div class="goal-card" data-goal-id="' + goal.id + '">' +
      '<div class="goal-card-head">' +
      '<div><h3>' + escapeHtml(goal.name) + ' ' + badge + '</h3>' +
      '<div class="g-sub">' + metaParts.join(" · ") + '</div></div>' +
      '<button class="btn btn-ghost btn-small btn-delete-goal" data-goal-id="' + goal.id + '">Supprimer</button>' +
      '</div>' + warning + weeksHtml + '</div>';
  }

  function renderSessionItem(s) {
    var overdue = !s.done && diffDays(parseISO(s.date), todayDate()) < 0;
    var deltaHtml = "";
    if (s.done && s.linkedRunId) {
      var run = state.runs.find(function (r) { return r.id === s.linkedRunId; });
      if (run) {
        var diff = Math.round((run.distance - s.targetDistance) * 10) / 10;
        var cls = diff >= 0 ? "pos" : "neg";
        deltaHtml = '<div class="session-delta ' + cls + '">Réalisé : ' + fmtKm(run.distance) + ' (prévu ' + fmtKm(s.targetDistance) + ')</div>';
      }
    }
    var paceStr = formatPaceSec(s.paceSecPerKm);
    var metaBits = [formatDateShort(s.date), fmtKm(s.targetDistance)];
    if (paceStr) metaBits.push(paceStr);
    if (s.elevTarget) metaBits.push("D+ " + s.elevTarget + "m");

    return '<div class="session-item">' +
      '<button class="session-check' + (s.done ? " done" : "") + (overdue ? " overdue" : "") + '" data-session-id="' + s.id + '">' +
      (s.done ? "&#10003;" : "") + '</button>' +
      '<div class="session-body">' +
      '<div class="session-type">' + s.type + '</div>' +
      '<div class="session-meta">' + metaBits.join(" · ") + '</div>' +
      (s.description ? '<div class="session-detail">' + escapeHtml(s.description) + '</div>' : '') +
      deltaHtml +
      '</div></div>';
  }

  // ---------- rendering: history ----------

  function renderHistory() {
    var runs = state.runs.slice().sort(function (a, b) { return parseISO(b.date) - parseISO(a.date); });
    var total = runs.reduce(function (s, r) { return s + r.distance; }, 0);
    var totalDuration = runs.reduce(function (s, r) { return s + r.duration; }, 0);
    var avgPace = total > 0 ? totalDuration / total : 0;
    var longest = runs.reduce(function (m, r) { return r.distance > m ? r.distance : m; }, 0);

    document.getElementById("global-stats").innerHTML =
      stat(fmtKm(total), "Total") +
      stat(String(runs.length), "Courses") +
      stat(formatPace(avgPace), "Allure moy.") +
      stat(fmtKm(longest), "Record dist.");

    var listEl = document.getElementById("runs-list");
    if (!runs.length) {
      listEl.innerHTML = '<div class="empty-state">Aucune course enregistrée. Ajoute ta première sortie.</div>';
      return;
    }
    listEl.innerHTML = runs.map(function (r) {
      var pace = r.distance > 0 ? r.duration / r.distance : 0;
      return '<div class="run-item" data-run-id="' + r.id + '">' +
        '<div class="r-left"><div class="r-type">' + escapeHtml(r.type) + '</div>' +
        '<div class="r-date">' + formatDateFull(r.date) + '</div></div>' +
        '<div class="r-right"><div class="r-distance">' + fmtKm(r.distance) + '</div>' +
        '<div class="r-pace">' + formatPace(pace) + '</div></div>' +
        '</div>';
    }).join("");
  }

  // ---------- view switching ----------

  var TITLES = { dashboard: "Dashboard", plan: "Plan d'entraînement", history: "Historique" };

  function switchView(view) {
    document.querySelectorAll(".view").forEach(function (el) {
      el.hidden = el.dataset.view !== view;
    });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    document.getElementById("view-title").textContent = TITLES[view];
    renderAll();
  }

  function renderAll() {
    renderDashboard();
    renderPlan();
    renderHistory();
  }

  // ---------- dialogs & forms ----------

  function setupGoalDialog() {
    var dlg = document.getElementById("dlg-goal");
    var sportSelect = document.getElementById("goal-sport");
    var trailFields = document.getElementById("goal-trail-fields");

    document.getElementById("btn-new-goal").addEventListener("click", function () {
      document.getElementById("form-goal").reset();
      trailFields.hidden = true;
      dlg.showModal();
    });
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    sportSelect.addEventListener("change", function () {
      trailFields.hidden = sportSelect.value !== "trail";
    });

    document.getElementById("form-goal").addEventListener("submit", function () {
      var name = document.getElementById("goal-name").value.trim();
      var distance = parseFloat(document.getElementById("goal-distance").value);
      var targetDate = document.getElementById("goal-date").value;
      var sessionsPerWeek = parseInt(document.getElementById("goal-sessions").value, 10);
      var sport = sportSelect.value;
      if (!name || !distance || !targetDate) return;

      var elevGain = sport === "trail" ? (parseFloat(document.getElementById("goal-elevation-gain").value) || null) : null;
      var elevLoss = sport === "trail" ? (parseFloat(document.getElementById("goal-elevation-loss").value) || null) : null;
      var targetTimeSec = parseTimeToSeconds(document.getElementById("goal-target-time").value);

      var goal = {
        id: uid(),
        name: name,
        targetDistance: distance,
        targetDate: targetDate,
        sessionsPerWeek: sessionsPerWeek,
        sport: sport,
        elevationGain: elevGain,
        elevationLoss: elevLoss,
        targetTimeSec: targetTimeSec,
        status: "active",
        createdAt: toISO(todayDate())
      };
      state.goals.push(goal);
      state.planSessions = state.planSessions.concat(generatePlan(goal, state.profile));
      saveData();
      switchView("plan");
    });
  }

  function zoneRow(label, sec) {
    return '<div class="zone-row"><span>' + label + '</span><strong>' + (formatPaceSec(sec) || "--") + '</strong></div>';
  }

  function renderZonesPreview() {
    var refTimes = {
      t1k: parseTimeToSeconds(document.getElementById("ref-1k").value),
      t5k: parseTimeToSeconds(document.getElementById("ref-5k").value),
      t10k: parseTimeToSeconds(document.getElementById("ref-10k").value),
      tSemi: parseTimeToSeconds(document.getElementById("ref-semi").value)
    };
    var zones = computeZonesFromRefTimes(refTimes);
    var el = document.getElementById("zones-computed");
    if (!zones) {
      el.innerHTML = '<p class="dlg-hint" style="margin:0;">Renseigne au moins un temps de référence pour calculer tes allures.</p>';
      return;
    }
    el.innerHTML =
      zoneRow("Zone 1 · Récupération", zones.z1) +
      zoneRow("Zone 2 · Fondamentale", zones.z2) +
      zoneRow("Zone 3 · Marathon / Tempo", zones.z3) +
      zoneRow("Zone 4 · Seuil", zones.z4) +
      zoneRow("Zone 5 · VMA / Intervalle", zones.z5) +
      zoneRow("Vitesse · allure 1km", zones.speed);
  }

  function setupProfileDialog() {
    var dlg = document.getElementById("dlg-profile");
    var manualToggle = document.getElementById("zones-manual-toggle");
    var manualFields = document.getElementById("zones-manual-fields");
    var computedFields = document.getElementById("zones-computed");

    document.getElementById("btn-profile").addEventListener("click", function () {
      var p = state.profile;
      document.getElementById("profile-level").value = p.level;
      document.getElementById("ref-1k").value = formatSecondsToTime(p.refTimes.t1k);
      document.getElementById("ref-5k").value = formatSecondsToTime(p.refTimes.t5k);
      document.getElementById("ref-10k").value = formatSecondsToTime(p.refTimes.t10k);
      document.getElementById("ref-semi").value = formatSecondsToTime(p.refTimes.tSemi);
      manualToggle.checked = p.zonesMode === "manual";
      manualFields.hidden = p.zonesMode !== "manual";
      computedFields.hidden = p.zonesMode === "manual";
      document.getElementById("zone-1").value = formatPaceSec(p.manualZones.z1) || "";
      document.getElementById("zone-2").value = formatPaceSec(p.manualZones.z2) || "";
      document.getElementById("zone-3").value = formatPaceSec(p.manualZones.z3) || "";
      document.getElementById("zone-4").value = formatPaceSec(p.manualZones.z4) || "";
      document.getElementById("zone-5").value = formatPaceSec(p.manualZones.z5) || "";
      document.getElementById("zone-speed").value = formatPaceSec(p.manualZones.speed) || "";
      renderZonesPreview();
      dlg.showModal();
    });

    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });

    ["ref-1k", "ref-5k", "ref-10k", "ref-semi"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", renderZonesPreview);
    });

    manualToggle.addEventListener("change", function () {
      manualFields.hidden = !manualToggle.checked;
      computedFields.hidden = manualToggle.checked;
    });

    document.getElementById("form-profile").addEventListener("submit", function () {
      state.profile.level = document.getElementById("profile-level").value;
      state.profile.refTimes = {
        t1k: parseTimeToSeconds(document.getElementById("ref-1k").value),
        t5k: parseTimeToSeconds(document.getElementById("ref-5k").value),
        t10k: parseTimeToSeconds(document.getElementById("ref-10k").value),
        tSemi: parseTimeToSeconds(document.getElementById("ref-semi").value)
      };
      state.profile.zonesMode = manualToggle.checked ? "manual" : "auto";
      state.profile.manualZones = {
        z1: parseTimeToSeconds(document.getElementById("zone-1").value),
        z2: parseTimeToSeconds(document.getElementById("zone-2").value),
        z3: parseTimeToSeconds(document.getElementById("zone-3").value),
        z4: parseTimeToSeconds(document.getElementById("zone-4").value),
        z5: parseTimeToSeconds(document.getElementById("zone-5").value),
        speed: parseTimeToSeconds(document.getElementById("zone-speed").value)
      };
      recalcSessionsForProfile();
      snapshotZones();
      saveData();
      renderAll();
    });
  }

  function setupSessionDoneDialog() {
    var dlg = document.getElementById("dlg-session-done");
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    document.getElementById("form-session-done").addEventListener("submit", function () {
      var sessionId = document.getElementById("done-session-id").value;
      var session = state.planSessions.find(function (s) { return s.id === sessionId; });
      if (!session) return;
      var distance = parseFloat(document.getElementById("done-distance").value) || 0;
      var duration = parseFloat(document.getElementById("done-duration").value) || 0;
      var notes = document.getElementById("done-notes").value.trim();

      var run = {
        id: uid(),
        date: session.date,
        type: session.type,
        distance: distance,
        duration: duration,
        elevation: session.elevTarget || null,
        notes: notes,
        linkedPlanId: session.id
      };
      state.runs.push(run);
      session.done = true;
      session.linkedRunId = run.id;
      saveData();
      renderAll();
    });
  }

  function openSessionDone(sessionId) {
    var session = state.planSessions.find(function (s) { return s.id === sessionId; });
    if (!session) return;
    document.getElementById("form-session-done").reset();
    document.getElementById("done-session-id").value = sessionId;
    var paceStr = formatPaceSec(session.paceSecPerKm);
    document.getElementById("session-done-target").innerHTML =
      '<strong>' + session.type + '</strong> prévue le ' + formatDateFull(session.date) +
      ' · objectif ' + fmtKm(session.targetDistance) + (paceStr ? ' · ' + paceStr : '') +
      (session.description ? '<br>' + escapeHtml(session.description) : '');
    document.getElementById("dlg-session-done").showModal();
  }

  function toggleSession(sessionId) {
    var session = state.planSessions.find(function (s) { return s.id === sessionId; });
    if (!session) return;
    if (session.done) {
      session.done = false;
      session.linkedRunId = null;
      saveData();
      renderAll();
    } else {
      openSessionDone(sessionId);
    }
  }

  var REF_DISTANCES = [
    [1, "t1k", "1 km"],
    [5, "t5k", "5 km"],
    [10, "t10k", "10 km"],
    [21.0975, "tSemi", "semi-marathon"]
  ];

  function matchRefDistance(d) {
    for (var i = 0; i < REF_DISTANCES.length; i++) {
      var target = REF_DISTANCES[i][0];
      if (Math.abs(d - target) / target <= 0.07) {
        return { key: REF_DISTANCES[i][1], label: REF_DISTANCES[i][2] };
      }
    }
    return null;
  }

  function updateRunRefRow() {
    var type = document.getElementById("run-type").value;
    var distance = parseFloat(document.getElementById("run-distance").value) || 0;
    var row = document.getElementById("run-ref-row");
    if (type !== "Course") {
      row.hidden = true;
      return;
    }
    var match = matchRefDistance(distance);
    if (!match) {
      row.hidden = true;
      return;
    }
    document.getElementById("run-ref-label").textContent = "Utiliser comme nouveau temps de référence (" + match.label + ")";
    row.hidden = false;
  }

  function setupRunDialog() {
    var dlg = document.getElementById("dlg-run");
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    document.getElementById("btn-new-run").addEventListener("click", function () {
      openRunDialog(null);
    });
    document.getElementById("run-type").addEventListener("change", updateRunRefRow);
    document.getElementById("run-distance").addEventListener("input", updateRunRefRow);
    document.getElementById("btn-delete-run").addEventListener("click", function () {
      var id = document.getElementById("run-id").value;
      if (!id) return;
      state.runs = state.runs.filter(function (r) { return r.id !== id; });
      state.planSessions.forEach(function (s) {
        if (s.linkedRunId === id) { s.linkedRunId = null; s.done = false; }
      });
      saveData();
      dlg.close();
      renderAll();
    });
    document.getElementById("form-run").addEventListener("submit", function () {
      var id = document.getElementById("run-id").value;
      var distance = parseFloat(document.getElementById("run-distance").value) || 0;
      var duration = parseFloat(document.getElementById("run-duration").value) || 0;
      var data = {
        date: document.getElementById("run-date").value,
        type: document.getElementById("run-type").value,
        distance: distance,
        duration: duration,
        elevation: document.getElementById("run-elevation").value ? parseFloat(document.getElementById("run-elevation").value) : null,
        notes: document.getElementById("run-notes").value.trim()
      };
      if (id) {
        var run = state.runs.find(function (r) { return r.id === id; });
        if (run) Object.assign(run, data);
      } else {
        data.id = uid();
        data.linkedPlanId = null;
        state.runs.push(data);
      }

      var refRow = document.getElementById("run-ref-row");
      if (!refRow.hidden && document.getElementById("run-is-ref").checked) {
        var match = matchRefDistance(distance);
        if (match) {
          state.profile.refTimes[match.key] = Math.round(duration * 60);
          recalcSessionsForProfile();
          snapshotZones();
        }
      }

      saveData();
      renderAll();
    });
  }

  function openRunDialog(runId) {
    var form = document.getElementById("form-run");
    form.reset();
    document.getElementById("run-id").value = runId || "";
    document.getElementById("btn-delete-run").hidden = !runId;
    document.getElementById("run-dlg-title").textContent = runId ? "Modifier la course" : "Ajouter une course";

    if (runId) {
      var run = state.runs.find(function (r) { return r.id === runId; });
      if (run) {
        document.getElementById("run-date").value = run.date;
        document.getElementById("run-type").value = run.type;
        document.getElementById("run-distance").value = run.distance;
        document.getElementById("run-duration").value = run.duration;
        document.getElementById("run-elevation").value = run.elevation || "";
        document.getElementById("run-notes").value = run.notes || "";
      }
    } else {
      document.getElementById("run-date").value = toISO(todayDate());
    }
    updateRunRefRow();
    document.getElementById("dlg-run").showModal();
  }

  function deleteGoal(goalId) {
    if (!confirm("Supprimer cet objectif et son plan ? L'historique des courses n'est pas touché.")) return;
    state.goals = state.goals.filter(function (g) { return g.id !== goalId; });
    state.planSessions = state.planSessions.filter(function (s) { return s.goalId !== goalId; });
    saveData();
    renderAll();
  }

  // ---------- init ----------

  function init() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    setupGoalDialog();
    setupProfileDialog();
    setupSessionDoneDialog();
    setupRunDialog();

    document.getElementById("goals-list").addEventListener("click", function (e) {
      var check = e.target.closest(".session-check");
      if (check) { toggleSession(check.dataset.sessionId); return; }
      var del = e.target.closest(".btn-delete-goal");
      if (del) { deleteGoal(del.dataset.goalId); return; }
    });

    document.getElementById("runs-list").addEventListener("click", function (e) {
      var item = e.target.closest(".run-item");
      if (item) openRunDialog(item.dataset.runId);
    });

    switchView("dashboard");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
