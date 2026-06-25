#!/usr/bin/env node
/**
 * Publication sociale des nouveaux articles du blog Odyssa.
 *   Lit data/pending-social.json (écrit par generate-weekly.mjs),
 *   poste chaque article sur X (Twitter) et, si configuré, sur Pinterest.
 *   Idempotent : data/social-log.json mémorise les slugs déjà publiés,
 *   donc relancer le workflow ne crée jamais de doublon.
 *
 * Variables d'environnement :
 *   X (requis pour poster sur X) :
 *     X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *   Pinterest (optionnel, ignoré tant que non défini) :
 *     PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_DESTINATIONS, PINTEREST_BOARD_TIPS
 *
 * Usage :
 *   node scripts/social-post.mjs            # poste pour de vrai
 *   node scripts/social-post.mjs --dry-run  # affiche sans rien publier
 */
import crypto from 'node:crypto';
import { join } from 'node:path';
import { ROOT, log, readJson, writeJson } from './lib/util.mjs';

const DRY = process.argv.slice(2).includes('--dry-run');
const env = (k) => process.env[k];

const PENDING_PATH = join(ROOT, 'data/pending-social.json');
const LOG_PATH = join(ROOT, 'data/social-log.json');

// ---------- OAuth 1.0a (X API v2) ----------
/** Percent-encode strict RFC 3986. */
function pct(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHeader(method, url, creds) {
  const params = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const paramString = Object.keys(params).sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessSecret)}`;
  params.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(params).sort()
    .map((k) => `${pct(k)}="${pct(params[k])}"`)
    .join(', ');
}

// ---------- Construction du texte du tweet (≤ 280, URL comptée 23) ----------
const TWEET_MAX = 280;
const URL_LEN = 23; // t.co normalise toute URL à 23 caractères
const SAFETY = 8;   // marge : X compte les emojis double

function hashtags(item) {
  const base = ['voyage', 'travel'];
  if (item.type === 'destination' && item.country) {
    base.unshift(item.country.replace(/[^A-Za-zÀ-ÿ0-9]/g, ''));
  } else {
    base.push('conseilsvoyage');
  }
  return [...new Set(base)].slice(0, 4).map((t) => `#${t}`).join(' ');
}

function buildTweet(item) {
  const emoji = item.type === 'destination' ? '🗺️' : '🧭';
  const tags = hashtags(item);
  const head = `${emoji} ${item.title}`;
  const tail = `👉 ${item.url}\n\n${tags}`;
  // Coût visuel : URL comptée comme 23 quel que soit sa longueur réelle.
  const fixedCost = head.length + 2 + URL_LEN + 2 + tags.length + 2; // +séparateurs
  let body = '';
  if (item.excerpt) {
    const room = TWEET_MAX - SAFETY - fixedCost;
    body = room > 20 ? truncate(item.excerpt, room) + '\n\n' : '';
  }
  return `${head}\n\n${body}${tail}`;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// ---------- Publication X ----------
async function postToX(item, creds) {
  const text = buildTweet(item);
  if (DRY) {
    log(`[dry] X (${text.length} car.) :\n${text}\n`);
    return { ok: true, dry: true };
  }
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: oauthHeader('POST', 'https://api.twitter.com/2/tweets', creds),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X ${res.status} : ${JSON.stringify(data)}`);
  log(`✓ X publié : ${item.slug} (tweet ${data?.data?.id || '?'})`);
  return { ok: true, id: data?.data?.id };
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

  // Credentials X
  const xCreds = {
    apiKey: env('X_API_KEY'),
    apiSecret: env('X_API_SECRET'),
    accessToken: env('X_ACCESS_TOKEN'),
    accessSecret: env('X_ACCESS_TOKEN_SECRET'),
  };
  const xReady = Object.values(xCreds).every(Boolean);
  if (!xReady && !DRY) log('⚠ Clés X absentes → publication X ignorée.');

  // Credentials Pinterest (optionnel)
  const pin = {
    accessToken: env('PINTEREST_ACCESS_TOKEN'),
    boardDestinations: env('PINTEREST_BOARD_DESTINATIONS'),
    boardTips: env('PINTEREST_BOARD_TIPS'),
  };
  const pinReady = Boolean(pin.accessToken);
  if (!pinReady) log('Pinterest : token absent (validation en attente) → ignoré.');

  let posted = 0;
  for (const item of pending) {
    const record = logData.posted[item.slug] || {};

    // X
    if ((xReady || DRY) && !record.x) {
      try {
        const r = await postToX(item, xCreds);
        if (r.ok && !r.dry) { record.x = new Date().toISOString(); posted++; }
        else if (r.dry) posted++;
      } catch (e) { log(`✗ X échec (${item.slug}) : ${e.message}`); }
    }

    // Pinterest
    if ((pinReady || DRY) && !record.pinterest) {
      try {
        const r = await postToPinterest(item, pin);
        if (r.ok && !r.dry) { record.pinterest = new Date().toISOString(); }
      } catch (e) { log(`✗ Pinterest échec (${item.slug}) : ${e.message}`); }
    }

    if (Object.keys(record).length) logData.posted[item.slug] = record;
  }

  if (!DRY) await writeJson(LOG_PATH, logData);
  log(`Terminé : ${posted} action(s) de publication.`);
}

main().catch((e) => { console.error('[social] ERREUR :', e); process.exit(1); });
