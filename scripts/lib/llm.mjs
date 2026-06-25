import { log } from './util.mjs';

// Fournisseur : Groq (API compatible OpenAI), tier gratuit généreux.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Codes transitoires qui méritent un nouvel essai.
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Retire les tirets longs (cadratin, barre horizontale) d'une chaîne, sans toucher
 *  aux plages chiffrées en demi-cadratin (ex. "60–90 €"). */
function stripEmDash(str) {
  return str
    .replace(/\s*[—―]\s*/g, ', ')   // tiret long → virgule
    .replace(/(?:,\s*){2,}/g, ', ') // évite les doubles virgules
    .replace(/\s+,/g, ',')           // pas d'espace avant la virgule
    .replace(/^[\s,]+/, '')          // pas de virgule en début de chaîne
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Applique stripEmDash récursivement à toutes les chaînes d'un objet/array. */
function sanitize(value) {
  if (typeof value === 'string') return stripEmDash(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

const BRAND = `
Tu écris pour le blog d'Odyssa, une application de planification de voyage.
Ton : chaleureux, vivant, concret, comme un voyageur expérimenté qui partage — jamais un texte générique d'IA.
Règles : français impeccable ; phrases variées ; détails précis et utiles (chiffres, noms de lieux, anecdotes) ;
zéro remplissage, zéro formule creuse, aucun emoji ; n'invente pas de faits incertains.
N'utilise JAMAIS le tiret long / cadratin (—) comme ponctuation : remplace-le par une virgule, des parenthèses, deux-points ou un point selon le sens. (Le tiret demi-cadratin reste autorisé uniquement pour les plages de chiffres ou de dates, ex. "60–90 €".)
CONCURRENCE : Odyssa est une application de planification de voyage. Ne recommande, ne cite et ne fais JAMAIS la promotion d'applications, de sites ou de services concurrents d'Odyssa, c'est-à-dire tout outil de planification d'itinéraire, d'organisation de voyage, de gestion de réservations, de budget de voyage, de cartes/itinéraires ou de carnet de voyage (ex. à NE PAS mentionner : TripIt, Wanderlog, Google Trips/Maps, Maps.me, Citymapper, Trail Wallet, etc.). Si le sujet implique "les meilleures applications" ou des outils d'organisation, présente plutôt comment Odyssa répond à chacun de ces besoins (itinéraire, réservations, budget, hors ligne, voyage à plusieurs). Tu peux mentionner des services qui ne concurrencent pas Odyssa (compagnies aériennes, plateformes d'hébergement, sites officiels de tourisme, etc.) uniquement si c'est utile et factuel.
`;

/**
 * Appelle le LLM en exigeant une réponse JSON.
 * Réessaie sur erreurs transitoires (429/5xx) en respectant l'en-tête retry-after.
 */
async function callLLM(prompt, key, temperature = 0.85) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `${prompt}\n\nRéponds UNIQUEMENT avec un objet JSON valide conforme à la structure demandée, sans aucun texte avant ou après.`,
    }],
    temperature,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  });

  const MAX_ATTEMPTS = 5;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Réponse LLM vide');
      try {
        return sanitize(JSON.parse(text));
      } catch {
        return sanitize(JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')));
      }
    }

    const detail = await res.text();
    lastErr = new Error(`Groq ${res.status} (${MODEL}): ${detail}`);
    if (!RETRYABLE.has(res.status)) throw lastErr; // erreur définitive (clé invalide, quota épuisé, etc.)

    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : attempt * 3000;
    log(`Groq ${res.status} — nouvel essai ${attempt}/${MAX_ATTEMPTS} dans ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  throw lastErr || new Error('Groq : échec après tous les essais');
}

/** Génère le contenu d'une fiche destination. */
export async function generateDestination({ name, country, angle, month }, key) {
  const prompt = `${BRAND}
Rédige un guide de voyage LONG (1200 à 1500 mots) sur la destination : "${name}"${country ? `, ${country}` : ''}.
${angle ? `Angle / notes personnelles à intégrer : ${angle}` : ''}
${month ? `MOIS DE RÉFÉRENCE : ${month}. Ancre concrètement le guide sur cette période : météo et températures typiques en ${month}, ambiance et affluence, événements/fêtes du moment, ce qui est ouvert ou de saison, vêtements à prévoir. La section "quand partir" doit expliciter pourquoi ${month} (avantages/limites), et plusieurs autres sections doivent refléter naturellement cette saison. Le champ facts.period doit cohérer avec ${month}.` : ''}

Structure attendue : un objet JSON avec ces clés :
- titleShort : le nom court de la destination (ex. "Lisbonne").
- title : un titre SEO longue traîne (55–65 caractères max) incluant le nom de la destination et un angle précis : durée, question ou angle pratique. Ex. : "Lisbonne en 5 jours : que voir et que faire ?", "Japon : 2 semaines entre Tokyo, Kyoto et Osaka", "Pourquoi le Maroc est parfait pour un premier voyage solo ?". Privilégie les formulations interrogatives, les durées chiffrées ou les promesses concrètes — ce sont les requêtes que les voyageurs tapent réellement sur Google.
- subtitle : sous-titre court et évocateur.
- eyebrow : "Pays · Région" (ex. "Portugal · Europe du Sud").
- countryCode : code ISO-2 du pays (ex. "PT").
- description : meta description SEO, 150 caractères max.
- excerpt : accroche pour la carte du blog, ~140 caractères.
- intro : paragraphe d'introduction immersif (3-4 phrases).
- facts : objet { period (meilleure période), budget (par jour, ex "60–90 €"), duration (durée idéale), currency (monnaie) }.
- sections : tableau de 8 à 9 objets. Chaque section : kicker ("01 · Pourquoi y aller"), heading (titre court), paragraphs (tableau de 1-3 paragraphes riches), bullets (tableau optionnel), pull (citation en exergue optionnelle, une seule sur tout l'article).
  Couvre : pourquoi y aller, quand partir, les quartiers/zones, à voir & à faire, gastronomie, où dormir, budget & bons plans, se déplacer, conseils pratiques.
- photoQuery : 3 à 5 mots-clés EN ANGLAIS pour trouver des photos emblématiques du lieu sur Unsplash. Privilégie les éléments visuels distinctifs : paysages iconiques, monuments, nature typique, scènes de vie locales (ex. "Iceland northern lights aurora", "Peru Machu Picchu mountains", "Morocco Marrakech medina souk"). Évite les termes trop génériques comme "travel" ou "vacation".
- tip : le "conseil Odyssa" final, lié à l'organisation/itinéraire avec l'app (1-2 phrases).
`;
  log(`LLM → destination "${name}"`);
  return callLLM(prompt, key);
}

/** Génère le contenu d'un article conseils/tips. */
export async function generateTip({ title, tag, angle }, key) {
  const prompt = `${BRAND}
Rédige un article de conseils voyage (800 à 1100 mots) sur le sujet : "${title}".
Catégorie : ${tag}. ${angle ? `Angle : ${angle}` : ''}

Structure attendue : un objet JSON avec ces clés :
- title : titre SEO longue traîne (55–65 caractères max) répondant à une requête réelle. Privilégie : formulation interrogative ("Comment...", "Pourquoi..."), liste chiffrée ("10 astuces...", "5 étapes..."), ou promesse concrète ("Le guide complet pour...", "Tout ce qu'il faut savoir sur..."). Ex. : "Comment voyager pas cher en Europe : 12 astuces concrètes", "Que mettre dans son sac à dos : checklist complète".
- titleShort : identique ou très proche du title.
- description : meta description SEO, 150 caractères max.
- excerpt : accroche pour la carte du blog, ~140 caractères.
- photoQuery : 2 à 4 mots-clés EN ANGLAIS pour trouver une photo de couverture pertinente et concrète sur Unsplash (ex. "packing suitcase travel", "airport departure board", "budget travel backpacker"). Privilégie un sujet visuel et photographiable, pas un concept abstrait.
- intro : introduction engageante (2-3 phrases).
- sections : tableau de 4 à 6 objets, chacun avec heading, paragraphs (tableau de 1-3) et bullets (tableau optionnel) — privilégie le concret et l'actionnable.
- tip : le "conseil Odyssa" final, lié à l'app (1-2 phrases).
`;
  log(`LLM → tip "${title}"`);
  return callLLM(prompt, key);
}

/** Déduit un mot-clé photo (EN) pour un sujet de conseil déjà publié (backfill). */
export async function generatePhotoQuery({ title, tag }, key) {
  const prompt = `${BRAND}
Pour cet article de conseils voyage, donne 2 à 4 mots-clés EN ANGLAIS pour trouver une photo de couverture pertinente et concrète sur Unsplash (ex. "packing suitcase travel", "airport departure board"). Privilégie un sujet visuel et photographiable, pas un concept abstrait.
Titre : "${title}"
Catégorie : ${tag}

Réponds avec un objet JSON de forme : {"photoQuery": "..."}`;
  log(`LLM → mot-clé photo pour "${title}"`);
  const out = await callLLM(prompt, key, 0.4);
  return out.photoQuery;
}

/** Propose de nouveaux sujets tips en évitant les doublons. */
export async function proposeTopics({ count, existingTitles }, key) {
  const prompt = `${BRAND}
Propose ${count} nouveaux sujets d'articles de conseils voyage pour le blog Odyssa.
Évite absolument tout doublon ou sujet trop proche de cette liste déjà couverte :
${existingTitles.map((t) => `- ${t}`).join('\n')}

Réponds avec un objet JSON de forme : {"topics": [{"title": ..., "tag": ..., "angle": ...}, ...]}
- title : titre SEO longue traîne (55–65 caractères max), formulé comme une requête réelle : question ("Comment...", "Pourquoi..."), liste chiffrée, ou promesse concrète ("Le guide complet pour..."). Ex. : "Comment voyager léger en avion : la méthode des bagages cabine".
- tag : catégorie courte (Organisation, Budget, Astuces, Famille, Pratique, Inspiration, Bien-être, Gastronomie, Éco-voyage).
- angle : 1 phrase sur ce que l'article couvrira.
`;
  log(`LLM → proposition de ${count} sujets tips`);
  const out = await callLLM(prompt, key, 1.0);
  return out.topics || [];
}
