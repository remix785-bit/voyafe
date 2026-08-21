# Coach Running pour Rémi

Application d'entraînement course à pied &amp; trail — génération de plans fondée
sur VDOT (Daniels-Gilbert), GAP trail (Minetti), charge d'entraînement
(ACWR/EWMA) et une boucle adaptative à propositions. Voir le dossier
technique complet transmis en spec pour la méthodologie scientifique
détaillée (Partie I), la logique de génération (Partie II) et les
spécifications produit (Partie III).

Ce dossier applicatif vit dans `training-app/`, séparé du site vitrine
existant à la racine du dépôt (`index.html`, `blog/`, etc. — voyage à vélo
Velodyssée), qui reste inchangé.

## Écart volontaire par rapport à la spec technique : pas de bundler

La Partie III proposait React + Vite + Dexie. **Cet environnement de build
n'a pas d'accès au registre npm** (politique d'egress réseau —
`registry.npmjs.org` répond 403 "Host not in allowlist"). Impossible d'y
installer la moindre dépendance.

En conséquence, l'application est écrite en **JavaScript vanilla, modules ES
natifs, sans étape de build** :
- Pas de React → rendu par petites fonctions de template (chaînes HTML) +
  re-rendu ciblé du conteneur d'écran, routeur hash-based maison
  (`js/router.js`).
- Pas de Dexie → wrapper IndexedDB natif minimal (`js/data/db.js`).
- Pas de Vite/Workbox → service worker écrit à la main (`sw.js`), pas de
  bundling (chaque fichier `.js` est un module ES chargé nativement par le
  navigateur).

Avantage inattendu : **aucune étape de build signifie aucun risque de
CI cassée par une dépendance** — les fichiers sont déployés tels quels sur
GitHub Pages. Si un accès npm redevient disponible plus tard, migrer vers
Vite/React reste possible sans changer l'architecture des moteurs de calcul
(`js/engines/*.js` sont des modules purs, sans dépendance UI).

## Structure

```
training-app/
  index.html              App shell (nav, conteneur d'écran)
  manifest.webmanifest     PWA
  sw.js                    Service worker (app shell offline)
  css/
    tokens.css             Palette, typographie, thèmes clair/sombre
    app.css                Composants, layout
  js/
    engines/                Moteurs de calcul purs (testés, sans dépendance DOM sauf pacing.js/parseGpx)
      vdot.js               VDOT, zones E/M/T/I/R, Riegel, altitude — Partie I §2, §3, §3.1
      gap.js                Minetti, GAP — Partie I §4
      load.js               ACWR/EWMA — Partie I §10
      nutrition.js          g/kg, ravitaillement — Partie I §8
      pacing.js              GPX, segmentation, pacing effort constant — Partie II §7
      adaptiveLoop.js        Règles de proposition — Partie I §12, Partie II §6
      planGenerator.js       Étapes ①→④ — Partie II §2-5
    catalog/                 Templates statiques (séances, renfo) — Partie I §5-7, §9
    data/                     IndexedDB, sync GitHub, sync Strava, export/import — Partie III §4-5
    ui/
      components.js           SessionCard, ZoneBadge, ElevationBar, LoadGauge, WeekStrip, TrainingTimer, QuickLog, PacingTimeline
      screens/                 Les 10 écrans de la cartographie (Partie III §7)
    store.js                  État applicatif central (wrappe db.js + engines)
    router.js                 Routeur hash-based
    app.js                    Bootstrap
  test/
    *.test.mjs                Tests `node:test` (aucune dépendance) sur les moteurs
```

## Lancer en local

Aucune installation nécessaire. Servir le dossier statiquement, par ex. :

```
npx http-server training-app -p 8080
# ou simplement : python3 -m http.server 8080 --directory training-app
```

Puis ouvrir `http://localhost:8080`.

## Tests

```
cd training-app
node --test test/*.test.mjs
```

26 tests couvrent : VDOT (dont un anchor élite marathon ~VDOT 82, cohérent
avec la littérature), Riegel, correction d'altitude, Minetti/GAP (coût
minimal ~-10%, remontée au-delà de -20%), ACWR/EWMA (zones verte/rouge),
segmentation GPX, pacing à effort constant (conservation du temps total),
boucle adaptative (règle ≥2 marqueurs/3 dégradés), et le pipeline complet de
génération de plan (reproduit l'exemple chiffré du dossier : 16 semaines,
charge modérée → taper 2 / base 7 / développement 7).

