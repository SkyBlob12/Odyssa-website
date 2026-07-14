import { join } from 'node:path';
import { escapeHtml, fillTemplate, readText, writeText, ROOT, SITE_URL } from './util.mjs';

/** Markdown minimal inline : **gras** et *italique*, sur texte déjà échappé. */
function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function paragraphs(arr, { dropcapFirst = false } = {}) {
  return (arr || [])
    .map((p, i) => `        <p${dropcapFirst && i === 0 ? ' class="dropcap"' : ''}>${inline(p)}</p>`)
    .join('\n');
}

function bullets(arr) {
  if (!arr || !arr.length) return '';
  return `        <ul>\n${arr.map((b) => `          <li>${inline(b)}</li>`).join('\n')}\n        </ul>`;
}

function pull(text) {
  return text ? `        <div class="pull">«&nbsp;${inline(text)}&nbsp;»</div>` : '';
}

/** Ligne de crédit photo Unsplash, avec lien auteur si disponible. */
function creditLine(a = {}) {
  return a.authorLink
    ? `Photo&nbsp;: <a href="${escapeHtml(a.authorLink)}?utm_source=odyssa&utm_medium=referral" target="_blank" rel="noopener">${escapeHtml(a.author)}</a> / Unsplash`
    : escapeHtml(a.author || 'Unsplash');
}

/** Figure de couverture d'un article conseil (vide si pas de photo). */
export function tipCoverFigure(photo, prefix, alt) {
  if (!photo?.cover) return '';
  return `      <figure class="article-cover"><img src="${prefix}${photo.cover}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${creditLine(photo.attribution)}</figcaption></figure>`;
}

function galleryBlock(photos, prefix, alt) {
  if (!photos.gallery?.length) return '';
  const fig = photos.gallery
    .map((src, i) => {
      const a = photos.attributions[i + 1] || photos.attributions[0] || {};
      return `          <figure class="dest-photo"><img src="${prefix}${src}" alt="${escapeHtml(alt)} ${i + 1}" loading="lazy"><figcaption>${creditLine(a)}</figcaption></figure>`;
    })
    .join('\n');
  return `        <div class="dest-gallery">\n${fig}\n        </div>`;
}

function fullBlock(photos, prefix, alt) {
  if (!photos.full) return '';
  const a = photos.attributions[3] || photos.attributions[0] || {};
  return `        <figure class="dest-full"><img src="${prefix}${photos.full}" alt="${escapeHtml(alt)}" loading="lazy"></figure>\n        <p class="dest-cap">${creditLine(a)}</p>`;
}

function faqSchema(faq) {
  if (!faq?.length) return '';
  const entities = faq
    .map((q) => `    { "@type": "Question", "name": ${JSON.stringify(q.question)}, "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(q.answer)} } }`)
    .join(',\n');
  return `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${entities}
    ]
  }
  </script>`;
}

function faqHtml(faq, titleShort = '') {
  if (!faq?.length) return '';
  const heading = titleShort ? `Questions fréquentes sur ${escapeHtml(titleShort)}` : 'Questions fréquentes';
  const items = faq
    .map((q) => `        <details class="faq-item">
          <summary>${escapeHtml(q.question)}</summary>
          <div class="faq-answer"><p>${escapeHtml(q.answer)}</p></div>
        </details>`)
    .join('\n');
  return `        <div class="faq-section">
          <h2>${heading}</h2>
${items}
        </div>`;
}

function relatedBlock(items, indent = '          ') {
  return items
    .map((it) => `${indent}<a href="${it.href}">${escapeHtml(it.title)} <span class="arrow">→</span></a>`)
    .join('\n');
}

function destSections(sections, photos, prefix, alt) {
  const out = [];
  sections.forEach((s, idx) => {
    const block = [
      `        <p class="sec-k">${escapeHtml(s.kicker)}</p>`,
      `        <h2>${escapeHtml(s.heading)}</h2>`,
      paragraphs(s.paragraphs, { dropcapFirst: idx === 0 }),
      pull(s.pull),
      bullets(s.bullets),
    ].filter(Boolean).join('\n');
    out.push(block);
    // Galerie après la 1re section, photo pleine largeur après la 3e.
    if (idx === 0) out.push(galleryBlock(photos, prefix, alt));
    if (idx === 2) out.push(fullBlock(photos, prefix, alt));
  });
  return out.filter(Boolean).join('\n\n');
}

function tipSections(sections) {
  return sections
    .map((s) =>
      [
        `        <h2>${escapeHtml(s.heading)}</h2>`,
        paragraphs(s.paragraphs),
        bullets(s.bullets),
      ].filter(Boolean).join('\n')
    )
    .join('\n\n');
}

