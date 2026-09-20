export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function formatDateFr(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(dateStr) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (24 * 3600 * 1000));
}

export function zoneTag(zone) {
  if (!zone) return "";
  return `<span class="zone-tag zone-${escapeHtml(zone)}">${escapeHtml(zone)}</span>`;
}

export function badge(text, level = "muted") {
  return `<span class="badge badge-${level}">${escapeHtml(text)}</span>`;
}

export function emptyState(message, actionHtml = "") {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p>${actionHtml}</div>`;
}

export function card(innerHtml) {
  return `<div class="card">${innerHtml}</div>`;
}
