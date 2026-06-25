import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { log } from './util.mjs';

const UNSPLASH_API = 'https://api.unsplash.com';

/**
 * Cherche des photos sur Unsplash.
 * @returns {Promise<Array<{regular,author,authorLink,downloadLocation}>>}
 */
export async function searchPhotos(query, count, key) {
  const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) throw new Error(`Unsplash search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results || []).map((p) => ({
    regular: p.urls.regular,
    author: p.user?.name || 'Unsplash',
    authorLink: p.user?.links?.html || 'https://unsplash.com',
    downloadLocation: p.links?.download_location,
  }));
}

/** Déclenche l'événement "download" requis par les guidelines Unsplash. */
async function triggerDownload(downloadLocation, key) {
  if (!downloadLocation) return;
  try {
    await fetch(`${downloadLocation}`, { headers: { Authorization: `Client-ID ${key}` } });
  } catch { /* best effort */ }
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement photo ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Convertit + redimensionne + écrit en WebP. */
async function toWebp(buf, outPath, width) {
  await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(outPath);
}

/** Couleur dominante {r,g,b} d'un buffer image. */
async function dominantOf(buf) {
  const { dominant } = await sharp(buf).stats();
  return dominant;
}

/**
 * Récupère et traite le jeu de photos d'une destination.
 * @returns {Promise<{cover, gallery:[], full, attributions:[], dominant}>}
 *   Les chemins retournés sont relatifs à la racine du repo.
 */
export async function fetchDestinationPhotos({ query, slug, absDir, relDir }, key) {
  await mkdir(absDir, { recursive: true });
  let photos = [];
  try {
    photos = await searchPhotos(query, 6, key);
    if (photos.length < 4) {
      // Élargit la recherche si peu de résultats.
      const extra = await searchPhotos(`${query} travel`, 6, key);
      photos.push(...extra);
    }
    if (photos.length < 4) {
      // Dernier recours : requête générique pour compléter le jeu de photos.
      const generic = await searchPhotos('travel destination landscape', 6, key);
      photos.push(...generic);
    }
  } catch (err) {
    log(`⚠ Recherche Unsplash échouée pour "${query}" (${err.message}) — placeholders utilisés.`);
  }
  if (photos.length === 0) {
    // Aucune image disponible : on dégrade vers des placeholders plutôt que de planter la pipeline.
    log(`⚠ Aucune photo Unsplash pour "${query}" — génération de placeholders.`);
    return generatePlaceholderPhotos({ absDir, relDir });
  }

  // Dédoublonne les candidates (les recherches élargies peuvent renvoyer les mêmes photos).
  const seen = new Set();
  const unique = photos.filter((p) => p?.regular && !seen.has(p.regular) && seen.add(p.regular));

  const attributions = [];
  const out = { gallery: [], attributions };

  // Cover (large) — sert aussi à dériver la palette.
  const coverP = unique[0];
  await triggerDownload(coverP.downloadLocation, key);
  const coverBuf = await download(coverP.regular);
  await toWebp(coverBuf, join(absDir, 'cover.webp'), 1600);
  out.cover = `${relDir}/cover.webp`;
  out.dominant = await dominantOf(coverBuf);
  attributions.push(coverP);

  // 2 photos de galerie + 1 pleine largeur — chacune avec une photo DISTINCTE de la cover.
  // S'il n'y a pas assez de photos uniques, on omet le slot plutôt que de réutiliser la cover.
  const slots = [
    { name: 'gallery-1.webp', width: 900, key: 'g' },
    { name: 'gallery-2.webp', width: 900, key: 'g' },
    { name: 'full.webp', width: 1600, key: 'f' },
  ];
  let next = 1; // index de la prochaine photo unique disponible
  for (const slot of slots) {
    const p = unique[next];
    if (!p) break; // plus de photo distincte : on omet les slots restants
    next++;
    await triggerDownload(p.downloadLocation, key);
    const buf = await download(p.regular);
    await toWebp(buf, join(absDir, slot.name), slot.width);
    const rel = `${relDir}/${slot.name}`;
    if (slot.key === 'f') out.full = rel;
    else out.gallery.push(rel);
    attributions.push(p);
  }

  log(`Photos prêtes pour ${slug} (${unique.length} uniques / ${photos.length} candidates)`);
  return out;
}

/**
 * Récupère une seule photo de couverture pour un article conseils.
 * @returns {Promise<{cover, attribution}>} chemin relatif à la racine du repo.
 */
export async function fetchTipPhoto({ query, slug, absDir, relDir }, key) {
  await mkdir(absDir, { recursive: true });
  let photos = [];
  try {
    photos = await searchPhotos(query, 4, key);
    if (photos.length === 0) photos = await searchPhotos(`${query} travel`, 4, key);
    if (photos.length === 0) photos = await searchPhotos('travel journey', 4, key);
  } catch (err) {
    log(`⚠ Recherche Unsplash échouée pour "${query}" (${err.message}) — placeholder utilisé.`);
  }
  if (photos.length === 0) {
    // Aucune image disponible : on dégrade vers un placeholder plutôt que de planter la pipeline.
    log(`⚠ Aucune photo Unsplash pour "${query}" — génération d'un placeholder.`);
    return generatePlaceholderTipPhoto({ absDir, relDir });
  }

  const p = photos[0];
  await triggerDownload(p.downloadLocation, key);
  const buf = await download(p.regular);
  await toWebp(buf, join(absDir, 'cover.webp'), 1600);
  log(`Photo prête pour le conseil ${slug}`);
  return { cover: `${relDir}/cover.webp`, attribution: p };
}

/** Génère des images de remplacement (mode --dry-run, sans clé Unsplash). */
export async function generatePlaceholderPhotos({ absDir, relDir, color = '#6e7d52' }) {
  await mkdir(absDir, { recursive: true });
  const make = async (name, w, h) => {
    await sharp({ create: { width: w, height: h, channels: 3, background: color } })
      .webp({ quality: 70 }).toFile(join(absDir, name));
  };
  await make('cover.webp', 1600, 700);
  await make('gallery-1.webp', 900, 700);
  await make('gallery-2.webp', 900, 700);
  await make('full.webp', 1600, 760);
  return {
    cover: `${relDir}/cover.webp`,
    gallery: [`${relDir}/gallery-1.webp`, `${relDir}/gallery-2.webp`],
    full: `${relDir}/full.webp`,
    attributions: [
      { author: 'Photo de démonstration', authorLink: 'https://unsplash.com' },
    ],
    dominant: { r: 110, g: 125, b: 82 },
  };
}

/** Génère une couverture de remplacement pour un conseil (mode --dry-run). */
export async function generatePlaceholderTipPhoto({ absDir, relDir, color = '#8c8f7a' }) {
  await mkdir(absDir, { recursive: true });
  await sharp({ create: { width: 1600, height: 700, channels: 3, background: color } })
    .webp({ quality: 70 }).toFile(join(absDir, 'cover.webp'));
  return {
    cover: `${relDir}/cover.webp`,
    attribution: { author: 'Photo de démonstration', authorLink: 'https://unsplash.com' },
  };
}
