import { log } from './util.mjs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Modèles essayés dans l'ordre : le principal, puis des replis si surcharge (503).
const MODELS = [...new Set([MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'])];
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Codes transitoires qui méritent un nouvel essai.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const BRAND = `
Tu écris pour le blog d'Odyssa, une application de planification de voyage.
Ton : chaleureux, vivant, concret, comme un voyageur expérimenté qui partage — jamais un texte générique d'IA.
Règles : français impeccable ; phrases variées ; détails précis et utiles (chiffres, noms de lieux, anecdotes) ;
zéro remplissage, zéro formule creuse, aucun emoji ; n'invente pas de faits incertains.
`;

async function callGemini(prompt, schema, key, temperature = 0.85) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  const MAX_ATTEMPTS = 4; // par modèle
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res;
      try {
        res = await fetch(ENDPOINT(model, key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch (e) {
        // erreur réseau → on retente
        lastErr = e;
        await sleep(attempt * 2000);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Réponse Gemini vide');
        try {
          return JSON.parse(text);
        } catch {
          return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
        }
      }

      const detail = await res.text();
      lastErr = new Error(`Gemini ${res.status} (${model}): ${detail}`);
      if (!RETRYABLE.has(res.status)) throw lastErr; // erreur définitive (clé invalide, etc.)

      const wait = attempt * 3000; // 3s, 6s, 9s…
      log(`Gemini ${res.status} sur ${model} — nouvel essai ${attempt}/${MAX_ATTEMPTS} dans ${wait / 1000}s`);
      await sleep(wait);
    }
    log(`Modèle ${model} indisponible après ${MAX_ATTEMPTS} essais — repli sur le suivant si disponible.`);
  }
  throw lastErr || new Error('Gemini : échec après tous les essais');
}

const S = {
  str: { type: 'string' },
  arr: (items) => ({ type: 'array', items }),
};

const DEST_SCHEMA = {
  type: 'object',
  properties: {
    titleShort: S.str,
    title: S.str,
    subtitle: S.str,
    eyebrow: S.str,
    countryCode: S.str,
    description: S.str,
    excerpt: S.str,
    intro: S.str,
    facts: {
      type: 'object',
      properties: { period: S.str, budget: S.str, duration: S.str, currency: S.str },
      required: ['period', 'budget', 'duration', 'currency'],
    },
    sections: S.arr({
      type: 'object',
      properties: {
        kicker: S.str,
        heading: S.str,
        paragraphs: S.arr(S.str),
        bullets: S.arr(S.str),
        pull: S.str,
      },
      required: ['kicker', 'heading', 'paragraphs'],
    }),
    tip: S.str,
  },
  required: ['titleShort', 'title', 'subtitle', 'eyebrow', 'countryCode', 'description', 'excerpt', 'intro', 'facts', 'sections', 'tip'],
};

const TIP_SCHEMA = {
  type: 'object',
  properties: {
    title: S.str,
    titleShort: S.str,
    description: S.str,
    excerpt: S.str,
    intro: S.str,
    sections: S.arr({
      type: 'object',
      properties: {
        heading: S.str,
        paragraphs: S.arr(S.str),
        bullets: S.arr(S.str),
      },
      required: ['heading', 'paragraphs'],
    }),
    tip: S.str,
  },
  required: ['title', 'titleShort', 'description', 'excerpt', 'intro', 'sections', 'tip'],
};

const TOPICS_SCHEMA = {
  type: 'object',
  properties: {
    topics: S.arr({
      type: 'object',
      properties: { title: S.str, tag: S.str, angle: S.str },
      required: ['title', 'tag', 'angle'],
    }),
  },
  required: ['topics'],
};

/** Génère le contenu d'une fiche destination. */
export async function generateDestination({ name, country, angle, month }, key) {
  const prompt = `${BRAND}
Rédige un guide de voyage LONG (1200 à 1500 mots) sur la destination : "${name}"${country ? `, ${country}` : ''}.
${angle ? `Angle / notes personnelles à intégrer : ${angle}` : ''}
${month ? `MOIS DE RÉFÉRENCE : ${month}. Ancre concrètement le guide sur cette période : météo et températures typiques en ${month}, ambiance et affluence, événements/fêtes du moment, ce qui est ouvert ou de saison, vêtements à prévoir. La section "quand partir" doit expliciter pourquoi ${month} (avantages/limites), et plusieurs autres sections doivent refléter naturellement cette saison. Le champ facts.period doit cohérer avec ${month}.` : ''}

Structure attendue dans le JSON :
- titleShort : le nom court de la destination (ex. "Lisbonne").
- title : un titre accrocheur incluant le nom (ex. "Lisbonne, la ville aux sept collines").
- subtitle : sous-titre court et évocateur.
- eyebrow : "Pays · Région" (ex. "Portugal · Europe du Sud").
- countryCode : code ISO-2 du pays (ex. "PT").
- description : meta description SEO, 150 caractères max.
- excerpt : accroche pour la carte du blog, ~140 caractères.
- intro : paragraphe d'introduction immersif (3-4 phrases).
- facts : { period (meilleure période), budget (par jour, ex "60–90 €"), duration (durée idéale), currency (monnaie) }.
- sections : 8 à 9 sections. Chaque section a kicker ("01 — Pourquoi y aller"), heading (titre court), paragraphs (1-3 paragraphes riches), bullets (liste optionnelle), pull (citation en exergue optionnelle, une seule sur tout l'article).
  Couvre : pourquoi y aller, quand partir, les quartiers/zones, à voir & à faire, gastronomie, où dormir, budget & bons plans, se déplacer, conseils pratiques.
- tip : le "conseil Odyssa" final, lié à l'organisation/itinéraire avec l'app (1-2 phrases).
`;
  log(`Gemini → destination "${name}"`);
  return callGemini(prompt, DEST_SCHEMA, key);
}

/** Génère le contenu d'un article conseils/tips. */
export async function generateTip({ title, tag, angle }, key) {
  const prompt = `${BRAND}
Rédige un article de conseils voyage (800 à 1100 mots) sur le sujet : "${title}".
Catégorie : ${tag}. ${angle ? `Angle : ${angle}` : ''}

Structure attendue dans le JSON :
- title : titre optimisé SEO (peut reformuler légèrement le sujet).
- titleShort : identique ou très proche du title.
- description : meta description SEO, 150 caractères max.
- excerpt : accroche pour la carte du blog, ~140 caractères.
- intro : introduction engageante (2-3 phrases).
- sections : 4 à 6 sections, chacune avec heading, paragraphs (1-3) et bullets (optionnel) — privilégie le concret et l'actionnable.
- tip : le "conseil Odyssa" final, lié à l'app (1-2 phrases).
`;
  log(`Gemini → tip "${title}"`);
  return callGemini(prompt, TIP_SCHEMA, key);
}

/** Propose de nouveaux sujets tips en évitant les doublons. */
export async function proposeTopics({ count, existingTitles }, key) {
  const prompt = `${BRAND}
Propose ${count} nouveaux sujets d'articles de conseils voyage pour le blog Odyssa.
Évite absolument tout doublon ou sujet trop proche de cette liste déjà couverte :
${existingTitles.map((t) => `- ${t}`).join('\n')}

Chaque sujet : title (accrocheur, orienté SEO), tag (catégorie courte : Organisation, Budget, Astuces, Famille, Pratique, Inspiration, Bien-être, Gastronomie, Éco-voyage), angle (1 phrase sur ce que l'article couvrira).
`;
  log(`Gemini → proposition de ${count} sujets tips`);
  const out = await callGemini(prompt, TOPICS_SCHEMA, key, 1.0);
  return out.topics || [];
}
