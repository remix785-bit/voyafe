// Routeur hash-based maison — pas de dépendance.

const routes = new Map();
let notFoundHandler = () => "<p>Page introuvable.</p>";
let currentUnsubscribe = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function setNotFound(renderFn) {
  notFoundHandler = renderFn;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, queryString] = hash.split("?");
  const params = Object.fromEntries(new URLSearchParams(queryString ?? ""));
  return { path: path || "dashboard", params };
}

export async function renderRoute(container) {
  if (typeof currentUnsubscribe === "function") {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  const { path, params } = parseHash();
  const handler = routes.get(path) ?? notFoundHandler;
  const result = await handler(params, container);
  if (typeof result === "function") {
    currentUnsubscribe = result;
  } else if (typeof result === "string") {
    container.innerHTML = result;
  }
  document.querySelectorAll("[data-nav-link]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-nav-link") === path);
  });
}

export function navigateTo(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `#/${path}${query ? `?${query}` : ""}`;
}

export function startRouter(container) {
  window.addEventListener("hashchange", () => renderRoute(container));
  renderRoute(container);
}
