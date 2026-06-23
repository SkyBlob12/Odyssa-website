#!/usr/bin/env node
/**
 * Génération hebdomadaire du blog Odyssa.
 *   3 articles / semaine : 1 destination (file Notion) + 2 conseils (backlog).
 *   Si aucune destination en file → 3 conseils à la place.
 *
 * Variables d'environnement (requises hors --dry-run) :
 *   GEMINI_API_KEY, NOTION_TOKEN, NOTION_DB_ID, UNSPLASH_KEY
 *
 * Usage :
 *   node scripts/generate-weekly.mjs            # run complet
 *   node scripts/generate-weekly.mjs --dry-run  # contenu factice, sans API
 *   node scripts/generate-weekly.mjs --listings-only  # régénère listings + sitemap
 */
import { join } from 'node:path';
import {
  ROOT, log, slugify, readingTime, today, readJson, writeJson,
} from './lib/util.mjs';
import { derivePalette, FALLBACK_PALETTE } from './lib/palette.mjs';
import { fetchDestinationPhotos, generatePlaceholderPhotos, fetchTipPhoto, generatePlaceholderTipPhoto } from './lib/photos.mjs';
import { generateDestination, generateTip, proposeTopics } from './lib/gemini.mjs';
import { fetchDestinationsToPublish, markStatus } from './lib/notion.mjs';
import { renderDestination, renderTip } from './lib/render.mjs';
import { rebuildListings, rebuildSitemap } from './lib/listings.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const LISTINGS_ONLY = argv.includes('--listings-only');

const TIPS_PER_WEEK = 2;        // + 1 destination
const BACKLOG_REFILL_AT = 6;    // propose de nouveaux sujets sous ce seuil

const env = (k) => process.env[k];