## Déploiement (GitHub Pages)

Le site existant est déjà publié depuis la racine du dépôt. `training-app/`
étant 100% statique (pas de build), il suffit qu'il soit poussé sur la
branche servie par Pages pour devenir accessible sous
`https://<user>.github.io/voyafe/training-app/` — aucune action GitHub
Actions n'est nécessaire. Le routeur étant hash-based (`#/dashboard`, etc.),
aucune règle de réécriture serveur n'est requise pour les sous-routes.

## Backend GitHub (Partie III §4)

`js/data/githubSync.js` implémente la lecture/écriture de fichiers JSON via
l'API Contents GitHub, avec un PAT saisi dans Réglages (jamais commité).
Branché automatiquement au store (`store.js`) : chaque mutation de données
programme un push différé (3s de debounce, pour regrouper les écritures
rapprochées en un seul commit) du dump complet
(`voyafe-training-data.json`), et `init()` tire automatiquement la dernière
sauvegarde distante au démarrage si l'appareil n'a aucune donnée locale
(bootstrap d'un nouvel appareil — ne remplace jamais un IndexedDB déjà
peuplé). L'export/import JSON manuel (`js/data/exportImport.js`) reste une
sauvegarde de secours indépendante.

## Strava (Partie III §5, Option A)

`js/data/stravaSync.js` implémente l'appel à l'API Strava v3 avec un token
d'accès personnel (pas de flux OAuth complet, cohérent avec la contrainte
"pas de secret exposé sur un site statique public"). Comme pour GitHub, le
câblage automatique dans la boucle adaptative (ingestion quotidienne,
calcul d'écart séance réalisée vs planifiée) est présent comme fonctions
pures testables, mais pas encore déclenché par un scheduler dans l'UI — à
faire une fois un compte Strava de test disponible.

## Décisions prises sur les points ouverts du dossier

Le dossier technique liste plusieurs points ouverts (Partie I §14, Partie II
§10, Partie III §12). Décisions prises pour permettre l'implémentation,
documentées ici pour traçabilité — toutes réversibles :

1. **Ajustement automatique vs proposé** : proposé uniquement, jamais
   appliqué automatiquement (`adaptiveLoop.js`, `modeAutomatique: false`
   toujours retourné).
2. **ACWR vs EWMA** : les deux sont calculés (`load.js`), l'UI affiche
   l'EWMA (plus robuste) avec l'ACWR simple disponible en complément.
3. **Sans capteur HRV/FC** : la boucle adaptative fonctionne avec les seuls
   champs renseignés dans le journal (RMSSD et FC repos restent optionnels).
4. **Granularité nutrition course** : v1 = information statique (calculs
   g/kg + cibles horaires), pas de protocole de test progressif guidé.
5. **Seuil plan court** : &lt;6 semaines déclenche `construirePlanCourt()` —
   pas de phase Base, taper 1-2 semaines, reste en Développement.
6. **Séances manquées répétées** : non implémenté en v1 — pas de recalcul
   automatique du plan restant (le plan reste figé, l'utilisateur ajuste
   manuellement).
7. **Mode dégradé sans GPX** : implémenté tel que décrit — profil plat par
   défaut (`profilParcoursParDefaut`), la fiche de pacing reste générable.
8. **Constantes de découpage GPX** : valeurs par défaut du dossier
   (tolérance 2-3%, 150 m / 1.2 km) posées telles quelles, non encore
   validées sur un tracé réel type GR34 (aucun fichier GPX de test fourni
   à ce stade).
9. **Thème par défaut** : sombre (cohérent avec l'usage terrain matinal
   argumenté dans le dossier), bascule possible dans Réglages.

## Roadmap restante (au-delà de cette itération)

- D+ cumulé mensuel réel (nécessite de rattacher un `ProfilParcours` par
  séance planifiée, pas seulement à la fiche de pacing course).
- Icônes PNG générées (les icônes actuelles sont en SVG uniquement — pas de
  toolchain d'image disponible sans npm ; à valider sur installation PWA
  réelle Android/iOS, qui accepte de plus en plus le SVG mais pas partout).
