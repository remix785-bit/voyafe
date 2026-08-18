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
      data.profile.manualZones = data.profile.manualZones || { E: null, M: null, T: null, I: null, R: null };
      data.goals.forEach(function (g) {
        if (!g.sport) g.sport = "route";
        if (g.elevationGain === undefined) g.elevationGain = null;
        if (g.elevationLoss === undefined) g.elevationLoss = null;
        if (g.targetTimeSec === undefined) g.targetTimeSec = null;
      });
      return data;
    } catch (e) {
      return { goals: [], planSessions: [], runs: [], profile: { refTimes: {}, zonesMode: "auto", manualZones: {} } };
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
    return {
      E: T + 70,
      M: paceAt(42.195),
      T: T,
      I: paceAt(5),
      R: paceAt(1)
    };
  }

  function getActiveZones(profile) {
    if (!profile) return null;
    if (profile.zonesMode === "manual") {
      var mz = profile.manualZones;
      if (mz && mz.E && mz.M && mz.T && mz.I && mz.R) return mz;
      return null;
    }
    return computeZonesFromRefTimes(profile.refTimes || {});
  }

  function isAmbitiousGoal(goal, profile) {
    if (!goal.targetTimeSec) return false;
    var zones = getActiveZones(profile);
    if (!zones) return false;
    var goalPace = goal.targetTimeSec / goal.targetDistance;
    return goalPace < zones.T * 0.98;
  }

  // ---------- coaching engine: plan generation ----------

  function sessionTypesForWeek(goal, w, isTaper) {
    var n = goal.sessionsPerWeek;
    if (n === 1) return ["Sortie longue"];
    if (n === 2) return ["Endurance fondamentale", "Sortie longue"];
    var quality;
    if (isTaper) quality = "Activation";
    else if (goal.sport === "trail") quality = "Côtes";
    else quality = (w % 2 === 0) ? "Fractionné" : "Seuil";
    return [quality, "Endurance fondamentale", "Sortie longue"];
  }

  function zonePaceFor(type, zones) {
    if (!zones) return null;
    switch (type) {
      case "Fractionné": return zones.I;
      case "Côtes": return zones.I;
      case "Seuil": return zones.T;
      case "Endurance fondamentale": return zones.E;
      case "Sortie longue": return Math.round((zones.E + zones.M) / 2);
      case "Récupération": return zones.E + 40;
      case "Activation": return zones.E;
      default: return null;
    }
  }

  function buildSessionPaceAndDetail(type, distanceKm, zones, opts) {
    var pace = zonePaceFor(type, zones);
    var paceStr = formatPaceSec(pace);
    var detail;

    switch (type) {
      case "Fractionné": {
        var repM = distanceKm <= 4 ? 400 : distanceKm <= 6 ? 600 : 1000;
        var reps = Math.max(4, Math.round((distanceKm * 1000 * 0.6) / repM));
        var recover = repM <= 400 ? "1min30" : repM <= 600 ? "2min" : "2min30";
        detail = "Échauffement 15min facile. " + reps + " x " + repM + "m" +
          (paceStr ? " à " + paceStr + " (allure intervalle)" : " en fractionné soutenu") +
          ", récupération " + recover + " trot très facile entre les répétitions. Retour au calme 10min.";
        break;
      }
      case "Côtes": {
        var reps2 = Math.max(5, Math.round(distanceKm * 2));
        detail = "Échauffement 15min. " + reps2 + " x 45sec en côte (pente 6-8%) à effort soutenu" +
          (paceStr ? " (proche allure intervalle, " + paceStr + " à plat)" : "") +
          ", redescente lente en récupération. " +
          (opts.elevTarget ? "D+ cumulé de la séance ~" + opts.elevTarget + "m. " : "") +
          "Retour au calme 10min.";
        break;
      }
      case "Seuil": {
        var mins = pace ? Math.round(((distanceKm * pace) / 60) * 0.7) : null;
        detail = "Échauffement 15min facile. " +
          (mins ? mins + "min continu" : distanceKm + "km") +
          (paceStr ? " à allure seuil (" + paceStr + ")" : " à allure soutenue mais tenable") +
          ", effort régulier sans à-coups. Retour au calme 10min.";
        break;
      }
      case "Endurance fondamentale": {
        detail = distanceKm + "km à allure fondamentale" + (paceStr ? " (" + paceStr + ")" : "") +
          ", effort confortable, tu dois pouvoir parler.";
        break;
      }
      case "Sortie longue": {
        detail = distanceKm + "km à allure fondamentale" + (paceStr ? " (autour de " + paceStr + ")" : "") + ", régulier";
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
        detail = distanceKm + "km très facile avec 4 à 6 accélérations progressives de 15-20sec (retour au calme entre chaque), pour rester réactif sans fatiguer.";
        break;
      }
      case "Récupération": {
        detail = "Footing très facile " + distanceKm + "km" + (paceStr ? " (" + paceStr + " ou plus lent)" : "") + ", focus relâchement et respiration.";
        break;
      }
      default:
        detail = "";
    }
    return { pace: pace, detail: detail };
  }

  function generatePlan(goal, profile) {
    var startMonday = nextMonday(todayDate());
    var targetDate = parseISO(goal.targetDate);
    var totalWeeks = Math.max(1, Math.ceil(diffDays(targetDate, startMonday) / 7));
    var taperWeeks = totalWeeks >= 3 ? 1 : 0;
    var progWeeks = Math.max(1, totalWeeks - taperWeeks);
    var startLong = Math.max(2, Math.round(goal.targetDistance * 0.35 * 10) / 10);
    var offsets = WEEKDAY_OFFSETS[goal.sessionsPerWeek];
    var zones = getActiveZones(profile);
    var goalPace = goal.targetTimeSec ? goal.targetTimeSec / goal.targetDistance : null;
    var elevRatio = (goal.sport === "trail" && goal.elevationGain) ? goal.elevationGain / goal.targetDistance : 0;

    goal.totalWeeks = totalWeeks;
    goal.taperWeeks = taperWeeks;
    goal.progWeeks = progWeeks;
    goal.startMonday = toISO(startMonday);

    var sessions = [];

    for (var w = 0; w < totalWeeks; w++) {
      var weekStart = addDays(startMonday, w * 7);
      var isTaper = w >= progWeeks;
      var longDist;
      if (!isTaper) {
        longDist = startLong + (goal.targetDistance - startLong) * ((w + 1) / progWeeks);
      } else {
        longDist = goal.targetDistance * 0.6;
      }
      longDist = Math.round(longDist * 10) / 10;

      var types = sessionTypesForWeek(goal, w, isTaper);

      offsets.forEach(function (offset, i) {
        var date = addDays(weekStart, offset);
        if (diffDays(date, targetDate) > 0) return;
        var type = types[i];
        var dist;
        if (type === "Sortie longue") dist = longDist;
        else if (type === "Endurance fondamentale") dist = Math.round(longDist * 0.5 * 10) / 10;
        else if (type === "Activation") dist = Math.max(3, Math.round(longDist * 0.25 * 10) / 10);
        else dist = Math.round(longDist * 0.4 * 10) / 10;

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

  function renderDashboard() {
    var today = todayDate();
    var range = weekRange(today);

    var goalsEl = document.getElementById("goals-countdown");
    var upcoming = activeGoals()
      .filter(function (g) { return diffDays(parseISO(g.targetDate), today) >= 0; })
      .sort(function (a, b) { return parseISO(a.targetDate) - parseISO(b.targetDate); });

    goalsEl.innerHTML = upcoming.length ? upcoming.map(function (g) {
      var days = diffDays(parseISO(g.targetDate), today);
      return '<div class="goal-countdown">' +
        '<div class="g-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="g-days">J-' + days + '</div>' +
        '<div class="g-meta">' + g.targetDistance + ' km · ' + formatDateFull(g.targetDate) + '</div>' +
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

    drawWeekChart(document.getElementById("week-chart"), last8WeeksData());

    var upcomingSessions = state.planSessions
      .filter(function (s) { return !s.done; })
      .sort(function (a, b) { return parseISO(a.date) - parseISO(b.date); });
    var nextEl = document.getElementById("next-session");
    if (upcomingSessions.length) {
      var s = upcomingSessions[0];
      var overdue = diffDays(parseISO(s.date), today) < 0;
      var paceStr = formatPaceSec(s.paceSecPerKm);
      nextEl.innerHTML =
        '<div class="session-item" style="border:none;padding:0;">' +
        '<div class="session-check next-check' + (overdue ? ' overdue' : '') + '"></div>' +
        '<div class="session-body">' +
        '<div class="session-type">' + s.type + (overdue ? ' (en retard)' : '') + '</div>' +
        '<div class="session-meta">' + formatDateFull(s.date) + ' · ' + fmtKm(s.targetDistance) + (paceStr ? ' · ' + paceStr : '') + '</div>' +
        '</div></div>';
    } else {
      nextEl.innerHTML = '<div class="empty-state">Aucune séance planifiée.</div>';
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
      return '<div class="week-block"><h4>Semaine ' + w + '</h4>' + items + '</div>';
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
      zoneRow("Fondamentale (E)", zones.E) +
      zoneRow("Marathon (M)", zones.M) +
      zoneRow("Seuil (T)", zones.T) +
      zoneRow("Intervalle (I)", zones.I) +
      zoneRow("Répétition (R)", zones.R);
  }

  function setupProfileDialog() {
    var dlg = document.getElementById("dlg-profile");
    var manualToggle = document.getElementById("zones-manual-toggle");
    var manualFields = document.getElementById("zones-manual-fields");
    var computedFields = document.getElementById("zones-computed");

    document.getElementById("btn-profile").addEventListener("click", function () {
      var p = state.profile;
      document.getElementById("ref-1k").value = formatSecondsToTime(p.refTimes.t1k);
      document.getElementById("ref-5k").value = formatSecondsToTime(p.refTimes.t5k);
      document.getElementById("ref-10k").value = formatSecondsToTime(p.refTimes.t10k);
      document.getElementById("ref-semi").value = formatSecondsToTime(p.refTimes.tSemi);
      manualToggle.checked = p.zonesMode === "manual";
      manualFields.hidden = p.zonesMode !== "manual";
      computedFields.hidden = p.zonesMode === "manual";
      document.getElementById("zone-E").value = formatPaceSec(p.manualZones.E) || "";
      document.getElementById("zone-M").value = formatPaceSec(p.manualZones.M) || "";
      document.getElementById("zone-T").value = formatPaceSec(p.manualZones.T) || "";
      document.getElementById("zone-I").value = formatPaceSec(p.manualZones.I) || "";
      document.getElementById("zone-R").value = formatPaceSec(p.manualZones.R) || "";
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
      state.profile.refTimes = {
        t1k: parseTimeToSeconds(document.getElementById("ref-1k").value),
        t5k: parseTimeToSeconds(document.getElementById("ref-5k").value),
        t10k: parseTimeToSeconds(document.getElementById("ref-10k").value),
        tSemi: parseTimeToSeconds(document.getElementById("ref-semi").value)
      };
      state.profile.zonesMode = manualToggle.checked ? "manual" : "auto";
      state.profile.manualZones = {
        E: parseTimeToSeconds(document.getElementById("zone-E").value),
        M: parseTimeToSeconds(document.getElementById("zone-M").value),
        T: parseTimeToSeconds(document.getElementById("zone-T").value),
        I: parseTimeToSeconds(document.getElementById("zone-I").value),
        R: parseTimeToSeconds(document.getElementById("zone-R").value)
      };
      recalcSessionsForProfile();
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

  function setupRunDialog() {
    var dlg = document.getElementById("dlg-run");
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    document.getElementById("btn-new-run").addEventListener("click", function () {
      openRunDialog(null);
    });
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
      var data = {
        date: document.getElementById("run-date").value,
        type: document.getElementById("run-type").value,
        distance: parseFloat(document.getElementById("run-distance").value) || 0,
        duration: parseFloat(document.getElementById("run-duration").value) || 0,
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
