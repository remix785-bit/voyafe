// GitHub comme backend de données — Partie III §4.
//
// Mécanisme : les données (plan, séances, logs, historique VDOT) sont stockées
// en fichiers JSON dans un dépôt GitHub PRIVÉ séparé du dépôt de code de l'app.
// Lecture/écriture via l'API REST Contents. Authentification par PAT à portée
// restreinte (droits limités à ce seul dépôt), saisi une fois et stocké
// localement (jamais commité dans le code public).
//
// Limite documentée : quotas de requêtes API GitHub — non pertinent ici vu la
// fréquence d'usage (quelques écritures/jour, cf. Partie III §4).

const API_BASE = "https://api.github.com";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Lit un fichier JSON depuis le dépôt de données.
 * @param {{owner:string, repo:string, path:string, token:string, branch?:string}} config
 * @returns {Promise<{content:any, sha:string}|null>} null si le fichier n'existe pas encore
 */
export async function lireFichier({ owner, repo, path, token, branch = "main" }) {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lecture GitHub échouée (${res.status}): ${await res.text()}`);
  const body = await res.json();
  const decoded = decodeBase64Utf8(body.content.replace(/\n/g, ""));
  return { content: JSON.parse(decoded), sha: body.sha };
}

/**
 * Écrit (crée ou met à jour) un fichier JSON dans le dépôt de données.
 * Chaque écriture produit un commit — historique versionné gratuitement.
 * @param {{owner:string, repo:string, path:string, token:string, branch?:string, data:any, message?:string, shaExistant?:string}} config
 */
export async function ecrireFichier({
  owner,
  repo,
  path,
  token,
  branch = "main",
  data,
  message,
  shaExistant,
}) {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const contentEncoded = encodeBase64Utf8(JSON.stringify(data, null, 2));
  const payload = {
    message: message ?? `sync: ${path} (${new Date().toISOString()})`,
    content: contentEncoded,
    branch,
    ...(shaExistant ? { sha: shaExistant } : {}),
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Écriture GitHub échouée (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Écrit un fichier en gérant automatiquement le sha courant (lecture puis écriture),
 * pour éviter un conflit "sha mismatch" sur mise à jour.
 */
export async function synchroniserFichier(config) {
  const existant = await lireFichier(config).catch(() => null);
  return ecrireFichier({ ...config, shaExistant: existant?.sha });
}

/**
 * Vérifie que le token a bien accès (lecture) au dépôt de données configuré.
 */
export async function verifierAcces({ owner, repo, token }) {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers: authHeaders(token) });
  if (res.status === 404) return { ok: false, raison: "Dépôt introuvable ou token sans accès." };
  if (res.status === 401) return { ok: false, raison: "Token invalide ou expiré." };
  if (!res.ok) return { ok: false, raison: `Erreur inattendue (${res.status}).` };
  return { ok: true };
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
