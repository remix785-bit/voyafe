(function () {
  "use strict";

  var STORAGE_KEY = "runplan:v1";
  var DAY_MS = 86400000;

  var TYPES_BY_COUNT = {
    1: ["Sortie longue"],
    2: ["Endurance fondamentale", "Sortie longue"],
    3: ["Fractionné", "Endurance fondamentale", "Sortie longue"]
  };
  var WEEKDAY_OFFSETS = { 1: [5], 2: [1, 5], 3: [1, 3, 5] };

  // ---------- storage ----------

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { goals: [], planSessions: [], runs: [] };
      var data = JSON.parse(raw);
      data.goals = data.goals || [];
      data.planSessions = data.planSessions || [];
      data.runs = data.runs || [];
      return data;
    } catch (e) {
      return { goals: [], planSessions: [], runs: [] };
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

  function fmtKm(n) {
    return (Math.round(n * 10) / 10).toString().replace(".", ",") + " km";
  }

  // ---------- plan generation ----------

  function sessionDescription(type) {
    switch (type) {
      case "Fractionné": return "Allure rapide avec récupération active entre les répétitions.";
      case "Endurance fondamentale": return "Allure confortable, effort modéré et régulier.";
      case "Sortie longue": return "Allure lente, priorité à la durée/distance.";
      case "Récupération": return "Footing très facile de récupération.";
      default: return "";
    }
  }

  function generatePlan(goal) {
    var startMonday = nextMonday(todayDate());
    var targetDate = parseISO(goal.targetDate);
    var totalWeeks = Math.max(1, Math.ceil(diffDays(targetDate, startMonday) / 7));
    var taperWeeks = totalWeeks >= 3 ? 1 : 0;
    var progWeeks = Math.max(1, totalWeeks - taperWeeks);
    var startLong = Math.max(2, Math.round(goal.targetDistance * 0.35 * 10) / 10);
    var offsets = WEEKDAY_OFFSETS[goal.sessionsPerWeek];
    var types = TYPES_BY_COUNT[goal.sessionsPerWeek];
    var sessions = [];

    for (var w = 0; w < totalWeeks; w++) {
      var weekStart = addDays(startMonday, w * 7);
      var longDist;
      if (w < progWeeks) {
        longDist = startLong + (goal.targetDistance - startLong) * ((w + 1) / progWeeks);
      } else {
        longDist = goal.targetDistance * 0.6;
      }
      longDist = Math.round(longDist * 10) / 10;

      offsets.forEach(function (offset, i) {
        var date = addDays(weekStart, offset);
        if (diffDays(date, targetDate) > 0) return;
        var type = types[i];
        var dist;
        if (type === "Sortie longue") dist = longDist;
        else if (type === "Endurance fondamentale") dist = Math.round(longDist * 0.5 * 10) / 10;
        else dist = Math.round(longDist * 0.4 * 10) / 10;

        sessions.push({
          id: uid(),
          goalId: goal.id,
          week: w + 1,
          date: toISO(date),
          type: type,
          targetDistance: dist,
          description: sessionDescription(type),
          done: false,
          linkedRunId: null
        });
      });
    }
    return sessions;
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
      nextEl.innerHTML =
        '<div class="session-item" style="border:none;padding:0;">' +
        '<div class="session-check next-check' + (overdue ? ' overdue' : '') + '"></div>' +
        '<div class="session-body">' +
        '<div class="session-type">' + s.type + (overdue ? ' (en retard)' : '') + '</div>' +
        '<div class="session-meta">' + formatDateFull(s.date) + ' · ' + fmtKm(s.targetDistance) + '</div>' +
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

    return '<div class="goal-card" data-goal-id="' + goal.id + '">' +
      '<div class="goal-card-head">' +
      '<div><h3>' + escapeHtml(goal.name) + '</h3>' +
      '<div class="g-sub">' + goal.targetDistance + ' km · ' + formatDateFull(goal.targetDate) +
      (days >= 0 ? ' · J-' + days : ' · terminé') + '</div></div>' +
      '<button class="btn btn-ghost btn-small btn-delete-goal" data-goal-id="' + goal.id + '">Supprimer</button>' +
      '</div>' + weeksHtml + '</div>';
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
    return '<div class="session-item">' +
      '<button class="session-check' + (s.done ? " done" : "") + (overdue ? " overdue" : "") + '" data-session-id="' + s.id + '">' +
      (s.done ? "&#10003;" : "") + '</button>' +
      '<div class="session-body">' +
      '<div class="session-type">' + s.type + '</div>' +
      '<div class="session-meta">' + formatDateShort(s.date) + ' · ' + fmtKm(s.targetDistance) + '</div>' +
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
    document.getElementById("btn-new-goal").addEventListener("click", function () {
      document.getElementById("form-goal").reset();
      dlg.showModal();
    });
    dlg.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { dlg.close(); });
    });
    document.getElementById("form-goal").addEventListener("submit", function (e) {
      var name = document.getElementById("goal-name").value.trim();
      var distance = parseFloat(document.getElementById("goal-distance").value);
      var targetDate = document.getElementById("goal-date").value;
      var sessionsPerWeek = parseInt(document.getElementById("goal-sessions").value, 10);
      if (!name || !distance || !targetDate) return;

      var goal = {
        id: uid(),
        name: name,
        targetDistance: distance,
        targetDate: targetDate,
        sessionsPerWeek: sessionsPerWeek,
        status: "active",
        createdAt: toISO(todayDate())
      };
      state.goals.push(goal);
      state.planSessions = state.planSessions.concat(generatePlan(goal));
      saveData();
      switchView("plan");
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
        elevation: null,
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
    document.getElementById("session-done-target").textContent =
      session.type + " prévue le " + formatDateFull(session.date) + " · objectif " + fmtKm(session.targetDistance);
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
