// Routeur — hash-based (compatible GitHub Pages sous-chemin, pas de config
// serveur nécessaire). Chaque route pointe vers un module d'écran exposant
// render(container, params).

const routes = new Map();
let container = null;
let navContainer = null;

export function registerRoute(path, renderFn, navMeta) {
  routes.set(path, { renderFn, navMeta });
}

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, queryString] = hash.split("?");
  const params = Object.fromEntries(new URLSearchParams(queryString ?? ""));
  return { path: path || "dashboard", params };
}

async function renderCurrent() {
  const { path, params } = parseHash();
  const matched = routes.get(path) ?? routes.get("dashboard");
  container.innerHTML = '<div class="app-main"><div class="skeleton-curve"></div></div>';
  try {
    await matched.renderFn(container, params);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="app-main"><div class="card"><h2>Erreur</h2><p>${err.message}</p></div></div>`;
  }
  updateNav(path);
  window.scrollTo(0, 0);
}

function updateNav(activePath) {
  if (!navContainer) return;
  navContainer.querySelectorAll("a").forEach((a) => {
    const sousRoutes = a.dataset.subroutes?.split(",") ?? [];
    a.classList.toggle("active", a.dataset.route === activePath || sousRoutes.includes(activePath));
  });
}

export function initRouter(appContainer, appNavContainer) {
  container = appContainer;
  navContainer = appNavContainer;
  window.addEventListener("hashchange", renderCurrent);
  renderCurrent();
}

export function navigate(path) {
  location.hash = `#/${path}`;
}
