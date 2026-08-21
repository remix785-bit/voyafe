// Rappel de séance du jour — couche UI (API Notification du navigateur).
// Pas de backend de push (l'appli reste 100% statique, cf. README) : le
// rappel ne peut donc se déclencher que quand l'utilisateur ouvre ou
// revient sur l'appli (démarrage, retour au premier plan) — pas une vraie
// alarme qui réveille le téléphone appli fermée, mais suffisant pour un
// usage terrain où l'appli est de toute façon consultée avant de partir.

import * as store from "./store.js";
import { seanceDuJourPourRappel, rappelDejaAffiche, texteRappel } from "./engines/reminder.js";

const STORAGE_KEY = "voyafe-dernier-rappel";

export function permissionRefusee() {
  return "Notification" in window && Notification.permission === "denied";
}

export async function demanderPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const reponse = await Notification.requestPermission();
  return reponse === "granted";
}

/** Vérifie s'il faut notifier la séance du jour et l'affiche si oui. À appeler au démarrage et au retour au premier plan. */
export async function verifierEtNotifierSeanceDuJour() {
  const { reglages, plans } = store.getState();
  if (!reglages.rappelSeanceActif) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (rappelDejaAffiche(localStorage.getItem(STORAGE_KEY))) return;

  const seance = seanceDuJourPourRappel(plans);
  if (!seance) return;

  const { titre, corps } = texteRappel(seance);
  await afficherNotification(titre, corps);
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

/** Notification de test, indépendante de la présence d'une séance aujourd'hui — pour vérifier que l'autorisation fonctionne bien sur l'appareil. */
export async function notifierTest() {
  await afficherNotification("Rappel de test", "Les notifications Voyafe Training fonctionnent sur cet appareil.");
}

async function afficherNotification(titre, corps) {
  const options = { body: corps, icon: "./icons/icon.svg", badge: "./icons/icon.svg", tag: "voyafe-rappel-jour" };
  // showNotification() via le service worker est requis sur Android Chrome
  // (new Notification() y est interdit directement en page) ; getRegistration()
  // ne bloque jamais (contrairement à .ready, qui peut ne jamais se résoudre
  // si l'enregistrement du SW a échoué), donc pas de risque de blocage silencieux.
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (registration) {
    await registration.showNotification(titre, options);
    return;
  }
  new Notification(titre, options);
}
