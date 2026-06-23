import { join } from 'node:path';
import { escapeHtml, readText, writeText, readJson, ROOT, SITE_URL } from './util.mjs';

function replaceBetween(content, startMarker, endMarker, inner) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error(`Marqueurs introuvables : ${startMarker}`);
  }
  return content.slice(0, start + startMarker.length) + '\n' + inner + '\n        ' + content.slice(end);
}

function destCard(d, { hrefBase, photoPrefix }) {
  const photo = d.cover
    ? `<div class="blog-card-photo"><img src="${photoPrefix}${escapeHtml(d.cover)}" alt="${escapeHtml(d.title)}" loading="lazy"></div>`
    : `<div class="blog-card-photo">${escapeHtml(d.tag || d.title)}</div>`;
  return `        <a href="${hrefBase}${d.slug}/" class="blog-card">
          ${photo}
          <div class="blog-card-body">
            <span class="blog-card-tag">${escapeHtml(d.tag || 'Destination')}</span>
            <h3>${escapeHtml(d.title)}</h3>
            <p>${escapeHtml(d.excerpt)}</p>
            <div class="blog-card-meta">
              <span>${escapeHtml(d.readingTime)}</span>
              <span class="blog-card-arrow">Lire →</span>
            </div>
          </div>
        </a>`;
}

function tipCard(t, { hrefBase }) {
  return `        <a href="${hrefBase}${t.slug}/" class="blog-card">
          <div class="blog-card-photo">${escapeHtml(t.tag)}</div>
          <div class="blog-card-body">
            <span class="blog-card-tag ${t.tagClass || ''}">${escapeHtml(t.tag)}</span>
            <h3>${escapeHtml(t.title)}</h3>
            <p>${escapeHtml(t.excerpt)}</p>
            <div class="blog-card-meta">
              <span>${escapeHtml(t.readingTime)}</span>
              <span class="blog-card-arrow">Lire →</span>
            </div>
          </div>
        </a>`;
}

const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

/** Régénère les grilles de cartes dans les pages de listing. */
export async function rebuildListings() {
  const destinations = (await readJson(join(ROOT, 'data/destinations.json'))).sort(byDateDesc);
  const tips = (await readJson(join(ROOT, 'data/tips.json'))).sort(byDateDesc);

  // --- blog/index.html : section Destinations (limitée à 4) + section Conseils ---
  const blogIndexPath = join(ROOT, 'blog/index.html');
  let blogIndex = await readText(blogIndexPath);
  blogIndex = replaceBetween(
    blogIndex,
    '<!-- AUTO:DEST_CARDS:START -->',
    '<!-- AUTO:DEST_CARDS:END -->',
    destinations.slice(0, 4).map((d) => destCard(d, { hrefBase: 'destinations/', photoPrefix: '../' })).join('\n\n')
  );
  blogIndex = replaceBetween(
    blogIndex,
    '<!-- AUTO:TIPS_CARDS:START -->',
    '<!-- AUTO:TIPS_CARDS:END -->',
    tips.map((t) => tipCard(t, { hrefBase: '' })).join('\n\n')
  );
  await writeText(blogIndexPath, blogIndex);

  // --- blog/destinations/index.html : toutes les destinations ---
  const destIndexPath = join(ROOT, 'blog/destinations/index.html');
  let destIndex = await readText(destIndexPath);
  destIndex = replaceBetween(
    destIndex,
    '<!-- AUTO:DEST_CARDS:START -->',
    '<!-- AUTO:DEST_CARDS:END -->',
    destinations.map((d) => destCard(d, { hrefBase: '', photoPrefix: '../../' })).join('\n\n')
  );
  await writeText(destIndexPath, destIndex);
}

/** Régénère sitemap.xml à partir des pages statiques + registres. */
export async function rebuildSitemap() {
  const destinations = await readJson(join(ROOT, 'data/destinations.json'));
  const tips = await readJson(join(ROOT, 'data/tips.json'));

  const url = (loc, changefreq, priority) =>
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

  const entries = [
    url(`${SITE_URL}/`, 'weekly', '1.0'),
    url(`${SITE_URL}/blog/`, 'weekly', '0.8'),
    url(`${SITE_URL}/blog/destinations/`, 'weekly', '0.8'),
    ...destinations.map((d) => url(`${SITE_URL}/blog/destinations/${d.slug}/`, 'monthly', '0.7')),
    ...tips.map((t) => url(`${SITE_URL}/blog/${t.slug}/`, 'monthly', '0.7')),
    url(`${SITE_URL}/support/`, 'monthly', '0.5'),
    url(`${SITE_URL}/privacy-policy/`, 'yearly', '0.3'),
    url(`${SITE_URL}/terms-of-service/`, 'yearly', '0.3'),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  await writeText(join(ROOT, 'sitemap.xml'), xml);
}
