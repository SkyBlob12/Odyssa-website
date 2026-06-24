#!/usr/bin/env node
/**
 * Backfill ponctuel : ajoute une photo de couverture aux conseils déjà publiés
 * (ceux sans champ `cover` dans data/tips.json). À lancer une seule fois.
 *
 * Variables requises : UNSPLASH_KEY, GROQ_API_KEY.
 *
 * Usage :
 *   node scripts/backfill-tip-images.mjs
 *   node scripts/backfill-tip-images.mjs --dry-run   # couvertures factices, sans API
 */
import { join } from 'node:path';
import { ROOT, SITE_URL, log, readJson, writeJson, readText, writeText } from './lib/util.mjs';
import { fetchTipPhoto, generatePlaceholderTipPhoto } from './lib/photos.mjs';
import { generatePhotoQuery } from './lib/llm.mjs';
import { tipCoverFigure } from './lib/render.mjs';
import { rebuildListings } from './lib/listings.mjs';

const DRY = process.argv.slice(2).includes('--dry-run');
const env = (k) => process.env[k];
const OG_DEFAULT = `${SITE_URL}/assets/og-image.png`;
const BODY_ANCHOR = '\n      <div class="article-body">';

async function main() {
  if (!DRY) {
    const missing = ['UNSPLASH_KEY', 'GROQ_API_KEY'].filter((k) => !env(k));
    if (missing.length) throw new Error(`Variables manquantes : ${missing.join(', ')}`);
  }

  const tips = await readJson(join(ROOT, 'data/tips.json'));
  const todo = tips.filter((t) => !t.cover);
  if (!todo.length) { log('Tous les conseils ont déjà une couverture. Rien à faire.'); return; }
  log(`${todo.length} conseil(s) à illustrer.`);

  for (const tip of todo) {
    const relRoot = `assets/blog/tips/${tip.slug}`;
    const absDir = join(ROOT, relRoot);

    const photo = DRY
      ? await generatePlaceholderTipPhoto({ absDir, relDir: relRoot })
      : await fetchTipPhoto(
          { query: await generatePhotoQuery({ title: tip.title, tag: tip.tag }, env('GROQ_API_KEY')), slug: tip.slug, absDir, relDir: relRoot },
          env('UNSPLASH_KEY')
        );

    // Injecte la couverture dans le HTML déjà généré + branche og:image / twitter:image.
    const htmlPath = join(ROOT, 'blog', tip.slug, 'index.html');
    let html = await readText(htmlPath);
    if (html.includes('class="article-cover"')) {
      log(`↷ ${tip.slug} a déjà une couverture dans le HTML, on ne réinjecte pas.`);
    } else if (!html.includes(BODY_ANCHOR)) {
      log(`⚠ Ancre introuvable dans ${tip.slug}/index.html — ignoré.`);
      continue;
    } else {
      const fig = tipCoverFigure(photo, '../../', tip.title);
      html = html.replace(BODY_ANCHOR, `\n${fig}\n${BODY_ANCHOR}`);
    }
    const ogUrl = `${SITE_URL}/${photo.cover}`;
    html = html.split(OG_DEFAULT).join(ogUrl);
    await writeText(htmlPath, html);

    tip.cover = photo.cover;
    log(`✓ ${tip.slug}`);
  }

  await writeJson(join(ROOT, 'data/tips.json'), tips);
  await rebuildListings();
  log('Terminé : base + cartes mises à jour.');
}

main().catch((e) => { console.error('[blog] ERREUR :', e); process.exit(1); });
