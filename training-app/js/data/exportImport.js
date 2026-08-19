// Sauvegarde de secours — export/import manuel en JSON depuis les Réglages,
// indépendant du mécanisme GitHub (Partie III §4), pour ne jamais dépendre
// d'un seul point de défaillance.

import { dumpAll, restoreAll } from "./db.js";

export async function exporterJson() {
  const dump = await dumpAll();
  const payload = {
    exporteLe: new Date().toISOString(),
    version: 1,
    donnees: dump,
  };
  return JSON.stringify(payload, null, 2);
}

export function telechargerExport(jsonString, nomFichier = `voyafe-training-export-${Date.now()}.json`) {
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importerJson(jsonString) {
  const payload = JSON.parse(jsonString);
  if (!payload.donnees) throw new Error("Fichier d'import invalide : champ 'donnees' manquant.");
  await restoreAll(payload.donnees);
  return payload;
}
