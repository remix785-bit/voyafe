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
      if (data.profile.vmaKmh === undefined) data.profile.vmaKmh = null;
      if (!data.profile.performances) {
        var migrated = [];
        var legacyPerf = data.profile.recentPerformance;
        var legacyRef = data.profile.refTimes || {};
        if (legacyPerf && legacyPerf.distanceKm && legacyPerf.timeSec) {
          migrated.push({ distanceKm: legacyPerf.distanceKm, timeSec: legacyPerf.timeSec, date: legacyPerf.date || toISO(todayDate()) });
        } else {
          if (legacyRef.t1k) migrated.push({ distanceKm: 1, timeSec: legacyRef.t1k, date: toISO(todayDate()) });
          if (legacyRef.t5k) migrated.push({ distanceKm: 5, timeSec: legacyRef.t5k, date: toISO(todayDate()) });
          if (legacyRef.t10k) migrated.push({ distanceKm: 10, timeSec: legacyRef.t10k, date: toISO(todayDate()) });
          if (legacyRef.tSemi) migrated.push({ distanceKm: 21.0975, timeSec: legacyRef.tSemi, date: toISO(todayDate()) });
        }
        data.profile.performances = migrated;
      }
      if (data.profile.currentLongRunKm === undefined) data.profile.currentLongRunKm = null;
      if (data.profile.weeklyVolumeKm === undefined) data.profile.weeklyVolumeKm = null;
      if (!data.profile.level) data.profile.level = "intermediaire";
      data.profile.vmaHistory = data.profile.vmaHistory || [];
      delete data.profile.recentPerformance;
      delete data.profile.refTimes;
      delete data.profile.zonesMode;
      delete data.profile.manualZones;
      delete data.profile.zonesHistory;

      data.goals.forEach(function (g) {
        if (!g.sport) g.sport = "route";
        if (g.elevationGain === undefined) g.elevationGain = null;
        if (g.elevationLoss === undefined) g.elevationLoss = null;
        if (g.targetTimeSec === undefined) g.targetTimeSec = null;
        if (!g.trainingDayOffsets) {
          g.trainingDayOffsets = WEEKDAY_OFFSETS[g.sessionsPerWeek] || WEEKDAY_OFFSETS[3];
        }
        if (!g.startDate) {
          g.startDate = g.startMonday || null;
        }
      });
      return data;
    } catch (e) {
      return {
        goals: [], planSessions: [], runs: [],
        profile: { vmaKmh: null, performances: [], currentLongRunKm: null, weeklyVolumeKm: null, level: "intermediaire", vmaHistory: [] }
      };
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

  // ============================================================
  // Coaching engine — VMA-based methodology (spec followed literally)
  // ============================================================

  // ---------- §2: pace engine ----------

  function riegelPredict(t, d1, d2) {
    return t * Math.pow(d2 / d1, 1.06);
  }

  var PCT_VMA_TABLE = [
    [1.5, 1.00],
    [3, 0.95],
    [5, 0.90],
    [10, 0.85],
    [21.0975, 0.80],
    [42.195, 0.75]
  ];

  function pctVMAForDistance(distanceKm) {
    var table = PCT_VMA_TABLE;
    if (distanceKm <= table[0][0]) return table[0][1];
    var last = table[table.length - 1];
    if (distanceKm >= last[0]) {
      var prev = table[table.length - 2];
      var slope = (last[1] - prev[1]) / (last[0] - prev[0]);
      return Math.max(0.60, last[1] + slope * (distanceKm - last[0]));
    }
    for (var i = 0; i < table.length - 1; i++) {
      var a = table[i], b = table[i + 1];
      if (distanceKm >= a[0] && distanceKm <= b[0]) {
        var t = (distanceKm - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return 0.75;
  }

  // With two or more reference performances at genuinely different distances,
  // fit a personalized Riegel exponent (ln(T) = intercept + k*ln(D)) instead of
  // relying on the generic population-average %VMA table for a single point --
  // this captures whether THIS runner leans more speed- or endurance-dominant.
  function personalizedRiegelFit(performances) {
    var pts = performances.filter(function (p) { return p && p.distanceKm > 0 && p.timeSec > 0; });
    var distinctDistances = [];
    pts.forEach(function (p) {
      var isNew = !distinctDistances.some(function (d) { return Math.abs(d - p.distanceKm) / p.distanceKm < 0.03; });
      if (isNew) distinctDistances.push(p.distanceKm);
    });
    if (distinctDistances.length < 2) return null;

    var n = pts.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    pts.forEach(function (p) {
      var x = Math.log(p.distanceKm), y = Math.log(p.timeSec);
      sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
    });
    var denom = n * sumXX - sumX * sumX;
    if (!denom) return null;
    var k = (n * sumXY - sumX * sumY) / denom;
    if (!isFinite(k) || k < 1.00 || k > 1.25) return null;
    return { k: k, intercept: (sumY - k * sumX) / n };
  }

  function predictTimeSecAt(fit, distanceKm) {
    return Math.exp(fit.intercept + fit.k * Math.log(distanceKm));
  }

  function estimateVMA(performances) {
    var list = Array.isArray(performances) ? performances : (performances ? [performances] : []);
    var valid = list.filter(function (p) { return p && p.distanceKm > 0 && p.timeSec > 0; });
    if (!valid.length) return null;

    var fit = personalizedRiegelFit(valid);
    if (fit) {
      var t15 = predictTimeSecAt(fit, 1.5);
      return 1.5 / (t15 / 3600); // 1.5km ~ 100% VMA per PCT_VMA_TABLE
    }

    var best = valid.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); })[0];
    var pct = pctVMAForDistance(best.distanceKm);
    var speedKmh = best.distanceKm / (best.timeSec / 3600);
    return speedKmh / pct;
  }

  function getVMA(profile) {
    if (!profile) return null;
    if (profile.vmaKmh) return profile.vmaKmh;
    return estimateVMA(profile.performances);
  }

  // Adds a new reference performance, replacing any existing one at a near-identical
  // distance (within 7%) so re-racing the same distance updates it instead of piling
  // up stale entries.
  function addReferencePerformance(perf) {
    state.profile.performances = state.profile.performances || [];
    var idx = state.profile.performances.findIndex(function (p) {
      return Math.abs(p.distanceKm - perf.distanceKm) / perf.distanceKm <= 0.07;
    });
    if (idx !== -1) state.profile.performances[idx] = perf;
    else state.profile.performances.push(perf);
  }

  function paceFromPctVMA(vmaKmh, pct) {
    if (!vmaKmh || !pct) return null;
    var speedKmh = vmaKmh * pct;
    return Math.round(3600 / speedKmh);
  }

  function distanceFromPace(paceSecPerKm, minutes) {
    if (!paceSecPerKm) return 0;
    return (minutes * 60) / paceSecPerKm;
  }

  function computeGoalTiming(goal, vmaKmh) {
    var pct = pctVMAForDistance(goal.targetDistance);
    var predictedTimeSec = vmaKmh ? (goal.targetDistance / (vmaKmh * pct)) * 3600 : null;
    if (goal.targetTimeSec && !goal.targetTimeEstimated) {
      var ambitious = predictedTimeSec ? goal.targetTimeSec < predictedTimeSec * 0.97 : false;
      return { targetTimeSec: goal.targetTimeSec, ambitious: ambitious };
    }
    return { targetTimeSec: predictedTimeSec ? Math.round(predictedTimeSec) : goal.targetTimeSec, ambitious: false };
  }

  function isAmbitiousGoal(goal, profile) {
    var vma = getVMA(profile);
    if (!vma || !goal.targetTimeSec) return false;
    return computeGoalTiming(goal, vma).ambitious;
  }

  function snapshotVMA() {
    var vma = getVMA(state.profile);
    if (!vma) return;
    var today = toISO(todayDate());
    var history = state.profile.vmaHistory;
    var last = history[history.length - 1];
    if (last && last.date === today) {
      last.vmaKmh = vma;
    } else {
      history.push({ date: today, vmaKmh: vma });
    }
  }

  // ---------- §3: plan duration, phases, taper ----------

  var MIN_WEEKS_TABLE = [[5, 4], [10, 6], [21.0975, 8], [42.195, 10]];
  var TAPER_DAYS_TABLE = [[5, 5], [10, 7], [21.0975, 10], [42.195, 14]];

  function lookupByDistance(table, distanceKm) {
    for (var i = 0; i < table.length; i++) {
      if (distanceKm <= table[i][0]) return table[i][1];
    }
    return table[table.length - 1][1];
  }

  function minWeeksFor(distanceKm) { return lookupByDistance(MIN_WEEKS_TABLE, distanceKm); }
  function taperDaysFor(distanceKm) { return lookupByDistance(TAPER_DAYS_TABLE, distanceKm); }

  function splitPhases(totalWeeks, distanceKm) {
    var condensed = totalWeeks < minWeeksFor(distanceKm);
    var taperDays = condensed ? Math.min(taperDaysFor(distanceKm), 7) : taperDaysFor(distanceKm);
    var taperWeeks = Math.max(1, Math.ceil(taperDays / 7));
    taperWeeks = Math.min(taperWeeks, Math.max(0, totalWeeks - 1));
    var remaining = Math.max(1, totalWeeks - taperWeeks);
    var baseWeeks, devWeeks, peakWeeks;
    if (condensed) {
      baseWeeks = 0;
      devWeeks = Math.max(1, Math.round(remaining * 0.6));
      peakWeeks = Math.max(1, remaining - devWeeks);
    } else {
      baseWeeks = Math.round(remaining * 0.35);
      devWeeks = Math.round(remaining * 0.40);
      peakWeeks = remaining - baseWeeks - devWeeks;
      if (peakWeeks < 1) {
        peakWeeks = 1;
        devWeeks = Math.max(1, remaining - baseWeeks - peakWeeks);
      }
    }
    return { taperDays: taperDays, taperWeeks: taperWeeks, baseWeeks: baseWeeks, devWeeks: devWeeks, peakWeeks: peakWeeks, condensed: condensed };
  }

  function phaseForWeek(goal, w) {
    if (w >= goal.progWeeks) return "taper";
    if (w < goal.baseWeeks) return "base";
    if (w < goal.baseWeeks + goal.devWeeks) return "dev";
    return "peak";
  }

  var PHASE_LABELS = { base: "Base", dev: "Développement", peak: "Pic", taper: "Affûtage" };

  // ---------- §4 + §5: session templates & lever-rotation progression ----------

  var PHASE_TEMPLATES = {
    base: { vmaReps: 8, vmaMeters: 400, vmaPct: 1.00, vmaRecoverSec: 90, seuilMin: 15, seuilBlocks: 1, seuilPct: 0.85, seuilRecoverMin: 0, longTailPct: 0 },
    dev: { vmaReps: 10, vmaMeters: 400, vmaPct: 1.025, vmaRecoverSec: 75, seuilMin: 10, seuilBlocks: 3, seuilPct: 0.87, seuilRecoverMin: 2, longTailPct: 0.25 },
    peak: { vmaReps: 12, vmaMeters: 400, vmaPct: 1.075, vmaRecoverSec: 60, seuilMin: 20, seuilBlocks: 2, seuilPct: 0.88, seuilRecoverMin: 3, longTailPct: 0.375 }
  };

  var LEVER_INCREMENTS = {
    base: { long_run: 1.5, seuil: 2, vma: 1 },
    dev: { long_run: 2.0, seuil: 3, vma: 2 },
    peak: { long_run: 1.0, seuil: 2, vma: 1 }
  };

  var LONG_TAIL_PCT_VMA = 0.80;
  var LONG_BASE_PCT_VMA = 0.725;

  // Weekly training volume (VMA reps, seuil duration, long-run ceiling) scales with
  // the chosen race distance, its elevation gain (trail), and the runner's own
  // profile (current weekly volume, experience level) -- intensity (%VMA paces)
  // stays the same, only the amount of work per session/week and the pace of
  // progression change.
  function interpolateTable(table, x) {
    if (x <= table[0][0]) return table[0][1];
    var last = table[table.length - 1];
    if (x >= last[0]) return last[1];
    for (var i = 0; i < table.length - 1; i++) {
      var a = table[i], b = table[i + 1];
      if (x >= a[0] && x <= b[0]) {
        var t = (x - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return 1.0;
  }

  var DISTANCE_LOAD_TABLE = [
    [5, 0.55], [10, 0.75], [15, 0.85], [21.0975, 0.90],
    [42.195, 1.00], [50, 1.08], [80, 1.20], [120, 1.32]
  ];

  function distanceLoadFactor(distanceKm) {
    return interpolateTable(DISTANCE_LOAD_TABLE, distanceKm);
  }

  function elevationLoadFactor(goal) {
    if (goal.sport !== "trail" || !goal.elevationGain || !goal.targetDistance) return 1.0;
    var mPerKm = goal.elevationGain / goal.targetDistance;
    return 1 + Math.min(0.35, mPerKm / 250);
  }

  // Current weekly volume is the runner's own baseline fitness signal: someone
  // already running 60km/week should get a visibly heavier plan than someone at
  // 15km/week for the same target race. No data entered stays neutral (1.0).
  var WEEKLY_VOLUME_LOAD_TABLE = [
    [0, 0.65], [15, 0.80], [30, 0.95], [45, 1.05], [60, 1.15], [80, 1.25], [120, 1.35]
  ];

  function fitnessLoadFactor(profile) {
    var km = profile && profile.weeklyVolumeKm;
    if (!km) return 1.0;
    return interpolateTable(WEEKLY_VOLUME_LOAD_TABLE, km);
  }

  // Experience level doesn't change how much a runner does this week, it changes
  // how fast the plan is allowed to ramp week over week.
  var LEVEL_STEP_MULTIPLIER = { debutant: 0.7, intermediaire: 1.0, confirme: 1.3 };

  function levelStepMultiplier(profile) {
    return LEVEL_STEP_MULTIPLIER[profile && profile.level] || 1.0;
  }

  function buildWeeklyParams(goal, profile) {
    var progWeeks = goal.progWeeks;
    var elevFactor = elevationLoadFactor(goal);
    var loadFactor = distanceLoadFactor(goal.targetDistance) * elevFactor * fitnessLoadFactor(profile);
    var levelMult = levelStepMultiplier(profile);
    var distancePic = Math.min(Math.min(0.65 * goal.targetDistance, 32) * elevFactor, 38);
    var longRunKm = goal.currentLongRunKm || 12;
    var seuilFloor = Math.max(4, Math.round(8 * loadFactor));
    var vmaFloor = Math.max(2, Math.round(4 * loadFactor));
    var seuilMin = null, vmaReps = null, currentPhase = null;
    var weeks = [];

    for (var w = 0; w < progWeeks; w++) {
      var weekIndex = w + 1;
      var phase = phaseForWeek(goal, w);
      if (phase !== currentPhase) {
        seuilMin = Math.max(seuilFloor, Math.round(PHASE_TEMPLATES[phase].seuilMin * loadFactor));
        vmaReps = Math.max(vmaFloor, Math.round(PHASE_TEMPLATES[phase].vmaReps * loadFactor));
        currentPhase = phase;
      }

      var isDecharge = weekIndex % 4 === 0;
      var lever = null;
      if (isDecharge) {
        longRunKm = Math.max(goal.currentLongRunKm || 8, Math.round(longRunKm * 0.72 * 10) / 10);
        seuilMin = Math.max(seuilFloor, Math.round(seuilMin * 0.72));
        vmaReps = Math.max(vmaFloor, Math.round(vmaReps * 0.72));
      } else {
        var leverIdx = (weekIndex - 1) % 3;
        lever = ["long_run", "seuil", "vma"][leverIdx];
        var inc = LEVER_INCREMENTS[phase];
        if (lever === "long_run" && longRunKm < distancePic) {
          var step = Math.min(inc.long_run * levelMult, 0.10 * longRunKm, 2 * levelMult);
          longRunKm = Math.min(distancePic, Math.round((longRunKm + step) * 10) / 10);
        } else if (lever === "seuil") {
          seuilMin = seuilMin + Math.max(1, Math.round(inc.seuil * loadFactor * levelMult));
        } else if (lever === "vma") {
          vmaReps = vmaReps + Math.max(1, Math.round(inc.vma * loadFactor * levelMult));
        }
      }

      weeks.push({
        phase: phase, isDecharge: isDecharge, lever: lever,
        longRunKm: Math.round(longRunKm * 10) / 10,
        seuilMin: seuilMin, vmaReps: vmaReps
      });
    }
    return weeks;
  }

  function vmaSessionDetail(vmaKmh, reps, meters, pct, recoverSec, opts) {
    var pace = paceFromPctVMA(vmaKmh, pct);
    var paceStr = formatPaceSec(pace);
    var distanceKm = Math.round((reps * meters / 1000) * 10) / 10;
    var detail = "Échauffement 15min facile + gammes/lignes droites. " + reps + " x " + meters + "m" +
      (paceStr ? " à " + paceStr : "") + " (" + Math.round(pct * 100) + "% VMA), récupération " + recoverSec + "sec trot. Retour au calme 10min.";
    var spot = parisTrainingSpot("VMA", opts && opts.sport);
    if (spot) detail += " " + spot;
    return { pace: pace, distanceKm: Math.max(distanceKm, 1), detail: detail };
  }

  function seuilSessionDetail(vmaKmh, durationMin, blocks, pct, recoverMin, opts) {
    var pace = paceFromPctVMA(vmaKmh, pct);
    var paceStr = formatPaceSec(pace);
    var totalMin = durationMin * blocks;
    var distanceKm = Math.round(distanceFromPace(pace, totalMin) * 10) / 10;
    var blocText = blocks > 1
      ? blocks + " x " + durationMin + "min" + (paceStr ? " à " + paceStr : "") + ", récupération " + recoverMin + "min trot"
      : durationMin + "min continu" + (paceStr ? " à " + paceStr : "");
    var detail = "Échauffement 15min facile. " + blocText + " (" + Math.round(pct * 100) + "% VMA), effort régulier sans à-coups. Retour au calme 10min.";
    var spot = parisTrainingSpot("Seuil", opts && opts.sport);
    if (spot) detail += " " + spot;
    return { pace: pace, distanceKm: Math.max(distanceKm, 1), detail: detail };
  }

  function longueSessionDetail(vmaKmh, distanceKm, tailPct, opts) {
    var basePace = paceFromPctVMA(vmaKmh, LONG_BASE_PCT_VMA);
    var basePaceStr = formatPaceSec(basePace);
    var detail = fmtNum(distanceKm) + "km à allure fondamentale" + (basePaceStr ? " (" + basePaceStr + ")" : "") + ", régulier";
    if (tailPct > 0) {
      var tailKm = Math.round(distanceKm * tailPct * 10) / 10;
      var tailPace = paceFromPctVMA(vmaKmh, LONG_TAIL_PCT_VMA);
      detail += ". Termine les " + fmtNum(tailKm) + " derniers km à allure spécifique" + (tailPace ? " (" + formatPaceSec(tailPace) + ")" : "");
    }
    if (opts && opts.sport === "trail" && opts.elevTarget) {
      detail += ", D+ ~" + opts.elevTarget + "m, gère l'effort en montée, mouline en descente";
    }
    detail += ".";
    var spot = parisTrainingSpot("Sortie longue", opts && opts.sport);
    if (spot) detail += " " + spot;
    return { pace: basePace, detail: detail };
  }

  function parisTrainingSpot(type, sport) {
    if (type === "VMA" || type === "Seuil") {
      return "Idéal sur piste d'athlétisme, quais de Seine ou Champ de Mars pour des repères de distance fiables.";
    }
    if (type === "Sortie longue") {
      return sport === "trail"
        ? "Pars en forêt si possible (Fontainebleau, Meudon, Saint-Cloud) pour du vrai dénivelé ; sinon grandes boucles au Bois de Vincennes/Boulogne."
        : "Bois de Vincennes ou Bois de Boulogne, grandes boucles à plat.";
    }
    return null;
  }

  // ---------- §6: detailed taper sequence (14-day marathon template, scaled) ----------

  var TAPER_CHECKPOINTS_14 = [
    { daysBefore: 14, kind: "longue", pctOfPeak: 0.60, tailPct: 0.15 },
    { daysBefore: 10, kind: "vma-sharp" },
    { daysBefore: 7, kind: "longue", pctOfPeak: 0.375, tailPct: 0 },
    { daysBefore: 4, kind: "vma-accel" },
    { daysBefore: 1.5, kind: "shakeout" }
  ];

  function taperCheckpointsFor(taperDays) {
    var scale = taperDays / 14;
    var seen = {};
    var out = [];
    TAPER_CHECKPOINTS_14.forEach(function (c) {
      var d = Math.max(1, Math.round(c.daysBefore * scale));
      if (seen[d]) return;
      seen[d] = true;
      out.push({ daysBefore: d, kind: c.kind, pctOfPeak: c.pctOfPeak, tailPct: c.tailPct });
    });
    return out;
  }

  function nearestCheckpoint(checkpoints, daysBefore) {
    var best = checkpoints[0];
    var bestDiff = Math.abs(daysBefore - best.daysBefore);
    checkpoints.forEach(function (c) {
      var diff = Math.abs(daysBefore - c.daysBefore);
      if (diff < bestDiff) { best = c; bestDiff = diff; }
    });
    return best;
  }

  function buildTaperSession(checkpoint, peakLongRunKm, vmaKmh, opts) {
    switch (checkpoint.kind) {
      case "longue": {
        var dist = Math.round(peakLongRunKm * checkpoint.pctOfPeak * 10) / 10;
        var built = longueSessionDetail(vmaKmh, dist, checkpoint.tailPct, opts);
        return { type: "Sortie longue", targetDistance: Math.max(dist, 3), pace: built.pace, detail: built.detail };
      }
      case "vma-sharp": {
        var built2 = vmaSessionDetail(vmaKmh, 4, 400, 1.00, 90, opts);
        built2.detail = built2.detail.replace("Échauffement 15min facile + gammes/lignes droites.", "Affûtage : échauffement 15min. Séance courte et vive, pas de charge.");
        return { type: "VMA", targetDistance: built2.distanceKm, pace: built2.pace, detail: built2.detail };
      }
      case "vma-accel": {
        var paceAccel = paceFromPctVMA(vmaKmh, 1.05);
        var detail = "Footing très facile 15-20min puis 4 à 6 x 20sec accélérations progressives" +
          (paceAccel ? " (proche " + formatPaceSec(paceAccel) + ")" : "") +
          ", retour au calme entre chaque. Objectif : réactivité neuromusculaire, sans créer de fatigue.";
        var spot = parisTrainingSpot("VMA", opts && opts.sport);
        if (spot) detail += " " + spot;
        return { type: "VMA", targetDistance: 4, pace: paceFromPctVMA(vmaKmh, LONG_BASE_PCT_VMA), detail: detail };
      }
      case "shakeout":
      default: {
        var easyPace = paceFromPctVMA(vmaKmh, LONG_BASE_PCT_VMA);
        return {
          type: "Sortie longue",
          targetDistance: 4,
          pace: easyPace,
          detail: "Footing très court et facile, 20-25min" + (easyPace ? " (" + formatPaceSec(easyPace) + " ou plus lent)" : "") + ". Objectif : relâchement, jambes fraîches pour le jour J."
        };
      }
    }
  }

  // ---------- generator ----------

  function generatePlan(goal, profile) {
    var targetDate = parseISO(goal.targetDate);
    var startDate = goal.startDate ? parseISO(goal.startDate) : nextMonday(todayDate());
    if (diffDays(startDate, targetDate) >= 0) {
      var today = todayDate();
      startDate = diffDays(targetDate, today) > 0 ? today : addDays(targetDate, -1);
    }
    var gridMonday = mondayOf(startDate);
    var totalWeeks = Math.max(1, Math.floor(diffDays(targetDate, gridMonday) / 7));
    var split = splitPhases(totalWeeks, goal.targetDistance);
    var progWeeks = totalWeeks - split.taperWeeks;
    var offsets = goal.trainingDayOffsets && goal.trainingDayOffsets.length ? goal.trainingDayOffsets : WEEKDAY_OFFSETS[3];
    var vmaKmh = getVMA(profile);
    var elevRatio = (goal.sport === "trail" && goal.elevationGain) ? goal.elevationGain / goal.targetDistance : 0;

    goal.totalWeeks = totalWeeks;
    goal.taperWeeks = split.taperWeeks;
    goal.taperDays = split.taperDays;
    goal.baseWeeks = split.baseWeeks;
    goal.devWeeks = split.devWeeks;
    goal.peakWeeks = split.peakWeeks;
    goal.progWeeks = progWeeks;
    goal.condensed = split.condensed;
    goal.startMonday = toISO(gridMonday);
    goal.startDate = toISO(startDate);
    goal.sessionsPerWeek = offsets.length;
    if (goal.currentLongRunKm === undefined || goal.currentLongRunKm === null) {
      goal.currentLongRunKm = (profile && profile.currentLongRunKm) || 12;
    }

    var timing = computeGoalTiming(goal, vmaKmh);
    goal.targetTimeEstimated = !goal.targetTimeSec;
    goal.targetTimeSec = timing.targetTimeSec;

    var weeklyParams = buildWeeklyParams(goal, profile);
    var peakLongRunKm = weeklyParams.length ? weeklyParams[weeklyParams.length - 1].longRunKm : (goal.currentLongRunKm || 12);
    var taperCheckpoints = taperCheckpointsFor(goal.taperDays);

    var sessions = [];

    for (var w = 0; w < totalWeeks; w++) {
      var weekStart = addDays(gridMonday, w * 7);
      var phase = phaseForWeek(goal, w);
      var isTaper = phase === "taper";
      var wp = !isTaper ? weeklyParams[w] : null;
      var tmpl = !isTaper ? PHASE_TEMPLATES[phase] : null;

      offsets.forEach(function (offset, i) {
        var date = addDays(weekStart, offset);
        if (date < startDate) return;
        if (diffDays(date, targetDate) >= 0) return;

        var opts = { sport: goal.sport };
        var type, targetDistance, pace, detail, elevTarget = 0, lever = null, isDecharge = false;

        if (isTaper) {
          var daysBefore = diffDays(targetDate, date);
          var checkpoint = nearestCheckpoint(taperCheckpoints, daysBefore);
          var built = buildTaperSession(checkpoint, peakLongRunKm, vmaKmh, opts);
          type = built.type;
          targetDistance = built.targetDistance;
          pace = built.pace;
          detail = built.detail;
          if (type === "Sortie longue" && elevRatio) elevTarget = Math.round(targetDistance * elevRatio);
        } else {
          // slot i maps to the fixed weekly structure: 0=VMA, 1=Seuil, 2=Sortie longue (or fewer if custom day count < 3)
          var n = offsets.length;
          var roleIdx = n === 3 ? i : (n === 2 ? (i === 0 ? 1 : 2) : 2);
          if (roleIdx === 0) {
            var vb = vmaSessionDetail(vmaKmh, wp.vmaReps, tmpl.vmaMeters, tmpl.vmaPct, tmpl.vmaRecoverSec, opts);
            type = "VMA"; targetDistance = vb.distanceKm; pace = vb.pace; detail = vb.detail;
          } else if (roleIdx === 1) {
            var sb = seuilSessionDetail(vmaKmh, wp.seuilMin, tmpl.seuilBlocks, tmpl.seuilPct, tmpl.seuilRecoverMin, opts);
            type = "Seuil"; targetDistance = sb.distanceKm; pace = sb.pace; detail = sb.detail;
          } else {
            elevTarget = elevRatio ? Math.round(wp.longRunKm * elevRatio) : 0;
            var lb = longueSessionDetail(vmaKmh, wp.longRunKm, tmpl.longTailPct, { sport: goal.sport, elevTarget: elevTarget });
            type = "Sortie longue"; targetDistance = wp.longRunKm; pace = lb.pace; detail = lb.detail;
          }
          lever = wp.lever;
          isDecharge = wp.isDecharge;
        }

        sessions.push({
          id: uid(),
          goalId: goal.id,
          week: w + 1,
          phase: phase,
          lever: lever,
          isDecharge: isDecharge,
          date: toISO(date),
          type: type,
          targetDistance: targetDistance,
          elevTarget: elevTarget || null,
          paceSecPerKm: pace,
          description: detail,
          done: false,
          linkedRunId: null
        });
      });
    }
    return sessions;
  }

  function recalcSessionsForProfile() {
    var vmaKmh = getVMA(state.profile);
    if (!vmaKmh) return;
    state.planSessions.forEach(function (s) {
      if (s.done) return;
      var goal = state.goals.find(function (g) { return g.id === s.goalId; });
      if (!goal || goal.progWeeks == null) return;
      var opts = { sport: goal.sport, elevTarget: s.elevTarget };
      var w = s.week - 1;
      var phase = phaseForWeek(goal, w);
      if (phase === "taper") return; // taper structures are checkpoint-based, not VMA-parametrized beyond pace already baked in; skip fine recalibration here
      var tmpl = PHASE_TEMPLATES[phase];
      if (!tmpl) return;
      if (s.type === "VMA") {
        var vb = vmaSessionDetail(vmaKmh, Math.round((s.targetDistance * 1000) / tmpl.vmaMeters), tmpl.vmaMeters, tmpl.vmaPct, tmpl.vmaRecoverSec, opts);
        s.paceSecPerKm = vb.pace;
        s.description = vb.detail;
      } else if (s.type === "Seuil") {
        var priorTotalMin = s.paceSecPerKm ? (s.targetDistance * s.paceSecPerKm) / 60 : tmpl.seuilMin * tmpl.seuilBlocks;
        var durMin = Math.max(1, Math.round((priorTotalMin / tmpl.seuilBlocks) * 10) / 10);
        var sb = seuilSessionDetail(vmaKmh, durMin, tmpl.seuilBlocks, tmpl.seuilPct, tmpl.seuilRecoverMin, opts);
        s.paceSecPerKm = sb.pace;
        s.description = sb.detail;
      } else if (s.type === "Sortie longue") {
        var lb = longueSessionDetail(vmaKmh, s.targetDistance, tmpl.longTailPct, opts);
        s.paceSecPerKm = lb.pace;
        s.description = lb.detail;
      }
    });
  }

  // ---------- derived data ----------

  function activeGoals() {
    return state.goals.filter(function (g) { return g.status === "active"; });
  }

  function sessionsForGoal(goalId) {
    return state.planSessions.filter(function (s) { return s.goalId === goalId; });
  }

  // The program's current week: the earliest week that still has an undone
  // session. Independent of today's date, so a plan whose next session is
  // more than a few calendar days out (sparse training days, plan not
  // started yet) still surfaces its next batch of sessions.
  function firstUndoneWeek(goal) {
    var sessions = sessionsForGoal(goal.id).sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
    var byWeek = {};
    sessions.forEach(function (s) { (byWeek[s.week] = byWeek[s.week] || []).push(s); });
    var weekNums = Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; });
    var currentWeek = null;
    weekNums.forEach(function (w) {
      if (currentWeek !== null) return;
      if (byWeek[w].some(function (s) { return !s.done; })) currentWeek = w;
    });
    return { byWeek: byWeek, weekNums: weekNums, currentWeek: currentWeek };
  }

  function programWeekSessions(goal) {
    var r = firstUndoneWeek(goal);
    if (r.currentWeek === null) return [];
    return r.byWeek[r.currentWeek].slice().sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
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

  var DEFAULT_RPE = {
    "Récupération": 3, "Endurance fondamentale": 4, "Activation": 3,
    "Sortie longue": 5, "Seuil": 7, "VMA": 8, "Côtes": 7, "Course": 8
  };

  function runLoad(run) {
    var rpe = run.rpe || DEFAULT_RPE[run.type] || 5;
    return run.duration * rpe;
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
    "insuffisant": ["Pas assez de données", "Ajoute au moins 2 semaines de courses (avec RPE) pour calculer ta charge (ACWR)."],
    "sous-charge": ["Sous-charge", "Charge en dessous de ta moyenne récente : marge de progression."],
    "optimale": ["Zone optimale", "Charge d'entraînement équilibrée par rapport à tes 4 dernières semaines."],
    "vigilance": ["Vigilance", "Charge en hausse rapide, sois attentif aux signaux de fatigue."],
    "risque": ["Risque élevé", "ACWR > 1.5 : hausse de charge trop rapide, une semaine de décharge est recommandée."]
  };

  function renderACWR() {
    var acwr = computeACWR();
    var labels = ACWR_LABELS[acwr.status];
    var valueStr = acwr.ratio === null ? "--" : acwr.ratio.toFixed(2);
    var markerPct = acwr.ratio === null ? 0 : Math.max(0, Math.min(100, (acwr.ratio / 2) * 100));
    var gauge = acwr.ratio === null ? "" :
      '<div class="acwr-gauge"><div class="acwr-gauge-marker" style="left:' + markerPct + '%"></div></div>';
    document.getElementById("acwr-display").innerHTML =
      '<div class="acwr-value">' + valueStr + '</div>' +
      '<div class="acwr-status acwr-' + acwr.status + '">' + labels[0] + '</div>' +
      gauge +
      '<div class="dlg-hint" style="margin:8px 0 0;">' + labels[1] + '</div>';
  }

  function goalProgress(goal) {
    var sessions = sessionsForGoal(goal.id);
    var total = sessions.length;
    var done = sessions.filter(function (s) { return s.done; }).length;
    return { done: done, total: total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function renderTodayBanner() {
    var todayISO = toISO(todayDate());
    var todaysSessions = state.planSessions.filter(function (s) { return !s.done && s.date === todayISO; });
    var slot = document.getElementById("today-banner-slot");
    if (!todaysSessions.length) {
      slot.innerHTML = "";
      return;
    }
    var s = todaysSessions[0];
    var paceStr = formatPaceSec(s.paceSecPerKm);
    slot.innerHTML = '<div class="today-banner" data-session-id="' + s.id + '">' +
      '<div class="tb-icon">🏃</div>' +
      '<div><div class="tb-title">Séance du jour : ' + s.type + '</div>' +
      '<div class="tb-meta">' + fmtKm(s.targetDistance) + (paceStr ? ' · ' + paceStr : '') + ' — à toi de jouer !</div></div>' +
      '</div>';
  }

  function renderDashboard() {
    var today = todayDate();
    var range = weekRange(today);

    renderTodayBanner();

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
        '<div class="g-meta">' + g.targetDistance + ' km · ' + formatDateFull(g.targetDate) +
        (g.targetTimeSec ? ' · objectif ' + formatSecondsToTime(g.targetTimeSec) + ' (' + formatPaceSec(g.targetTimeSec / g.targetDistance) + ')' + (g.targetTimeEstimated ? ' estimé' : '') : '') + '</div>' +
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
    var history = state.profile.vmaHistory;
    if (history.length >= 2) {
      trendCanvas.hidden = false;
      trendEmpty.hidden = true;
      drawTrendChart(trendCanvas, history);
    } else {
      trendCanvas.hidden = true;
      trendEmpty.hidden = false;
      if (history.length === 1) {
        trendEmpty.innerHTML = 'VMA actuelle : <strong>' + fmtNum(history[0].vmaKmh) + ' km/h</strong> (depuis le ' + formatDateShort(history[0].date) + '). Coche tes séances ou enregistre une course pour voir ta progression apparaître ici.';
      } else {
        trendEmpty.textContent = "Renseigne ta VMA dans ton profil pour commencer à suivre ta progression.";
      }
    }

    var upcomingGoals = activeGoals();
    var upcomingEl = document.getElementById("upcoming-week");
    var upcomingHtml = upcomingGoals.map(function (g) {
      var weekSessions = programWeekSessions(g);
      if (!weekSessions.length) return "";
      var heading = upcomingGoals.length > 1 ? '<div class="upcoming-goal-name">' + escapeHtml(g.name) + '</div>' : "";
      return heading + weekSessions.map(renderSessionItem).join("");
    }).join("");
    upcomingEl.innerHTML = upcomingHtml || '<div class="empty-state">Aucune séance planifiée.</div>';

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

    var values = history.map(function (h) { return h.vmaKmh; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (minV === maxV) { minV -= 0.5; maxV += 0.5; }

    var padX = 6;
    var topPad = 16;
    var bottomPad = 20;
    var chartW = cssWidth - padX * 2;
    var chartH = cssHeight - topPad - bottomPad;
    var mutedColor = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#888";

    function pointAt(i) {
      var x = padX + (history.length === 1 ? chartW / 2 : chartW * (i / (history.length - 1)));
      var t = (history[i].vmaKmh - minV) / (maxV - minV);
      var y = topPad + (1 - t) * chartH;
      return [x, y];
    }

    var grad = ctx.createLinearGradient(0, topPad, 0, topPad + chartH);
    grad.addColorStop(0, "#F72585");
    grad.addColorStop(1, "#FF5A36");
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
    ctx.fillText("VMA : " + fmtNum(maxV) + " km/h au mieux", padX, topPad - 5);
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

  var SESSION_TYPE_CLASS = { "VMA": "vma", "Seuil": "seuil", "Sortie longue": "longue", "Course": "course" };
  function sessionTypeClass(type) { return SESSION_TYPE_CLASS[type] || "autre"; }

  function renderGoalCard(goal) {
    var today = todayDate();
    var days = diffDays(parseISO(goal.targetDate), today);
    var r = firstUndoneWeek(goal);
    var byWeek = r.byWeek, weekNums = r.weekNums;
    var currentWeek = r.currentWeek !== null ? r.currentWeek : (weekNums.length ? weekNums[weekNums.length - 1] : null);

    var weeksHtml = weekNums.map(function (w) {
      var weekSessions = byWeek[w];
      var items = weekSessions.map(renderSessionItem).join("");
      var wk = weekSessions[0];
      var phase = wk && wk.phase;
      var phaseLabel = phase ? ' <span class="phase-badge phase-' + phase + '">' + PHASE_LABELS[phase] + '</span>' : "";
      var dechargeLabel = wk && wk.isDecharge ? ' <span class="phase-badge phase-decharge">Décharge</span>' : "";
      var preview = weekSessions.map(function (s) { return s.type; }).join(" · ");
      var isOpen = w === currentWeek;
      return '<details class="week-block"' + (isOpen ? " open" : "") + '>' +
        '<summary><span class="week-title">Semaine ' + w + '</span>' + phaseLabel + dechargeLabel +
        '<span class="week-preview">' + escapeHtml(preview) + '</span></summary>' +
        '<div class="week-sessions">' + items + '</div></details>';
    }).join("");

    var metaParts = [goal.targetDistance + " km", formatDateFull(goal.targetDate)];
    if (goal.sport === "trail" && goal.elevationGain) {
      metaParts.push("D+ " + goal.elevationGain + "m" + (goal.elevationLoss ? " / D- " + goal.elevationLoss + "m" : ""));
    }
    if (goal.targetTimeSec) {
      var goalPaceStr = formatPaceSec(goal.targetTimeSec / goal.targetDistance);
      metaParts.push("objectif " + formatSecondsToTime(goal.targetTimeSec) + (goalPaceStr ? " (" + goalPaceStr + ")" : "") + (goal.targetTimeEstimated ? " · estimé depuis ta VMA" : ""));
    }
    metaParts.push(days >= 0 ? "J-" + days : "terminé");

    var badge = goal.sport === "trail" ?
      '<span class="sport-badge trail">Trail</span>' : '<span class="sport-badge route">Route</span>';
    var warning = isAmbitiousGoal(goal, state.profile) ?
      '<div class="goal-warning">Objectif ambitieux par rapport à ta VMA actuelle — le plan vise quand même cette allure sur les séances spécifiques.</div>' : "";

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

    return '<div class="session-item type-' + sessionTypeClass(s.type) + '">' +
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

  var DEFAULT_TRAINING_DAYS = [1, 3, 5];
  var MAX_TRAINING_DAYS = 3;

  function setupDayPicker() {
    var picker = document.getElementById("day-picker");
    var buttons = Array.prototype.slice.call(picker.querySelectorAll(".day-btn"));

    function setSelectedDays(days) {
      buttons.forEach(function (b) {
        b.classList.toggle("active", days.indexOf(parseInt(b.dataset.day, 10)) !== -1);
      });
    }

    function getSelectedDays() {
      return buttons.filter(function (b) { return b.classList.contains("active"); })
        .map(function (b) { return parseInt(b.dataset.day, 10); })
        .sort(function (a, b) { return a - b; });
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var active = b.classList.contains("active");
        if (!active && getSelectedDays().length >= MAX_TRAINING_DAYS) return;
        b.classList.toggle("active");
      });
    });

    return { setSelectedDays: setSelectedDays, getSelectedDays: getSelectedDays };
  }

  function setupGoalDialog() {
    var dlg = document.getElementById("dlg-goal");
    var sportSelect = document.getElementById("goal-sport");
    var trailFields = document.getElementById("goal-trail-fields");
    var dayPicker = setupDayPicker();

    document.getElementById("btn-new-goal").addEventListener("click", function () {
      document.getElementById("form-goal").reset();
      trailFields.hidden = true;
      dayPicker.setSelectedDays(DEFAULT_TRAINING_DAYS);
      var startInput = document.getElementById("goal-start-date");
      var todayISO = toISO(todayDate());
      startInput.min = todayISO;
      startInput.value = toISO(nextMonday(todayDate()));
      dlg.showModal();
    });
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    sportSelect.addEventListener("change", function () {
      trailFields.hidden = sportSelect.value !== "trail";
    });
    document.getElementById("goal-date").addEventListener("change", function () {
      var startInput = document.getElementById("goal-start-date");
      var targetVal = this.value;
      if (!targetVal) return;
      var todayISO = toISO(todayDate());
      var dayBeforeTarget = toISO(addDays(parseISO(targetVal), -1));
      startInput.max = dayBeforeTarget < todayISO ? todayISO : dayBeforeTarget;
      if (!startInput.value || startInput.value >= targetVal) {
        startInput.value = todayISO < targetVal ? todayISO : dayBeforeTarget;
      }
    });

    document.getElementById("form-goal").addEventListener("submit", function (e) {
      var name = document.getElementById("goal-name").value.trim();
      var distance = parseFloat(document.getElementById("goal-distance").value);
      var targetDate = document.getElementById("goal-date").value;
      var startDate = document.getElementById("goal-start-date").value;
      var trainingDayOffsets = dayPicker.getSelectedDays();
      var sport = sportSelect.value;
      if (!name || !distance || !targetDate || !startDate) return;
      if (!trainingDayOffsets.length) {
        e.preventDefault();
        alert("Choisis au moins un jour d'entraînement.");
        return;
      }

      var elevGain = sport === "trail" ? (parseFloat(document.getElementById("goal-elevation-gain").value) || null) : null;
      var elevLoss = sport === "trail" ? (parseFloat(document.getElementById("goal-elevation-loss").value) || null) : null;
      var targetTimeSec = parseTimeToSeconds(document.getElementById("goal-target-time").value);

      var goal = {
        id: uid(),
        name: name,
        targetDistance: distance,
        targetDate: targetDate,
        startDate: startDate,
        trainingDayOffsets: trainingDayOffsets,
        sessionsPerWeek: trainingDayOffsets.length,
        sport: sport,
        elevationGain: elevGain,
        elevationLoss: elevLoss,
        targetTimeSec: targetTimeSec,
        currentLongRunKm: (state.profile && state.profile.currentLongRunKm) || null,
        status: "active",
        createdAt: toISO(todayDate())
      };
      state.goals.push(goal);
      state.planSessions = state.planSessions.concat(generatePlan(goal, state.profile));
      saveData();
      switchView("plan");
    });
  }

  function formatPerfLine(p) {
    var speedKmh = p.distanceKm / (p.timeSec / 3600);
    return fmtNum(p.distanceKm) + ' km en ' + formatSecondsToTime(p.timeSec) + ' (' + formatPaceSec(3600 / speedKmh) + ')';
  }

  function renderPerfList(pending) {
    var el = document.getElementById("perf-list");
    el.innerHTML = pending.map(function (p, i) {
      return '<div class="perf-item"><span class="perf-info">' + escapeHtml(formatPerfLine(p)) +
        '<span class="perf-date">' + (p.date ? formatDateShort(p.date) : '') + '</span></span>' +
        '<button type="button" class="btn-remove-perf" data-perf-index="' + i + '">&times;</button></div>';
    }).join("");
  }

  function renderVmaPreview(pending) {
    var directVma = parseFloat(document.getElementById("profile-vma").value);
    var el = document.getElementById("vma-preview");
    var vma = directVma || estimateVMA(pending);
    if (!vma) {
      el.innerHTML = '<p class="dlg-hint" style="margin:0;">Renseigne ta VMA ou au moins une performance récente pour calculer tes allures.</p>';
      return;
    }
    var fit = !directVma && personalizedRiegelFit(pending);
    var estimateLabel = directVma ? '' : fit ? ' (estimée, courbe personnalisée sur ' + pending.length + ' performances)' : ' (estimée)';
    el.innerHTML =
      '<div class="zone-row"><span>VMA' + estimateLabel + '</span><strong>' + fmtNum(vma) + ' km/h</strong></div>' +
      '<div class="zone-row"><span>Endurance fondamentale (72,5%)</span><strong>' + formatPaceSec(paceFromPctVMA(vma, LONG_BASE_PCT_VMA)) + '</strong></div>' +
      '<div class="zone-row"><span>Allure spécifique (80%)</span><strong>' + formatPaceSec(paceFromPctVMA(vma, LONG_TAIL_PCT_VMA)) + '</strong></div>' +
      '<div class="zone-row"><span>Seuil (85%)</span><strong>' + formatPaceSec(paceFromPctVMA(vma, 0.85)) + '</strong></div>' +
      '<div class="zone-row"><span>VMA (100%)</span><strong>' + formatPaceSec(paceFromPctVMA(vma, 1.00)) + '</strong></div>';
  }

  function setupProfileDialog() {
    var dlg = document.getElementById("dlg-profile");
    var pendingPerformances = [];

    function refresh() {
      renderPerfList(pendingPerformances);
      renderVmaPreview(pendingPerformances);
    }

    document.getElementById("btn-profile").addEventListener("click", function () {
      var p = state.profile;
      document.getElementById("profile-vma").value = p.vmaKmh || "";
      document.getElementById("profile-long-run").value = p.currentLongRunKm || "";
      document.getElementById("profile-weekly-volume").value = p.weeklyVolumeKm || "";
      document.getElementById("profile-level").value = p.level || "intermediaire";
      pendingPerformances = (p.performances || []).map(function (x) { return Object.assign({}, x); });
      document.getElementById("perf-add-distance").value = "";
      document.getElementById("perf-add-time").value = "";
      document.getElementById("perf-add-date").value = toISO(todayDate());
      refresh();
      dlg.showModal();
    });

    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });

    document.getElementById("profile-vma").addEventListener("input", function () { renderVmaPreview(pendingPerformances); });

    document.getElementById("btn-add-perf").addEventListener("click", function () {
      var distance = parseFloat(document.getElementById("perf-add-distance").value);
      var timeSec = parseTimeToSeconds(document.getElementById("perf-add-time").value);
      var date = document.getElementById("perf-add-date").value || toISO(todayDate());
      if (!distance || !timeSec) return;
      pendingPerformances.push({ distanceKm: distance, timeSec: timeSec, date: date });
      document.getElementById("perf-add-distance").value = "";
      document.getElementById("perf-add-time").value = "";
      refresh();
    });

    document.getElementById("perf-list").addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-remove-perf");
      if (!btn) return;
      pendingPerformances.splice(parseInt(btn.dataset.perfIndex, 10), 1);
      refresh();
    });

    document.getElementById("form-profile").addEventListener("submit", function () {
      state.profile.vmaKmh = parseFloat(document.getElementById("profile-vma").value) || null;
      state.profile.performances = pendingPerformances.slice();
      state.profile.currentLongRunKm = parseFloat(document.getElementById("profile-long-run").value) || null;
      state.profile.weeklyVolumeKm = parseFloat(document.getElementById("profile-weekly-volume").value) || null;
      state.profile.level = document.getElementById("profile-level").value || "intermediaire";
      recalcSessionsForProfile();
      snapshotVMA();
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
      var rpe = parseInt(document.getElementById("done-rpe").value, 10) || null;
      var notes = document.getElementById("done-notes").value.trim();

      var run = {
        id: uid(),
        date: session.date,
        type: session.type,
        distance: distance,
        duration: duration,
        rpe: rpe,
        elevation: session.elevTarget || null,
        notes: notes,
        linkedPlanId: session.id
      };
      state.runs.push(run);
      session.done = true;
      session.linkedRunId = run.id;
      snapshotVMA();
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

  function updateRunRefRow() {
    var type = document.getElementById("run-type").value;
    var distance = parseFloat(document.getElementById("run-distance").value) || 0;
    var row = document.getElementById("run-ref-row");
    if (type !== "Course" || distance <= 0) {
      row.hidden = true;
      return;
    }
    document.getElementById("run-ref-label").textContent = "Utiliser comme nouvelle performance de référence (" + fmtKm(distance) + ")";
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
        rpe: parseInt(document.getElementById("run-rpe").value, 10) || null,
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
      if (!refRow.hidden && document.getElementById("run-is-ref").checked && distance > 0) {
        addReferencePerformance({ distanceKm: distance, timeSec: Math.round(duration * 60), date: data.date });
        recalcSessionsForProfile();
      }
      snapshotVMA();

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
        document.getElementById("run-rpe").value = run.rpe || "";
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

    document.getElementById("today-banner-slot").addEventListener("click", function (e) {
      var card = e.target.closest(".today-banner");
      if (card) openSessionDone(card.dataset.sessionId);
    });

    document.getElementById("upcoming-week").addEventListener("click", function (e) {
      var check = e.target.closest(".session-check");
      if (check) toggleSession(check.dataset.sessionId);
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
