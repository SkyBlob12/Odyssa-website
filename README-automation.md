# Automatisation du blog Odyssa

Génère **3 articles par semaine** (1 destination + 2 conseils) et ouvre une **Pull Request** que tu valides en 1 clic. Une fois configuré, tu n'as plus qu'une seule action récurrente : ajouter des destinations dans Notion.

```
Notion (destinations)  ─┐
Backlog (data/tips-backlog.json) ─┼─► GitHub Action (lundi)
                                  │      └─ Gemini (rédaction) + Unsplash (photos)
                                  │      └─ rendu HTML + listings + sitemap
                                  └────► Pull Request ──(merge 1 clic)──► GitHub Pages
```

## 1. Setup unique (≈15 min)

### a) Clés API (gratuites)
| Service | Où l'obtenir | Secret GitHub |
|---|---|---|
| Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| Unsplash | https://unsplash.com/developers (créer une app) | `UNSPLASH_KEY` (Access Key) |
| Notion | https://www.notion.so/my-integrations (nouvelle intégration interne) | `NOTION_TOKEN` |

### b) Base Notion « Destinations blog »
Crée une base de données avec ces colonnes :
| Colonne | Type | Notes |
|---|---|---|
| **Destination** | Titre | ex. « Lisbonne » |
| **Pays** | Texte ou Select | ex. « Portugal » |
| **Angle/notes** | Texte | optionnel — tes notes perso, intégrées par l'IA |
| **Statut** | Select (ou Status) | valeurs : `À publier`, `En PR`, `Publié` |
| **Lien post** | URL | optionnel — lien Insta/TikTok |

Puis : ouvre la base → menu `•••` → **Connections** → ajoute ton intégration (pour lui donner accès).
Récupère l'**ID de la base** (dans l'URL : `notion.so/<workspace>/<DATABASE_ID>?v=...`) → secret GitHub `NOTION_DB_ID`.

### c) Secrets GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**, ajoute :
`GEMINI_API_KEY`, `UNSPLASH_KEY`, `NOTION_TOKEN`, `NOTION_DB_ID`.
(Optionnel : variable `GEMINI_MODEL` pour changer de modèle, défaut `gemini-2.5-flash`.)

### d) GitHub Pages
Vérifie que Pages déploie depuis la branche `main` (Settings → Pages). Merger une PR = publication.
Autorise aussi les Actions à créer des PR : **Settings → Actions → General → Workflow permissions** → « Read and write » + cocher « Allow GitHub Actions to create and approve pull requests ».

## 2. Utilisation au quotidien

- **Pour publier une destination** : ajoute une ligne dans Notion (Destination + Pays + Statut `À publier`). C'est tout.
- **Chaque lundi 07:00 UTC** : l'Action génère les articles et ouvre une PR `📝 Blog : nouveaux articles de la semaine`.
- **Tu valides** : relis vite fait, puis **merge** la PR (depuis l'app GitHub mobile aussi). Le site se met à jour seul.
- **Lancer à la demande** : onglet **Actions → Blog auto → Run workflow**.

## 3. Sujets des conseils (tips)

`data/tips-backlog.json` contient la liste des sujets. Le script pioche les `"used": false`.
Quand il reste peu de sujets, Gemini en propose de nouveaux automatiquement (ajoutés au backlog). Tu peux éditer/ajouter/réordonner librement.

## 4. Tester en local

```bash
npm install
npm run generate:dry      # contenu factice, sans aucune clé API
```
Ça génère une destination + des conseils de démonstration pour vérifier le rendu.
Pense à annuler ensuite les fichiers de test : `git restore data/ && git clean -fd blog/ assets/blog/`.

Régénérer seulement les listings + sitemap (sans créer d'article) :
```bash
npm run build:listings
```

## 5. Détails techniques

- **Palette** : dérivée de la couleur dominante de la photo de couverture (`scripts/lib/palette.mjs`). La principale (hero/titres) varie ; l'accent moutarde, la touche rouille, le papier crème et l'encre restent constants pour garder l'identité rétro.
- **Photos** : Unsplash, converties en WebP (`sharp`), avec attribution automatique.
- **Dédoublonnage** : un slug déjà présent dans `data/destinations.json` / `data/tips.json` est ignoré.
- **Templates** : `blog/_templates/` (ignorés par GitHub Pages car préfixés `_`).
- **Modèle IA** : `gemini-2.5-flash` par défaut (variable `GEMINI_MODEL` pour changer).
