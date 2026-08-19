// Couche de stockage local — IndexedDB natif (pas de dépendance externe,
// cf. Partie III §3 : pas d'accès npm registry dans cet environnement de build,
// et cohérent avec la contrainte "efficace, tout en local").
//
// Modèle de données — Partie II §9 :
// ProfilUtilisateur, Plan, Semaine, SeanceConcrete, SeanceRealisee, LogQuotidien,
// HistoriqueAjustements, ProfilParcours, FichePacing.

const DB_NAME = "voyafe-training";
const DB_VERSION = 1;

const STORES = {
  profil: "id",
  plans: "id",
  seances: "id",
  seancesRealisees: "id",
  logsQuotidiens: "id",
  historiqueAjustements: "id",
  profilsParcours: "id",
  fichesPacing: "id",
  renfoCharges: "id",
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible dans cet environnement."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function put(storeName, record) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function get(storeName, id) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(storeName, id) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dumpAll() {
  const dump = {};
  for (const store of Object.keys(STORES)) {
    dump[store] = await getAll(store);
  }
  return dump;
}

export async function restoreAll(dump) {
  for (const [store, records] of Object.entries(dump)) {
    if (!STORES[store]) continue;
    for (const record of records) {
      await put(store, record);
    }
  }
}

export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export { STORES };
