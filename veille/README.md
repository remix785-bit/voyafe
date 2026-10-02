# Veille concurrentielle

Extraction pure des **nouveautés** (médias + LinkedIn), sans tri de pertinence. Python 3.9+, aucune dépendance.

```bash
python veille.py run                              # 7 flux RSS + sources DOM → outputs/veille-AAAA-MM-JJ.md
python veille.py run --only "DAF Mag" --dry-run   # test sur une source, sans toucher l'historique
python veille.py run --linkedin posts.json        # + import LinkedIn
python tests/test_veille.py                       # (ou pytest) test de bout en bout hors-ligne
```

## Règles implémentées
- **Seuls motifs d'exclusion** : doublon (historique) ; LinkedIn : post non d'aujourd'hui (min/h), sauf premier passage sur un profil (3 plus récents par onglet).
- **Lien systématique** : URL nettoyée (sans `?…` ni `#…`) pour chaque item, sinon `non capturée`.
- **Dédup** : clé = URL nettoyée (ou `média|titre`) ; LinkedIn = `urn:li:activity:…`. Historique dans `data/historique-liens-vus.txt` (si non inscriptible, copie dans `outputs/` + avertissement en tête du résumé).
- **Premier passage d'une source** : 10 items RSS / 5 DOM. Ensuite : 10 (15 pour Actusnews et Boursorama).
- **DOM** : ancres de `<main>/<article>` (15–300 car., dédoublonnées) ; repli sur toute la page (>30 car.) si peu de résultats. Une source en erreur n'arrête pas le run.
- **Entreprises** : repérées dans titre/extrait via votre liste `companies.txt` ; sinon `Non identifiée` (jamais d'exclusion).
- Les sources sont dans `sources.json` (modifiables).

## LinkedIn
LinkedIn nécessite votre session connectée : le script ne scrape pas LinkedIn lui-même. Exécutez `linkedin_console.js` dans la console de votre navigateur sur chaque page d'activité (best-effort, le DOM LinkedIn change), concaténez les JSON en `posts.json` (`profil, onglet, auteur, heure, texte, url`) et passez `--linkedin posts.json`.

## Limites
- Pas de navigateur : les sites rendus en JavaScript (SPA) ou protégés (anti-bot, paywall) peuvent renvoyer peu ou rien ; ils sont alors listés « inaccessibles » ou sans nouveautés. Dans ce cas, un passage navigateur reste nécessaire.
- Passes approfondies (ouverture d'articles, scroll) non incluses (optionnelles dans votre cahier des charges).
