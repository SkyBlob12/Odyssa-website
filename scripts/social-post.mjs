#!/usr/bin/env node
/**
 * Publication sociale des nouveaux articles du blog Odyssa.
 *   Lit data/pending-social.json (écrit par generate-weekly.mjs) et publie
 *   chaque article sur Pinterest. Idempotent : data/social-log.json mémorise
 *   les slugs déjà publiés, donc relancer le workflow ne crée jamais de doublon.
 *
 * Variables d'environnement (Pinterest, ignoré tant que non défini) :
 *   PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_DESTINATIONS, PINTEREST_BOARD_TIPS
 *
 * Usage :
 *   node scripts/social-post.mjs            # publie pour de vrai
 *   node scripts/social-post.mjs --dry-run  # affiche sans rien publier
 */
import { join } from 'node:path';
import { ROOT, log, readJson, writeJson } from './lib/util.mjs';

const DRY = process.argv.slice(2).includes('--dry-run');
const env = (k) => process.env[k];

const PENDING_PATH = join(ROOT, 'data/pending-social.json');
const LOG_PATH = join(ROOT, 'data/social-log.json');

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function hashtags(item) {
  const base = ['voyage', 'travel'];
  if (item.type === 'destination' && item.country) {
    base.unshift(item.country.replace(/[^A-Za-zÀ-ÿ0-9]/g, ''));
  } else {
    base.push('conseilsvoyage');
  }
  return [...new Set(base)].slice(0, 4).map((t) => `#${t}`).join(' ');
}

// ---------- Publication Pinterest (activée quand le token est fourni) ----------
async function postToPinterest(item, pin) {
  const boardId = item.type === 'destination' ? pin.boardDestinations : pin.boardTips;
  if (!boardId) { log(`Pinterest : aucun board pour le type "${item.type}", ignoré.`); return { ok: false }; }
  if (!item.image) { log(`Pinterest : pas d'image pour ${item.slug}, ignoré.`); return { ok: false }; }

  const body = {
    board_id: boardId,
    title: item.title.slice(0, 100),
    description: truncate(`${item.excerpt || item.title} ${hashtags(item)}`, 500),
    link: item.url,
    media_source: { source_type: 'image_url', url: item.image },
  };
  if (DRY) {
    log(`[dry] Pinterest :\n${JSON.stringify(body, null, 2)}\n`);
    return { ok: true, dry: true };
  }
  const res = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${pin.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pinterest ${res.status} : ${JSON.stringify(data)}`);
  log(`✓ Pinterest publié : ${item.slug} (pin ${data?.id || '?'})`);
  return { ok: true, id: data?.id };
}

// ---------- Main ----------
async function main() {
  let pending;
  try {
    pending = await readJson(PENDING_PATH);
  } catch {
    log('Aucun data/pending-social.json → rien à publier.');
    return;
  }
  if (!Array.isArray(pending) || pending.length === 0) {
    log('File sociale vide → rien à publier.');
    return;
  }

  const logData = await readJson(LOG_PATH).catch(() => ({ posted: {} }));
  logData.posted = logData.posted || {};

  const pin = {
    accessToken: env('PINTEREST_ACCESS_TOKEN'),
    boardDestinations: env('PINTEREST_BOARD_DESTINATIONS'),
    boardTips: env('PINTEREST_BOARD_TIPS'),
  };
  const pinReady = Boolean(pin.accessToken);
  if (!pinReady && !DRY) { log('Pinterest : token absent (validation en attente) → rien à publier.'); return; }

  let posted = 0;
  for (const item of pending) {
    const record = logData.posted[item.slug] || {};
    if ((pinReady || DRY) && !record.pinterest) {
      try {
        const r = await postToPinterest(item, pin);
        if (r.ok && !r.dry) { record.pinterest = new Date().toISOString(); posted++; }
        else if (r.dry) posted++;
      } catch (e) { log(`✗ Pinterest échec (${item.slug}) : ${e.message}`); }
    }
    if (Object.keys(record).length) logData.posted[item.slug] = record;
  }

  if (!DRY) await writeJson(LOG_PATH, logData);
  log(`Terminé : ${posted} action(s) de publication.`);
}

main().catch((e) => { console.error('[social] ERREUR :', e); process.exit(1); });