/** Rendu d'une fiche destination → écrit le fichier, renvoie l'entrée de registre. */
export async function renderDestination({ content, photos, palette, slug, date, relatedTips }) {
  const tpl = await readText(join(ROOT, 'blog/_templates/destination.html'));
  const prefix = '../../../'; // depuis /blog/destinations/<slug>/
  const alt = `${content.titleShort} — ${content.titleShort}`;
  const url = `${SITE_URL}/blog/destinations/${slug}/`;
  const ogImage = photos.cover ? `${SITE_URL}/${photos.cover}` : `${SITE_URL}/assets/miniature-odyssa.png`;

  const cover = photos.cover
    ? `<div class="dest-cover"><img src="${prefix}${photos.cover}" alt="${escapeHtml(content.titleShort)}"></div>`
    : '<div class="dest-cover"></div>';

  const blogPrefix = '../../'; // depuis /blog/destinations/<slug>/ vers /blog/
  const related = relatedBlock(
    (relatedTips || []).map((t) => ({ href: `${blogPrefix}${t.slug}/`, title: t.title }))
  );

  const html = fillTemplate(tpl, {
    SLUG: slug,
    TITLE: escapeHtml(content.title),
    TITLE_SHORT: escapeHtml(content.titleShort),
    SUBTITLE: escapeHtml(content.subtitle),
    EYEBROW: escapeHtml(content.eyebrow),
    DESCRIPTION: escapeHtml(content.description),
    COUNTRY_CODE: escapeHtml(content.countryCode || ''),
    OG_IMAGE: ogImage,
    DATE: date,
    READING_TIME: content.readingTime,
    INTRO: inline(content.intro),
    FACT_PERIOD: escapeHtml(content.facts.period),
    FACT_BUDGET: escapeHtml(content.facts.budget),
    FACT_DURATION: escapeHtml(content.facts.duration),
    FACT_CURRENCY: escapeHtml(content.facts.currency),
    BADGE_TOP: escapeHtml(content.titleShort.slice(0, 8).toUpperCase()),
    BADGE_YEAR: new Date(date).getFullYear(),
    C_PRIMARY: palette.primary,
    C_ACCENT: palette.accent,
    C_WARM: palette.warm,
    C_PAPER: palette.paper,
    C_INK: palette.ink,
    COVER: cover,
    SECTIONS: destSections(content.sections, photos, prefix, content.titleShort),
    FAQ_SCHEMA: faqSchema(content.faq),
    FAQ_SECTION: faqHtml(content.faq, content.titleShort),
    TIP: inline(content.tip),
    RELATED: related,
    SHARE_URL: encodeURIComponent(url),
    SHARE_TEXT: encodeURIComponent(content.title),
  });

  await writeText(join(ROOT, 'blog/destinations', slug, 'index.html'), html);

  return {
    slug,
    title: content.title,
    country: content.country || '',
    tag: (content.eyebrow || '').split('·')[0].trim() || content.country || 'Destination',
    excerpt: content.excerpt,
    readingTime: content.readingTime,
    cover: photos.cover || null,
    date,
  };
}

/** Rendu d'un article tips → écrit le fichier, renvoie l'entrée de registre. */
export async function renderTip({ content, photo, tag, tagClass, slug, date, related }) {
  const tpl = await readText(join(ROOT, 'blog/_templates/tip.html'));
  const prefix = '../../'; // depuis /blog/<slug>/
  const url = `${SITE_URL}/blog/${slug}/`;
  const alt = content.titleShort || content.title;
  const ogImage = photo?.cover ? `${SITE_URL}/${photo.cover}` : `${SITE_URL}/assets/miniature-odyssa.png`;
  const cover = tipCoverFigure(photo, prefix, alt);

  const blogPrefix = '../'; // depuis /blog/<slug>/ vers /blog/
  const relatedItems = (related || []).map((r) =>
    r.type === 'destination'
      ? { href: `${blogPrefix}destinations/${r.slug}/`, title: r.title }
      : { href: `${blogPrefix}${r.slug}/`, title: r.title }
  );

  const html = fillTemplate(tpl, {
    SLUG: slug,
    TITLE: escapeHtml(content.title),
    TITLE_SHORT: escapeHtml(content.titleShort || content.title),
    DESCRIPTION: escapeHtml(content.description),
    OG_IMAGE: ogImage,
    DATE: date,
    TAG: escapeHtml(tag),
    TAG_CLASS: tagClass || '',
    READING_TIME: content.readingTime,
    COVER: cover,
    INTRO: inline(content.intro),
    SECTIONS: tipSections(content.sections),
    FAQ_SCHEMA: faqSchema(content.faq),
    FAQ_SECTION: faqHtml(content.faq, content.titleShort || content.title),
    TIP: inline(content.tip),
    RELATED: relatedBlock(relatedItems),
    SHARE_URL: encodeURIComponent(url),
    SHARE_TEXT: encodeURIComponent(content.title),
  });

  await writeText(join(ROOT, 'blog', slug, 'index.html'), html);

  return {
    slug,
    title: content.title,
    tag,
    tagClass: tagClass || '',
    excerpt: content.excerpt,
    readingTime: content.readingTime,
    cover: photo?.cover || null,
    date,
  };
}
