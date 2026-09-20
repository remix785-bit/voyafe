// Wrapper IndexedDB natif — stores : profil, saisons, objectifs, plans,
// seances, journal, resultats, renfoLog. Pas de dépendance (pas de Dexie).

const DB_NAME = "voyafe-training";
const DB_VERSION = 1;

const STORES = {
  profil: { keyPath: "id" },
  saisons: { keyPath: "id" },
  objectifs: { keyPath: "id", indexes: [{ name: "saisonId", keyPath: "saisonId" }] },
  plans: { keyPath: "id", indexes: [{ name: "objectifId", keyPath: "objectifId" }] },
  seances: {
    keyPath: "id",
    indexes: [
      { name: "planId", keyPath: "planId" },
      { name: "date", keyPath: "date" },
    ],
  },
  journal: { keyPath: "id", indexes: [{ name: "date", keyPath: "date" }] },
  resultats: { keyPath: "id", indexes: [{ name: "date", keyPath: "date" }] },
  renfoLog: { keyPath: "id", indexes: [{ name: "date", keyPath: "date" }] },
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, config] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: config.keyPath });
        for (const index of config.indexes ?? []) {
          store.createIndex(index.name, index.keyPath);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function genId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function put(storeName, record) {
  const store = await tx(storeName, "readwrite");
  return wrapRequest(store.put(record));
}

export async function get(storeName, id) {
  const store = await tx(storeName, "readonly");
  return wrapRequest(store.get(id));
}

export async function getAll(storeName) {
  const store = await tx(storeName, "readonly");
  return wrapRequest(store.getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const store = await tx(storeName, "readonly");
  return wrapRequest(store.index(indexName).getAll(value));
}

export async function remove(storeName, id) {
  const store = await tx(storeName, "readwrite");
  return wrapRequest(store.delete(id));
}

export async function clearStore(storeName) {
  const store = await tx(storeName, "readwrite");
  return wrapRequest(store.clear());
}

export const STORE_NAMES = Object.keys(STORES);