function requireEnv(keys) {
  const missing = keys.filter((k) => !env(k));
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(', ')}`);
}

function destWordCount(c) {
  let n = (c.intro || '').split(/\s+/).length + (c.tip || '').split(/\s+/).length;
  for (const s of c.sections || []) {
    n += (s.paragraphs || []).join(' ').split(/\s+/).length;
    n += (s.bullets || []).join(' ').split(/\s+/).length;
  }
  return n;
}
function tipWordCount(c) {
  let n = (c.intro || '').split(/\s+/).length + (c.tip || '').split(/\s+/).length;
  for (const s of c.sections || []) {
    n += (s.paragraphs || []).join(' ').split(/\s+/).length;
    n += (s.bullets || []).join(' ').split(/\s+/).length;
  }
  return n;
}

function uniqueSlug(base, taken) {
  let slug = base, i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  taken.add(slug);
  return slug;
}

// ---------- Fixtures (dry-run uniquement) ----------
function fixtureDestination() {
  return {
    name: 'Séville', country: 'Espagne',
    content: {
      titleShort: 'Séville', title: 'Séville, le cœur ardent de l’Andalousie',
      subtitle: 'Orangers, flamenco et patios fleuris', eyebrow: 'Espagne · Andalousie',
      countryCode: 'ES', description: 'Guide complet de Séville : quand partir, quartiers, à voir, gastronomie, budget et transports.',
      excerpt: 'Flamenco, patios fleuris et tapas : le guide complet pour découvrir la capitale andalouse.',
      intro: 'Séville se découvre au rythme lent des après-midis andalous, entre patios fleuris, ruelles ombragées et terrasses où l’on refait le monde autour de quelques tapas.',
      facts: { period: 'Mars – Mai', budget: '55–85 €', duration: '3 jours', currency: 'Euro €' },
      sections: [
        { kicker: '01 — Pourquoi y aller', heading: 'Une ville qui prend son temps', paragraphs: ['Capitale de l’Andalousie, Séville concentre des siècles d’histoire mauresque et chrétienne dans un mouchoir de poche.', 'On y vient pour la lumière, l’ambiance des bars à tapas et la douceur de vivre.'], pull: 'Séville ne se visite pas, elle se savoure.' },
        { kicker: '02 — Quand partir', heading: 'Le bon moment', paragraphs: ['Le printemps est idéal : températures douces et fêtes traditionnelles.'], bullets: ['Mars–Mai : la meilleure période', 'Été : très chaud (plus de 40°C)', 'Automne : agréable et moins fréquenté'] },
        { kicker: '03 — Les quartiers', heading: 'Où poser ses pas', paragraphs: ['Santa Cruz, l’ancien quartier juif, est un dédale de ruelles.', 'Triana, de l’autre côté du fleuve, vibre au rythme du flamenco.'] },
        { kicker: '04 — À voir', heading: 'Les incontournables', paragraphs: ['Impossible de manquer la cathédrale et la Giralda.'], bullets: ['La Giralda et la cathédrale', 'L’Alcázar et ses jardins', 'La Plaza de España'] },
        { kicker: '05 — À table', heading: 'Saveurs sévillanes', paragraphs: ['Les tapas se dégustent debout, de bar en bar.'] },
        { kicker: '06 — Budget', heading: 'Combien prévoir', paragraphs: ['Comptez 55 à 85 € par jour et par personne.'] },
      ],
      tip: 'Planifiez vos visites tôt le matin pour éviter la chaleur et la foule, et gardez vos billets coupe-file hors ligne dans Odyssa.',
    },
  };
}
function fixtureTip(title, tag) {
  return {
    title, titleShort: title, tag,
    description: `Conseils pratiques : ${title}.`,
    excerpt: `Tout ce qu’il faut savoir : ${title.toLowerCase()}.`,
    photoQuery: 'travel planning',
    intro: 'Voici une méthode simple et concrète pour aborder ce sujet sereinement.',
    sections: [
      { heading: 'Bien se préparer', paragraphs: ['La préparation fait toute la différence.'], bullets: ['Point clé 1', 'Point clé 2'] },
      { heading: 'Sur place', paragraphs: ['Quelques réflexes utiles une fois sur le terrain.'] },
      { heading: 'Les erreurs à éviter', paragraphs: ['On évite ces pièges classiques.'] },
    ],
    tip: 'Centralisez toutes vos informations de voyage dans Odyssa pour les garder accessibles, même hors ligne.',
  };
}

// ---------- Génération d'une destination ----------
async function makeDestination({ name, country, angle, month }, registries, takenSlugs) {
  const content = DRY ? fixtureDestination().content : await generateDestination({ name, country, angle, month }, env('GEMINI_API_KEY'));
  content.country = content.country || country || '';
  const slug = uniqueSlug(slugify(content.titleShort || name), takenSlugs);
  content.readingTime = readingTime(destWordCount(content));

  const relRoot = `assets/blog/destinations/${slug}`;
  const absDir = join(ROOT, relRoot);
  const photos = DRY
    ? await generatePlaceholderPhotos({ absDir, relDir: relRoot })
    : await fetchDestinationPhotos({ query: `${content.titleShort} ${content.country}`.trim(), slug, absDir, relDir: relRoot }, env('UNSPLASH_KEY'));

  const palette = photos.dominant ? derivePalette(photos.dominant) : FALLBACK_PALETTE;

  const relatedTips = registries.tips.slice().sort((a, b) => String(b.date).localeCompare(a.date)).slice(0, 2);
  const entry = await renderDestination({ content, photos, palette, slug, date: today(), relatedTips });
  registries.destinations.unshift(entry);
  log(`✓ Destination générée : ${slug}`);
  return entry;
}

// ---------- Génération d'un tip ----------
async function makeTip(topic, registries, takenSlugs) {
  const content = DRY ? fixtureTip(topic.title, topic.tag) : await generateTip(topic, env('GEMINI_API_KEY'));
  const slug = uniqueSlug(slugify(content.title), takenSlugs);
  content.readingTime = readingTime(tipWordCount(content));

  const relRoot = `assets/blog/tips/${slug}`;
  const absDir = join(ROOT, relRoot);
  const photo = DRY
    ? await generatePlaceholderTipPhoto({ absDir, relDir: relRoot })
    : await fetchTipPhoto({ query: content.photoQuery || content.title, slug, absDir, relDir: relRoot }, env('UNSPLASH_KEY'));

  const related = [];
  if (registries.destinations[0]) related.push({ type: 'destination', slug: registries.destinations[0].slug, title: registries.destinations[0].title });
  const otherTip = registries.tips.find((t) => t.slug !== slug);
  if (otherTip) related.push({ type: 'tip', slug: otherTip.slug, title: otherTip.title });

  const entry = await renderTip({ content, photo, tag: topic.tag, tagClass: '', slug, date: today(), related });
  registries.tips.unshift(entry);
  log(`✓ Tip généré : ${slug}`);
  return entry;
}

// ---------- Sélection des sujets tips ----------
async function pickTipTopics(count, backlog, existingTitles) {
  const available = backlog.topics.filter((t) => !t.used);
  const chosen = available.slice(0, count);

  // Refill : si peu de sujets restants, on en demande de nouveaux à Gemini.
  if (!DRY && available.length - chosen.length < BACKLOG_REFILL_AT) {
    try {
      const proposed = await proposeTopics({ count: 10, existingTitles }, env('GEMINI_API_KEY'));
      for (const p of proposed) {
        if (!backlog.topics.some((t) => t.title.toLowerCase() === p.title.toLowerCase())) {
          backlog.topics.push({ ...p, used: false });
        }
      }
      log(`Backlog enrichi (+${proposed.length} sujets proposés)`);
    } catch (e) { log('Refill backlog ignoré :', e.message); }
  }
  return chosen;
}

// ---------- Main ----------
async function main() {
  const registries = {
    destinations: await readJson(join(ROOT, 'data/destinations.json')),
    tips: await readJson(join(ROOT, 'data/tips.json')),
  };

  if (LISTINGS_ONLY) {
    await rebuildListings();
    await rebuildSitemap();
    log('Listings + sitemap régénérés.');
    return;
  }

  if (!DRY) requireEnv(['GEMINI_API_KEY', 'UNSPLASH_KEY', 'NOTION_TOKEN', 'NOTION_DB_ID']);

  const backlog = await readJson(join(ROOT, 'data/tips-backlog.json'));
  const takenDestSlugs = new Set(registries.destinations.map((d) => d.slug));
  const takenTipSlugs = new Set(registries.tips.map((t) => t.slug));

  // 1) Destination depuis Notion (ou fixture en dry-run)
  let madeDestination = false;
  let notionPage = null;
  if (DRY) {
    const f = fixtureDestination();
    await makeDestination({ name: f.name, country: f.country }, registries, takenDestSlugs);
    madeDestination = true;
  } else {
    const queue = await fetchDestinationsToPublish(env('NOTION_TOKEN'), env('NOTION_DB_ID'));
    const next = queue.find((d) => !takenDestSlugs.has(slugify(d.name)));
    if (next) {
      notionPage = next;
      await makeDestination({ name: next.name, country: next.country, angle: next.angle, month: next.month }, registries, takenDestSlugs);
      madeDestination = true;
    } else {
      log('Aucune destination en file → 3 conseils cette semaine.');
    }
  }

  // 2) Tips (2 si destination publiée, sinon 3)
  const tipsTarget = madeDestination ? TIPS_PER_WEEK : TIPS_PER_WEEK + 1;
  const existingTitles = [...registries.tips.map((t) => t.title), ...backlog.topics.filter((t) => t.used).map((t) => t.title)];
  const topics = await pickTipTopics(tipsTarget, backlog, existingTitles);
  for (const topic of topics) {
    await makeTip(topic, registries, takenTipSlugs);
    topic.used = true;
  }
  if (topics.length < tipsTarget) log(`⚠ Seulement ${topics.length}/${tipsTarget} sujets tips disponibles dans le backlog.`);

  // 3) Persistance des registres + backlog
  await writeJson(join(ROOT, 'data/destinations.json'), registries.destinations);
  await writeJson(join(ROOT, 'data/tips.json'), registries.tips);
  await writeJson(join(ROOT, 'data/tips-backlog.json'), backlog);

  // 4) Listings + sitemap
  await rebuildListings();
  await rebuildSitemap();

  // 5) Marque la page Notion "En PR"
  if (notionPage) {
    try {
      await markStatus(env('NOTION_TOKEN'), notionPage.pageId, notionPage.statusType, 'En PR');
      log('Notion : page marquée "En PR".');
    } catch (e) { log('MAJ statut Notion échouée :', e.message); }
  }

  log(`Terminé : ${madeDestination ? 1 : 0} destination + ${topics.length} conseils.`);
}

main().catch((e) => { console.error('[blog] ERREUR :', e); process.exit(1); });
